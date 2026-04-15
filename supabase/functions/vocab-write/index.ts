import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Used to hash IPs in the audit_log. Rotate if leaked.
// Set IP_SALT as a secret in Supabase (Functions → Secrets) or replace inline.
const IP_SALT = Deno.env.get("IP_SALT") ?? "REPLACE_WITH_RANDOM_SECRET";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const USER_NAME_RE = /^(moodle_\d{1,20}|dev_[a-z0-9_-]{1,40})$/;
const SET_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const CARD_ID_RE = /^[a-zA-Z0-9_.:/-]{1,128}$/;

const RATE_LIMIT_USER_PER_HOUR = 1500;
const RATE_LIMIT_IP_PER_HOUR = 3000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function logAudit(row: Record<string, unknown>) {
  try { await admin.from("audit_log").insert(row); } catch (_e) { /* swallow */ }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const ipRaw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ip_hash = (await sha256(IP_SALT + ":" + ipRaw)).slice(0, 32);
  const user_agent = (req.headers.get("user-agent") || "").slice(0, 200);

  let body: any;
  try { body = await req.json(); } catch {
    await logAudit({ action: "unknown", status: "invalid", ip_hash, user_agent, error: "bad json" });
    return json({ error: "bad json" }, 400);
  }

  const action = String(body?.action || "");
  const user_name = String(body?.user_name || "");
  const payload = body?.payload || {};

  if (!USER_NAME_RE.test(user_name)) {
    await logAudit({ user_name, action, status: "invalid_user", ip_hash, user_agent, target: payload });
    return json({ error: "invalid user_name" }, 400);
  }

  // Rate limits
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: userCount }, { count: ipCount }] = await Promise.all([
    admin.from("audit_log").select("*", { count: "exact", head: true }).eq("user_name", user_name).gte("created_at", hourAgo),
    admin.from("audit_log").select("*", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", hourAgo),
  ]);
  if ((userCount ?? 0) >= RATE_LIMIT_USER_PER_HOUR) {
    await logAudit({ user_name, action, status: "rate_user", ip_hash, user_agent });
    return json({ error: "rate limit (user)" }, 429);
  }
  if ((ipCount ?? 0) >= RATE_LIMIT_IP_PER_HOUR) {
    await logAudit({ user_name, action, status: "rate_ip", ip_hash, user_agent });
    return json({ error: "rate limit (ip)" }, 429);
  }

  try {
    if (action === "save_progress") {
      const { set_id, card_id, stability, difficulty, repetitions, interval_days, next_review, last_review, last_rating, lapses } = payload;
      if (!SET_ID_RE.test(String(set_id || ""))) throw new Error("set_id");
      if (!CARD_ID_RE.test(String(card_id || ""))) throw new Error("card_id");
      if (typeof stability !== "number" || typeof difficulty !== "number") throw new Error("fsrs numeric");
      if (!Number.isFinite(stability) || !Number.isFinite(difficulty)) throw new Error("fsrs finite");
      const row = {
        user_name, set_id, card_id,
        stability, difficulty,
        repetitions: Number(repetitions) | 0,
        interval_days: Number(interval_days) | 0,
        next_review, last_review,
        last_rating: Number(last_rating) | 0,
        lapses: Number(lapses) | 0,
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin.from("progress").upsert(row, { onConflict: "user_name,set_id,card_id" });
      if (error) throw error;
      await logAudit({ user_name, action, status: "ok", target: { set_id, card_id }, ip_hash, user_agent });
      return json({ ok: true });
    }

    if (action === "activate_set" || action === "deactivate_set") {
      const set_id = String(payload?.set_id || "");
      if (!SET_ID_RE.test(set_id)) throw new Error("set_id");
      if (action === "activate_set") {
        const { error } = await admin.from("user_sets").insert({ user_name, set_id });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await admin.from("user_sets").delete().eq("user_name", user_name).eq("set_id", set_id);
        if (error) throw error;
      }
      await logAudit({ user_name, action, status: "ok", target: { set_id }, ip_hash, user_agent });
      return json({ ok: true });
    }

    await logAudit({ user_name, action, status: "invalid_action", ip_hash, user_agent });
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    await logAudit({ user_name, action, status: "error", ip_hash, user_agent, error: String((e as Error).message || e).slice(0, 300), target: payload });
    return json({ error: "server" }, 500);
  }
});
