const express = require('express');
const { getWorkouts, getWorkout } = require('../db');
const router = express.Router();
const validId = (id) => /^\d+$/.test(id) && Number(id) > 0 && Number(id) <= 2147483647;

router.get('/', async (req, res) => {
  res.json({ workouts: await getWorkouts(req.user.id), source: 'database' });
});
router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid workout ID' });
  const workout = await getWorkout(req.user.id, req.params.id);
  if (!workout) return res.status(404).json({ error: 'Workout not found' });
  res.json({ workout, source: 'database' });
});
module.exports = router;
