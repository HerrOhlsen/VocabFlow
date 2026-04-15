# 03 — Datenmodell

Alle Tabellen liegen im `public` Schema der Supabase-Postgres-Instanz.

## Übersicht

| Tabelle | Zweck | Write-Zugriff |
|---|---|---|
| `vocab_sets` | Vokabelsets (globale Library) | nur via `set-manager` Edge Function |
| `user_sets` | Welche Sets hat welcher User aktiviert? | nur via `vocab-write` Edge Function |
| `progress` | FSRS-Lernstand pro Karte pro User | nur via `vocab-write` Edge Function |
| `teachers` | Whitelist für Lehrer-Funktionen | nur manuell (Admin) |
| `audit_log` | Forensik-Log aller Writes | nur Service-Role |

## `vocab_sets`

```sql
CREATE TABLE public.vocab_sets (
  id          text PRIMARY KEY,          -- z.B. "englisch_oxford5000_a1"
  name        text NOT NULL,
  description text,
  language    text,                      -- "en", "fr", ...
  level       text,                      -- "A1" ... "C1"
  subject     text,                      -- "Englisch"
  category    text,                      -- Gruppierung in Library
  grade_level text,                      -- "7", "Oberstufe", ...
  has_reverse boolean DEFAULT false,     -- Abfrage beidseitig?
  owner_id    text,                      -- user_name der erstellenden Lehrkraft
  archived    boolean DEFAULT false,     -- Soft-Delete
  published   boolean DEFAULT false,     -- SuS sehen nur published=true
  cards       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.vocab_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select" ON public.vocab_sets
  FOR SELECT TO anon USING (true);
-- Writes nur über Edge Function set-manager (Service-Role-Key)
```

### Karten-Format (flat, innerhalb `cards` jsonb)

```json
{
  "id": "card_42",
  "front_main": "apple",
  "front_sub": "noun",
  "back_main": "der Apfel",
  "back_sub": "(der) Apfel / Äpfel",
  "example": "I eat an <b>apple</b> every morning.",
  "tags": ["food", "A1"],
  "audio_url": "https://.../audio/apple.mp3",
  "example_audio_url": "https://.../audio/apple_sentence.mp3",
  "image": "https://.../apple.jpg",
  "mnemonic": "Denk an Apfel-Strudel"
}
```

**Felder:**
- `id` — stabil über Set-Editierungen hinweg, wird nie neu generiert (Progress bleibt erhalten)
- `front_main` / `back_main` — Hauptbegriff beidseitig
- `front_sub` / `back_sub` — optional, kleine Zusatzinfo (Wortart, Artikel)
- `example` — Beispielsatz, `<b>…</b>` markiert Cloze-Wort
- `tags` — Array für Filter/Gruppierung
- `audio_url` / `example_audio_url` — optionale MP3-Links
- `image` — optionaler Bildlink
- `mnemonic` — Eselsbrücke (nur Back-View sichtbar)

**XSS-Schutz:** Beim Rendering wird `escapeHtml` auf alle Felder angewendet, dann gezielt `<b>` wiederhergestellt. Andere HTML-Tags werden gestrippt.

## `user_sets`

```sql
CREATE TABLE public.user_sets (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_name     text NOT NULL,
  set_id        text NOT NULL REFERENCES public.vocab_sets(id) ON DELETE CASCADE,
  activated_at  timestamptz DEFAULT now(),
  UNIQUE (user_name, set_id)
);

CREATE INDEX idx_user_sets_user ON public.user_sets(user_name);
CREATE INDEX idx_user_sets_set  ON public.user_sets(set_id);

ALTER TABLE public.user_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.user_sets FOR SELECT TO anon USING (true);
```

## `progress`

```sql
CREATE TABLE public.progress (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_name      text NOT NULL,
  set_id         text NOT NULL,
  card_id        text NOT NULL,
  stability      real,        -- FSRS S
  difficulty     real,        -- FSRS D
  repetitions    int DEFAULT 0,
  interval_days  int DEFAULT 0,
  next_review    date,
  last_review    date,
  last_rating    int,         -- 1=Again, 2=Hard, 3=Good, 4=Easy
  lapses         int DEFAULT 0,
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (user_name, set_id, card_id)
);

CREATE INDEX idx_progress_user     ON public.progress(user_name);
CREATE INDEX idx_progress_user_set ON public.progress(user_name, set_id);
CREATE INDEX idx_progress_set      ON public.progress(set_id);

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.progress FOR SELECT TO anon USING (true);
```

**UNIQUE `(user_name, set_id, card_id)`** ist zwingend — wird für Upsert beim Write genutzt.

## `teachers`

```sql
CREATE TABLE public.teachers (
  user_name    text PRIMARY KEY,    -- z.B. "moodle_4"
  display_name text NOT NULL,
  added_at     timestamptz DEFAULT now(),
  added_by     text
);

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON public.teachers FOR SELECT TO anon USING (true);
-- INSERT/UPDATE/DELETE nur manuell per SQL
```

App prüft beim Boot `SELECT * FROM teachers WHERE user_name = $1` — Treffer schaltet Lehrer-UI frei.

## `audit_log`

```sql
CREATE TABLE public.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_name   text,
  action      text,        -- "save_progress" | "activate_set" | ...
  status      text,        -- "ok" | "invalid_user" | "rate_user" | ...
  target      jsonb,       -- {set_id, card_id}
  ip_hash     text,        -- SHA256(Salt + IP), truncated to 32 chars
  user_agent  text,
  error       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_user    ON public.audit_log(user_name, created_at);
CREATE INDEX idx_audit_ip      ON public.audit_log(ip_hash, created_at);
CREATE INDEX idx_audit_created ON public.audit_log(created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- Keine Policies für anon — nur Service-Role kann lesen/schreiben
```

## RLS-Status-Tabelle

| Tabelle | anon SELECT | anon WRITE |
|---|---|---|
| `vocab_sets` | ✓ | ✗ — Edge Function |
| `user_sets` | ✓ | ✗ — Edge Function |
| `progress` | ✓ | ✗ — Edge Function |
| `teachers` | ✓ | ✗ — manuell |
| `audit_log` | ✗ | ✗ — Service-Role |

**Wichtig:** SELECTs sind offen. Ein Client mit anon-Key kann theoretisch den Fortschritt anderer User lesen. Für echte Per-User-Reads bräuchte es Supabase Auth (siehe [07_Sicherheit_Datenschutz.md](07_Sicherheit_Datenschutz.md)).

## Warum `user_name` als text, keine Foreign Key auf `auth.users`?

Kein Supabase Auth → keine `auth.users`-Einträge. User-Identität kommt aus Moodle (`M.cfg.userId`). Als Text-Spalte bleibt das flexibel:
- `moodle_4` für Moodle-authentifizierte User
- `dev_name` für Dev-Login-Fallback
- `guest` wird nie gespeichert (Guards im Frontend)

Convention statt Constraint. Validiert wird in der Edge Function per Regex.
