const { Pool, types } = require('pg');

// pg returns NUMERIC (OID 1700) as strings to avoid precision loss; our weights are 3-decimal kg, safe as JS numbers
types.setTypeParser(1700, parseFloat);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // postgres://user:pass@localhost:5432/liftlog
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

//TODO: split table inits into migration files once schemas are finalised 
// Renames tables/columns created with the old "excercise" spelling so existing local databases keep working
const RENAME_LEGACY = `
  DO $$
  DECLARE r RECORD;
  BEGIN
    FOR r IN SELECT * FROM (VALUES
      ('excercises', 'exercises'),
      ('template_excercises', 'template_exercises'),
      ('workout_excercises', 'workout_exercises')
    ) AS t(old_name, new_name) LOOP
      IF to_regclass(r.old_name) IS NOT NULL AND to_regclass(r.new_name) IS NULL THEN
        EXECUTE format('ALTER TABLE %I RENAME TO %I', r.old_name, r.new_name);
      END IF;
    END LOOP;

    FOR r IN SELECT table_name, column_name FROM information_schema.columns
             WHERE table_schema = current_schema() AND column_name LIKE '%excercise%' LOOP
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I',
        r.table_name, r.column_name, replace(r.column_name, 'excercise', 'exercise'));
    END LOOP;

    -- target_weight was unitless; it is kg like workout_sets.weight_kgs
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
               AND table_name = 'template_exercises' AND column_name = 'target_weight')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
               AND table_name = 'template_exercises' AND column_name = 'target_weight_kgs') THEN
      ALTER TABLE template_exercises RENAME COLUMN target_weight TO target_weight_kgs;
    END IF;
  END $$;
`;

async function init() {
  // Match the exercise naming used by the team's newer feature branches.
  await pool.query(`
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN SELECT * FROM (VALUES
        ('excercises', 'exercises'), ('template_excercises', 'template_exercises'),
        ('workout_excercises', 'workout_exercises')
      ) AS t(old_name, new_name) LOOP
        IF to_regclass(r.old_name) IS NOT NULL AND to_regclass(r.new_name) IS NULL THEN
          EXECUTE format('ALTER TABLE %I RENAME TO %I', r.old_name, r.new_name);
        END IF;
      END LOOP;
      FOR r IN SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND column_name LIKE '%excercise%' LOOP
        EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.table_name,
          r.column_name, replace(r.column_name, 'excercise', 'exercise'));
      END LOOP;
    END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'lb' CHECK (weight_unit IN ('lb', 'kg'));

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

    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS secondary_muscles TEXT[] NOT NULL DEFAULT '{}';
    -- Library metadata, filled by scripts/seed-exercises.js (ADD COLUMN so existing databases pick these up)
    ALTER TABLE exercises
      ADD COLUMN IF NOT EXISTS source_id TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS equipment TEXT,
      ADD COLUMN IF NOT EXISTS mechanic TEXT,
      ADD COLUMN IF NOT EXISTS force TEXT,
      ADD COLUMN IF NOT EXISTS level TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT,
      ADD COLUMN IF NOT EXISTS instructions TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS image_paths TEXT[] NOT NULL DEFAULT '{}';
    CREATE INDEX IF NOT EXISTS idx_exercises_primary_muscle ON exercises(primary_muscle);

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
      target_weight_kgs NUMERIC(8,3),
      target_duration INTEGER,
      target_distance INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS workouts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES workout_templates(id) ON DELETE SET NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
      type TEXT NOT NULL CHECK (type IN ('weekly', 'monthly')),
      start_date DATE NOT NULL,
      days JSONB NOT NULL CHECK (jsonb_typeof(days) = 'array'),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_workout_plans_user ON workout_plans(user_id);

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
      weight_kgs NUMERIC(8,3),
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
      value NUMERIC(8,3) NOT NULL, -- kg for weight/volume/1rm records, a count for max_reps
      date_achieved DATE DEFAULT CURRENT_DATE
    );

    -- Existing databases created these as INTEGER; decimals let lb entries round-trip exactly
    ALTER TABLE workout_sets ALTER COLUMN weight_kgs TYPE NUMERIC(8,3);
    ALTER TABLE template_exercises ALTER COLUMN target_weight_kgs TYPE NUMERIC(8,3);
    ALTER TABLE personal_records ALTER COLUMN value TYPE NUMERIC(8,3);

    CREATE UNIQUE INDEX IF NOT EXISTS ux_exercises_name ON exercises (lower(name));

    CREATE TABLE IF NOT EXISTS friendships (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
      PRIMARY KEY (user_id, friend_id),
      CHECK (user_id <> friend_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 1000),
      workout_id INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS body_part TEXT
      CHECK (body_part IN ('arms', 'legs', 'back', 'chest'));
    UPDATE posts p SET body_part = CASE lower(w.name)
      WHEN 'squat' THEN 'legs' WHEN 'deadlift' THEN 'back'
      WHEN 'dumbbell curl' THEN 'arms' WHEN 'bench' THEN 'chest' END
      FROM workouts w WHERE w.id = p.workout_id AND p.body_part IS NULL
      AND lower(w.name) IN ('squat', 'deadlift', 'dumbbell curl', 'bench');
    CREATE INDEX IF NOT EXISTS idx_posts_author_date ON posts(author_id, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, user_id)
    );

    -- Temporary all-users-are-friends behavior, including users inserted by seeds.
    CREATE OR REPLACE FUNCTION auto_friend_new_user() RETURNS trigger AS $$
    BEGIN
      -- Serialize this step so simultaneous signups also see each other.
      PERFORM pg_advisory_xact_lock(19741, 1);
      INSERT INTO friendships (user_id, friend_id, status)
      SELECT LEAST(NEW.id, u.id), GREATEST(NEW.id, u.id), 'accepted'
      FROM users u WHERE u.id <> NEW.id
      ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted';
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE OR REPLACE TRIGGER auto_friend_after_signup
      AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION auto_friend_new_user();

    -- Accept existing requests and connect existing accounts once per pair.
    UPDATE friendships SET status = 'accepted' WHERE status <> 'accepted';
    INSERT INTO friendships (user_id, friend_id, status)
    SELECT a.id, b.id, 'accepted' FROM users a JOIN users b ON a.id < b.id
    WHERE NOT EXISTS (
      SELECT 1 FROM friendships f
      WHERE (f.user_id = a.id AND f.friend_id = b.id)
         OR (f.user_id = b.id AND f.friend_id = a.id)
    ) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted';
  `);
}
//remove this insert once we got the api hooked up

