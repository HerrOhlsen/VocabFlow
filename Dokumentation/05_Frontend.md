# 05 — Frontend

Die gesamte App ist eine einzige HTML-Datei (`vocabflow.html`, ~100 KB, ~2900 Zeilen). Keine Build-Pipeline, kein Framework.

## Struktur der HTML-Datei

```
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>VocabFlow</title>
  <style>
    /* ~500 Zeilen CSS inline */
    /* CSS-Variablen für Theme, Reset, Utility-Klassen */
    /* Komponenten-Styles: .card, .btn, .set-manager, .editor, ... */
  </style>
</head>
<body>
  <div id="app"></div>

  <!-- Supabase Client per CDN -->
  <script src="https://unpkg.com/@supabase/supabase-js@2"></script>

  <script>
    // ~2400 Zeilen JS inline, ein IIFE
    (function () {
      const SUPABASE_URL = "<YOUR_SUPABASE_URL>";
      const SUPABASE_KEY = "<YOUR_SUPABASE_ANON_KEY>";
      const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      // ===== Module (logisch, nicht getrennt) =====
      // 1. SCORM-Bridge
      // 2. User/Auth-Logik
      // 3. FSRS-Engine
      // 4. Data-Layer (Reads + callWrite)
      // 5. UI-Flows (Dashboard, Lernmodus, Library, Editor, ...)
      // 6. Router (hashchange)

      boot();
    })();
  </script>
</body>
</html>
```

## SCORM-Bridge

```js
function findScormApi() {
  let win = window;
  for (let i = 0; i < 10; i++) {
    if (win.API) return win.API;                    // SCORM 1.2
    if (win.API_1484_11) return win.API_1484_11;    // SCORM 2004
    if (win.parent && win.parent !== win) win = win.parent;
    else break;
  }
  return null;
}

function boot() {
  const api = findScormApi();
  if (api) {
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.lesson_status", "incomplete");
    const studentName = api.LMSGetValue("cmi.core.student_name"); // "Nachname, Vorname"
    USER_DISPLAY = reverseName(studentName);
  }

  // Moodle User-ID (bevorzugt)
  if (window.M?.cfg?.userId) {
    USER_NAME = "moodle_" + window.M.cfg.userId;
    USER_ROLE = "student";
  } else {
    // Fallback: Dev-Login oder Guest-Modus
    USER_NAME = getDevOrGuestUser();
  }

  checkTeacher(USER_NAME).then(...);
  renderRoot();
}
```

## FSRS-Engine

Kern-Logik (vereinfacht):

```js
function scheduleCard(card, rating, prevStability, prevDifficulty) {
  const s = prevStability ?? initialStability(rating);
  const d = prevDifficulty ?? initialDifficulty(rating);

  const retrievability = Math.pow(1 + elapsedDays / (9 * s), -1);
  const newStability = rating === 1
    ? s * Math.exp(lapseFactor * (1 - retrievability))
    : s * (1 + factor * (11 - d) * Math.pow(s, -0.5) * ...);

  const newDifficulty = clamp(d + driftForRating(rating), 1, 10);
  const intervalDays = Math.round(newStability * Math.log(0.9) / Math.log(0.9));

  return {
    stability: newStability,
    difficulty: newDifficulty,
    interval_days: intervalDays,
    next_review: addDays(today(), intervalDays),
    last_rating: rating,
    repetitions: (card.repetitions ?? 0) + 1,
    lapses: rating === 1 ? (card.lapses ?? 0) + 1 : (card.lapses ?? 0)
  };
}
```

