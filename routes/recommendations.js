// Workout plan recommendations: preview a plan, swap exercises, save a plan as workout templates.
const express = require('express');
const { pool } = require('../db');
const { parsePreferences, buildPlan, findAlternatives, PLAN_CATEGORIES } = require('../lib/recommend');

// How many of the user's latest workouts count as "recent" when avoiding repeats
const RECENT_WORKOUTS = 5;

const EXERCISE_FIELDS = 'id, name, primary_muscle, equipment, mechanic, level, category, tracking_type';
const MAX_ID = 2 ** 31 - 1; // Postgres INTEGER
const toPublic = ({ category, ...e }) => e;

// "1,2,3" -> [1, 2, 3]; anything that isn't a positive whole number is dropped
const idList = (v) => (typeof v === 'string' ? v.split(',') : [])
  .map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_ID);

async function loadPlanExercises() {
  const { rows } = await pool.query(
    `SELECT ${EXERCISE_FIELDS} FROM exercises WHERE category = ANY($1::text[])`,
    [[...PLAN_CATEGORIES]]
  );
  return rows;
}

async function loadRecentExerciseIds(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT we.exercise_id
       FROM workout_exercises we
      WHERE we.workout_id IN (
        SELECT id FROM workouts WHERE user_id = $1 ORDER BY id DESC LIMIT $2
      )`,
    [userId, RECENT_WORKOUTS]
  );
  return rows.map((r) => r.exercise_id);
}

const LIBRARY_EMPTY = { error: 'Exercise library is empty. Run npm run seed:exercises' };

module.exports = function recommendationRoutes({ requireAuth }) {
  const router = express.Router();

  // Preview a weekly plan. Nothing is saved until POST /api/plans.
  // Body: { goal, daysPerWeek, minutesPerSession, level, equipment } (all optional)
  router.post('/recommendations/plan', requireAuth, async (req, res) => {
    const { prefs, error } = parsePreferences(req.body);
    if (error) return res.status(400).json({ error });

    const [exercises, recentExerciseIds] = await Promise.all([
      loadPlanExercises(),
      loadRecentExerciseIds(req.user.id),
    ]);
    if (!exercises.length) return res.status(503).json(LIBRARY_EMPTY);

    res.json({ plan: buildPlan(prefs, exercises, { recentExerciseIds }) });
  });

  // Other exercises for the same muscle, for swapping one out of a previewed plan.
  // Query: level, equipment (comma-separated), exclude (comma-separated ids), limit (default 10, max 25)
  router.get('/exercises/:id/alternatives', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || id > MAX_ID) return res.status(400).json({ error: 'Invalid exercise id' });

    const { level, equipment } = req.query;
    const { prefs, error } = parsePreferences({
      ...(level !== undefined && { level }),
      ...(equipment !== undefined && { equipment: String(equipment).split(',').filter(Boolean) }),
    });
    if (error) return res.status(400).json({ error });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 25);

    const { rows: [target] } = await pool.query(`SELECT ${EXERCISE_FIELDS} FROM exercises WHERE id = $1`, [id]);
    if (!target) return res.status(404).json({ error: 'Exercise not found' });

    const { rows: sameMuscle } = await pool.query(
      `SELECT ${EXERCISE_FIELDS} FROM exercises WHERE primary_muscle = $1 AND category = ANY($2::text[])`,
      [target.primary_muscle, [...PLAN_CATEGORIES]]
    );
    const alternatives = findAlternatives(target, sameMuscle, prefs, { exclude: idList(req.query.exclude), limit });
    res.json({ exercise: toPublic(target), alternatives: alternatives.map(toPublic) });
  });

  return router;
};
