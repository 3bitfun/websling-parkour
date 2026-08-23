import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export type NetStatus = "off" | "local" | "online";

/** One snapshot of a swinger's state, broadcast ~12x per second. */
export interface NetPacket {
  v: 1;
  pid: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  attached: boolean;
  ax: number;
  ay: number;
  az: number;
  grounded: boolean;
  score: number;
  combo: number;
  tokens: number;
  playing: boolean;
}

export interface RoomTransport {
  kind: "supabase" | "local";
  send(p: NetPacket): void;
  onPacket(cb: (p: NetPacket) => void): void;
  close(): void;
}

/* Supabase Realtime credentials (anon key is safe for client use).
   Env vars take precedence so deployments can point elsewhere. */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const SB_URL =
  env.VITE_SUPABASE_URL ?? "https://cjelflljzocgpidtrqbg.supabase.co";
const SB_KEY =
  env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZWxmbGxqem9jZ3BpZHRycWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczNDg0NjYsImV4cCI6MjEwMjkyNDQ2Nn0.-PxUs1IbKvU3r19ToA9HeZEZwwRxFw6koFhr643NNIE";
export const SUPABASE_CONFIGURED = SB_URL.length > 0 && SB_KEY.length > 0;

let sharedClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!SUPABASE_CONFIGURED) return null;
  try {
    if (!sharedClient) sharedClient = createClient(SB_URL, SB_KEY);
    return sharedClient;
  } catch {
    return null;
  }
}

/* ---------- local fallback: works between tabs of the same browser ---------- */
class LocalTransport implements RoomTransport {
  kind = "local" as const;
  private bc: BroadcastChannel;
  private cb: ((p: NetPacket) => void) | null = null;

  constructor(code: string, private pid: string) {
    this.bc = new BroadcastChannel(`webrunner-room-${code.toUpperCase()}`);
    this.bc.onmessage = (e) => {
      const p = e.data as NetPacket;
      if (p && p.v === 1 && p.pid !== this.pid) this.cb?.(p);
    };
  }
  send(p: NetPacket) {
    try {
      this.bc.postMessage(p);
    } catch {
      /* channel closed */
    }
  }
  onPacket(cb: (p: NetPacket) => void) {
    this.cb = cb;
  }
  close() {
    try {
      this.bc.close();
    } catch {
      /* noop */
    }
  }
}

/* ---------- Supabase Realtime: broadcast channel per room code ---------- */
class SupabaseTransport implements RoomTransport {
  kind = "supabase" as const;
  private channel: RealtimeChannel;
  private cb: ((p: NetPacket) => void) | null = null;
  private subscribed = false;
  private dead = false;
  private onDead?: () => void;

  constructor(client: SupabaseClient, code: string, private pid: string, onDead?: () => void) {
    this.onDead = onDead;
    this.channel = client.channel(`webrunner-room-${code.toUpperCase()}`);
    this.channel.on("broadcast", { event: "state" }, (msg) => {
      const p = msg.payload as NetPacket;
      if (p && p.v === 1 && p.pid !== this.pid) this.cb?.(p);
    });
    this.channel.subscribe((status) => {
      if (this.dead) return;
      if (status === "SUBSCRIBED") {
        this.subscribed = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // realtime unavailable on this project/network -> fall back to local link
        this.subscribed = false;
        this.dead = true;
        this.onDead?.();
      }
    });
  }
  send(p: NetPacket) {
    if (!this.subscribed || this.dead) return;
    this.channel.send({ type: "broadcast", event: "state", payload: p }).catch(() => {
      /* drop packet */
    });
  }
  onPacket(cb: (p: NetPacket) => void) {
    this.cb = cb;
  }
  close() {
    this.dead = true;
    try {
      this.channel.unsubscribe();
    } catch {
      /* noop */
    }
  }
}

/**
 * Creates the room link. Prefers Supabase Realtime (cross-device).
 * If Realtime is unavailable or errors out, transparently falls back
 * to the local tab channel so the room never silently dies.
 */
export function createRoomTransport(
  code: string,
  pid: string,
  onSwap?: (kind: RoomTransport["kind"]) => void
): RoomTransport {
  const client = getClient();
  if (!client) return new LocalTransport(code, pid);

  let closed = false;
  let packetCb: ((p: NetPacket) => void) | null = null;
  let current: RoomTransport = new SupabaseTransport(client, code, pid, () => {
    if (closed) return;
    current.close();
    current = new LocalTransport(code, pid);
    if (packetCb) current.onPacket(packetCb);
    onSwap?.("local");
  });

  return {
    get kind() {
      return current.kind;
    },
    send: (p) => current.send(p),
    onPacket: (cb) => {
      packetCb = cb;
      current.onPacket(cb);
    },
    close: () => {
      closed = true;
      current.close();
    },
  };
}

export function randomPid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function randomCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
