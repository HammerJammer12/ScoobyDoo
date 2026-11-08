# Exercise API research: API Ninjas vs MuscleWiki

Researched on 2026-10-31. Primary sources only (vendor docs, pricing, terms, OpenAPI spec). Anything not confirmed there is marked **unverified**.

## TL;DR

- **Neither free tier supports our plan** (cache in Postgres, serve on a public site). API Ninjas Free forbids caching, commercial use and sharing output with third parties, returns 5 results per call, and has no `offset`, images or videos. MuscleWiki's free BASIC plan only works in their web Playground. It has no API key access.
- **MuscleWiki is the better fit.** It has videos (male/female, front/side), step-by-step instructions, about 1,900 exercises, proper `limit`/`offset` paging, and terms that allow caching metadata for up to 30 days. Cheapest API plan: **TESTING, $10/month, 1,000 calls/month**. Secondary muscles are `null` below PROFESSIONAL ($99.99/month).
- **Recommendation:** MuscleWiki TESTING (about $2 per student per month). Cache text metadata in Postgres with a monthly refresh. Never store videos; stream them with server-minted media tokens. Keep our own primary-to-secondary muscle mapping for stats. If the budget must be $0, neither API works without breaking its terms (see [Open questions](#open-questions)).

---

## 1. API Ninjas Exercises

Sources: [docs](https://api-ninjas.com/api/exercises), [pricing](https://api-ninjas.com/pricing), [terms](https://api-ninjas.com/tos) (ToS "Last Updated: September 13, 2026").

### Basics

| Item | Value |
|---|---|
| Base URL | `https://api.api-ninjas.com/v1` |
| Auth | Header `X-Api-Key: <key>`. Get the key from an api-ninjas.com account. Calling without a key returns `400 {"error": "Missing API Key."}` (tested with curl). |
| Dataset | "over 3000 exercises" ([docs FAQ](https://api-ninjas.com/api/exercises)) |
| Rate limit | Free plan: 100 calls/hour, 3,000 calls/month ([pricing](https://api-ninjas.com/pricing)) |

### Endpoints

| Endpoint | Params | Notes |
|---|---|---|
| `GET /v1/exercises` | `name` (partial match), `type`, `muscle`, `difficulty`, `equipments` (comma-separated, partial match), `offset` (**premium only**, default 0) | Returns **up to 5** exercises per call. All params optional. |
| `GET /v1/allexercises` | `muscle` (**required**), `limit` (default 10, max 100), `offset` (default 0) | **Business, Professional or any annual plan only.** Returns **names only** (array of strings). |

### Response (`/v1/exercises?muscle=biceps`, from docs, first item)

```json
[{
  "name": "Incline Hammer Curls",
  "type": "strength",
  "muscle": "biceps",
  "difficulty": "beginner",
  "instructions": "Seat yourself on an incline bench with a dumbbell in each hand. ...",
  "equipments": ["dumbbells", "incline bench", "..."],
  "safety_info": "Keep your back firmly against the incline bench ...",
  "images": ["https://media.api-ninjas.com/exercise_images/incline-hammer-curls-01.png",
             "https://media.api-ninjas.com/exercise_images/incline-hammer-curls-02.png"]
}]
```

Fields: `name`, `type`, `muscle` (one string), `difficulty`, `instructions` (one string), `equipments` (array), `safety_info`, `images` (array, **premium only**, "in movement order (usually the start and finish positions)"). There is **no `id` field** and **no secondary muscles field**.

### Filter values (exact, from docs)

| Filter | Values |
|---|---|
| `type` | `cardio`, `olympic_weightlifting`, `plyometrics`, `powerlifting`, `strength`, `stretching`, `strongman` |
| `muscle` | `abdominals`, `abductors`, `adductors`, `biceps`, `calves`, `chest`, `forearms`, `glutes`, `hamstrings`, `lats`, `lower_back`, `middle_back`, `neck`, `quadriceps`, `traps`, `triceps` |
| `difficulty` | `beginner`, `intermediate`, `expert` |
| `equipments` | About 120 values in groups (machines, benches, bars, free weights, racks, cable attachments, bands, boxes, mats, strongman, cardio, etc.), e.g. `barbell`, `dumbbell`, `kettlebell`, `cable machine`, `pull-up bar`, `resistance band`. Full list on the [docs page](https://api-ninjas.com/api/exercises). |

### Media

- Images only: PNG, `media.api-ninjas.com/exercise_images/<slug>-01.png`, usually start and finish positions. **Premium plans only.**
- **No videos.** The docs never mention them.
- The ToS has no clause on hotlinking images. **Unverified.**

### Pricing tiers ([pricing](https://api-ninjas.com/pricing))

| Plan | Price (monthly / annual per month) | Calls/month | Rate limit | Commercial | Attribution | **Caching/storing** |
|---|---|---|---|---|---|---|
| Free | $0 | 3,000 | 100/hour | No | **Required** | **No** |
| Developer | $59 / $39 | 100,000 | none | Yes | No | **No** |
| Business | $149 / $99 | 1,000,000 | none | Yes | No | Yes |
| Professional | $299 / $199 | 10,000,000 | none | Yes | No | Yes |
| Enterprise | Custom | Custom | none | Yes | No | Yes |

The pricing page does not label which price is monthly and which is annual. It has a Monthly/Yearly toggle with "Save 34%", so the lower number is assumed to be annual.

### Terms ([ToS](https://api-ninjas.com/tos))

- §3.1 Free plan: "solely for personal, non-commercial purposes and for development, testing, or evaluation". It may NOT "Share, distribute, or make available any Output or content from the Services to any third party in any form". **A publicly deployed site showing exercise data to other users likely breaks this clause.**
- §3.2: commercial use is allowed only while a paid plan is active.
- §3.3 (all plans): no repackaging, redistributing, or building a database or service "that competes with or substitutes for" API Ninjas.
- The ToS has no caching clause. The pricing table is the only source for caching rules: storing is allowed on Business and above only.
- The pricing page says attribution is required on Free, but the ToS gives no wording or format for it. **Unverified.**

### Gotchas

- 5 results per call and no `offset` on Free, so bulk caching on Free is not practical (and not allowed).
- `/allexercises` returns names only and needs Business or an annual plan. A full sync would cost 1 call per name page plus 1 per detail lookup.
- No shoulders or delts value in `muscle`. Shoulder exercises can't be filtered by muscle, which breaks our muscle-group stats.
- One `muscle` per exercise and no secondary muscles.
- No stable `id`. We would have to use `name` as `api_id`.
- CORS behaviour is undocumented (**unverified**). Calls must stay server-side anyway because of the key.

---

## 2. MuscleWiki API

Sources: [documentation](https://api.musclewiki.com/documentation), [OpenAPI spec](https://api.musclewiki.com/openapi.json) (v2.0.0), [pricing (landing page)](https://api.musclewiki.com/), [FAQ](https://api.musclewiki.com/faq), [API terms](https://api.musclewiki.com/api-terms).

### Basics

| Item | Value |
|---|---|
| Base URL | `https://api.musclewiki.com` |
| Auth | Header `X-API-Key: mw_...`. Register at [/register](https://api.musclewiki.com/register), then create a key at [/dashboard/api-keys](https://api.musclewiki.com/dashboard/api-keys). The key is shown once. Without a key, data endpoints return `401 {"detail":"Authentication required","message":"Missing X-API-Key header"}` (tested with curl). `/health` is open. |
| Dataset | "1,900+ exercises" (the `/health` example shows 1,832), "7,700+" videos, 14 languages ([docs](https://api.musclewiki.com/documentation)) |
| Rate limit | Monthly quota only. No per-second, per-minute or per-day limit, except `POST /media/token` at 10 per key per minute. Over quota returns `429`, with no automatic overage billing ([FAQ](https://api.musclewiki.com/faq)). |

### Endpoints (from the [OpenAPI spec](https://api.musclewiki.com/openapi.json))

| Endpoint | Params | Returns |
|---|---|---|
| `GET /exercises` | `limit` (1–100, default 20), `offset`, `search` (2–200 chars, matches names and steps), `gender`, `category`, `muscles` (array), `difficulty`, `force`, `mechanic`, `grips` (array), `secondary_muscles`\*, `tertiary_muscles`\*, `lang` | `{total, limit, offset, count, results:[{id, name}]}`, **minimal fields only** |
| `GET /exercises/{id}` | `detail` (bool), `gender`, `lang` | Standard or detailed exercise |
| `GET /exercises/{id}/videos` | `gender`, `lang` | `Video[]` |
| `GET /search` | `q` (2–200 chars, required), `limit` (1–**50**, default 10), `gender`, `category`, `muscles`, `difficulty`, `force`, `mechanic`, `secondary_muscles`\*, `tertiary_muscles`\*, `lang` | Standard exercise array. **No `offset`.** |
| `GET /random` | `category`, `gender`, `lang` | One standard exercise |
| `GET /filters` | `lang` | `{muscles, difficulties, forces, mechanics, grips, categories, secondary_muscles*, tertiary_muscles*}` |
| `GET /muscles`, `/categories`, `/statistics`, `/languages` | none | Counts and lookup lists |
| `POST /media/token` | none (needs key) | `{token, expires_in}` (900 s by default). TESTING plan or above. |
| `GET /stream/videos/branded/{filename}` | `?token=` or key header | MP4, supports byte ranges |
| `GET /stream/images/og_images/{filename}` | `?token=` or key header | Thumbnail image |
| `GET /stream/images/bodymaps/{id}` | `gender`, `theme` (light/dark), `view` (front/back) | Bodymap image (PROFESSIONAL+) |
| `/routines…`, `/workouts…` | `limit`, `offset`, `difficulty`, `goal`, `equipment`, `muscles` | PROFESSIONAL and ENTERPRISE only |

\* `secondary_muscles` and `tertiary_muscles` filters need PROFESSIONAL or above. Lower plans get `403`, and those fields come back as `null`.

### Response (standard exercise, schema `ExerciseStandard`)

```json
{
  "id": 1,
  "name": "Barbell Curl",
  "primary_muscles": ["Biceps"],
  "secondary_muscles": ["Forearms"],
  "tertiary_muscles": ["Front Shoulders"],
  "category": "...", "force": "...", "grips": ["..."], "mechanic": "...", "difficulty": "...",
  "steps": ["..."],
  "videos": [{
    "url": "https://api.musclewiki.com/stream/videos/branded/male-Barbell-barbell-curl-front.mp4",
    "angle": "front", "gender": "male",
    "og_image": "https://api.musclewiki.com/stream/images/og_images/og-male-Barbell-barbell-curl-front.jpg"
  }],
  "bodymap_male": "...", "bodymap_female": "..."
}
```

`id`, `name`, `primary_muscles` and `secondary_muscles`/`tertiary_muscles` come from the docs example. The `videos` item is the spec's `Video` example. The `"..."` values are not filled in by the docs. `?detail=true` adds `video_count`, `image_count` and `step_count`. Required fields: `id`, `name`, `primary_muscles`, `category`, `grips`, `steps`, `videos`. `force`, `mechanic`, `difficulty` and `video.url` can be `null`. On TESTING and GROWTH, `secondary_muscles`, `tertiary_muscles` and the bodymaps are `null`. `[]` means the plan includes the field but the exercise has no data.

### Filter values

The docs and spec give **examples only**. The full lists come from `GET /filters`, which needs a key (**unverified**: not fetched).

| Filter | Values |
|---|---|
| `difficulty` | `Novice`, `Beginner`, `Intermediate`, `Advanced` (spec regex, case-insensitive). The docs say exercises use Novice/Intermediate/Advanced and routines use Beginner. |
| `force` | `Push`, `Pull`, `Hold` (spec). The docs page says "push, pull, static", which **conflicts with the spec**. |
| `mechanic` | `Isolation`, `Compound` |
| `category` (equipment) | Examples: `barbell`, `dumbbell`, `bodyweight` |
| `muscles` | Examples: `Biceps`, `Chest`, `Triceps`, `Front Shoulders`, `Forearms` |
| `grips` | Examples: `Overhand`, `Underhand`, `Neutral` |
| `gender` | `male`, `female` |

### Media

- Videos are MP4. Each exercise has variants by `gender` (male/female) and `angle` (front/side). Thumbnails come from `og_image`. Bodymaps (PROFESSIONAL+) use red for primary, orange for secondary and yellow for tertiary muscles.
- **Media URLs are never public.** Every `/stream/` request needs the key header or `?token=` (a video URL without auth returned `401` in our curl test). Tokens come from `POST /media/token`, which the spec says to call "from your **server**, never from the device". The token is a credential: "do not embed it in a shareable link".
- **Every `/stream/` request costs one API call, range requests included.** One video playback can cost several calls.
- Terms ([api-terms](https://api.musclewiki.com/api-terms) §2–3): no downloading, storing or re-hosting videos or images on our own servers or CDN. No embedding on external platforms. "All video playback must occur directly within your own application using the API-streamed URLs." Videos may only be cached transiently. MuscleWiki branding in the videos must stay intact.

### Pricing tiers ([landing page pricing](https://api.musclewiki.com/), [FAQ](https://api.musclewiki.com/faq))

| Plan | Price/month | Calls/month | API key | Videos | Secondary/tertiary muscles | Languages |
|---|---|---|---|---|---|---|
| BASIC | Free | 500 | **No (Playground only)** | Playground | Playground | 14 |
| TESTING | $10 | 1,000 | Yes | Yes | **No (null)** | English |
| GROWTH | $39.99 | 30,000 | Yes | Yes | No | 14 |
| PROFESSIONAL | $99.99 | 100,000 | Yes | Yes | Yes (+ bodymaps, routines) | 14 |
| ENTERPRISE | $199.99 | 300,000 | Yes | Yes | Yes | 14 |

Annual billing gets 25% off. Top-ups ($10 for 5,000 calls) are available on GROWTH and above only. "All paid plans include full commercial use rights."

### Terms ([api-terms](https://api.musclewiki.com/api-terms), [FAQ](https://api.musclewiki.com/faq))

- Caching (§3): text and metadata **up to 30 days**. Thumbnails and bodymaps up to 24 hours (the FAQ says only in the end user's own client, not a shared cache). Videos transient only.
- Use (§1.2): the license covers "fitness, health, and workout-related applications". There is no commercial/non-commercial split, and students or education are not mentioned.
- Prohibited (§4): "Resell, redistribute, sublicense, or expose API data to third parties". Also no building "an API or dataset that mimics or competes with MuscleWiki", and no ML training.
- **Attribution (§8):** our ToS or privacy page must include, word for word, "Exercise data and videos provided by MuscleWiki.com". An in-app credit is encouraged but optional.

### Gotchas

- There is no free API access. BASIC only works in their Playground.
- `/exercises` lists return only `id` and `name`, so full records need `/exercises/{id}` (1 call each) or `/search` (max 50, no offset, needs `q`). Seeding all of about 1,832 exercises would exceed TESTING's 1,000 calls/month.
- Secondary muscles are `null` below PROFESSIONAL, so our heat map and neglected-muscle stats get primary muscles only.
- Video playback uses up the same quota as data calls.
- The docs page lists the error for an invalid key as both `401` and `403`.
- CORS: no `Access-Control-*` headers on an unauthenticated request with an `Origin` header (curl test); not documented (**unverified**). Calls stay server-side anyway.

---

## 3. Side-by-side

| | API Ninjas | MuscleWiki |
|---|---|---|
| Auth | `X-Api-Key` header | `X-API-Key` header (`mw_…`) |
| Free tier | 3,000/month, 100/hour, non-commercial, attribution, no sharing to third parties | 500/month **Playground only**, no API key |
| Cheapest usable paid | Developer $39–59/month (still no caching) | TESTING $10/month, 1,000 calls |
| Dataset | 3,000+ | 1,900+ |
| Muscle taxonomy | 16 fixed values, **no shoulders** | Named groups (e.g. "Front Shoulders"). Full list via `/filters`. |
| Secondary muscles | None | Yes, but PROFESSIONAL+ only ($99.99) |
| Videos | None | MP4, male/female × front/side, authenticated streaming |
| Images | Start/finish PNGs (premium) | Thumbnails, bodymaps (PROFESSIONAL+) |
| Instructions | One `instructions` string + `safety_info` | `steps[]` array |
| Stable ID | No (name only) | Integer `id` |
| Bulk fetch for caching | Free: 5 per query, no offset. `/allexercises` (names) on Business or annual. | `limit` up to 100 with `offset` (ids and names). Details 1 call each or `/search` up to 50. |
| Storage terms | Caching/storing only on Business+ | Metadata ≤30 days. Never store media. |
| Video hotlink/embed | n/a | Only via API stream URLs with key or token. No re-hosting. |

## 4. Field mapping to `exercises`

| Our column | API Ninjas | MuscleWiki |
|---|---|---|
| `id` | our serial | our serial |
| `api_id` | `name` (no id exists) | `id` |
| `name` | `name` | `name` |
| `muscle_group` | `muscle` | `primary_muscles[0]` (an array, so keep all of them if more than one) |
| `secondary_muscles` | none, use our own mapping | `secondary_muscles` (PROFESSIONAL+) or our own mapping |
| `equipment` | `equipments` (array) | `category` |
| `video_url` | none | `videos[].url`, a stream path. Store the **path or filename only** and add a token at request time. |
| `description` | `instructions` (+ `safety_info`) | `steps.join('\n')` |

For MuscleWiki, add `fetched_at timestamptz` (refresh/purge before 30 days) and a `UNIQUE (api_id)` constraint (needed by the upsert below).

## 5. Recommendation

**Use MuscleWiki on the TESTING plan ($10/month)**, provided the team agrees to pay it. Reasons:

1. It is the only one of the two with videos, and videos are an explicit requirement.
2. Its terms allow the cache-in-Postgres plan, with a ≤30-day refresh. API Ninjas allows storage only on Business ($99+/month).
3. It has a stable integer `id`, structured `steps`, and a muscle taxonomy that includes shoulders.

Trade-offs to accept:
- Secondary muscles are `null` on TESTING. Keep a small hand-made table that maps each primary muscle to its usual secondary muscles for the stats. Real per-exercise secondary data costs $99.99/month.
- 1,000 calls/month covers the seed, refreshes and video plays together. Seed a **curated subset** (for example 200–300 common lifts across all muscles), not the full catalogue. Videos load only when the user clicks play.
- Put the required attribution line on our site's terms or about page.

### Integration sketch

`.env` (never commit): `MUSCLEWIKI_API_KEY=mw_...`

Seed or refresh script (`scripts/seed-exercises.js`, run monthly with `node --env-file=.env scripts/seed-exercises.js`):

```js
const { pool } = require('../db');
const BASE = 'https://api.musclewiki.com';
const headers = { 'X-API-Key': process.env.MUSCLEWIKI_API_KEY };

async function get(path) {
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function seed(ids) {                       // curated list of MuscleWiki ids
  for (const id of ids) {
    const e = await get(`/exercises/${id}`);
    const v = e.videos.find(x => x.url) ?? null;
    await pool.query(
      `INSERT INTO exercises (api_id, name, muscle_group, secondary_muscles, equipment, video_url, description, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (api_id) DO UPDATE SET name=$2, muscle_group=$3, secondary_muscles=$4,
         equipment=$5, video_url=$6, description=$7, fetched_at=now()`,
      [e.id, e.name, e.primary_muscles[0], e.secondary_muscles ?? [], e.category,
       v && new URL(v.url).pathname, e.steps.join('\n')]);
  }
  await pool.query(`DELETE FROM exercises WHERE fetched_at < now() - interval '30 days'`);
}
```

Our endpoints (in `server.js`) serve from Postgres only. The browser never sees the key:

```js
app.get('/api/exercises', async (req, res) => {
  const { q = '', muscle } = req.query;
  const { rows } = await pool.query(
    `SELECT id, name, muscle_group, secondary_muscles, equipment, description
       FROM exercises
      WHERE name ILIKE '%' || $1 || '%' AND ($2::text IS NULL OR muscle_group = $2)
      ORDER BY name LIMIT 50`, [q, muscle ?? null]);
  res.json(rows);
});

// Video: mint a short-lived media token server-side (requires login; costs quota per play)
app.get('/api/exercises/:id/video', async (req, res) => {
  const { rows: [ex] } = await pool.query('SELECT video_url FROM exercises WHERE id=$1', [req.params.id]);
  if (!ex?.video_url) return res.sendStatus(404);
  const r = await fetch('https://api.musclewiki.com/media/token', { method: 'POST', headers });
  const { token } = await r.json();
  res.json({ src: `https://api.musclewiki.com${ex.video_url}?token=${token}` });
});
```

Cache one token in memory and reuse it until it is close to the 900-second expiry, so we stay under the 10 per minute limit on `/media/token`. The frontend sets `<video src>` from `/api/exercises/:id/video` when the user clicks play.

## Open questions

- **$0 option:** neither API allows a free, cached, public deployment. API Ninjas Free bans storage and sharing with third parties. MuscleWiki has no free API access. If paying is impossible, look at an openly licensed exercise dataset instead (not researched here).
- **MuscleWiki full filter lists** (`muscles`, `categories`, `grips`, secondary values): only available from `GET /filters` with a key. **Unverified.**
- **MuscleWiki `force` values:** the docs page says push/pull/static and the spec says Push/Pull/Hold.
- **Token in `<video src>`:** the docs say not to put tokens in shareable links. Whether a short-lived token in a page shown to a logged-in user is acceptable needs confirming with api-support@musclewiki.com. The alternative is proxying the stream through our server without storing it. That is not explicitly allowed or forbidden, so it is also **unverified**.
- **MuscleWiki `/exercises/{id}` response with `"..."` fields:** the docs don't show example values for `category`, `force`, `grips`, `mechanic` or `difficulty`. **Unverified** until we call it with a key.
- **API Ninjas attribution format** and whether images may be hotlinked: neither the ToS nor the docs say. **Unverified.**
- **API Ninjas monthly vs annual price labels:** inferred from the "Save 34%" toggle, not stated.
- **CORS** on both APIs: undocumented. It doesn't matter, because all calls go through our server.
- **Student or education discounts:** not mentioned by either vendor. Worth asking MuscleWiki through [contact](https://api.musclewiki.com/contact).
