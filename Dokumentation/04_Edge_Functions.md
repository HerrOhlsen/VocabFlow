# 04 — Edge Functions

Zwei produktive Edge Functions. Beide laufen auf Supabase (Deno-Runtime) und sind der einzige Schreibweg auf die DB.

## `vocab-write` — SuS-Writes

**Zweck:** SuS speichern FSRS-Fortschritt und aktivieren/deaktivieren Sets.

**Verifikationsmodell:**
- Kein JWT, kein echter Auth-Check (der Client kann beliebige `user_name` senden).
- Gegen Massen-Scans gehärtet durch: Regex-Format-Check, Rate-Limits, Audit-Log.
- Motivierter Angreifer mit anon-Key kann falsche Daten schreiben — sichtbar im Audit-Log.

**Endpoint:** `POST /functions/v1/vocab-write`

**Request Body:**
```json
{
  "action": "save_progress" | "activate_set" | "deactivate_set",
  "user_name": "moodle_4",
  "payload": { ... }
}
```

**Payloads:**

`save_progress`:
```json
{
  "set_id": "englisch_oxford5000_a1",
  "card_id": "card_42",
  "stability": 1.5,
  "difficulty": 5.2,
  "repetitions": 3,
  "interval_days": 4,
  "next_review": "2026-04-18",
  "last_review": "2026-04-14",
  "last_rating": 3,
  "lapses": 0
}
```

`activate_set` / `deactivate_set`:
```json
{ "set_id": "englisch_oxford5000_a1" }
```

**Response:**
- `200 { ok: true }` bei Erfolg
- `400` bei ungültigem Input
- `429` bei Rate-Limit-Überschreitung
- `500` bei DB-Fehler

### Code (gekürzt)

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_NAME_RE = /^(moodle_\d{1,20}|dev_[a-z0-9_-]{1,40})$/;
const ALLOWED_ACTIONS = new Set(["save_progress", "activate_set", "deactivate_set"]);
const RATE_LIMIT_USER_PER_HOUR = 1500;
const RATE_LIMIT_IP_PER_HOUR   = 3000;
const IP_SALT = Deno.env.get("IP_SALT") ?? "REPLACE_WITH_RANDOM_SECRET";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function hashIp(ip: string) {
  const data = new TextEncoder().encode(IP_SALT + ip);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function logAudit(entry: Record<string, unknown>) {
  await supabase.from("audit_log").insert(entry);
}

async function rateCheck(column: string, value: string, limit: number) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since);
  return (count ?? 0) < limit;
}

