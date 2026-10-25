const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 14; //how long after we expire sessions, helps to prevent sessions table from getting full of junk
const COOKIE_NAME = 'sid';

app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = SESSION_DAYS * 24 * 60 * 60 * 1000;

  await pool.query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, Date.now() + maxAge]
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge,
  });
}

async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies[COOKIE_NAME];
  if (token) {
    const { rows } = await pool.query(
      'SELECT user_id, expires_at FROM sessions WHERE token = $1',
      [hashToken(token)]
    );
    const s = rows[0];
    if (s && Number(s.expires_at) > Date.now()) {
      const result = await pool.query(
        'SELECT id, username, created_at FROM users WHERE id = $1',
        [s.user_id]
      );
      req.user = result.rows[0] || null;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function authLimiter(req, res, next) {
  //TODO: limit signin attempts, maybe not a big deal for this project practically but a good practice nonetheless
  next();
}

function requireJson(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  next();
}

app.use(loadUser);
app.use('/api', requireJson);

app.post('/api/signup', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  //TODO username/password autnentication, we should decide what requirements usernames and passwords should have.

  const hash = bcrypt.hashSync(password, 12);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
      [username, hash]
    );
    await startSession(res, rows[0].id);
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    throw e;
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  let user = null;
  if (typeof username === 'string') {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, created_at FROM users WHERE lower(username) = lower($1)',
      [username]
    );
    user = rows[0] || null;
  }

  const hash = user ? user.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = typeof password === 'string' && bcrypt.compareSync(password, hash);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid username or password' });

  await startSession(res, user.id);
  res.json({ user: { id: user.id, username: user.username, created_at: user.created_at } });
});

app.post('/api/logout', async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [hashToken(token)]);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

//deletes sessions with expiration dates in the past, just to prevent db from getting filled with junk
setInterval(() => {
  pool.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]).catch(console.error);
}, 60 * 60 * 1000).unref();

if (require.main === module) {
  init()
    .then(() => app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`)))
    .catch((err) => {
      console.error('Failed to start:', err);
      process.exit(1);
    });
}
module.exports = app;