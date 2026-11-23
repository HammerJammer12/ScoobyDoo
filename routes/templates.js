// Workout templates (e.g. the days of a plan saved from /plan/): list, load one to start it, delete.
// Mounted at /api/templates behind requireAuth; users only ever see their own templates.
const express = require('express');
const { pool } = require('../db');

const router = express.Router();
const MAX_ID = 2 ** 31 - 1; // Postgres INTEGER

const validId = (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= MAX_ID;

// Templates with their exercises in order. Pass templateId to load just one.
async function loadTemplates(userId, templateId = null) {
  const { rows } = await pool.query(
    `SELECT t.id, t.name,
            COALESCE(json_agg(json_build_object(
              'exercise_id', e.id,
              'name', e.name,
              'primary_muscle', e.primary_muscle,
              'equipment', e.equipment,
              'tracking_type', e.tracking_type,
              'target_sets', te.target_sets,
              'target_reps', te.target_reps,
              'target_duration', te.target_duration
            ) ORDER BY te.position_in_workout, te.id) FILTER (WHERE te.id IS NOT NULL), '[]') AS exercises
       FROM workout_templates t
       LEFT JOIN template_exercises te ON te.template_id = t.id
       LEFT JOIN exercises e ON e.id = te.exercise_id
      WHERE t.user_id = $1 AND ($2::int IS NULL OR t.id = $2)
      GROUP BY t.id
      ORDER BY t.id`,
    [userId, templateId]
  );
  return rows;
}

router.get('/', async (req, res) => {
  res.json({ templates: await loadTemplates(req.user.id) });
});

router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid template id' });
  const [template] = await loadTemplates(req.user.id, Number(req.params.id));
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json({ template });
});

router.delete('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid template id' });
  const { rowCount } = await pool.query(
    'DELETE FROM workout_templates WHERE id = $1 AND user_id = $2',
    [Number(req.params.id), req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Template not found' });
  res.json({ ok: true });
});

module.exports = router;
