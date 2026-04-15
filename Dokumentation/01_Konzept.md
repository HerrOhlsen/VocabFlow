# 01 — Konzept

## Problem, das VocabFlow löst

Vokabellernen in der Schule scheitert an drei Punkten:

1. **Timing** — SuS wiederholen entweder zu früh (Zeitverschwendung) oder zu spät (vergessen). Der optimale Zeitpunkt ist pro Karte individuell und ändert sich mit jeder Wiederholung.
2. **Infrastruktur** — Jede externe App (Quizlet, Anki, Memrise) bedeutet: neuer Login, neue AGB, DSGVO-Fragen, kein Zugriff für Lehrkräfte auf Fortschritt, nicht individuell anpassbar oder Kosten.
3. **Inhalte** — Lehrbuchvokabeln sind oft nicht digital verfügbar, und Lehrkräfte haben keine Zeit für händische Karten-Pflege in fremden Systemen.

VocabFlow adressiert alle drei:

- **FSRS-Algorithmus** berechnet pro Karte und User individuell den optimalen Wiederholungszeitpunkt.
- **Einbindung in Moodle** über SCORM — kein zusätzlicher Login, Nutzeridentität kommt aus Moodle.
- **Lehrer-UI** zum Erstellen eigener Sets, inkl. KI-gestützter Kartengenerierung via JSON-Import.

## Pädagogisches Fundament

### Spaced Repetition (FSRS)

FSRS = Free Spaced Repetition Scheduler. Nachfolger von SM-2 (Anki-Original-Algorithmus). Modelliert für jede Karte zwei Parameter:

- **Stability (S)** — wie lange das Gedächtnis die Karte hält, bevor die Abrufwahrscheinlichkeit auf 90 % fällt.
- **Difficulty (D)** — wie schwer die Karte für den individuellen User ist.

Nach jeder Bewertung (Again/Hard/Good/Easy) werden S und D neu berechnet, daraus ergibt sich das Intervall bis zur nächsten Wiederholung. Karten, die schwerfallen, kommen oft; leichte Karten werden über Wochen/Monate gestreckt.

### Backlog-Bremse

Wenn SuS einige Tage nicht üben, stauen sich fällige Karten auf. VocabFlow zeigt dann nicht 300 fällige Karten am Stück — das ist demotivierend. Stattdessen wird der Pool auf ein verträgliches Tageslimit gedeckelt, mit Info-Hinweis an den User.

### Bonus-Session

Nach Abarbeiten aller fälligen Karten kann der User optional zusätzliche neue Karten ziehen. Trennung von „Pflicht" (Wiederholung) und „Kür" (Neues lernen) reduziert Überforderung.

### Cloze-Effekt in Beispielsätzen

Im Beispielsatz wird das gesuchte Wort mit `<b>…</b>` markiert. In der Front-Ansicht wird es zu `_____`, in der Back-Ansicht zu fett gedruckten Buchstaben. Das aktiviert beim Lernen aktives Abrufen statt passives Lesen.

## Features im Überblick

### Für Schüler:innen

- **Dashboard** mit Streak, Übungstagen, fälligen Karten, Kartenverteilung (fresh/learning/familiar/mastered).
- **Set-Bibliothek** zweistufig gruppiert (Fach → Kategorie), CEFR-sortiert.
- **Multi-Set-Lernen** — mehrere Sets gleichzeitig aktiv.
- **Audio-Autoplay** für Wort und Beispielsatz (toggle).
- **Gast-Modus** — Testen ohne DB-Spuren.
- **Info-Modals** erklären Spaced Repetition und die App.

### Für Lehrkräfte

- **Set-Manager** mit Inline-Editing aller Karten.
- **Publish-Workflow** — neue Sets starten als Entwurf, SuS sehen nur veröffentlichte.
- **Read-Only-Vorschau** fremder Sets (Kollegium kann einsehen, nicht bearbeiten).
- **JSON-Import** mit Clipboard-Prompt für externe LLMs (Lehrer formuliert Wortliste, KI erstellt Karten, Lehrer importiert JSON).
- **Soft-Delete (Archivierung)** mit Nutzerwarnung.
- **Owner-Modell** — jedes Set gehört einer Lehrkraft, die es pflegt. Keine Duplikate.

### Inhalte (Stand 2026-04-14)

- Oxford 5000 (A1–C1, 5944 Karten, 11829 MP3s)
- Irregular Verbs (93 Karten)
- A Year's Worth of Words (718 Karten)
- Text Analysis Toolkit (140 Karten, Oberstufe Englisch)

## Design-Entscheidungen (und warum)

### Single-File-HTML statt Framework

Kein React, kein Vue, kein Build-Step. Die gesamte App ist eine HTML-Datei (~100 KB) mit CSS und JS inline. Gründe:

- **SCORM erwartet selbst-enthaltene Pakete.** Externe Scripts brauchen CORS-freie URLs, was Moodle oft blockiert.
- **Wartbarkeit für eine Schule.** Ein Lehrer-Entwickler + KI-Assistent können eine einzelne Datei jederzeit anfassen. Ein Framework-Projekt mit Build-Pipeline braucht Ops-Kompetenz.
- **Performance.** Kein Hydration-Lag, kein FOUC. Die App ist in <500 ms benutzbar.

Nachteil: Bei >4000 Zeilen wird das mühsam. Aktuell ~2900 Zeilen, akzeptabel.

### SCORM statt LTI

LTI war der erste Plan. Ist am Hosting gescheitert: Supabase Storage und Edge Functions servieren HTML aus `*.supabase.co` zwangsweise als `text/plain` mit CSP `default-src 'none'; sandbox` — der Browser rendert das HTML nicht. Anti-Phishing-Härtung, nicht umgehbar.

SCORM umgeht das: Moodle entpackt das ZIP und liefert `index.html` aus der eigenen Domain (`pluginfile.php`). User-Identität liefert Moodle direkt über `M.cfg.userId`.

### Moodle als Identity-Provider statt eigene Auth

Keine Registrierung, keine Passwort-Resets, keine AGBs. Der Nutzer ist authentifiziert, sobald Moodle ihn authentifiziert hat. Trade-off: kein kryptografisch gesicherter User-Token im Client — der User-Name kommt aus `M.cfg.userId` und wird beim Write mit der Edge Function zusammen rohtextlich übergeben. Siehe [07_Sicherheit_Datenschutz.md] für die Grenzen dieses Modells.

### Kein „Kopie erstellen" bei Sets

Sets sind eine **gemeinsame Fachschafts-Bibliothek**, keine private Sammlung. Wer einen Fehler findet, spricht den Owner an. Wer andere Vokabeln braucht, erstellt ein thematisch eigenes Set. Das verhindert die typische Datei-Explosion in Schulordnern und macht Pflege klarer.
