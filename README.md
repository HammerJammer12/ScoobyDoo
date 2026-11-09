# Workout Planning Site (NAME TODO, liftlog?)

## Setup

1. Clone the repo and install dependencies:
   ```
   git clone https://github.com/HammerJammer12/ScoobyDoo.git
   cd DIRECTORY
   npm install
   ```
2. Create a local database:
   ```
   psql -U postgres -c "CREATE DATABASE liftlog;"
   ```
3. Copy `.env.example` to `.env` and set `DATABASE_URL` for your PostgreSQL instance:
   ```
   DATABASE_URL=postgres://postgres:YOURPASSWORD@localhost:5432/liftlog
   ```
   Special characters in the password (`@ # : / %`) must be URL-encoded.
   Never commit `.env`.
4. Start the server and open localhost. Tables are created automatically on startup:
   ```
   npm start
   ```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DATABASE_SSL` | on the host | Set to `true` when the database requires SSL. Should be left unset locally |
| `NODE_ENV` | on the host | Set to `production` when serving over HTTPS so session cookies require HTTPS. Leave unset for local HTTP. |
| `PORT` | no | Server port, default 3000 |

## Project structure

```
server.js     Express authentication, sessions, and file serving
db.js         Everything sql and database
public/       Front end display logic
routes/       API route modules
data/         Example lifts for the opt-in demo seed
scripts/      Development demo seeding
test/         PostgreSQL integration tests
docs/         Project plan (PLAN.md) and Excalidraw diagram
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/signup` | Create an account and log in |
| POST | `/api/login` | Log in |
| POST | `/api/logout` | Log out |
| GET | `/api/me` | Current user (401 if logged out) |
| GET | `/api/workouts` | Signed-in user's saved workouts |
| GET | `/api/workouts/:id` | Own workout with muscle metadata and recorded sets |
| GET | `/api/feed` | Latest 50 posts from self and accepted friends |
| GET | `/api/posts/me` | Latest 50 posts authored by the signed-in user |
| POST | `/api/posts` | Save `{ content, bodyPart }`; optional `workoutId` also supported |
| PUT | `/api/posts/:id/like` | Like a visible post (idempotent) |
| DELETE | `/api/posts/:id/like` | Remove own like |

All workout/post endpoints require a session. Workouts are scoped to their owner;
workout tags are checked on the server before saving. Feed queries include only
the user and accepted friends (either friendship direction). The profile query
always uses the session user, never a supplied author ID.

For now, all accounts are automatically friends. Startup accepts existing
requests and connects any missing user pairs. A PostgreSQL trigger connects each
new account to all existing accounts, including accounts created by seed scripts.
Everyone's posts therefore appear in the shared feed and can be liked; profiles
still show only the signed-in user's posts, and workout ownership checks remain.
The temporary behavior is isolated in `db.js` under `auto_friend_new_user` and
the accompanying startup backfill for later replacement with friend requests.

## PostgreSQL storage

Posts, tags, likes, users, sessions, workouts, and friendships live in PostgreSQL.
There is no in-memory fallback. Empty databases show empty states. Posts and likes
survive reloads, logout, and server restarts. Deleting a tagged workout preserves
the post and clears its tag; deleting a user cascades their records.

Startup creates missing tables and indexes and renames the legacy `excercise`
tables/columns without dropping their rows. Repeated startup is safe. Workout
summaries use the first exercise for muscle metadata; details include saved sets.
The daily lift rotates through the user's workouts by local calendar date.

The composer offers four directly clickable body-part tags: Arms (purple, 💪),
Legs (teal, 🦵), Back (amber, 🏋️), and Chest (blue, 🏋️), plus No tag.
These are available to every account, even with no saved workouts. The selected
value is stored in `posts.body_part`, with a database constraint and server-side
validation. Existing tagged demo workouts are mapped to their body-part tag on
startup. Workout recommendations keep the same color cues and their lift names.
The optional `workoutId` API field still supports linking an owned saved workout.

## Optional development demo

Create your account in the app, then run:

```sh
npm run seed:demo -- YOUR_USERNAME
```

This explicitly seeds four empty workouts, two clearly named demo friends,
accepted friendships, and demo posts into the configured database. It creates no
completed sets and is repeatable without adding duplicate examples. It refuses
to run with `NODE_ENV=production`. It is never run automatically on startup.
Real friend-request management and workout creation can plug into the existing
tables through their own feature branches.

This checkout's local preview stores PostgreSQL data under `.local/postgres` on
port 55432, with its connection in the ignored `.env`. Both are excluded from git.
If that local instance is stopped, start it with PostgreSQL's binaries on PATH:

```sh
pg_ctl -D "$PWD/.local/postgres" -l "$PWD/.local/postgres.log" -o "-h 127.0.0.1 -p 55432" start
npm start
```

For a different PostgreSQL instance, use `.env.example` and the setup steps above.

## Integration tests

```sh
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/DEVELOPMENT_DB npm test
```

The tests use a randomly named schema and remove only that schema afterward.
They cover legacy migration, persisted posts/tags, ownership checks, friend-feed
visibility, profile filtering, idempotent likes, and foreign-key deletion behavior.
They require schema-creation permission and are skipped without `TEST_DATABASE_URL`.

## Contributing

- Add API changes to the API table above
- Use parameterized queries (`$1`, `$2`) for all SQL. Never build SQL strings
  from user input.
- Schema changes go in `db.js` using `CREATE TABLE IF NOT EXISTS`
- Don't commit secrets, `.env`, or `node_modules`.
- Keep Project Structure in this doc updated, hopefully makes changes easier going forward
