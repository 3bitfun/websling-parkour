import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Persistence layer. localStorage is the source of truth for snappy UX;
 * when Supabase env vars (or the built-in project defaults) are available,
 * cash + upgrades also sync to the websling_* tables.
 */

const SB_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://cjelflljzocgpidtrqbg.supabase.co";
const SB_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZWxmbGxqem9jZ3BpZHRycWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczNDg0NjYsImV4cCI6MjEwMjkyNDQ2Nn0.-PxUs1IbKvU3r19ToA9HeZEZwwRxFw6koFhr643NNIE";

let client: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  try {
    if (!client) client = createClient(SB_URL, SB_KEY);
    return client;
  } catch {
    return null;
  }
}

const CASH_KEY = "websling-cash";
const UPGRADE_KEY = "websling-upgrades";
const GUEST_KEY = "websling-guest-id";

function guestId(): string {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = "g-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

/* ---------------- cash ---------------- */

export function loadCash(): number {
  try {
    return Number(localStorage.getItem(CASH_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Persist the new total locally and fire-and-forget a sync to Supabase. */
export function saveCash(total: number): void {
  try {
    localStorage.setItem(CASH_KEY, String(total));
  } catch {
    /* ignore */
  }
  const c = sb();
  if (!c) return;
  void (async () => {
    try {
      await c.from("websling_wallet").upsert({ owner: guestId(), cash: total, updated_at: new Date().toISOString() });
    } catch {
      /* offline is fine */
    }
  })();
}

/** Pull the cloud total (if any) and keep the richer of the two. */
export async function syncCash(local: number): Promise<number> {
  const c = sb();
  if (!c) return local;
  try {
    const { data } = await c.from("websling_wallet").select("cash").eq("owner", guestId()).maybeSingle();
    const remote = Number((data as { cash?: number } | null)?.cash ?? 0);
    const merged = Math.max(local, remote);
    if (merged !== local) saveCash(merged);
    return merged;
  } catch {
    return local;
  }
}

/* ---------------- upgrades ---------------- */

export function loadUpgrades(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(UPGRADE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveUpgrades(u: Record<string, number>): void {
  try {
    localStorage.setItem(UPGRADE_KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
  const c = sb();
  if (!c) return;
  void (async () => {
    try {
      await c.from("websling_wallet").upsert({ owner: guestId(), upgrades: u, updated_at: new Date().toISOString() });
    } catch {
      /* offline is fine */
    }
  })();
}

export async function syncUpgrades(local: Record<string, number>): Promise<Record<string, number>> {
  const c = sb();
  if (!c) return local;
  try {
    const { data } = await c.from("websling_wallet").select("upgrades").eq("owner", guestId()).maybeSingle();
    const remote = ((data as { upgrades?: Record<string, number> } | null)?.upgrades ?? {}) as Record<string, number>;
    const merged: Record<string, number> = { ...remote };
    for (const k of Object.keys(local)) merged[k] = Math.max(local[k] ?? 0, remote[k] ?? 0);
    saveUpgrades(merged);
    return merged;
  } catch {
    return local;
  }
}
