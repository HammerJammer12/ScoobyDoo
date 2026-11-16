const express = require('express');
const { pool } = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const FIELDS = {
  weight_and_reps: { required: ['weightKgs', 'reps'], optional: [] },
  reps_only:       { required: ['reps'], optional: [] },
  duration:        { required: ['durationSecs'], optional: [] },
  distance:        { required: ['distanceMeters'], optional: ['durationSecs'] },
};
const INTEGER_FIELDS = new Set(['reps', 'durationSecs']);

const MAX_EXERCISES = 30;
const MAX_SETS = 30;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object';

  if (typeof body.name !== 'string' || !body.name.trim()) return 'Workout name is required';

  if (body.name.length > 100) return 'Workout name is too long (max 100)';

  if (!Array.isArray(body.exercises) || body.exercises.length === 0) return 'Add at least one exercise';

  if (body.exercises.length > MAX_EXERCISES) return `Too many exercises (max ${MAX_EXERCISES})`;

  for (const ex of body.exercises) {
    if (!ex || !Number.isInteger(ex.exerciseId)) return 'Each exercise needs a valid exerciseId';
    if (!Array.isArray(ex.sets) || ex.sets.length === 0) return 'Each exercise needs at least one set';
    if (ex.sets.length > MAX_SETS) return `Too many sets in one exercise (max ${MAX_SETS})`;
  }
  return null;
}

function validateSet(set, trackingType, exerciseName) {
  const spec = FIELDS[trackingType];
  if (!set || typeof set !== 'object') return `Invalid set for ${exerciseName}`;
  for (const f of [...spec.required, ...spec.optional]) {
    const v = set[f];
    if (v == null) {
      if (spec.required.includes(f)) return `${exerciseName}: every set needs ${f}`;
      continue;
    }
    if (!isNum(v) || v < 0) return `${exerciseName}: ${f} must be a non-negative number`;
    if (INTEGER_FIELDS.has(f) && !Number.isInteger(v)) return `${exerciseName}: ${f} must be a whole number`;
    if (f === 'reps' && v < 1) return `${exerciseName}: reps must be at least 1`;
  }
  return null;
}

router.get('/exercises', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, primary_muscle, tracking_type FROM exercises ORDER BY name'
  );
  res.json({ exercises: rows });
}));

router.post('/workouts', wrap(async (req, res) => {
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, exercises } = req.body;

  const ids = [...new Set(exercises.map((e) => e.exerciseId))];
  const found = await pool.query(
    'SELECT id, name, tracking_type FROM exercises WHERE id = ANY($1::int[])',
    [ids]
  );
  const byId = new Map(found.rows.map((r) => [r.id, r]));

  for (const ex of exercises) {
    const meta = byId.get(ex.exerciseId);
    if (!meta) return res.status(400).json({ error: `Unknown exercise id ${ex.exerciseId}` });
    for (const set of ex.sets) {
      const setErr = validateSet(set, meta.tracking_type, meta.name);
      if (setErr) return res.status(400).json({ error: setErr });
    }
  }

router.get('/workouts', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT w.id,
            w.name,
            COUNT(DISTINCT we.id)::int AS exercise_count,
            COUNT(ws.id)::int          AS set_count
       FROM workouts w
       LEFT JOIN workout_exercises we ON we.workout_id = w.id
       LEFT JOIN workout_sets ws      ON ws.workout_exercise_id = we.id
      WHERE w.user_id = $1
      GROUP BY w.id
      ORDER BY w.id DESC`,
    [req.user.id]
  );

  res.json({
    workouts: rows.map((r) => ({
      id: r.id,
      name: r.name,
      exerciseCount: r.exercise_count,
      setCount: r.set_count,
    })),
  });
}));

router.get('/workouts/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid workout id' });
  }

  const { rows: [workout] } = await pool.query(
    'SELECT id, name FROM workouts WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (!workout) return res.status(404).json({ error: 'Workout not found' });

  const { rows } = await pool.query(
    `SELECT we.id AS workout_exercise_id,
            we.position_in_workout,
            e.id AS exercise_id,
            e.name,
            e.primary_muscle,
            e.tracking_type,
            ws.set_number,
            ws.weight_kgs,
            ws.reps,
            ws.duration_secs,
            ws.distance_meters
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
       LEFT JOIN workout_sets ws ON ws.workout_exercise_id = we.id
      WHERE we.workout_id = $1
      ORDER BY we.position_in_workout, ws.set_number`,
    [id]
  );

  const exercises = [];
  const byWe = new Map();
  for (const r of rows) {
    let ex = byWe.get(r.workout_exercise_id);
    if (!ex) {
      ex = {
        exerciseId: r.exercise_id,
        name: r.name,
        primaryMuscle: r.primary_muscle,
        trackingType: r.tracking_type,
        sets: [],
      };
      byWe.set(r.workout_exercise_id, ex);
      exercises.push(ex);
    }
    if (r.set_number != null) {
      const set = { setNumber: r.set_number };
      if (r.weight_kgs != null) set.weightKgs = r.weight_kgs;
      if (r.reps != null) set.reps = r.reps;
      if (r.duration_secs != null) set.durationSecs = r.duration_secs;
      if (r.distance_meters != null) set.distanceMeters = r.distance_meters;
      ex.sets.push(set);
    }
  }

  res.json({ id: workout.id, name: workout.name, exercises });
}));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [w] } = await client.query(
      `INSERT INTO workouts (user_id, name)
       VALUES ($1, $2)
       RETURNING id`,
      [req.user.id, name.trim()]
    );

    for (const [i, ex] of exercises.entries()) {
      const { rows: [we] } = await client.query(
        `INSERT INTO workout_exercises (workout_id, exercise_id, position_in_workout)
         VALUES ($1, $2, $3) RETURNING id`,
        [w.id, ex.exerciseId, i + 1]
      );
      for (const [j, set] of ex.sets.entries()) {
        await client.query(
          `INSERT INTO workout_sets
             (workout_exercise_id, set_number, weight_kgs, reps, duration_secs, distance_meters)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            we.id,
            j + 1,
            set.weightKgs ?? null,
            set.reps ?? null,
            set.durationSecs ?? null,
            set.distanceMeters ?? null,
          ]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ id: w.id });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

module.exports = router;