// One summary per workout; the first exercise supplies its muscle metadata.
const WORKOUT_SELECT = `
  SELECT w.id::text AS id, w.name, COALESCE(e.primary_muscle, 'Not specified') AS primary_muscle,
         COALESCE(e.secondary_muscles, '{}'::text[]) AS secondary_muscles
    FROM workouts w
    LEFT JOIN LATERAL (
      SELECT ex.primary_muscle, ex.secondary_muscles FROM workout_exercises we
      JOIN exercises ex ON ex.id = we.exercise_id
      WHERE we.workout_id = w.id ORDER BY we.position_in_workout, we.id LIMIT 1
    ) e ON true
   WHERE w.user_id = $1 AND ($2::integer IS NULL OR w.id = $2)
   ORDER BY w.id`;

async function getWorkouts(userId, id = null) {
  const { rows } = await pool.query(WORKOUT_SELECT, [userId, id]);
  return rows;
}

async function getWorkoutHistory(userId) {
  const { rows } = await pool.query(
    `SELECT w.id,
            COUNT(DISTINCT we.id)::int AS exercise_count,
            COUNT(ws.id)::int          AS set_count
       FROM workouts w
       LEFT JOIN workout_exercises we ON we.workout_id = w.id
       LEFT JOIN workout_sets ws      ON ws.workout_exercise_id = we.id
      WHERE w.user_id = $1
      GROUP BY w.id
      ORDER BY w.id DESC`,
    [userId]
  );

  const base = new Map((await getWorkouts(userId)).map((w) => [w.id, w]));

  return rows.map((r) => ({
    ...base.get(String(r.id)),
    exerciseCount: r.exercise_count,
    setCount: r.set_count,
  }));
}

