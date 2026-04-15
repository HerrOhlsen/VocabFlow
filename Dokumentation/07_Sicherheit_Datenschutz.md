# 07 — Sicherheit und Datenschutz

Dieses Dokument soll interessierte Schulen in die Lage versetzen, das Risiko fundiert einzuschätzen.

## Bedrohungsmodell — wer ist der Angreifer?

| Angreifer-Typ | Risiko | Schutz |
|---|---|---|
| Neugieriger Schüler | Niedrig | anon-Key liegt im Source. Kann versuchen, direkt DB zu schreiben — wird durch Edge-Function-Gatekeeper geblockt |
| Gezielter Schüler (programmiert, will manipulieren) | Mittel | kann falsche `user_name` beim Write senden → Progress anderer User kaputt machen. Sichtbar im Audit-Log |
| Externer Scraper/Bot (Mass-Scan mit KI) | Mittel | Rate-Limits (1500/h pro User, 3000/h pro IP), Regex-Validierung, Audit-Log drosselt und macht forensisch nachvollziehbar |
| Motivierter externer Angreifer (z.B. DSGVO-Probe) | Hoch | Reads sind offen — alle `progress`-Einträge sind mit anon-Key lesbar. Siehe „Offene Punkte" |

## Was ist aktuell gesichert

### Writes gehen ausschließlich über Edge Functions

Die anon-RLS-Policies für INSERT/UPDATE/DELETE auf `progress`, `user_sets`, `vocab_sets` sind **gedroppt**. Wer schreiben will, muss über `vocab-write` oder `set-manager`.

Beide Functions:
- Validieren `user_name` gegen Regex (`moodle_\d+|dev_[a-z0-9_-]+`)
- Rate-limiten (1500/h User, 3000/h IP)
- Loggen jeden Call in `audit_log` mit IP-Hash (SHA256+Salt), User-Agent, Timestamp, Status
- Setzen `archived`/`published`/`owner_id` nicht über User-Input, sondern server-seitig

### Teacher-Funktionen mit Whitelist

Nur User in der `teachers`-Tabelle können Sets erstellen/bearbeiten. Die Whitelist ist manuell gepflegt — kein Self-Enrollment.

### XSS-Schutz beim Karten-Rendering

Alle Content-Felder werden durch `escapeHtml`/`escapeAttr` geschickt, bevor sie ins DOM gelangen. Ausnahme: `<b>`-Tags in `example`, gezielt wiederhergestellt für Cloze-Effekt. Andere HTML-Tags werden gestrippt.

### Keine Passwörter/Credentials im Code

Nur der **Publishable/Anon Key** ist im Frontend — das ist per Design öffentlich. Service-Role-Key liegt nur in Edge Function Env Vars.

### Minimale Daten

Gespeichert pro User:
- Moodle-User-ID (numerisch, z.B. `moodle_4`)
- FSRS-Parameter pro Karte (Stability, Difficulty, Reviews, nächster Termin)
- Aktivierte Sets

**Nicht gespeichert:** E-Mail, Klarname (nur `cmi.core.student_name` für UI-Anzeige, nicht persistent), Geburtsdatum, Noten, Klassenbezug.

## Was NICHT gesichert ist

### Reads sind offen

Ein User mit anon-Key kann per Supabase-Client z.B. alle `progress`-Einträge lesen:

```js
const { data } = await client.from("progress").select("*");
// Gibt den Fortschritt aller User zurück
```

**Warum?** Für echte Per-User-Reads bräuchte es Supabase Auth (JWT mit User-Claim + RLS-Policy `auth.uid() = user_id`). Das haben wir bewusst nicht implementiert — siehe [08_Anpassung_und_Roadmap.md](08_Anpassung_und_Roadmap.md) für Option B.

**Praktisches Risiko:**
- Kein Klarname in der DB. Ein Scraper sieht `moodle_4` — kennt aber nicht, wer das ist (Mapping liegt in Moodle, nicht in Supabase).
- Mapping `moodle_4 ↔ echter Name` ist nur einer Person in Moodle einsehbar, die bereits Moodle-Admin ist. Die hätte ohnehin alle Daten.
- Jemand **ohne** Moodle-Zugang kann sehen: `moodle_4 hat 243 Karten in Set Oxford 5000 A2 mit 76% Abrufquote`. Das ist keine besonders schützwürdige Info.

**DSGVO-Einordnung:** Pseudonyme Daten (Art. 4 Nr. 5 DSGVO). Gelten als personenbezogen, da eine Re-Identifikation über Moodle möglich ist. Daher **datenschutzrechtlich kein Freibrief** — aber das Schadenspotenzial eines Leaks ist gering.

### Kein kryptografischer Auth-Check

Die Edge Function vertraut dem `user_name` aus dem Request-Body. Ein Angreifer kann beliebigen `user_name` senden.

