const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // postgres://user:pass@localhost:5432/liftlog
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

//TODO: split table inits into migration files once schemas are finalised 
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS exercises (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      primary_muscle TEXT NOT NULL,
      tracking_type TEXT NOT NULL CHECK (tracking_type IN ('weight_and_reps', 'reps_only', 'duration', 'distance'))
    );

    CREATE TABLE IF NOT EXISTS workout_templates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
      position_in_workout INTEGER NOT NULL,
      target_sets INTEGER,
      target_reps INTEGER,
      target_weight INTEGER,
      target_duration INTEGER,
      target_distance INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS workouts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES workout_templates(id) ON DELETE SET NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      id SERIAL PRIMARY KEY,
      workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
      position_in_workout INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id SERIAL PRIMARY KEY,
      workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      weight_kgs INTEGER,
      reps INTEGER,
      duration_secs INTEGER,
      distance_meters INTEGER
    );

    CREATE TABLE IF NOT EXISTS personal_records(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      set_id INTEGER NOT NULL REFERENCES workout_sets(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL CHECK(record_type in ('max_weight', 'max_reps', 'max_set_volume', 'max_est_1rm')),
      value INTEGER NOT NULL,
      date_achieved DATE DEFAULT CURRENT_DATE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_exercises_name ON exercises (lower(name));

INSERT INTO exercises (name, primary_muscle, tracking_type) VALUES
  ('Barbell Back Squat', 'quads', 'weight_and_reps'),
  ('Bench Press', 'chest', 'weight_and_reps'),
  ('Deadlift', 'back', 'weight_and_reps'),
  ('Overhead Press', 'shoulders', 'weight_and_reps'),
  ('Pull-up', 'back', 'reps_only'),
  ('Plank', 'core', 'duration'),
  ('Running', 'legs', 'distance')
ON CONFLICT DO NOTHING;
  `);
}
//remove this insert once we got the api hooked up

module.exports = { pool, init };