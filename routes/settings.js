// Settings page API. Mounted at /api/settings behind requireAuth (see server.js),
// so req.user is always set here. Express 5 forwards async errors to the error handler.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const router = express.Router();

// Same rules as signup on the Peter branch (#15). Move them to one shared place once that merges.
const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
const USERNAME_MSG = 'Username must be 3–30 letters, numbers, or underscores.';
const PASSWORD_MSG = 'Password must have at least 8 characters and use no more than 72 bytes.';
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && Buffer.byteLength(p, 'utf8') <= 72;

async function checkPassword(userId, password) {
  if (typeof password !== 'string' || !password) return false;
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  return rows.length > 0 && bcrypt.compare(password, rows[0].password_hash);
}

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT username, is_private, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  const u = rows[0];
  res.json({ username: u.username, isPrivate: u.is_private, createdAt: u.created_at });
});

router.patch('/username', async (req, res) => {
  const { username } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: USERNAME_MSG });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING username',
      [username, req.user.id]
    );
    res.json({ username: rows[0].username });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    throw e;
  }
});

router.patch('/password', async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!validPassword(newPassword)) return res.status(400).json({ error: PASSWORD_MSG });
  if (newPassword !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
  if (!(await checkPassword(req.user.id, currentPassword))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  // A changed password should kick out anyone else who was logged in as this user.
  await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [req.user.id, req.sessionTokenHash]);
  res.json({ ok: true });
});

router.patch('/privacy', async (req, res) => {
  const { isPrivate } = req.body || {};
  if (typeof isPrivate !== 'boolean') return res.status(400).json({ error: 'isPrivate must be true or false' });
  await pool.query('UPDATE users SET is_private = $1 WHERE id = $2', [isPrivate, req.user.id]);
  res.json({ isPrivate });
});

router.post('/logout-others', async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM sessions WHERE user_id = $1 AND token <> $2',
    [req.user.id, req.sessionTokenHash]
  );
  res.json({ removed: rowCount });
});

router.delete('/account', async (req, res) => {
  const { password } = req.body || {};
  if (!(await checkPassword(req.user.id, password))) {
    return res.status(401).json({ error: 'Password is incorrect' });
  }
  // ON DELETE CASCADE removes sessions, workouts, templates and records.
  await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
  res.clearCookie('sid');
  res.json({ ok: true });
});

module.exports = router;