**Mitigation:**
- Audit-Log → forensisch nachvollziehbar (IP-Hash, UA, Timestamp).
- Rate-Limits → Massen-Scans werden gedrosselt.
- Regex-Validierung → blockiert offensichtliche Injection.

**Kein echter Schutz** gegen gezielte Manipulation. Für echten Schutz → Supabase Auth (Option B).

### K2: `set-manager` vertraut `user_name`

Die Lehrer-CRUD-Function prüft zwar die Whitelist, validiert aber nicht die `user_name`-Herkunft. Ein Schüler könnte theoretisch `moodle_4` (Maltes ID) senden und dessen Sets bearbeiten.

**Aktuelles Risiko:** minimal, da Teacher-Set winzig (1 Person). Bei Skalierung → Audit-Log-Pattern wie `vocab-write` nachrüsten.

### W7: Storage-Bucket-Listing

Der Bucket `app` ist public (muss er sein, damit Moodle das ZIP laden kann). `SELECT` auf `storage.objects` ist breit erlaubt → Dateistruktur ist auflistbar.

**Praktisches Risiko:** Sehr gering. Einziger Inhalt ist `vocabflow.zip`, der ohnehin Public-URL-bekannt ist.

## DSGVO-Checkliste

- [x] **Art. 6 DSGVO (Rechtsgrundlage):** Einwilligung der SuS bzw. Erziehungsberechtigten beim Moodle-Einstieg. VocabFlow erhebt keine Daten darüber hinaus.
- [x] **Art. 32 DSGVO (Sicherheit):** Pseudonymisierung ✓, Rate-Limits ✓, Audit-Log ✓. Offene Punkte (Reads, K2) transparent dokumentiert.
- [x] **Art. 13 DSGVO (Informationspflichten):** Im Info-Modal der App wird erklärt, welche Daten gespeichert werden (Moodle-ID, FSRS-Werte, aktivierte Sets).
- [x] **Art. 17 DSGVO (Recht auf Löschung):** Manuell per SQL möglich (`DELETE FROM progress WHERE user_name = ...`). Automatisches Löschkonzept nach 1 Jahr Inaktivität ist versprochen, aber noch nicht per Cron implementiert.
- [x] **Art. 25 DSGVO (Privacy by Design):** Datenminimierung: kein Klarname, keine E-Mail.
- [ ] **Verfahrensverzeichnis:** muss die Schule führen (wir stellen die Info, der Datenschutzbeauftragte dokumentiert).
- [ ] **AV-Vertrag mit Supabase:** Supabase bietet einen Data Processing Agreement (DPA). Muss pro Schule abgeschlossen werden — Standard-DPA unter `https://supabase.com/legal/dpa`.
- [ ] **Serverstandort:** Bei Projektanlage **EU (Frankfurt)** wählen. Andere Regionen sind nicht DSGVO-konform ohne zusätzliche Verträge.

## Empfehlungen für die Einführung an einer Schule

1. **Mit Datenschutzbeauftragtem abstimmen** — Pseudonymisierung erklären, Verfahrensverzeichnis ergänzen, DPA mit Supabase abschließen.
2. **Klar kommunizieren** (an SuS und Eltern): „Wir speichern deinen Lernfortschritt, nicht deinen Namen. Moodle-ID + FSRS-Werte, nichts darüber hinaus."
3. **Realistische Erwartungen:** Das System ist für den **Schulalltag** gut genug. Es ist **nicht** für sensible Daten (Noten, Diagnosen) geeignet.

## Trade-off-Reflexion

Warum dieses Sicherheitsniveau und nicht mehr?

- Eine Schule ist **kein Hochsicherheits-Setup**. Die Alternative ist oft: „gar nichts digital" oder „Quizlet mit undurchsichtigem DSGVO-Status". Gegen beides ist dieses Setup eine klare Verbesserung.
- Jede zusätzliche Sicherheitsschicht (Supabase Auth, JWT-Validierung, Client-Signing) kostet **Wartungsaufwand**. Ein Lehrer, der nebenher programmiert, kann das nicht dauerhaft stemmen.
- Die gewählten Maßnahmen (Pseudonymisierung, Edge Function Gatekeeper, Audit-Log, Rate-Limits) decken die **realistischen Risiken** gut ab. Gegen einen Staatsakteur hilft das nicht — aber den haben wir nicht im Bedrohungsmodell.

**Ehrlicher Satz für den Datenschutzbericht:**
„VocabFlow pseudonymisiert alle Nutzerdaten, protokolliert alle Schreibzugriffe und limitiert Missbrauchs-Szenarien durch Rate-Limits. Eine kryptografische End-to-End-Authentifizierung ist nicht implementiert; im Schulkontext mit Moodle als Zugangsschleuse ist das vertretbar."
