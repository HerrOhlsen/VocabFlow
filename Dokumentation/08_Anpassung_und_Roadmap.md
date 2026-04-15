# 08 — Anpassung und Roadmap

## Anpassung auf andere Fächer und Sprachen

VocabFlow ist nicht auf Englisch-Vokabeln festgelegt. Die Datenmodell-Felder sind generisch:
- `front_main` / `back_main` — beliebiger Content (Text, Formel, Fachbegriff)
- `example` — Kontext-Satz
- `audio_url` / `image` — optional
- `tags` — Freitext-Array

### Beispiel: Latein-Vokabeln

```json
{
  "id": "card_1",
  "front_main": "aqua, aquae",
  "front_sub": "f.",
  "back_main": "Wasser",
  "example": "In <b>aqua</b> vita est."
}
```

Set-Metadaten: `subject = "Latein"`, `language = "la"`, `level = "Lektion 3"`.

### Beispiel: Physik-Formeln

```json
{
  "id": "card_17",
  "front_main": "Ohmsches Gesetz",
  "back_main": "U = R · I",
  "back_sub": "U: Spannung, R: Widerstand, I: Stromstärke",
  "example": "Bei <b>R = 10 Ω</b> und I = 2 A fließt U = 20 V."
}
```

### Beispiel: Chemie-Elemente

```json
{
  "id": "card_3",
  "front_main": "Na",
  "back_main": "Natrium",
  "back_sub": "Ordnungszahl 11",
  "tags": ["Alkalimetalle", "Gruppe 1"]
}
```

Die FSRS-Engine ist content-agnostisch. Jede atomare Wissenseinheit funktioniert.

## Anpassung auf andere Schulen

### Was einfach ist

- **Supabase-Credentials austauschen** (URL + Anon Key in vocabflow.html).
- **Fach-Dropdown** im Editor (~Zeile 2100 in vocabflow.html) — Liste anpassen.
- **Branding** — Farbvariablen im `<style>`-Block am Dateianfang (Akzentfarbe, Schriftart).
- **Oxford 5000 übernehmen** oder weglassen — pro Schule entscheidbar.

### Was Aufwand macht

- **Audio-Sets migrieren** — Wenn man Oxford 5000 nutzen will, müssen die MP3s in den eigenen Supabase `audio`-Bucket hochgeladen werden (ca. 12 000 Dateien, ~1,5 GB). Mit kleinem Script machbar.
- **Teacher-Whitelist pflegen** — ein:e Admin muss initial alle Lehrkräfte per SQL-INSERT eintragen.

### Was man nicht anpassen sollte

- **Edge-Function-Contract** (Payload-Format, Rate-Limits) — nicht brechen, das bricht jeden bestehenden Client.
- **UNIQUE-Constraints** auf `progress(user_name, set_id, card_id)` — essenziell für Upsert.
- **Karten-`id`-Stabilität** — wenn `card_id` neu generiert wird, geht Progress verloren.

## Offene Features (Roadmap, geordnet)

### Kurzfristig

- **K2-Fix** — `set-manager` auf Audit-Log-Pattern umstellen (wie `vocab-write`).
- **W3-Fix** — Autosave-Race-Condition im Set-Editor (zwei parallele `scheduleEditorSave`-Timer können sich überschreiben). Entweder Lock einbauen oder dokumentieren.
- **W7-Fix** — Storage-Bucket-Policies restriktiver (Objekt-Listing einschränken, direkte Objekte bleiben public).

### Mittelfristig

- **Lehrer-Dashboard** — Übersicht über SuS-Fortschritt. Aggregierende RPC statt Full-Load.
  - Use-Case: Klassenleitung sieht „Wer hat in den letzten 7 Tagen geübt?"
  - Anforderung: Neue Edge Function `get-class-stats`, die nur aggregierte Daten zurückgibt (kein User-Mapping).
