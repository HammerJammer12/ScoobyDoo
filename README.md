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

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DATABASE_SSL` | on the host | Set to `true` when the database requires SSL. Should be left unset locally |
| `PORT` | no | Server port, default 3000 |

## Project structure

```
server.js     Express authentication, sessions, and file serving
db.js         Everything sql and database
public/       Front end display logic
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/signup` | Create an account and log in |
| POST | `/api/login` | Log in |
| POST | `/api/logout` | Log out |
| GET | `/api/me` | Current user (401 if logged out) |



## Contributing

- Add API changes to the API table above
- Use parameterized queries (`$1`, `$2`) for all SQL. Never build SQL strings
  from user input.
- Schema changes go in `db.js` using `CREATE TABLE IF NOT EXISTS`
- Don't commit secrets, `.env`, or `node_modules`.
- Keep Project Structure in this doc updated, hopefully makes changes easier going forward
