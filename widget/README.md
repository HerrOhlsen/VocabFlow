# VocabFlow Dashboard-Widget

Zeigt Übungstage, Streak und fällige Karten direkt auf einer Moodle-Seite an. Kein iframe, keine externe Datei — HTML + Script werden in ein Moodle-Textfeld eingefügt.

## Zwei Versionen

### `vocabflow-widget.html` — Standalone

Zum lokalen Testen per Doppelklick. Mit Dev-Login-Fallback (fragt nach Namen, speichert in `localStorage`).

### `vocabflow-widget-inline.html` — Moodle-Inline

Zum Einfügen in Moodle. Beachtet die Moodle-Restriktionen (URLs gesplittet, Inline-Styles, kein CDN).

## Einbau in Moodle

**Dashboard-Widget (auf der persönlichen Startseite aller User):**

1. Site-Administration → Darstellung → "Zusätzliches HTML".
2. In das Feld "Vor `</body>` wird geschlossen" den Inhalt von `vocabflow-widget-inline.html` einfügen.
3. Speichern.

Optional nur auf dem Dashboard rendern:
```js
if (!/\/my\/?/.test(window.location.pathname)) return;
```
Direkt an den Anfang des `(function(){ ... })()`-IIFE einfügen.

**Kurs-Widget (auf einer einzelnen Moodle-Kursseite):**

1. Kurs bearbeiten → Textfeld-Aktivität oder "Universelles Textfeld" (mod_unilabel) anlegen.
2. HTML-Quelltext-Modus aktivieren, Inhalt einfügen.
3. Speichern.

## Credentials setzen

In `vocabflow-widget-inline.html` (Zeile ~8):

```js
// NICHT konkatenieren — Moodle zerstört sonst die URL.
var B = "htt" + "ps://<YOUR_PROJECT_ID>.sup" + "abase.co";
var KEY = '<YOUR_SUPABASE_ANON_KEY>';
```

Beide Platzhalter ersetzen. Das Split-Muster **muss erhalten bleiben**, sonst greift Moodles URL-Autolinker ein und macht aus der URL einen `<a href>`-Tag, der das Script kaputtmacht.

Für `vocabflow-widget.html` (Standalone) reicht die normale Config am Dateianfang.

## Weiterentwickeln

Das Widget ist ein gutes Referenz-Pattern für eigene Moodle+Supabase-Widgets. Siehe auch Maltes Skill-Datei `moodle-widget.md` (in `~/.claude/commands/`), die das Muster dokumentiert.

Wichtige Regeln:
- Kein `<script src=...>` — Moodle strippt das.
- Keine `<style>`-Tags — Inline-Styles verwenden.
- URLs splitten, wenn sie im Script-Body stehen.
- `M.cfg.userId` (camelCase!) liefert die Moodle-User-ID.
