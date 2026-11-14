// Workout plan recommendations: preview a plan, swap exercises, save a plan as workout templates.
const express = require('express');
const { pool } = require('../db');
const { parsePreferences, buildPlan, PLAN_CATEGORIES } = require('../lib/recommend');

// How many of the user's latest workouts count as "recent" when avoiding repeats
const RECENT_WORKOUTS = 5;

async function loadPlanExercises() {
  const { rows } = await pool.query(
    `SELECT id, name, primary_muscle, equipment, mechanic, level, category, tracking_type
       FROM exercises
      WHERE category = ANY($1::text[])`,
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

  return router;
};
