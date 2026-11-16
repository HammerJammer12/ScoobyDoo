const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { pool, init, getDashboard } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 14; //how long after we expire sessions, helps to prevent sessions table from getting full of junk
const COOKIE_NAME = 'sid';
const secureCookies = process.env.NODE_ENV === 'production';
const authAttempts = new Map();
const AUTH_WINDOW = 15 * 60 * 1000;
// A real hash makes unknown usernames take about as long as wrong passwords.
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

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
    secure: secureCookies,
    maxAge,
  });
}

async function loadUser(req, _res, next) {
  req.user = null;
  req.sessionTokenHash = null;
  const token = req.cookies[COOKIE_NAME];
  if (token) {
    const { rows } = await pool.query(
      'SELECT user_id, expires_at FROM sessions WHERE token = $1',
      [hashToken(token)]
    );
    const s = rows[0];
    if (s && Number(s.expires_at) > Date.now()) {
      const result = await pool.query(
        'SELECT id, username, created_at, weight_unit FROM users WHERE id = $1',
        [s.user_id]
      );
      req.user = result.rows[0] || null;
      req.sessionTokenHash = hashToken(token); // lets settings routes keep the current session
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function authLimiter(req, res, next) {
  // Count requests from each IP. This simple limit resets on server restart.
  const now = Date.now();
  let attempts = authAttempts.get(req.ip);
  if (!attempts || attempts.resetAt <= now) {
    attempts = { count: 0, resetAt: now + AUTH_WINDOW };
    authAttempts.set(req.ip, attempts);
  }
  if (attempts.count >= 10) {
    res.set('Retry-After', String(Math.ceil((attempts.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  attempts.count += 1;
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
  const { username, password, confirmPassword } = req.body || {};
  // Check on the server too: browser checks can be bypassed.
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–30 letters, numbers, or underscores.' });
  }
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password must have at least 8 characters and use no more than 72 bytes.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const hash = await bcrypt.hash(password, 12);
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
  if (typeof username !== 'string' || typeof password !== 'string' ||
      !username.trim() || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Enter a username and password (password maximum: 72 bytes).' });
  }
  let user = null;
  if (typeof username === 'string') {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, created_at FROM users WHERE lower(username) = lower($1)',
      [username]
    );
    user = rows[0] || null;
  }

  const hash = user ? user.password_hash : dummyHash;
  const ok = typeof password === 'string' && await bcrypt.compare(password, hash);
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

app.use('/api/plans', requireAuth, require('./routes/plans'));
app.use('/api/workouts', requireAuth, require('./routes/workout-views'));
app.get('/api/dashboard', requireAuth, async (req, res) => {
  res.json(await getDashboard(req.user.id));
});
app.use('/api', requireAuth, require('./routes/posts'));
app.use('/api/settings', requireAuth, require('./routes/settings'));

const EXERCISE_IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// Search the exercise library, e.g. /api/exercises?q=curl&muscle=biceps&equipment=dumbbell
app.get('/api/exercises', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { rows } = await pool.query(
    `SELECT id, name, primary_muscle, secondary_muscles, equipment, mechanic, force, level,
            category, tracking_type, instructions, image_paths
       FROM exercises
      WHERE ($1::text IS NULL OR strpos(lower(name), lower($1)) > 0)
        AND ($2::text IS NULL OR primary_muscle = lower($2))
        AND ($3::text IS NULL OR equipment = lower($3))
      ORDER BY name
      LIMIT $4 OFFSET $5`,
    [str(req.query.q), str(req.query.muscle), str(req.query.equipment), limit, offset]
  );
  res.json({
    exercises: rows.map(({ image_paths, ...e }) => ({
      ...e,
      images: image_paths.map((p) => EXERCISE_IMAGE_BASE + p),
    })),
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

//deletes sessions with expiration dates in the past, just to prevent db from getting filled with junk
setInterval(() => {
  for (const [ip, attempts] of authAttempts) {
    if (attempts.resetAt <= Date.now()) authAttempts.delete(ip);
  }
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
