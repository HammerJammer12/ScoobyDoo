# Weight Unit Toggle (lb / kg) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user pick lb or kg once on the settings page, store it on `users`, and give the browser one helper for converting the kg the API speaks.

**Architecture:** The DB and API stay in kg, with decimal columns so lb values round-trip exactly. `public/units.js` is the only place that converts. It loads in the browser as `window.Units` and in Node through `require`, so the server reuses its unit validation. The user's unit rides along on `req.user` / `/api/me`.

**Tech Stack:** Node ≥22.13, Express 5, `pg` 8, Postgres, plain browser JS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-weight-unit-toggle-design.md`

## Global Constraints

- Units are exactly `'lb'` and `'kg'` (lowercase strings). The default for every user is `'lb'`.
- 1 lb = `0.45359237` kg.
- Stored kg are rounded to 3 decimal places. Displayed values are rounded to 0.1, with no trailing `.0`.
- Weight columns are `NUMERIC(8,3)`.
- The API never converts. Request and response weights are always kg.
- `/api/exercises` and `distance_meters` are untouched.
- Schema changes go in `init()` in `db.js` and must be safe to run on every start, on both fresh and existing databases.

## Review Focus

1. **Blank or non-numeric weight input** (reps-only sets, an empty field): `toKg` returns `null`, not `0` or `NaN`. Tested in Task 1.
2. **A null weight coming from the API** (`weight_kgs` is null for reps-only sets): `fromKg` returns `null` and `formatWeight` returns `''`, not `"null lb"` or `"0 lb"`. Tested in Task 1.
3. **Bad unit values** (`'LB'`, `'pounds'`, `undefined`, a missing body): the PATCH returns 400 and nothing is saved. Tested in Task 1 (`isWeightUnit`) and Task 3 (curl).
4. **Existing local databases** (integer columns, old `target_weight` name, rows already present): `init()` migrates them without losing data, and a second start is a no-op. Checked in Task 2.
5. **NUMERIC returned as a string**: without the type parser, `61.235 + 1` becomes `"61.2351"`. Routes must get numbers. Checked in Task 2.

---

### Task 1: Conversion helper `public/units.js`

**Files:**
- Create: `public/units.js`
- Test: `test/units.test.js`

**Interfaces:**
- Produces (browser global `window.Units`; Node `module.exports`):
  - `WEIGHT_UNITS: ['lb', 'kg']`
  - `isWeightUnit(u: any) -> boolean`: true only for `'lb'` / `'kg'`
  - `toKg(value: number|string, unit: 'lb'|'kg') -> number|null`: kg rounded to 3 dp. Returns `null` for `''`, `null`, `undefined` or non-numeric input. Throws `TypeError` for an invalid unit.
  - `fromKg(kg: number|null, unit) -> number|null`: rounded to 0.1. Passes `null` through.
  - `formatWeight(kg: number|null, unit) -> string`: e.g. `"135 lb"` or `"61.2 kg"`. Returns `''` for `null`.

- [ ] **Step 1: Write the failing tests** in `test/units.test.js` (`node:test` + `node:assert/strict`, `require('../public/units')`):
  - `isWeightUnit`: true for `'lb'`, `'kg'`; false for `'LB'`, `'pounds'`, `''`, `undefined`, `null`, `1`.
  - `toKg(135, 'lb') === 61.235`; `toKg(100, 'kg') === 100`; `toKg('135', 'lb') === 61.235`; `toKg(2.5, 'lb') === 1.134`.
  - Round-trips: `fromKg(toKg(v, 'lb'), 'lb') === v` for `v` of `135, 225, 45, 2.5, 315.5`. `fromKg(toKg(v, 'kg'), 'kg') === v` for `100, 62.5`.
  - `fromKg(100, 'lb') === 220.5`.
  - Blanks: `toKg('', 'lb')`, `toKg(null, 'lb')`, `toKg(undefined, 'kg')` and `toKg('abc', 'lb')` are all `null`. `fromKg(null, 'lb') === null`.
  - `formatWeight(61.235, 'lb') === '135 lb'`; `formatWeight(61.235, 'kg') === '61.2 kg'`; `formatWeight(100, 'kg') === '100 kg'`; `formatWeight(null, 'lb') === ''`.
  - `assert.throws(() => toKg(1, 'stone'), TypeError)`.

- [ ] **Step 2: Run** `npm test`. Expected: `units.test.js` fails with "Cannot find module '../public/units'". `recommend.test.js` still passes.

- [ ] **Step 3: Implement `public/units.js`.** Use a plain IIFE that builds the object, then `if (typeof module === 'object' && module.exports) module.exports = Units; else window.Units = Units;`. Round with `Math.round(x * 1000) / 1000` and `Math.round(x * 10) / 10`. Treat input as blank when `value === null || value === undefined || String(value).trim() === ''`, or when `Number(value)` is not finite.

- [ ] **Step 4: Run** `npm test`. Expected: all tests pass (16 existing plus the new ones).

- [ ] **Step 5: Commit**
```bash
git add public/units.js test/units.test.js
git commit -m "Add lb/kg conversion helper shared by browser and server"
```

---

### Task 2: Schema — unit setting, decimal weights, numeric parsing

**Files:**
- Modify: `db.js` (top of file, `RENAME_LEGACY`, the `init()` table SQL)
- Modify: `server.js:46-49` (session loader query)

**Interfaces:**
- Produces: column `users.weight_unit` (`'lb'|'kg'`). `req.user.weight_unit` on every authenticated request, so `/api/me` returns `{ user: { id, username, created_at, weight_unit } }`. Columns `workout_sets.weight_kgs`, `template_exercises.target_weight_kgs` and `personal_records.value` become `NUMERIC(8,3)`, read back as JS numbers.

- [ ] **Step 1: Register the type parser** at the top of `db.js`: `require('pg').types.setTypeParser(1700, parseFloat);` (1700 = NUMERIC). Add a comment saying why.

- [ ] **Step 2: Rename `target_weight`.** In `RENAME_LEGACY`'s `DO` block, after the existing loops, add: if `template_exercises.target_weight` exists in `information_schema.columns` and `target_weight_kgs` doesn't, run `ALTER TABLE template_exercises RENAME COLUMN target_weight TO target_weight_kgs`.

- [ ] **Step 3: Update the `CREATE TABLE`s** for fresh databases. Use `target_weight_kgs NUMERIC(8,3)` in `template_exercises`, `weight_kgs NUMERIC(8,3)` in `workout_sets` and `value NUMERIC(8,3) NOT NULL` in `personal_records`.

- [ ] **Step 4: Add migrations for existing databases** at the end of the `init()` SQL:
  - `ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'lb' CHECK (weight_unit IN ('lb', 'kg'));` Put it next to the `is_private` line, after `CREATE TABLE users`.
  - `ALTER TABLE workout_sets ALTER COLUMN weight_kgs TYPE NUMERIC(8,3);`
  - `ALTER TABLE template_exercises ALTER COLUMN target_weight_kgs TYPE NUMERIC(8,3);`
  - `ALTER TABLE personal_records ALTER COLUMN value TYPE NUMERIC(8,3);`

- [ ] **Step 5: Select `weight_unit` in the session loader** in `server.js`: `'SELECT id, username, created_at, weight_unit FROM users WHERE id = $1'`.

- [ ] **Step 6: Verify the migration on your existing local DB, twice.** With your usual `DATABASE_URL`:
```bash
node -e "const {pool,init}=require('./db');(async()=>{await init();await init();const {rows}=await pool.query(\"SELECT table_name,column_name,data_type,numeric_scale FROM information_schema.columns WHERE (table_name,column_name) IN (('users','weight_unit'),('workout_sets','weight_kgs'),('template_exercises','target_weight_kgs'),('template_exercises','target_weight'),('personal_records','value'))\");console.table(rows);const r=await pool.query('SELECT 61.235::numeric AS n');console.log(typeof r.rows[0].n, r.rows[0].n);await pool.end()})()"
```
Expected: four rows (no `target_weight` row). `weight_unit` is `text`, and the other three are `numeric` with scale `3`. The last line prints `number 61.235`. Both `init()` calls run without errors.

- [ ] **Step 7: Run** `npm test`. Expected: everything passes.

- [ ] **Step 8: Commit**
```bash
git add db.js server.js
git commit -m "Store weights as decimal kg and add per-user weight unit"
```

---

### Task 3: Settings API and README

**Files:**
- Modify: `routes/settings.js` (`GET /`, new `PATCH /weight-unit` after `/privacy`)
- Modify: `README.md` (API table, after the `/api/settings/privacy` row)

**Interfaces:**
- Consumes: `isWeightUnit` from Task 1 (`require('../public/units')`). `users.weight_unit` from Task 2.
- Produces: `GET /api/settings` returns `{ username, isPrivate, createdAt, weightUnit }`. `PATCH /api/settings/weight-unit` takes `{ weightUnit }`, returns `200 { weightUnit }` or `400 { error: "weightUnit must be 'lb' or 'kg'" }`.

- [ ] **Step 1: Add `weight_unit` to the `GET /` select** and `weightUnit: u.weight_unit` to the response.

- [ ] **Step 2: Add `PATCH /weight-unit`.** Shape it like `/privacy`: validate with `isWeightUnit`, then `UPDATE users SET weight_unit = $1 WHERE id = $2`, then respond with `{ weightUnit }`.

- [ ] **Step 3: Add a README row:** ``| PATCH | `/api/settings/weight-unit` | Set display unit for weights (`{ weightUnit: 'lb' \| 'kg' }`, lb by default) |``. Also add `weightUnit` to the `GET /api/settings` row's description.

- [ ] **Step 4: Verify by hand.** Run `npm start`, sign up in the browser, and copy the `sid` cookie. Then:
```bash
C='Cookie: sid=<paste>'; J='Content-Type: application/json'
curl -s -H "$C" localhost:3000/api/settings                                                   # ..."weightUnit":"lb"
curl -s -X PATCH -H "$C" -H "$J" -d '{"weightUnit":"kg"}' localhost:3000/api/settings/weight-unit  # {"weightUnit":"kg"}
curl -s -H "$C" localhost:3000/api/me                                                         # ..."weight_unit":"kg"
for b in '{"weightUnit":"LB"}' '{"weightUnit":"pounds"}' '{}'; do curl -s -o /dev/null -w '%{http_code}\n' -X PATCH -H "$C" -H "$J" -d "$b" localhost:3000/api/settings/weight-unit; done  # 400 x3
curl -s -H "$C" localhost:3000/api/settings                                                   # still "kg"
```

- [ ] **Step 5: Commit**
```bash
git add routes/settings.js README.md
git commit -m "Add weight unit to settings API"
```

---

### Task 4: Units card on the settings page

**Files:**
- Modify: `public/settings/index.html` (new card between Privacy and Sessions; script tag)
- Modify: `public/settings/settingsPage.js` (`fill`, new `onSubmit`)

**Interfaces:**
- Consumes: `GET /api/settings` → `weightUnit`; `PATCH /api/settings/weight-unit` (Task 3).

- [ ] **Step 1: Add the card.** It's a `<section class="card">` with `<h2>Units</h2>` and `<form id="units-form">`. Inside: the prompt "Show weights in", two `label.radio` inputs (`name="weight-unit"`, values `lb` → "Pounds (lb)" and `kg` → "Kilograms (kg)"), a `button.primary` "Save", and a `p.msg`. This matches the Privacy card markup.

- [ ] **Step 2: Load the helper for later pages.** Add `<script src="/units.js"></script>` before `settingsPage.js`. This page only needs the setting, but this establishes the include every weight page will copy.

- [ ] **Step 3: Wire it up in `settingsPage.js`.** In `fill`, check the radio whose value is `settings.weightUnit`. Add an `onSubmit($('units-form'), …)` with the same shape as the privacy handler: read the checked `weight-unit` radio, send the PATCH, and return `'Units saved.'`.

- [ ] **Step 4: Verify in the browser.** Run `npm start` and open `/settings/`.
  - Expected: "Pounds (lb)" is preselected for a new user.
  - Choosing kg and pressing Save shows "Units saved.", and kg is still selected after a reload.
  - DevTools → Network shows `PATCH /api/settings/weight-unit` returning 200.
  - `window.Units.formatWeight(61.235, 'lb')` in the console returns `"135 lb"`.

- [ ] **Step 5: Run** `npm test`. Expected: everything passes.

- [ ] **Step 6: Commit**
```bash
git add public/settings/index.html public/settings/settingsPage.js docs/superpowers/specs/2026-11-14-weight-unit-toggle-design.md
git commit -m "Add units card to settings page"
```

---

## After merge (not in this plan)

Pages on the `CreateWorkoutPage` branch should include `/units.js`. They should read `weight_unit` from `/api/me`, show weights with `Units.formatWeight` and send `Units.toKg(input, unit)` as `weightKgs`. Its routes need no changes once Task 2's type parser is on main.
