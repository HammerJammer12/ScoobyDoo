# Render Hosting and Database

How the app will be hosted for a short, free deployment of less than a month. **Nothing here has been set up yet.**

Design and alternatives: [`superpowers/specs/2026-11-21-render-deploy-design.md`](superpowers/specs/2026-11-21-render-deploy-design.md).

## What it looks like

```text
Browser
   │  HTTPS
   ▼
Render free web service
Node + Express (server.js), also serves public/
   │  Render private network (Internal Database URL)
   ▼
Render free Postgres
users, sessions, workouts, plans, posts, exercises

Laptop ── External Database URL + SSL ──▶ Render Postgres
          (one-time exercise seed only)
```

Both resources live in one Render workspace and **must be in the same region**, because the Internal Database URL only works within a region.

## Web service

| Setting | Value |
| --- | --- |
| Type | Web Service |
| Plan | Free |
| Runtime | Node (`package.json` requires `>=22.13`) |
| Repository | `HammerJammer12/ScoobyDoo` |
| Branch | `main` |
| Build command | `npm ci` |
| Start command | `npm start` |

Environment variables:

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Render's **Internal** Database URL | Secret. Never commit it. |
| `DATABASE_SSL` | `false` | Traffic stays on Render's private network. |
| `NODE_ENV` | `production` | Turns on secure cookies. |

Render supplies `PORT`, so do not set it.

## Database

| Setting | Value |
| --- | --- |
| Type | Render Postgres |
| Plan | Free |
| Region | Same as the web service |
| Database name | `liftlog` |

- **Tables** are created automatically when the server starts.
- **Exercises** are not. The library stays empty until the seed below runs.
- **Backups** are out of scope. Treat all hosted data as disposable.

## Setup checklist

1. Pull the latest `main`, and check whether open PRs should be merged first.
2. On a new branch, stop tracking the old local database files and open a PR:

   ```sh
   git rm --cached app.db-wal app.db-shm
   ```

3. Create the Render Postgres database and record its creation date under [Deployment record](#deployment-record).
4. Create the web service in the same region with the settings above.
   - You have to connect GitHub to Render. The repo owner may need to approve this.
   - If that is blocked, deploy from the public Git URL. Redeploys are then manual.
5. Wait for the first deploy to finish, which also creates the tables.
6. Seed the exercises once from a laptop using the **External** Database URL:

   ```sh
   DATABASE_URL='<external database url>' DATABASE_SSL=true npm run seed:exercises
   ```

   It is safe to re-run. Do not run `seed:demo` unless the team wants demo data in production.

## Verify

- [ ] The Render URL loads over HTTPS.
- [ ] Sign up, log out, and log back in.
- [ ] Refresh the page and confirm you stay logged in.
- [ ] The exercise list is populated.
- [ ] A workout can be created and saved.
- [ ] After a manual restart, the saved workout is still there.

## Free-tier limits

Checked on 2026-11-21. Confirm against [Render's free tier docs](https://render.com/docs/free) during setup.

| Limit | Effect |
| --- | --- |
| Sleeps after 15 idle minutes | The next visit takes about a minute to load. |
| 750 free instance hours per month | Free services are suspended if the workspace runs out. |
| Database expires 30 days after creation | The app loses its data connection on that date. |
| 14-day grace period after expiry | Render then deletes the database and its data. |
| Local files are not persistent | Fine today, since all app data is in Postgres. |
| Service may restart at any time | In-memory login rate-limit counters reset. |

## Shutting down

When the project is done, delete the web service and the database in Render. Export anything worth keeping first with `pg_dump` and the External Database URL.

## Deployment record

Fill this in during setup. Do not put database URLs or passwords here.

| Item | Value |
| --- | --- |
| App URL | |
| Region | |
| Database created | |
| Database expires (created + 30 days) | |
| Database deleted by Render (expiry + 14 days) | |