async function getWorkout(userId, id) {
  const { rows: [workout] } = await pool.query(
    'SELECT id, name FROM workouts WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!workout) return null;

  const { rows } = await pool.query(
    `SELECT we.id AS workout_exercise_id,
            e.id AS exercise_id, e.name, e.primary_muscle, e.tracking_type,
            ws.set_number, ws.weight_kgs, ws.reps, ws.duration_secs, ws.distance_meters
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
       LEFT JOIN workout_sets ws ON ws.workout_exercise_id = we.id
      WHERE we.workout_id = $1
      ORDER BY we.position_in_workout, we.id, ws.set_number`,
    [id]
  );

  const exercises = [];
  const byWe = new Map();
  for (const r of rows) {
    let ex = byWe.get(r.workout_exercise_id);
    if (!ex) {
      ex = {
        exerciseId: r.exercise_id,
        name: r.name,
        primaryMuscle: r.primary_muscle,
        trackingType: r.tracking_type,
        sets: [],
      };
      byWe.set(r.workout_exercise_id, ex);
      exercises.push(ex);
    }
    if (r.set_number != null) {
      const set = { setNumber: r.set_number };
      if (r.weight_kgs != null) set.weightKgs = r.weight_kgs;
      if (r.reps != null) set.reps = r.reps;
      if (r.duration_secs != null) set.durationSecs = r.duration_secs;
      if (r.distance_meters != null) set.distanceMeters = r.distance_meters;
      ex.sets.push(set);
    }
  }

  return { id: workout.id, name: workout.name, exercises };
}

// Posts are readable by their author and accepted friends, in either direction.
const VISIBLE_POST = `(p.author_id = $1 OR EXISTS (
  SELECT 1 FROM friendships f WHERE f.status = 'accepted'
  AND ((f.user_id = $1 AND f.friend_id = p.author_id)
    OR (f.friend_id = $1 AND f.user_id = p.author_id))))`;

async function getPosts(userId, { mine = false, id = null } = {}) {
  const { rows } = await pool.query(`
    SELECT p.id::text AS id, p.author_id, p.content, p.created_at, p.body_part,
      u.username AS name, u.username AS handle,
      (SELECT count(*)::integer FROM post_likes l WHERE l.post_id = p.id) AS likes,
      EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked,
      CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', w.id::text, 'name', w.name,
        'primary_muscle', COALESCE(e.primary_muscle, 'Not specified')) END AS lift
    FROM posts p JOIN users u ON u.id = p.author_id
    LEFT JOIN workouts w ON w.id = p.workout_id AND w.user_id = p.author_id
    LEFT JOIN LATERAL (
      SELECT ex.primary_muscle FROM workout_exercises we
      JOIN exercises ex ON ex.id = we.exercise_id
      WHERE we.workout_id = w.id ORDER BY we.position_in_workout, we.id LIMIT 1
    ) e ON true
    WHERE ${VISIBLE_POST} AND (NOT $2::boolean OR p.author_id = $1)
      AND ($3::integer IS NULL OR p.id = $3)
    ORDER BY p.created_at DESC, p.id DESC LIMIT 50`, [userId, mine, id]);
  return rows;
}

async function createPost(userId, content, workoutId, bodyPart = null) {
  // The ownership check and insert are one statement, including for untagged posts.
  const { rows } = await pool.query(`
    INSERT INTO posts (author_id, content, workout_id, body_part)
    SELECT $1, $2, $3::integer, $4::text WHERE $3::integer IS NULL OR EXISTS (
      SELECT 1 FROM workouts WHERE id = $3 AND user_id = $1)
    RETURNING id`, [userId, content, workoutId, bodyPart]);
  if (!rows.length) return null;
  return (await getPosts(userId, { id: rows[0].id }))[0];
}

async function setPostLike(userId, id, liked) {
  if (liked) {
    await pool.query(`
      INSERT INTO post_likes (post_id, user_id)
      SELECT p.id, $1 FROM posts p WHERE p.id = $2 AND ${VISIBLE_POST}
      ON CONFLICT DO NOTHING RETURNING post_id`, [userId, id]);
  } else {
    await pool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, userId]);
  }
  return (await getPosts(userId, { id }))[0] || null;
}

async function getDashboard(userId) {
  const { rows: [summary] } = await pool.query(`
    SELECT
      (SELECT count(*)::integer FROM workouts WHERE user_id = $1) AS saved_workouts,
      (SELECT count(*)::integer FROM workout_sets s
        JOIN workout_exercises we ON we.id = s.workout_exercise_id
        JOIN workouts w ON w.id = we.workout_id WHERE w.user_id = $1) AS logged_sets,
      (SELECT count(*)::integer FROM personal_records WHERE user_id = $1) AS personal_records`, [userId]);
  // There is no workout-date column yet. IDs reflect save order, not session dates.
  const { rows: recentWorkouts } = await pool.query(`
    SELECT w.id::text AS id, w.name,
      (SELECT count(*)::integer FROM workout_exercises we WHERE we.workout_id = w.id) AS exercise_count,
      (SELECT count(*)::integer FROM workout_sets s
        JOIN workout_exercises we ON we.id = s.workout_exercise_id
        WHERE we.workout_id = w.id) AS set_count
    FROM workouts w WHERE w.user_id = $1 ORDER BY w.id DESC LIMIT 3`, [userId]);
  const { rows: recentAchievements } = await pool.query(`
    SELECT pr.id::text AS id, e.name AS exercise_name, pr.record_type, pr.value
    FROM personal_records pr JOIN exercises e ON e.id = pr.exercise_id
    WHERE pr.user_id = $1 ORDER BY pr.date_achieved DESC NULLS LAST, pr.id DESC LIMIT 3`, [userId]);
  return { summary, recentWorkouts, recentAchievements, recentOrder: 'save-order' };
}

module.exports = { pool, init, getWorkouts, getWorkout, getPosts, createPost, setPostLike, getDashboard, getWorkoutHistory };
