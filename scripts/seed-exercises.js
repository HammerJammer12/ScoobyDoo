// Loads the free-exercise-db dataset (public domain) into the exercises table.
// Safe to re-run: rows are matched on source_id and updated in place.
// Usage: npm run seed:exercises
const { pool, init } = require('../db');

const DATASET_URL =
  process.env.EXERCISE_DATASET_URL ||
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const UNWEIGHTED_EQUIPMENT = new Set([null, 'body only', 'bands', 'exercise ball', 'foam roll']);

function trackingType(e) {
  if (e.category === 'cardio' || e.category === 'stretching' || e.force === 'static') return 'duration';
  if (e.category === 'plyometrics' || UNWEIGHTED_EQUIPMENT.has(e.equipment ?? null)) return 'reps_only';
  return 'weight_and_reps';
}

function toRow(e) {
  const [primary, ...otherPrimaries] = e.primaryMuscles;
  return [
    e.id,
    e.name,
    primary,
    trackingType(e),
    [...otherPrimaries, ...(e.secondaryMuscles ?? [])],
    e.equipment ?? null,
    e.mechanic ?? null,
    e.force ?? null,
    e.level ?? null,
    e.category ?? null,
    e.instructions ?? [],
    e.images ?? [],
  ];
}

async function main() {
  const res = await fetch(DATASET_URL);
  if (!res.ok) throw new Error(`Dataset download failed: ${res.status}`);
  const data = await res.json();
  const exercises = data.filter((e) => e.id && e.name && e.primaryMuscles?.length);

  await init();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of exercises) {
      // Adopt a hand-added row with the same name (e.g. a placeholder "Plank") instead of
      // duplicating it, which keeps its id and anything already referencing it
      await client.query(
        'UPDATE exercises SET source_id = $1 WHERE source_id IS NULL AND lower(name) = lower($2)',
        [e.id, e.name]
      );
      await client.query(
        `INSERT INTO exercises (source_id, name, primary_muscle, tracking_type, secondary_muscles,
                                equipment, mechanic, force, level, category, instructions, image_paths)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (source_id) DO UPDATE SET
           name = $2, primary_muscle = $3, tracking_type = $4, secondary_muscles = $5,
           equipment = $6, mechanic = $7, force = $8, level = $9, category = $10,
           instructions = $11, image_paths = $12`,
        toRow(e)
      );
    }
    await client.query('COMMIT');
    console.log(`Seeded ${exercises.length} exercises`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
