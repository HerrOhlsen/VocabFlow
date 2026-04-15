import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { action, user_name } = body as { action: string; user_name: string };
  if (!action || !user_name) {
    return json({ error: "Missing action or user_name" }, 400);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Verify teacher
  const { data: teacher, error: tErr } = await sb
    .from("teachers")
    .select("user_name")
    .eq("user_name", user_name)
    .maybeSingle();
  if (tErr || !teacher) {
    return json({ error: "Unauthorized: not a teacher" }, 403);
  }

  // ── CREATE ──
  if (action === "create") {
    const setData = (body as { set: Record<string, unknown> }).set;
    if (!setData || !setData.id) {
      return json({ error: "Missing set data" }, 400);
    }
    // Force owner to requesting user, new sets start unpublished
    setData.owner_id = user_name;
    setData.archived = false;
    setData.published = false;
    const { error } = await sb.from("vocab_sets").insert(setData);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── UPDATE ──
  if (action === "update") {
    const { set_id, data: updateData } = body as { set_id: string; data: Record<string, unknown> };
    if (!set_id || !updateData) {
      return json({ error: "Missing set_id or data" }, 400);
    }
    // Verify ownership
    const { data: existing } = await sb
      .from("vocab_sets")
      .select("owner_id")
      .eq("id", set_id)
      .single();
    if (!existing || existing.owner_id !== user_name) {
      return json({ error: "Not the owner of this set" }, 403);
    }
    // Never allow changing owner_id or id via update
    delete updateData.owner_id;
    delete updateData.id;
    updateData.updated_at = new Date().toISOString();
    const { error } = await sb.from("vocab_sets").update(updateData).eq("id", set_id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── ARCHIVE ──
  if (action === "archive") {
    const { set_id } = body as { set_id: string };
    if (!set_id) return json({ error: "Missing set_id" }, 400);
    const { data: existing } = await sb
      .from("vocab_sets")
      .select("owner_id")
      .eq("id", set_id)
      .single();
    if (!existing || existing.owner_id !== user_name) {
      return json({ error: "Not the owner of this set" }, 403);
    }
    const { error } = await sb
      .from("vocab_sets")
      .update({ archived: true, published: false, updated_at: new Date().toISOString() })
      .eq("id", set_id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unknown action: " + action }, 400);
});
