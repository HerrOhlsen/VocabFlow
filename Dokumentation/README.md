# VocabFlow — Dokumentation zur Nachnutzung

Diese Dokumentation beschreibt **VocabFlow**, einen Vokabeltrainer mit Spaced-Repetition-Algorithmus (FSRS), der als SCORM-Paket in Moodle eingebunden wird und Supabase als Backend nutzt. Sie ist so aufgebaut, dass andere Schulen das System mit Unterstützung eines LLMs (Claude, GPT, etc.) selbst nachbauen oder anpassen können.

**Autor:** Malte Ohlsen (mit Claude Code als Entwicklungspartner)
**Stand:** 2026-04-14
**Kontext:** Entwickelt für eine einzelne Schule, nicht als öffentlich gehostete Plattform.
**Code & Issues:** Siehe GitHub-Repo im Wurzelverzeichnis dieses Ordners (`../README.md`).

## Was ist VocabFlow?

- Ein Vokabeltrainer, der SuS pro Karte individuell optimal timet, wann sie wiederholt werden soll (FSRS-Algorithmus).
- Läuft **in Moodle** — SuS brauchen keinen zusätzlichen Login, keine App, keine externe Website.
- Bietet Lehrkräften ein UI, um **eigene Vokabelsets** zu erstellen, zu veröffentlichen und zu verwalten.
- Enthält fertig importiert: Oxford 5000 (A1–C1, ~6000 Karten mit Audio), Irregular Verbs, weitere thematische Sets.
- Ein **Dashboard-Widget** zeigt Stats (Streak, fällige Karten) direkt auf Moodle-Seiten.

## Technologie-Stack (kurz)

- **Frontend:** Single-File-HTML (~100 KB), CSS/JS inline, kein Framework
- **Integration:** SCORM 1.2 (Moodle entpackt das ZIP und serviert das HTML)
- **Backend:** Supabase (PostgreSQL + Edge Functions + Storage)
- **User-ID:** Moodle stellt `M.cfg.userId` auf jeder Seite zur Verfügung — keine separate Auth
- **Writes:** Edge Functions mit Service-Role-Key als Gatekeeper, Audit-Log für Forensik

## Aufbau dieser Dokumentation

| Datei | Inhalt |
|---|---|
| [01_Konzept.md](01_Konzept.md) | Pädagogisches Konzept, Features im Detail, Design-Entscheidungen |
| [02_Architektur.md](02_Architektur.md) | System-Übersicht, Moodle-Integration, warum SCORM statt LTI |
| [03_Datenmodell.md](03_Datenmodell.md) | Vollständiges Datenbank-Schema mit SQL und Erklärungen |
| [04_Edge_Functions.md](04_Edge_Functions.md) | Code und Verträge der beiden produktiven Functions |
| [05_Frontend.md](05_Frontend.md) | Struktur der HTML-Datei, FSRS-Implementierung, UI-Flows |
| [06_Setup_Anleitung.md](06_Setup_Anleitung.md) | Schritt-für-Schritt-Anleitung zur Nachbildung |
| [07_Sicherheit_Datenschutz.md](07_Sicherheit_Datenschutz.md) | Trade-offs, DSGVO, offene Sicherheitspunkte |
| [08_Anpassung_und_Roadmap.md](08_Anpassung_und_Roadmap.md) | Wie man es auf andere Fächer/Sprachen anpasst, offene Punkte |

## Nachnutzungs-Hinweise

- Das System ist bewusst **pragmatisch** und **schulspezifisch** aufgebaut. Es ist **keine** Produktionsumgebung für öffentlichen Betrieb.
- Offene Punkte sind im Dokument [07_Sicherheit_Datenschutz.md](07_Sicherheit_Datenschutz.md) transparent gelistet.
- Die Lizenz ist frei nachnutzbar (keine explizite Angabe — im Zweifel Malte ansprechen).
- Der Audit-Log-Ansatz schützt nicht gegen motivierte Angreifer, macht aber Manipulation nachvollziehbar und drosselt Massen-Scans.

## Kontakt

Bei Fragen oder Interesse an Zusammenarbeit: `maltedownunder@gmail.com`