Die konkreten Konstanten sind aus dem FSRS-Paper (siehe https://github.com/open-spaced-repetition/fsrs4anki/wiki).

## Data-Layer

### Reads — direkt über Supabase-Client

```js
async function loadSets() {
  const { data } = await client
    .from("vocab_sets")
    .select("*")
    .eq("published", true)
    .eq("archived", false);
  return data ?? [];
}

async function loadProgress() {
  if (IS_GUEST) { return new Map(); }
  const { data } = await client
    .from("progress")
    .select("*")
    .eq("user_name", USER_NAME);
  return new Map(data.map(r => [`${r.set_id}:${r.card_id}`, r]));
}
```

### Writes — immer über Edge Function

```js
async function callWrite(action, userName, payload) {
  const res = await fetch(SUPABASE_URL + "/functions/v1/vocab-write", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY
    },
    body: JSON.stringify({ action, user_name: userName, payload })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function saveCardProgress(setId, cardId, fsrsState) {
  if (IS_GUEST) return;
  await callWrite("save_progress", USER_NAME, {
    set_id: setId, card_id: cardId, ...fsrsState
  });
}
```

## Optimistische UI mit Rollback

Beim Bewerten einer Karte wird das UI **sofort** aktualisiert, bevor der Server geantwortet hat. Bei Fehler wird zurückgerollt.

```js
async function handleRating(rating) {
  const oldState = progressMap.get(key);
  const newState = scheduleCard(currentCard, rating, oldState?.stability, oldState?.difficulty);

  // Optimistic update
  progressMap.set(key, newState);
  advanceToNextCard();

  try {
    await saveCardProgress(currentSet.id, currentCard.id, newState);
  } catch (err) {
    // Rollback
    if (oldState) progressMap.set(key, oldState);
    else progressMap.delete(key);
    showToast("Fehler beim Speichern. Erneut versuchen?");
  }
}
```

## UI-Flows

### Dashboard
- Streak-Anzeige (zusammenhängende Übungstage)
- Übungstage-Counter (all time)
- Fällige Karten pro Set
- Kartenverteilung (neu / lernend / jung / reif)
- CTA „Jetzt üben"

### Lernmodus
- Front-View mit `<b>_____</b>` im Beispielsatz
- Tap/Click → Back-View mit vollem Satz + Übersetzung + Audio-Play
- Vier Bewertungs-Buttons: Again (rot), Hard (orange), Good (grün), Easy (blau)

### Library
- Zweistufige Gruppierung: Fach → Kategorie
- CEFR-Sortierung (A1 → C1)
- Toggle „aktiviert/nicht aktiviert"
- Read-Only-Vorschau für User ohne Aktivierung

### Set-Manager (Lehrer-UI)
- Übersicht: eigene Sets / alle Sets
- Status-Badges: ✓ Veröffentlicht / ⏳ Entwurf
- Click → Editor (eigene Sets) oder Read-Only-Preview (fremde Sets)
- „Neues Set" + JSON-Import

### Set-Editor
- Inline-Felder für Metadaten (Name, Beschreibung, Fach-Dropdown, ...)
- Kartenliste mit Inline-Editing pro Karte
- Audio-Indikator 🔊 bei Karten mit `audio_url`
- Autosave debounced (2 s) mit Sync-Indikator
- Segmented Control Entwurf ↔ Veröffentlicht
- „Karte hinzufügen" / „Karte löschen" (mit Nutzerwarnung)
- „Set archivieren" (mit Nutzerwarnung)

## Guest-Mode und Dev-Login

Außerhalb Moodles (z.B. lokal per Doppelklick geöffnet):

```js
function getDevOrGuestUser() {
  const stored = localStorage.getItem("vocabflow_dev_user");
  if (stored) return stored;

  // Zeige Dev-Login-Dialog mit Optionen:
  // - "Als Gast weiter" → USER_NAME = "guest", IS_GUEST = true
  // - "Dev-Login" → Prompt für Namen → "dev_<name>"
  return renderDevLogin();
}
```

**Gast-Guards** (schreiben nie in DB):

```js
async function saveCardProgress(...) { if (IS_GUEST) return; ... }
async function toggleUserSet(...)    { if (IS_GUEST) return; ... }
async function loadUserSets(...)     { if (IS_GUEST) return []; ... }
async function loadProgress(...)     { if (IS_GUEST) return new Map(); ... }
```

## XSS-Schutz

Karten-Content kommt aus Lehrer-Eingaben + externen LLMs — nicht vertrauenswürdig. Beim Rendering:

```js
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// Rendering mit selektivem <b>-Restore für Cloze:
function renderExample(text, clozed) {
  let escaped = escapeHtml(text);
  if (clozed) {
    escaped = escaped.replace(/&lt;b&gt;.*?&lt;\/b&gt;/g, "_____");
  } else {
    escaped = escaped.replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, "<b>$1</b>");
  }
  return escaped;
}
```

Alle Felder (`front_main`, `back_main`, `example`, `audio_url`, ...) werden escape't, bevor sie ins DOM gehen.
