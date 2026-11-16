const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL posts, tags, feed visibility, and likes', { skip: !databaseUrl }, async (t) => {
  // Every run gets an isolated schema; existing application records are untouched.
  const schema = `test_social_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const db = require('../db');
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await db.pool.query(`CREATE TABLE excercises (id SERIAL PRIMARY KEY, name TEXT NOT NULL,
      primary_muscle TEXT NOT NULL, tracking_type TEXT NOT NULL);
      INSERT INTO excercises (name, primary_muscle, tracking_type) VALUES ('Dumbbell Curl', 'biceps', 'weight_and_reps')`);
    await db.init();
    await db.init();
    await t.test('startup migrates legacy names without losing rows and is repeatable', async () => {
      assert.equal((await db.pool.query('SELECT name FROM exercises WHERE id = 1')).rows[0].name, 'Dumbbell Curl');
      assert.equal((await db.pool.query("SELECT to_regclass('excercises') AS legacy")).rows[0].legacy, null);
    });
    const users = (await db.pool.query(`INSERT INTO users (username, password_hash)
      VALUES ('owner', 'unused'), ('friend', 'unused'), ('stranger', 'unused') RETURNING id`)).rows;
    await t.test('existing accounts are connected and pending requests are accepted on startup', async () => {
      await db.pool.query('DELETE FROM friendships WHERE user_id=$1 AND friend_id=$2', [users[0].id, users[2].id]);
      await db.pool.query("UPDATE friendships SET status='pending' WHERE user_id=$1 AND friend_id=$2", [users[0].id, users[1].id]);
      await db.init();
      await db.init();
      const friendships = (await db.pool.query('SELECT * FROM friendships')).rows;
      assert.equal(friendships.length, 3);
      assert.ok(friendships.every(f => f.status === 'accepted' && f.user_id !== f.friend_id));
    });
    const cookies = [];
    for (const user of users) {
      const token = crypto.randomBytes(24).toString('hex');
      await db.pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)', [crypto.createHash('sha256').update(token).digest('hex'), user.id, Date.now() + 60000]);
      cookies.push(`sid=${token}`);
    }
    const workoutIds = [];
    for (const user of users) {
      const { rows: [workout] } = await db.pool.query("INSERT INTO workouts (user_id,name) VALUES ($1,'Dumbbell Curl') RETURNING id", [user.id]);
      workoutIds.push(workout.id);
      await db.pool.query('INSERT INTO workout_exercises (workout_id,exercise_id,position_in_workout) VALUES ($1,1,1)', [workout.id]);
    }
    const request = async (path, { user = 0, method = 'GET', body } = {}) => {
      const response = await fetch(base + path, { method, headers: { ...(user === null ? {} : { Cookie: cookies[user] }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    };
    await t.test('requires authentication and scopes workout reads to the owner', async () => {
      for (const path of ['/api/feed', '/api/posts/me', '/api/workouts', '/api/dashboard']) assert.equal((await request(path, { user: null })).status, 401);
      assert.equal((await request('/api/posts', { user: null, method: 'POST', body: { content: 'test' } })).status, 401);
      const list = await request('/api/workouts');
      assert.equal(list.data.source, 'database');
      assert.deepEqual(list.data.workouts.map(w => w.id), [String(workoutIds[0])]);
      assert.equal((await request(`/api/workouts/${workoutIds[1]}`)).status, 404);
      assert.deepEqual((await request(`/api/workouts/${workoutIds[0]}`)).data.workout.sets, []);
    });
    await t.test('dashboard counts and latest three saved workouts are scoped to the signed-in user', async () => {
      const added = [];
      for (const name of ['Session A', 'Session B', 'Session C']) {
        const { rows: [workout] } = await db.pool.query('INSERT INTO workouts (user_id,name) VALUES ($1,$2) RETURNING id', [users[0].id, name]);
        added.push(workout.id);
      }
      const { rows: [set] } = await db.pool.query(`INSERT INTO workout_sets (workout_exercise_id,set_number,weight_kgs,reps)
        SELECT id,1,20,10 FROM workout_exercises WHERE workout_id=$1 RETURNING id`, [workoutIds[0]]);
      await db.pool.query("INSERT INTO personal_records (user_id,exercise_id,set_id,record_type,value) VALUES ($1,1,$2,'max_weight',20)", [users[0].id, set.id]);
      try {
        const dashboard = await request('/api/dashboard');
        assert.equal(dashboard.status, 200);
        assert.deepEqual(dashboard.data.summary, { saved_workouts: 4, logged_sets: 1, personal_records: 1 });
        assert.deepEqual(dashboard.data.recentWorkouts.map(w => w.id), [...added].reverse().map(String));
        assert.equal(dashboard.data.recentOrder, 'save-order');
        assert.equal(dashboard.data.recentAchievements.length, 1);
        assert.equal(dashboard.data.recentAchievements[0].exercise_name, 'Dumbbell Curl');
        assert.equal(dashboard.data.recentAchievements[0].value, 20);
        const other = (await request('/api/dashboard', { user: 1 })).data;
        assert.deepEqual(other.summary, { saved_workouts: 1, logged_sets: 0, personal_records: 0 });
        assert.deepEqual(other.recentWorkouts.map(w => w.id), [String(workoutIds[1])]);
        assert.deepEqual(other.recentAchievements, []);
      } finally {
        await db.pool.query('DELETE FROM personal_records WHERE set_id=$1', [set.id]);
        await db.pool.query('DELETE FROM workout_sets WHERE id=$1', [set.id]);
        await db.pool.query('DELETE FROM workouts WHERE id=ANY($1::integer[])', [added]);
      }
    });
    await t.test('planner saves weekly and leap-month plans, enforces ownership, and validates calendar days', async () => {
      assert.equal((await request('/api/plans', { user: null })).status, 401);
      const weekly = { name: 'My week', type: 'weekly', startDate: '2026-11-09', days: Array.from({length:7}, () => []) };
      weekly.days[0] = [String(workoutIds[0])];
      const saved = await request('/api/plans', { method: 'POST', body: weekly });
      assert.equal(saved.status, 201);
      const path = `/api/plans/${saved.data.id}`;
      const reopened = (await request(path)).data.plan;
      assert.deepEqual(reopened.days, weekly.days);
      assert.equal(reopened.startDate, weekly.startDate);
      assert.equal((await request('/api/plans')).data.plans.length, 1);
      assert.deepEqual((await request('/api/plans', { user: 1 })).data.plans, []);
      assert.equal((await request(path, { user: 1 })).status, 404);
      assert.equal((await request(path, { user: 1, method:'PUT', body: {...weekly, days: Array.from({length:7}, () => [])} })).status, 404);
      const monthly = { name:'February', type:'monthly', startDate:'2028-02-01', days:Array.from({length:29}, () => []) };
      monthly.days[28] = [String(workoutIds[0])];
      assert.equal((await request(path, { method:'PUT', body:monthly })).status, 200);
      assert.equal((await request(path)).data.plan.days.length, 29);
      for (const body of [
        {...weekly, name:' '}, {...weekly, startDate:'2026-11-10'}, {...weekly, startDate:'2026-02-30'},
        {...weekly, days:[]}, {...weekly, days:[[workoutIds[1]],...weekly.days.slice(1)]},
        {...weekly, days:[[true],...weekly.days.slice(1)]},
        {...monthly, days:monthly.days.slice(0,28)}, {...monthly, startDate:'2028-02-02'}
      ]) assert.equal((await request(path, {method:'PUT',body})).status, 400);
      assert.equal((await request(path)).data.plan.name, 'February');
      await db.pool.query('DELETE FROM workout_plans WHERE id=$1', [saved.data.id]);
    });
    let taggedPost;
    await t.test('saves tagged and untagged posts in PostgreSQL; rejects foreign tags and invalid content', async () => {
      const response = await request('/api/posts', { method: 'POST', body: { content: "Curl day <script>test</script> '; SELECT 1;", workoutId: String(workoutIds[0]) } });
      assert.equal(response.status, 201);
      taggedPost = response.data.post;
      assert.equal(taggedPost.lift.id, String(workoutIds[0]));
      const secondConnection = new Pool({ connectionString: url.toString() });
      try { assert.equal((await secondConnection.query('SELECT workout_id FROM posts WHERE id=$1', [taggedPost.id])).rows[0].workout_id, workoutIds[0]); }
      finally { await secondConnection.end(); }
      assert.equal((await request('/api/posts', { method: 'POST', body: { content: 'No tag today' } })).status, 201);
      assert.equal((await request('/api/posts', { method: 'POST', body: { content: 'foreign tag', workoutId: workoutIds[1] } })).status, 404);
      for (const body of [{ content: '   ' }, { content: 'x'.repeat(1001) }, { content: 'test', workoutId: true }, { content: 'test', workoutId: '999999999999' }]) {
        assert.equal((await request('/api/posts', { method: 'POST', body })).status, 400);
      }
      assert.equal((await db.pool.query('SELECT count(*)::integer AS n FROM posts')).rows[0].n, 2);
    });
    let friendPost;
    await t.test('all users appear in the feed; profiles still contain only own posts', async () => {
      friendPost = (await request('/api/posts', { user: 1, method: 'POST', body: { content: 'Friend workout', workoutId: workoutIds[1] } })).data.post;
      await request('/api/posts', { user: 2, method: 'POST', body: { content: 'Another user update' } });
      const feed = (await request('/api/feed')).data.posts;
      assert.equal(feed.length, 4);
      assert.ok(feed.some(p => p.id === friendPost.id));
      assert.ok(feed.some(p => p.author_id === users[2].id));
      const profile = (await request('/api/posts/me')).data.posts;
      assert.equal(profile.length, 2);
      assert.ok(profile.every(p => p.author_id === users[0].id));
      assert.equal((await request('/api/feed', { user: 2 })).data.posts.length, 4);
    });
    await t.test('likes persist, PUT is idempotent, and all friends can like posts', async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await request(`/api/posts/${friendPost.id}/like`, { method: 'PUT', body: {} });
        assert.equal(result.status, 200);
        assert.equal(result.data.post.likes, 1);
        assert.equal(result.data.post.liked, true);
      }
      assert.equal((await request('/api/feed')).data.posts.find(p => p.id === friendPost.id).liked, true);
      assert.equal((await request(`/api/posts/${friendPost.id}/like`, { user: 2, method: 'PUT', body: {} })).status, 200);
      assert.equal((await request('/api/feed')).data.posts.find(p => p.id === friendPost.id).likes, 2);
      assert.equal((await request('/api/posts/2147483647/like', { method: 'PUT', body: {} })).status, 404);
      assert.equal((await request(`/api/posts/${friendPost.id}/like`, { method: 'DELETE', body: {} })).data.post.likes, 1);
    });
    await t.test('body-part tags save for accounts with no workouts and reject unsupported tags', async () => {
      await db.pool.query('DELETE FROM workouts WHERE user_id=$1', [users[2].id]);
      assert.equal((await request('/api/workouts', { user: 2 })).data.workouts.length, 0);
      const emptyDashboard = (await request('/api/dashboard', { user: 2 })).data;
      assert.deepEqual(emptyDashboard.summary, { saved_workouts: 0, logged_sets: 0, personal_records: 0 });
      assert.deepEqual(emptyDashboard.recentWorkouts, []);
      for (const bodyPart of ['arms', 'legs', 'back', 'chest']) {
        const result = await request('/api/posts', { user: 2, method: 'POST', body: { content: `Training ${bodyPart}`, bodyPart } });
        assert.equal(result.status, 201);
        assert.equal(result.data.post.body_part, bodyPart);
        assert.equal(result.data.post.lift, null);
      }
      const saved = (await request('/api/posts/me', { user: 2 })).data.posts;
      assert.equal(saved.filter(post => post.body_part).length, 4);
      assert.equal((await request('/api/posts', { method: 'POST', body: { content: 'invalid', bodyPart: 'biceps' } })).status, 400);
      await assert.rejects(db.pool.query("INSERT INTO posts (author_id, content, body_part) VALUES ($1, 'invalid', 'unsupported')", [users[0].id]), { code: '23514' });
    });
    await t.test('simultaneous new accounts become friends with everyone and one another', async () => {
      const peers = await Promise.all(['new_one', 'new_two'].map(async (name) => {
        const client = await db.pool.connect();
        try {
          const { rows: [user] } = await client.query('INSERT INTO users (username,password_hash) VALUES ($1,$2) RETURNING id', [name, 'unused']);
          return user.id;
        } finally { client.release(); }
      }));
      const links = (await db.pool.query('SELECT * FROM friendships')).rows;
      assert.equal(links.length, 10);
      assert.ok(links.every(f => f.status === 'accepted' && f.user_id !== f.friend_id));
      assert.ok(links.some(f => [f.user_id, f.friend_id].includes(peers[0]) && [f.user_id, f.friend_id].includes(peers[1])));
    });
    await t.test('deleting a workout preserves its post and safely clears the tag', async () => {
      await db.pool.query('DELETE FROM workouts WHERE id=$1', [workoutIds[0]]);
      assert.equal((await request('/api/posts/me')).data.posts.find(p => p.id === taggedPost.id).lift, null);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
