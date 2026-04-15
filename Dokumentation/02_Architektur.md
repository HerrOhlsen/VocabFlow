# 02 — Architektur

## System-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│ Moodle                                                       │
│  └─ SCORM-Aktivität                                          │
│       └─ entpacktes ZIP (imsmanifest.xml + index.html)       │
│            └─ HTML wird aus Moodle-Domain geliefert          │
│                 ├─ liest M.cfg.userId (globales JS-Objekt)   │
│                 └─ spricht direkt Supabase an                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTPS, CORS offen
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Supabase (PostgreSQL + Edge Functions + Storage)             │
│                                                              │
│  ┌──────────────────┐    ┌────────────────────────────────┐  │
│  │ REST API (Reads) │    │ Edge Functions (Writes)        │  │
│  │  vocab_sets      │    │  vocab-write  (SuS: progress)  │  │
│  │  user_sets       │    │  set-manager  (Lehrer: Sets)   │  │
│  │  progress        │    │                                │  │
│  │  teachers        │    │  Service-Role-Key,             │  │
│  │                  │    │  Rate-Limits, Audit-Log        │  │
│  └──────────────────┘    └────────────────────────────────┘  │
│                                                              │
│  Storage Buckets: app (ZIP), audio (MP3s)                    │
└─────────────────────────────────────────────────────────────┘
```

## Drei Layer, klar getrennt

### Layer 1: Moodle-Seite

Moodle stellt bereit:
- **Hosting** — entpacktes SCORM-ZIP wird aus Moodle-eigener Domain geliefert (umgeht Supabase-CSP-Probleme).
- **Authentifizierung** — Moodle-Login ist die einzige Auth-Quelle.
- **User-ID** — `window.M.cfg.userId` (numerisch, camelCase) auf jeder Moodle-Seite verfügbar.
- **SCORM-API** — `window.API` (SCORM 1.2) für Launch, Score-Reporting, `cmi.core.student_name`.

### Layer 2: Frontend (vocabflow.html)

Eine Single-File-HTML mit:
- **FSRS-Engine** — Algorithmus zur Karten-Planung, läuft vollständig client-seitig.
- **UI-Flows** — Dashboard, Lern-Modus, Set-Manager, Editor.
- **Supabase-Client** — Reads direkt über REST API (`@supabase/supabase-js` per CDN geladen), Writes über Edge Function Calls.
- **SCORM-Bridge** — sucht `window.API` durch alle parent frames, initialisiert Session, meldet Score.

### Layer 3: Supabase-Backend

- **PostgreSQL** mit 5 Produktiv-Tabellen (`vocab_sets`, `user_sets`, `progress`, `teachers`, `audit_log`).
- **Row Level Security (RLS)** — SELECTs offen für anon, Writes nur über Edge Functions.
- **Edge Functions** (Deno) — `vocab-write` (SuS), `set-manager` (Lehrer). Beide verifizieren User-Name-Format, rate-limiten, loggen.
- **Storage** — Bucket `app` für SCORM-ZIP, Bucket `audio` für MP3s.

## Datenfluss: SuS bewertet eine Karte

```
1. SuS klickt "Good" im Frontend
2. Frontend ruft FSRS-Engine: berechnet neue stability/difficulty/next_review
3. Frontend updatet optimistisch das UI (kein Warten auf Server)
4. Frontend schickt POST /functions/v1/vocab-write
     { action: "save_progress", user_name: "moodle_4", payload: {...} }
5. Edge Function:
     a. Validiert user_name-Regex
     b. Prüft Rate-Limit (User + IP)
     c. Upsert in progress-Tabelle
     d. Schreibt audit_log-Entry
6. Bei Fehler: Frontend rollt optimistisches Update zurück
```

## Datenfluss: Lehrer erstellt neues Set

```
1. Lehrer öffnet Set-Manager (Menüpunkt nur sichtbar für User in teachers-Tabelle)
2. "Neues Set" → Editor öffnet mit leerem Entwurf
3. Lehrer editiert inline, Autosave (debounced, 2s) ruft:
     POST /functions/v1/set-manager
     { action: "update", user_name: "moodle_4", set_id: "...", data: {...} }
4. Edge Function:
     a. Prüft Whitelist (user_name in teachers?)
     b. Prüft Owner (user_name == set.owner_id?)
     c. Update in vocab_sets
5. Lehrer toggled "Veröffentlicht"
6. SuS-Library zeigt das Set ab sofort (filter: published=true AND archived=false)
```

## Warum SCORM statt LTI (historisch)

Der erste Entwurf war LTI 1.1:
1. Moodle → LTI Launch → Edge Function `lti-launch`
2. Function verifiziert OAuth-Signatur, erzeugt Ticket
3. Function redirected zu gehostetem HTML mit Ticket in URL
4. HTML tauscht Ticket gegen User-Name

**Problem:** Schritt 3 scheiterte hart. Supabase-Hosting (Storage + Edge Functions) liefert HTML aus `*.supabase.co` mit:
- `Content-Type: text/plain`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: default-src 'none'; sandbox`

Browser rendern solches HTML nicht. Das ist Anti-Phishing-Härtung bei Supabase und nicht umgehbar (bestätigt durch Supabase-Support).

Alternative Hosting-Optionen (Netlify, Vercel, eigener Server) wurden verworfen:
- Mehr Infrastruktur, mehr DSGVO-Verträge.
- Cross-Origin zu Moodle → iframe-Einbettung + PostMessage → deutlich komplexer.

**Lösung SCORM:**
- Moodle entpackt ZIP beim Upload und liefert das HTML aus eigener Domain (`pluginfile.php`).
- Kein Cross-Origin-Problem.
- SCORM-API liefert User-Identität direkt, keine Auth-Funktion nötig.
- Eleganter als erwartet — der SCORM-Standard ist alt, aber für genau diesen Use-Case gemacht.

**Nachteile SCORM:**
- Update-Zyklus: Neue Version = ZIP neu bauen + hochladen + in Moodle neu importieren (oder Cron-Update).
- Debug-Schwieriger: SCORM-Iframe ist tief verschachtelt, DevTools brauchen Context-Switch.

## Technologie-Entscheidungen auf einen Blick

| Entscheidung | Gewählt | Verworfen | Grund |
|---|---|---|---|
| Integration | SCORM 1.2 | LTI 1.1 / 1.3 | Hosting-Problem bei Supabase |
| Frontend | Single-File-HTML | React/Vue SPA | Wartbarkeit, keine Build-Pipeline |
| Backend | Supabase | Self-hosted Postgres + Node | Schulkontext: wenig Ops-Kapazität |
| Auth | `M.cfg.userId` aus Moodle | Supabase Auth | Keine Registrierung, kein Passwort-Handling |
| Writes | Edge Function Gatekeeper | Direkter DB-Write über RLS | Audit-Log, Rate-Limits, Input-Validierung |
| Algorithmus | FSRS | SM-2 (Anki-Original) | Moderner, adaptiver, Open Source |
| Audio | Statisch im Supabase Storage | TTS On-Demand | Kosten, Latenz, Stabilität |