Deno.serve(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const ipHash = await hashIp(ip);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);

  try {
    const { action, user_name, payload } = await req.json();

    if (!USER_NAME_RE.test(user_name ?? "")) {
      await logAudit({ user_name, action, status: "invalid_user", ip_hash: ipHash, user_agent: ua });
      return new Response("Invalid user_name", { status: 400 });
    }
    if (!ALLOWED_ACTIONS.has(action)) {
      await logAudit({ user_name, action: "unknown", status: "invalid_action", ip_hash: ipHash, user_agent: ua });
      return new Response("Invalid action", { status: 400 });
    }
    if (!await rateCheck("user_name", user_name, RATE_LIMIT_USER_PER_HOUR)) {
      await logAudit({ user_name, action, status: "rate_user", ip_hash: ipHash, user_agent: ua });
      return new Response("Rate limit (user)", { status: 429 });
    }
    if (!await rateCheck("ip_hash", ipHash, RATE_LIMIT_IP_PER_HOUR)) {
      await logAudit({ user_name, action, status: "rate_ip", ip_hash: ipHash, user_agent: ua });
      return new Response("Rate limit (ip)", { status: 429 });
    }

    if (action === "save_progress") {
      const row = { user_name, ...payload, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from("progress")
        .upsert(row, { onConflict: "user_name,set_id,card_id" });
      if (error) throw error;
    } else if (action === "activate_set") {
      const { error } = await supabase
        .from("user_sets")
        .upsert({ user_name, set_id: payload.set_id }, { onConflict: "user_name,set_id" });
      if (error) throw error;
    } else if (action === "deactivate_set") {
      const { error } = await supabase
        .from("user_sets")
        .delete().eq("user_name", user_name).eq("set_id", payload.set_id);
      if (error) throw error;
    }

    await logAudit({
      user_name, action, status: "ok",
      target: payload?.set_id ? { set_id: payload.set_id, card_id: payload.card_id } : null,
      ip_hash: ipHash, user_agent: ua
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    await logAudit({ status: "error", error: String(e).slice(0, 500), ip_hash: ipHash, user_agent: ua });
    return new Response("Server error", { status: 500 });
  }
});
```

### Rate-Limit-Kalibrierung

- **1500/h pro User** — extrem selten legit überschritten (das wären 25 Bewertungen/Minute, eine Stunde lang).
- **3000/h pro IP** — typische Schul-Netze haben NAT, mehrere User teilen eine IP.

Bei Überschreitung: Audit-Entry mit `status=rate_user` / `rate_ip`, kein Write. User sieht Fehler-Toast.

## `set-manager` — Lehrer-CRUD

**Zweck:** Lehrer erstellen/bearbeiten/archivieren ihre eigenen Sets.

**Verifikationsmodell:**
- Prüft, ob `user_name` in `teachers`-Whitelist steht.
- Prüft bei Update/Archive, ob `user_name == set.owner_id`.
- **Bekanntes Finding K2:** Vertraut weiter `user_name` aus Body. Sollte wie `vocab-write` auf Audit-Log-Pattern umgestellt werden. Risiko aktuell minimal, da Teacher-Menge klein (in unserem Fall: 1 Person).

**Endpoint:** `POST /functions/v1/set-manager`

**Request Body:**
```json
{
  "action": "create" | "update" | "archive",
  "user_name": "moodle_4",
  "set_id": "...",        // bei update/archive
  "data": { ... },        // bei update (Teil-Update erlaubt)
  "set":  { ... }         // bei create (vollständiger Entwurf)
}
```

### Verträge

**`create`:**
- Generiert neue `id` (z.B. aus Name + Zufalls-Suffix).
- Erzwingt `owner_id = user_name`, `published = false`, `archived = false`.
- Response: `{ ok: true, id: "..." }`.

**`update`:**
- Prüft Owner-Berechtigung.
- Erlaubt alle Felder außer `id` und `owner_id`.
- Setzt `updated_at = now()`.

**`archive`:**
- Prüft Owner-Berechtigung.
- Setzt `archived = true, published = false`.
- Hart-Delete gibt es nicht (würde Progress-FKs verletzen).

### Code-Skelett

```ts
Deno.serve(async (req) => {
  const { action, user_name, set_id, data, set } = await req.json();

  const { data: teacher } = await supabase
    .from("teachers").select("user_name").eq("user_name", user_name).single();
  if (!teacher) return new Response("Not a teacher", { status: 403 });

  if (action === "create") {
    const id = generateSetId(set.name);
    const { error } = await supabase.from("vocab_sets").insert({
      ...set, id, owner_id: user_name, published: false, archived: false
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, id }), { ... });
  }

  if (action === "update" || action === "archive") {
    const { data: existing } = await supabase
      .from("vocab_sets").select("owner_id").eq("id", set_id).single();
    if (!existing || existing.owner_id !== user_name) {
      return new Response("Not owner", { status: 403 });
    }

    const update = action === "archive"
      ? { archived: true, published: false }
      : { ...data, updated_at: new Date().toISOString() };

    // Schutz: id und owner_id können nicht geändert werden
    delete update.id;
    delete update.owner_id;

    const { error } = await supabase
      .from("vocab_sets").update(update).eq("id", set_id);
    if (error) throw error;
  }

  return new Response(JSON.stringify({ ok: true }), { ... });
});
```