- **Lokale Spiegelung der `vocab_sets`** — Für Offline-Lernen.
- **Wortfelder für Sprechprüfungen** — Thematische Cluster, die spezifisch auf Prüfungsformate trainieren.
- **Private/urheberrechtsgeschützte Sets** — Private Bucket + Edge-Function-Proxy für Lehrbuchmaterial (darf nicht öffentlich einsehbar sein).
- **Löschkonzept nach 1 Jahr Inaktivität** — Cron (pg_cron) löscht User-Rows bei `MAX(last_review) < now() - interval '1 year'`. Aktuell versprochen, aber manuell.

### Langfristig

- **Option B: Supabase Auth** — Für echtes Per-User-Read-RLS.
  - Bedeutet: JWT-Austausch zwischen Moodle und Supabase (z.B. via signierter Token in SCORM-Launch-URL).
  - Große Umbaumaßnahme, die Usability bleibt gleich.
  - Schwelle: Sinnvoll sobald sensible Daten verarbeitet werden oder Skalierung >500 aktive User.
- **Module-Split von vocabflow.html** — Aktuell ~2900 Zeilen. Bei >4000 Zeilen sinnvoll: Split in `app.js`, `fsrs.js`, `editor.js` (aber dann Build-Step für SCORM-Bundle nötig).

## Wie man mit einem LLM weiterentwickelt

Empfohlener Workflow:

1. **Kontext geben:** Dokumentation (diesen Ordner) + `vocabflow.html` + SQL-Schema an den Assistenten.
2. **Kleine Schritte:** Ein Feature pro Session, testen, committen.
3. **Audit-Log als Safety-Net:** Nach jeder Änderung einen schnellen Check: Sind Writes noch nachvollziehbar?
4. **Versionskontrolle:** git-Repository anlegen, damit man bei Fehlern zurückrollen kann.
5. **SCORM-Update-Zyklus:** ZIP neu bauen und hochladen, Moodle holt es per Auto-Update oder manuell neu.

### Empfohlene Skills/MCP-Server für Claude

Für eine eigene Implementierung lohnt es sich, Claude (z.B. Claude Code oder Claude Desktop) mit passenden Skills und MCP-Servern auszustatten — dann kann er den Großteil der Arbeit direkt übernehmen, statt nur Code-Snippets zu liefern:

- **Frontend-Skill** — für die Arbeit an `vocabflow.html`: inline HTML/CSS/JS lesen und editieren, XSS-Schutz beachten, UI-Flows anpassen. Ein eigener Frontend-orientierter Subagent/Skill hilft, Konsistenz im großen Single-File-HTML zu halten.
- **Supabase MCP-Server** (`@supabase/mcp-server-supabase`) — ermöglicht Claude direkt:
  - Tabellen anlegen (`apply_migration`)
  - SQL ausführen (`execute_sql`) — z.B. Teacher-Eintrag, Audit-Log-Check
  - Edge Functions deployen (`deploy_edge_function`)
  - Logs lesen (`get_logs`) — beim Debugging Gold wert
  - Policies inspizieren (`list_tables`, `get_advisors`)

Mit beidem zusammen kann Claude ein komplettes Schul-Setup (Tabellen, Policies, Functions, Test-Insert) in einer einzigen Session durchführen, während man ihm parallel die Credentials in den Skill steckt. Das senkt die Einstiegshürde dramatisch.

### Kommunikationskanal

Fragen, Fehlerberichte und Ideen gerne als **GitHub Issue** im Repo — das ist der bevorzugte Weg vor E-Mail, weil andere Schulen von den Antworten mit profitieren.

## Wenn etwas kaputtgeht

- **Audit-Log anschauen** (`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100`) — zeigt, was schiefgegangen ist.
- **Edge Function Logs** in Supabase Dashboard → Functions → Logs.
- **Browser DevTools** → Network-Tab → auf `/functions/v1/vocab-write` Calls schauen.
- **Rollback** — vorige `vocabflow.zip` hochladen, Moodle holt sie neu. Keine Migration nötig.

## Kontakt

Bei Fragen oder Kooperationsinteresse: `malte.ohlsen@igs-seevetal.de`

Das Projekt ist **frei nachnutzbar** (keine Lizenz-Komplikationen). Rückmeldungen über Erfahrungen, Erweiterungen oder DSGVO-Bewertungen sind willkommen — je mehr Schulen sich das ansehen, desto besser werden die Materialien.
