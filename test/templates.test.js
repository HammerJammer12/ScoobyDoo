const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const databaseUrl = process.env.TEST_DATABASE_URL;
test('saved plan days can be listed, loaded and deleted as templates', { skip: !databaseUrl }, async (t) => {
  // Every run gets an isolated schema; existing application records are untouched.
  const schema = `test_templates_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const db = require('../db');
  const app = require('../server');
  await db.init();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Signs up a user and returns a fetch helper that sends their session cookie
  async function userClient(username) {
    const res = await fetch(`${base}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password123', confirmPassword: 'password123' }),
    });
    assert.equal(res.status, 201);
    const cookie = res.headers.get('set-cookie').split(';')[0];
    return async (method, path, body) => {
      const r = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
  }

  try {
    const { rows: [squat, plank] } = await db.pool.query(
      `INSERT INTO exercises (name, primary_muscle, tracking_type) VALUES
         ('Template Squat', 'quadriceps', 'weight_and_reps'), ('Template Plank', 'abdominals', 'duration')
       RETURNING id`
    );
    const alice = await userClient('alice_templates');
    const bob = await userClient('bob_templates');

    const saved = await alice('POST', '/api/recommendations/save', {
      name: 'Block',
      days: [
        { name: 'Legs', exercises: [
          { exercise_id: squat.id, sets: 5, rep_min: 3, rep_max: 6 },
          { exercise_id: plank.id, sets: 3, duration_secs: 45 },
        ] },
        { name: 'Core', exercises: [{ exercise_id: plank.id, sets: 2, duration_secs: 60 }] },
      ],
    });
    assert.equal(saved.status, 201);
    const [legsId, coreId] = saved.body.plan.templates.map((x) => x.id);

    await t.test('lists only the signed-in user\'s templates, exercises in order', async () => {
      const { status, body } = await alice('GET', '/api/templates');
      assert.equal(status, 200);
      assert.deepEqual(body.templates.map((x) => x.name), ['Block - Legs', 'Block - Core']);
      assert.deepEqual(
        body.templates[0].exercises.map(({ name, target_sets, target_reps, target_duration }) =>
          ({ name, target_sets, target_reps, target_duration })),
        [
          { name: 'Template Squat', target_sets: 5, target_reps: 6, target_duration: null },
          { name: 'Template Plank', target_sets: 3, target_reps: null, target_duration: 45 },
        ]
      );
      assert.deepEqual((await bob('GET', '/api/templates')).body.templates, []);
    });

    await t.test('loads one template, and hides other users\' templates', async () => {
      const { status, body } = await alice('GET', `/api/templates/${legsId}`);
      assert.equal(status, 200);
      assert.equal(body.template.exercises.length, 2);
      assert.equal((await bob('GET', `/api/templates/${legsId}`)).status, 404);
      assert.equal((await alice('GET', '/api/templates/abc')).status, 400);
      assert.equal((await alice('GET', '/api/templates/99999999999')).status, 400);
    });

    await t.test('deletes only the owner\'s template', async () => {
      assert.equal((await bob('DELETE', `/api/templates/${coreId}`, {})).status, 404);
      assert.equal((await alice('DELETE', `/api/templates/${coreId}`, {})).status, 200);
      assert.equal((await alice('GET', `/api/templates/${coreId}`)).status, 404);
      assert.equal((await alice('GET', '/api/templates')).body.templates.length, 1);
    });

    await t.test('requires login', async () => {
      assert.equal((await fetch(`${base}/api/templates`)).status, 401);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
