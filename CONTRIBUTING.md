# Mitwirken an VocabFlow

Freut mich, dass du dir das anschaust. VocabFlow ist als pragmatisches Schulprojekt gestartet — Beiträge, die es für andere Schulen nutzbarer machen, sind sehr willkommen.

## Bugs und Ideen

- Bitte als **GitHub Issue** melden.
- Ein kurzer Reproduktionspfad reicht.
- Bei UI-Bugs gerne Screenshot, aber **ohne echte Schüler- oder Klassendaten** im Bild.

## Pull Requests

- Bei größeren Änderungen vorher ein Issue aufmachen, damit wir nicht aneinander vorbei arbeiten.
- Kleine Fixes (Tippfehler, Doku, UI-Details) gerne direkt als PR.
- Bitte die Single-File-Architektur respektieren — kein Build-Tooling, kein Framework. Siehe [Dokumentation/01_Konzept.md](Dokumentation/01_Konzept.md).

## Datenschutz — bitte beachten

**Keine realen Daten im öffentlichen Repo**, weder in Code noch in Issues noch in Screenshots:
- Keine echten Moodle-User-IDs (`moodle_4` im Doku-Kontext ist ok, als „Maltes ID markiert" nicht).
- Keine Klarnamen, E-Mail-Adressen, Klassenbezeichnungen.
- Keine Schul-spezifischen Daten.
- Keine Supabase-Credentials, API-Keys oder Service-Role-Keys.

Sicherheitsmodell und offene Findings siehe [Dokumentation/07_Sicherheit_Datenschutz.md](Dokumentation/07_Sicherheit_Datenschutz.md).

## Lokal testen

- `app/vocabflow.html` lässt sich lokal per Doppelklick öffnen (Dev-Login-Fallback startet).
- `widget/vocabflow-widget.html` ebenfalls, mit eigener Dev-Login-Logik.
- Für Supabase-Integration einmal `SUPABASE_URL` und `SUPABASE_KEY` auf ein eigenes Test-Projekt zeigen lassen.

## Fragen

Malte Ohlsen — `maltedownunder@gmail.com` oder als GitHub Issue.
