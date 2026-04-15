# 06 — Setup-Anleitung

Schritt-für-Schritt-Anleitung, um VocabFlow an einer anderen Schule nachzubauen. Mit KI-Unterstützung (Claude, GPT) in ~1–2 Tagen machbar.
Claude unterstützt eine MCP Verbindung zu Supabase und kann dementsprechend das Meiste übernehmen.

## Voraussetzungen

- **Moodle** (Version 3.x+ mit SCORM-Aktivität, standardmäßig enthalten)
- **Moodle-Admin-Rechte** (für SCORM-Aktivität + „Zusätzliches HTML" für Dashboard-Widget)
- **Supabase-Account** (kostenlos für kleine Schulen, ~500 MB DB, 1 GB Storage, 500 K Edge-Function-Calls/Monat)
- **Texteditor** (VS Code empfohlen) + **Zugang zu einem LLM** (Claude Code, Cursor, GitHub Copilot, ChatGPT)
- Optional: **git** für Versionierung

## Schritt 1: Supabase-Projekt anlegen

1. `https://supabase.com` → Account → „New Project".
2. Region: EU (Frankfurt) wegen DSGVO.
3. Name: z.B. `vocabflow-schulname`.
4. Passwort setzen (wird für DB-Verbindungen gebraucht).
5. Warten bis das Projekt grün ist (~2 Min).

In den Projekt-Settings notieren:
- **URL:** `https://<project-id>.supabase.co`
- **Publishable/Anon Key** (unter API → Project API keys → `anon public`)
- **Service-Role Key** (unter API → nie ins Frontend!)

## Schritt 2: Datenbank-Schema anlegen

Im Supabase SQL Editor (Project → SQL Editor) nacheinander ausführen. Alle Statements sind in [03_Datenmodell.md](03_Datenmodell.md) dokumentiert.

```sql
-- 1. vocab_sets
CREATE TABLE public.vocab_sets (...);

-- 2. user_sets
CREATE TABLE public.user_sets (...);

-- 3. progress
CREATE TABLE public.progress (...);

-- 4. teachers
CREATE TABLE public.teachers (...);

-- 5. audit_log
CREATE TABLE public.audit_log (...);

-- 6. Indizes + RLS-Policies (siehe 03_Datenmodell.md)
```

## Schritt 3: Storage-Buckets anlegen

Im Supabase Dashboard → Storage → „New Bucket":

- **`app`** (public)
  - Allowed MIME types: `application/zip, text/html, application/javascript, text/css, image/png, image/jpeg, image/svg+xml, application/json`
  - Hier landet später die `vocabflow.zip`.
- **`audio`** (public) — nur nötig, wenn Audio-Dateien genutzt werden.

## Schritt 4: Edge Functions deployen

Zwei Functions: `vocab-write` und `set-manager`. Code siehe [04_Edge_Functions.md](04_Edge_Functions.md).

### Variante A: Supabase Dashboard (einfach)

Dashboard → Edge Functions → „New Function":
1. Name: `vocab-write`
2. Code aus [04_Edge_Functions.md](04_Edge_Functions.md) einfügen
3. Deploy
4. Wiederholen für `set-manager`

### Variante B: Supabase CLI (fortgeschritten)

```bash
npx supabase init
npx supabase functions new vocab-write
# Code in supabase/functions/vocab-write/index.ts einfügen
npx supabase functions deploy vocab-write --no-verify-jwt
```

**Wichtig:** `--no-verify-jwt` (oder in Dashboard „Verify JWT" deaktivieren), da wir keinen Supabase Auth nutzen.

**Environment Variables für `vocab-write`:**
- `SUPABASE_URL` (automatisch gesetzt)
- `SUPABASE_SERVICE_ROLE_KEY` (automatisch gesetzt)
- Optional: `IP_SALT` als eigenen Secret. Sonst hardcoded lassen.

## Schritt 5: Als Lehrer eintragen

Nach Deployment einmalig in der `teachers`-Tabelle eintragen (zunächst mit dem eigenen Moodle-User-Namen, den man nach erstem SCORM-Launch sehen kann):

```sql
INSERT INTO public.teachers (user_name, display_name, added_by)
VALUES ('moodle_42', 'Frau Mustermann', 'admin');
```

Wie bekommt man die eigene Moodle-User-ID?
- In Moodle einloggen, Profilseite aufrufen, URL endet mit `?id=42` → User-ID ist 42.
- Oder in der Browser-Konsole auf einer Moodle-Seite: `M.cfg.userId`.

## Schritt 6: vocabflow.html anpassen

Code aus dem GitHub-Repo holen (`git clone` oder ZIP-Download) und `app/vocabflow.html` in einem Editor öffnen.

Zwei Stellen ändern (am Dateianfang):
```js
const SUPABASE_URL = "https://<DEINE-PROJECT-ID>.supabase.co";
const SUPABASE_KEY = "<DEIN-ANON-KEY>";
```

Anpassen mit KI-Assistent: „Passe die Supabase-Config an folgende Werte an …"

## Schritt 7: SCORM-ZIP bauen

Struktur:
```
vocabflow.zip
  ├─ imsmanifest.xml
  └─ index.html    (die umbenannte vocabflow.html)
```

`imsmanifest.xml` (einmalig kopieren, Stand-SCORM-1.2):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="vocabflow" version="1.2"
          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG1">
    <organization identifier="ORG1">
      <title>VocabFlow</title>
      <item identifier="ITEM1" identifierref="RES1">
        <title>VocabFlow</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent"
              adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
```

ZIP bauen (Windows):
```powershell
Compress-Archive -LiteralPath imsmanifest.xml, index.html -DestinationPath vocabflow.zip
```

Mac/Linux:
```bash
zip vocabflow.zip imsmanifest.xml index.html
```

## Schritt 8: ZIP in Supabase Storage hochladen

Einfachste Variante: Dashboard → Storage → Bucket `app` → „Upload File".

Für spätere Auto-Updates (per Moodle-Cron) bleibt die Datei unter derselben URL:
```
https://<project-id>.supabase.co/storage/v1/object/public/app/vocabflow.zip
```

## Schritt 9: SCORM-Aktivität in Moodle anlegen

1. Moodle-Kurs aufrufen → „Material oder Aktivität anlegen" → SCORM-Paket.
2. Name: „VocabFlow".
3. Paket: **URL statt Datei-Upload**. Die Public-URL des ZIPs einfügen.
4. „Automatisches Update" aktivieren (Einstellung: täglich oder bei jedem Öffnen).
5. Anzeige: „Neues Fenster" empfohlen (mehr Platz).
6. Bewertungsart: Höchste Bewertung.
7. Speichern.

Beim ersten Öffnen als SuS sollte die App starten, `M.cfg.userId` auslesen und das Dashboard anzeigen.

## Schritt 10: Erstes Set erstellen

Als Lehrer einloggen → SCORM öffnen → Menü „Sets verwalten" erscheint (wenn `teachers`-Eintrag stimmt).

„Neues Set" → Metadaten ausfüllen → Karten hinzufügen (manuell oder per JSON-Import).

### JSON-Import-Workflow mit externer KI

Lehrer öffnet externes LLM (Claude.ai / ChatGPT) und kopiert den Prompt, den der Editor zur Verfügung stellt:

```
Erstelle ein Vokabelset im folgenden JSON-Format:
[
  {
    "id": "card_1",
    "front_main": "...",
    "back_main": "...",
    "example": "... <b>Wort</b> ..."
  },
  ...
]

Thema: <Lehrer trägt hier ein>
Anzahl Karten: <X>
Niveau: <A1/A2/...>
```

LLM generiert JSON → Lehrer kopiert es in den JSON-Import-Dialog → Karten erscheinen → Review → Speichern.

## Schritt 11 (Optional): Dashboard-Widget

Das Inline-Widget zeigt Stats direkt auf der Moodle-Startseite.

1. Site-Administration → Darstellung → „Zusätzliches HTML" → „Vor `</body>`".
2. Code aus `vocabflow-widget-inline.html` einfügen.
3. Speichern.

Code-Pattern siehe Slash Command `moodle-widget.md` oder [02_Architektur.md](02_Architektur.md).

## Troubleshooting

| Problem | Lösung |
|---|---|
| SCORM lädt nicht | Browser-Konsole: CORS-Fehler? Supabase-URL richtig? |
| SuS sieht Sets nicht | Sind sie `published = true AND archived = false`? |
| Lehrer-Menü fehlt | User in `teachers`-Tabelle? `M.cfg.userId` vs. Eintrag stimmt? |
| Writes schlagen fehl | Edge Function deployed mit `--no-verify-jwt`? Logs in Supabase? |
| ZIP lädt Moodle nicht | `Content-Type` muss `application/zip` sein, nicht `text/html` |

## KI-Assistierte Umsetzung

Tipp: Diese Dokumentation plus die Original-`vocabflow.html` reichen aus, um einen LLM-Coding-Assistenten (Claude Code, Cursor) zu bitten:

> „Passe vocabflow.html an unser Supabase-Projekt an. URL: …, Anon Key: … . Lege die benötigten Tabellen an (Schema siehe 03_Datenmodell.md) und deploye die Edge Functions (Code siehe 04_Edge_Functions.md)."

Der Assistent kann dann alle Schritte automatisieren, inklusive SQL-Migrations und Function-Deploys — sofern er Supabase-CLI-Zugriff hat oder eine MCP Verbindung.
