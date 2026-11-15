# Weight unit toggle (lb / kg) — design

## Intent

Each lifter picks pounds or kilograms once, on the settings page, and every
weight in the app is shown and entered in that unit. Most users are US lifters
on lb. People switching units mid-workout is not a goal.

## Goals / non-goals

- Goal: one per-user setting, saved in the database, that applies on every
  device and wherever weights appear (sets, templates, personal records, and
  other people's lifts in the community feed).
- Goal: a weight typed in lb displays back exactly as typed (135 lb stays 135).
- Non-goal: per-workout or per-gym units, plate math, distance units
  (miles/km). `distance_meters` is left alone.
- Anti-goal: any page showing raw kg to an lb user because it skipped the
  conversion.

## Approaches

- **A. Store kg as a decimal, convert in the browser (chosen).** The API always
  speaks kg. The browser converts after fetching and before saving. This fits
  the existing client-side rendering and the `weightKgs` shape already on the
  `CreateWorkoutPage` branch.
- B. Server converts per request based on the user's unit. Rejected: every
  weight route has to remember to convert, and responses mean different things
  for different users.
- C. Store each weight with the unit it was entered in. Rejected: records and
  progress need SQL-side conversion, which is complexity for a problem a
  one-time choice doesn't have.

## Design

**Setting**
- `users.weight_unit TEXT NOT NULL DEFAULT 'lb' CHECK (weight_unit IN ('lb','kg'))`,
  added in `init()` with `ADD COLUMN IF NOT EXISTS`, next to `is_private`.
  Default is lb because most users are US lifters. *(My call.)*
- The session loader in `server.js` selects `weight_unit`, so `/api/me` and
  `req.user` carry it. Pages already call `/api/me`, so no extra request is
  needed.
- `GET /api/settings` adds `weightUnit`. A new
  `PATCH /api/settings/weight-unit` takes `{ weightUnit: 'lb' | 'kg' }` and
  returns 400 for anything else. Document it in the README API table.

**Storage precision**
- Change `workout_sets.weight_kgs`, `template_exercises.target_weight` and
  `personal_records.value` from `INTEGER` to `NUMERIC(8,3)`, with an idempotent
  `ALTER COLUMN ... TYPE` in `init()`. Integer to numeric loses no data.
- Rename `target_weight` to `target_weight_kgs` so the unit is explicit,
  reusing the rename pattern from the spelling-fix migration. *(My call.)*
- `personal_records.value` keeps mixed meaning. It is kg for `max_weight`,
  `max_set_volume` and `max_est_1rm`, and a count for `max_reps`. The browser
  converts by `record_type`.
- `pg` returns `NUMERIC` as strings. Register a type parser for OID 1700 in
  `db.js` (`parseFloat`) so routes get numbers. Three decimal places stays well
  inside double precision.

**Conversion (browser)**
- One shared helper, `public/units.js`. It also exports via `module.exports`
  so Node tests can load it.
  - `toKg(value, unit)` — rounds to 3 dp; 1 lb = 0.45359237 kg.
  - `fromKg(kg, unit)` — returns a number rounded to 0.1.
  - `formatWeight(kg, unit)` — `"135 lb"` / `"61.2 kg"`, dropping a trailing `.0`.
- Every page that shows or accepts a weight loads `units.js` and reads the unit
  from `/api/me`. No page does its own math.
- `/api/exercises` and other routes without weights are unchanged.

**Settings page**
- A new "Units" card between Privacy and Sessions, with a two-option lb | kg
  radio group. It saves on change, matching how the privacy card behaves.

**Tests**
- `test/units.test.js`: round-trips (135 lb → kg → 135 lb; 100 kg → lb → 100 kg),
  rounding, and formatting.
- Validation for the new PATCH route, following existing settings tests if any
  exist by build time.

## Left to the builder

- Exact markup and styling of the Units card.
- Coordinating with the `CreateWorkoutPage` branch: its `weight_kgs` reads and
  writes work unchanged once the type parser exists. Its pages need to use
  `units.js` when they land.
