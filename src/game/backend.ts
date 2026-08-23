import { getSupabaseClient, SUPABASE_CONFIGURED } from "./net";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BACKEND_READY = SUPABASE_CONFIGURED;

export interface AccountUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface BoardRow {
  userId: string;
  name: string;
  mode: string;
  score: number;
  tokens: number;
  maxCombo: number;
  bestSwing: number;
  at: string;
}

export interface ScoreEntry {
  mode: "solo" | "free" | "versus";
  score: number;
  tokens: number;
  maxCombo: number;
  bestSwing: number;
  timeLeft: number;
  placement: number | null;
}

function client(): SupabaseClient {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("already registered")) return "That email already has a pilot account — sign in instead.";
  if (m.includes("rate limit")) return "Too many attempts — wait a moment and retry.";
  if (m.includes("email not confirmed"))
    return "Confirm your email first (or disable email confirmation in Supabase Auth settings).";
  if (m.includes("password should be")) return "Password must be at least 6 characters.";
  if (m.includes("unable to validate email")) return "That email address doesn't look valid.";
  return msg;
}

async function fetchDisplayName(uid: string): Promise<string | null> {
  try {
    const { data } = await client()
      .from("websling_profiles")
      .select("display_name")
      .eq("user_id", uid)
      .maybeSingle();
    return ((data?.display_name as string | undefined) ?? null);
  } catch {
    return null;
  }
}

async function ensureProfile(uid: string, displayName: string): Promise<void> {
  try {
    await client()
      .from("websling_profiles")
      .upsert({ user_id: uid, display_name: displayName }, { onConflict: "user_id", ignoreDuplicates: true });
  } catch {
    /* profile may already exist via the signup trigger */
  }
}

/* ---------------- session ---------------- */

export async function getSession(): Promise<AccountUser | null> {
  if (!BACKEND_READY) return null;
  const { data } = await client().auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  return { id: u.id, email: u.email ?? "", displayName: await fetchDisplayName(u.id) };
}

export function onAuthChange(cb: (user: AccountUser | null) => void): () => void {
  if (!BACKEND_READY) return () => {};
  const { data } = client().auth.onAuthStateChange((_evt, session) => {
    const u = session?.user;
    if (!u) {
      cb(null);
      return;
    }
    const acc: AccountUser = { id: u.id, email: u.email ?? "", displayName: null };
    cb(acc);
    fetchDisplayName(u.id).then((n) => cb({ ...acc, displayName: n }));
  });
  return () => data.subscription.unsubscribe();
}

/* ---------------- auth ---------------- */

export async function signUp(email: string, password: string, displayName: string): Promise<AccountUser> {
  const clean = displayName.trim().slice(0, 14) || "SPIDER";
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: clean } },
  });
  if (error) throw new Error(friendly(error.message));
  const u = data.user;
  if (!u) throw new Error("Sign-up failed — try again.");
  if (data.session) await ensureProfile(u.id, clean);
  return { id: u.id, email: u.email ?? email, displayName: clean };
}

export async function signIn(email: string, password: string): Promise<AccountUser> {
  const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendly(error.message));
  const u = data.user;
  return { id: u.id, email: u.email ?? email, displayName: await fetchDisplayName(u.id) };
}

export async function signOutUser(): Promise<void> {
  if (!BACKEND_READY) return;
  try {
    await client().auth.signOut();
  } catch {
    /* already out */
  }
}

export async function updateDisplayName(uid: string, name: string): Promise<string> {
  const clean = name.trim().slice(0, 14) || "SPIDER";
  const { error } = await client().from("websling_profiles").update({ display_name: clean }).eq("user_id", uid);
  if (error) throw new Error(friendly(error.message));
  return clean;
}

/* ---------------- scores ---------------- */

export async function submitScore(uid: string, entry: ScoreEntry): Promise<void> {
  await ensureProfile(uid, "SPIDER");
  const { error } = await client().from("websling_scores").insert({
    user_id: uid,
    mode: entry.mode,
    score: entry.score,
    tokens: entry.tokens,
    max_combo: entry.maxCombo,
    best_swing: entry.bestSwing,
    time_left: entry.timeLeft,
    placement: entry.placement,
  });
  if (error) throw new Error(friendly(error.message));
}

export async function fetchLeaderboard(mode: "solo" | "free" | "versus" | "all"): Promise<BoardRow[]> {
  const { data, error } = await client().rpc("websling_leaderboard", {
    p_mode: mode === "all" ? null : mode,
    p_limit: 100,
  });
  if (error) throw new Error(friendly(error.message));
  const rows = (data as Array<Record<string, unknown>>) ?? [];
  return rows.map((r) => ({
    userId: String(r.user_id ?? ""),
    name: String(r.display_name ?? "SPIDER"),
    mode: String(r.mode ?? "solo"),
    score: Number(r.score ?? 0),
    tokens: Number(r.tokens ?? 0),
    maxCombo: Number(r.max_combo ?? 0),
    bestSwing: Number(r.best_swing ?? 0),
    at: String(r.created_at ?? ""),
  }));
}

export async function fetchMyBest(mode: "solo" | "free" | "versus" | "all", uid: string): Promise<number | null> {
  let q = client().from("websling_scores").select("score").eq("user_id", uid);
  if (mode !== "all") q = q.eq("mode", mode);
  const { data } = await q.order("score", { ascending: false }).limit(1).maybeSingle();
  return data ? Number((data as { score: number }).score) : null;
}
