// Opt-in local demo data only; never run automatically at server startup.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, init } = require('../db');
const examples = require('../data/demo-workouts');

async function seedWorkouts(client, userId) {
  const ids = [];
  for (const lift of examples) {
    let { rows: [exercise] } = await client.query('SELECT id FROM exercises WHERE name = $1 ORDER BY id LIMIT 1', [lift.name]);
    if (!exercise) {
      ({ rows: [exercise] } = await client.query(`INSERT INTO exercises (name, primary_muscle, secondary_muscles, tracking_type)
        VALUES ($1, $2, $3, 'weight_and_reps') RETURNING id`, [lift.name, lift.primary_muscle, lift.secondary_muscles]));
    }
    let { rows: [workout] } = await client.query('SELECT id FROM workouts WHERE user_id = $1 AND name = $2 ORDER BY id LIMIT 1', [userId, lift.name]);
    if (!workout) {
      ({ rows: [workout] } = await client.query('INSERT INTO workouts (user_id, name) VALUES ($1, $2) RETURNING id', [userId, lift.name]));
      await client.query('INSERT INTO workout_exercises (workout_id, exercise_id, position_in_workout) VALUES ($1, $2, 1)', [workout.id, exercise.id]);
    }
    ids.push(workout.id);
  }
  return ids;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
  const username = process.argv[2];
  if (!username) throw new Error('Usage: npm run seed:demo -- YOUR_EXISTING_USERNAME');
  await init();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
    if (!user) throw new Error('Create an account in the app first, then seed that username.');
    await seedWorkouts(client, user.id);
    for (const [index, name] of ['demo_alex', 'demo_jamie'].entries()) {
      const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      await client.query(`INSERT INTO users (username, password_hash) SELECT $1, $2
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(username) = lower($1))`, [name, hash]);
      const { rows: [friend] } = await client.query('SELECT id FROM users WHERE username = $1', [name]);
      if (friend.id === user.id) continue;
      const workouts = await seedWorkouts(client, friend.id);
      await client.query(`INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted')
        ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`, [user.id, friend.id]);
      const content = index === 0 ? 'Demo post: working on consistent squat depth. Small improvements add up.' : 'Demo post: finished upper body with controlled dumbbell curls today.';
      await client.query(`INSERT INTO posts (author_id, content, workout_id) SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM posts WHERE author_id = $1 AND content = $2)`, [friend.id, content, workouts[index === 0 ? 0 : 2]]);
    }
    await client.query('COMMIT');
    console.log('Demo workouts, two demo friends, and their posts are ready.');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => pool.end());
