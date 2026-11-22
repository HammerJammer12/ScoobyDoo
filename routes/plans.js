const express = require('express');
const { pool } = require('../db');
const router = express.Router();
const validId = id => ['string', 'number'].includes(typeof id) && /^\d+$/.test(String(id)) && Number(id) > 0 && Number(id) <= 2147483647;

function validatePlan(body) {
  const { name, type, startDate, days } = body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return 'Enter a plan name (up to 80 characters).';
  if (!['weekly', 'monthly'].includes(type)) return 'Choose a weekly or monthly plan.';
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return 'Choose a valid start date.';
  const date = new Date(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate || date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2200) return 'Choose a valid start date.';
  if (type === 'weekly' && date.getUTCDay() !== 1) return 'Weekly plans start on Monday.';
  if (type === 'monthly' && date.getUTCDate() !== 1) return 'Monthly plans start on the first day.';
  const length = type === 'weekly' ? 7 : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (!Array.isArray(days) || days.length !== length || days.some(day => !Array.isArray(day) || day.length > 10 || day.some(id => !validId(id)))) return 'Use up to 10 workouts per day, with one entry for every day.';
  return null;
}
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id::text, name, type, start_date::text AS "startDate" FROM workout_plans WHERE user_id=$1 ORDER BY updated_at DESC, id DESC', [req.user.id]);
  res.json({ plans: rows });
});
router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid plan ID.' });
  const { rows: [plan] } = await pool.query('SELECT id::text, name, type, start_date::text AS "startDate", days FROM workout_plans WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });
  res.json({ plan });
});
async function save(req, res) {
  if (req.params.id && !validId(req.params.id)) return res.status(400).json({ error: 'Invalid plan ID.' });
  const error = validatePlan(req.body);
  if (error) return res.status(400).json({ error });
  const { name, type, startDate, days } = req.body;
  const ids = [...new Set(days.flat().map(Number))];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock referenced workouts through the save so ownership cannot change mid-request.
    const { rows } = await client.query('SELECT id FROM workouts WHERE user_id=$1 AND id=ANY($2::integer[]) FOR SHARE', [req.user.id, ids]);
    if (rows.length !== ids.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Choose workouts from your own saved workouts.' });
    }
    const values = [req.user.id, name.trim(), type, startDate, JSON.stringify(days.map(day => day.map(String)))];
    const result = req.params.id
      ? await client.query('UPDATE workout_plans SET name=$2,type=$3,start_date=$4,days=$5,updated_at=now() WHERE user_id=$1 AND id=$6 RETURNING id::text', [...values, req.params.id])
      : await client.query('INSERT INTO workout_plans (user_id,name,type,start_date,days) VALUES ($1,$2,$3,$4,$5) RETURNING id::text', values);
    await client.query('COMMIT');
    if (!result.rows.length) return res.status(404).json({ error: 'Plan not found.' });
    res.status(req.params.id ? 200 : 201).json({ id: result.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
router.post('/', save);
router.put('/:id', save);
module.exports = router;
