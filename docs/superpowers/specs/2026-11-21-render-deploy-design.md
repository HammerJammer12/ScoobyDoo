# Render Deployment Design

## Intent

Put the app online for free for less than a month. Slow wake-ups and a database that expires are acceptable.

## Goals

- Public HTTPS URL running the current `main`.
- Signup, login, workouts, and the exercise library work in production.
- $0 cost, with no paid plan or long-term infrastructure.

## Non-goals

- Keeping the app awake, custom domains, backups, staging, or data retention past the Render database expiry.
- Refactoring database setup into migrations.

## Approaches

1. **Render web service + Render free Postgres (chosen by Minh).** One provider and the simplest setup. The database expires 30 days after creation, which fits the timeframe.
2. Render web service + Neon free Postgres. Database does not expire, but adds a second provider that this timeframe does not need.
3. Railway. The Free plan's $1 monthly usage is tight for an app and database, and the reliable option costs $5/month.

## Design

**Render resources, created in the dashboard and in the same region:**

- Free Postgres database.
- Free Node web service from `HammerJammer12/ScoobyDoo`, branch `main`.
  - Build command: `npm ci`
  - Start command: `npm start`

A `render.yaml` is not needed for a one-time, short-lived deployment.

**Web service environment variables:**

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Render's **Internal** Database URL |
| `DATABASE_SSL` | `false` (traffic stays on Render's private network) |
| `NODE_ENV` | `production` |

Render supplies `PORT`. Tables are created on startup.

**Exercise data:** run this once from a laptop, using Render's **External** Database URL. The exercise library is empty until this runs.

```sh
DATABASE_URL='<external url>' DATABASE_SSL=true npm run seed:exercises
```

Do not run `seed:demo` against production unless the team wants demo data there.

**Repo change:** stop tracking `app.db-wal` and `app.db-shm`. They are already covered by `.gitignore`, and no code uses them.

## Known risks

- **Old local database files.** Removing them from `main` does not remove them from git history. The team decided not to rewrite history as part of this work.
- **Repo connection.** Minh has write access, not admin, so the repo owner may need to approve Render's GitHub app. Fallback: deploy from the public Git URL, which requires manual redeploys.
- **Database expiry.** The free database expires 30 days after creation, and Render deletes it after a further 14-day grace period.
- **Free-tier behavior.** The service sleeps after 15 idle minutes and takes about a minute to wake. Login rate-limit counters are in memory and reset on each sleep or restart.

## Verification

- Open the deployed URL over HTTPS.
- Sign up, log out, and log back in. Confirm the session survives a page refresh.
- Confirm the exercise list is populated and a workout can be saved.
- Trigger a restart and confirm the saved data is still there.
