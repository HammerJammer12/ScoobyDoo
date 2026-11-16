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
3. Paste the following line in a file called `.env` and fill in your Postgres password:
   ```
   DATABASE_URL=postgres://postgres:YOURPASSWORD@localhost:5432/liftlog
   ```
   Special characters in the password (`@ # : / %`) must be URL-encoded.
   Never commit `.env`.
4. Start the server and open localhost. Takes are created automatically on startup:
   ```
   npm start
   ```
5. Load the exercise library (about 870 exercises, safe to re-run):
   ```
   npm run seed:exercises
   ```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DATABASE_SSL` | on the host | Set to `true` when the database requires SSL. Should be left unset locally |
| `PORT` | no | Server port, default 3000 |
| `EXERCISE_DATASET_URL` | no | Override the dataset used by `npm run seed:exercises` |

## Project structure

```
server.js     Express authentication, sessions, and file serving
db.js         Everything sql and database
routes/       Express routers mounted from server.js
scripts/      One-off scripts (exercise seeding)
lib/          Logic with no database access (plan recommendations)
test/         Tests, run with npm test
public/       Front end display logic
docs/         Project plan (PLAN.md) and Excalidraw diagrams
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/signup` | Create an account and log in |
| POST | `/api/login` | Log in |
| POST | `/api/logout` | Log out |
| GET | `/api/me` | Current user (401 if logged out) |
| GET | `/api/settings` | Username, privacy setting and join date for the settings page |
| PATCH | `/api/settings/username` | Change username (`{ username }`, 409 if taken) |
| PATCH | `/api/settings/password` | Change password (`{ currentPassword, newPassword, confirmPassword }`), logs out other sessions |
| PATCH | `/api/settings/privacy` | Set profile visibility (`{ isPrivate }`, friends-only by default) |
| POST | `/api/settings/logout-others` | End every session except the current one |
| DELETE | `/api/settings/account` | Delete the account (`{ password }`) and everything that belongs to it |
| GET | `/api/exercises?q=&muscle=&equipment=&limit=&offset=` | Search the exercise library (limit default 25, max 100) |
| GET | `/api/exercises/:id/alternatives?level=&equipment=&exclude=&limit=` | Exercises to swap in for this one (same muscle) |
| POST | `/api/recommendations/plan` | Preview a weekly plan (login required, nothing saved) |
| POST | `/api/plans` | Save a plan as one workout template per day (login required) |

Exercise data comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain).

### Recommendations

The plan page at `/plan/` uses these endpoints: generate a preview, swap or remove exercises, then save.

`POST /api/recommendations/plan` takes optional preferences:

```json
{ "goal": "hypertrophy", "daysPerWeek": 4, "minutesPerSession": 60, "level": "beginner", "equipment": ["dumbbell"] }
```

- `goal`: `strength`, `hypertrophy` (default) or `endurance`
- `daysPerWeek`: 1–6 (default 3); `minutesPerSession`: 20–180 (default 60)
- `level`: `beginner` (default), `intermediate` or `expert`
- `equipment`: leave out for a full gym; bodyweight is always allowed

It returns `{ plan: { ...preferences, split, days: [{ day, name, focus, exercises: [...] }] } }`. Each exercise has
`exercise_id`, `name`, `primary_muscle`, `equipment`, `mechanic`, `tracking_type`, `sets`, `rep_min`, `rep_max`
and `duration_secs` (timed exercises have no reps). Exercises from the user's last 5 workouts are avoided when possible.

To swap one, call `/api/exercises/:id/alternatives` with the same `level` and `equipment` (comma-separated), and
`exclude` set to the ids already in that day.

To save, `POST /api/plans` with `{ name, days }`, where `days` is the (edited) `plan.days`. Only `name`,
`exercises[].exercise_id`, `sets`, `rep_min`, `rep_max` and `duration_secs` are read, so other fields can be
dropped to stay under the 10 KB request limit. Each day becomes a workout template named `<plan name> - <day name>`,
with the top of the rep range as its target reps.



## Contributing

- Add API changes to the API table above
- Use parameterized queries (`$1`, `$2`) for all SQL. Never build SQL strings
  from user input.
- Schema changes go in `db.js` using `CREATE TABLE IF NOT EXISTS`
- Don't commit secrets, `.env`, or `node_modules`.
- Keep Project Structure in this doc updated, hopefully makes changes easier going forward
