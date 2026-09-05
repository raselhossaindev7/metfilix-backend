# Metfilix Backend — Express + Postgres

**Pixeldrain test video:** `https://pixeldrain.dev/api/file/UXZM8kk7` (env `PIXELDRAIN_TEST_VIDEO`)

## Quick start (Windows)
```bash
cd F:\2026-2030\tv\netflix_flutter\metfilix-backend
npm install
# Requires Postgres running locally or Neon/Supabase
# Create DB: createdb metflix  (or use Docker)
# Or set DATABASE_URL to neon/supabase
cp .env.example .env
# edit DATABASE_URL + JWT_SECRET
node src/migrate.js
node src/seed.js
npm run dev   # http://localhost:5000
```

**Docker Postgres (if no psql):**
```bash
docker run --name metfilix-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=metflix -p 5432:5432 -d postgres:16
# then DATABASE_URL=postgres://postgres:postgres@localhost:5432/metflix
```

## API
- `POST /api/auth/register {email,password,name}` → `{token,user}`
- `POST /api/auth/login {email,password}` → `{token,user}`  (demo: `demo@metfilix.com / demo123`, admin: `admin@metfilix.com / admin123`)
- `GET /api/auth/me` Bearer → `{user,profiles}`
- `GET /api/movies?category=&lang=&q=&page=&limit=` → `{data,total}`
- `GET /api/movies/rows/grouped?lang=` → `[{title,items}]` (home rows)
- `GET /api/movies/:id`
- `POST/PUT/DELETE /api/movies` admin Bearer
- `GET /api/hero` → hero slides
- `GET/POST /api/rows` admin
- `GET /api/mylist` Bearer, `POST /api/mylist/:movieId`, `DELETE`
- `GET /api/mylist/progress` , `POST /api/mylist/progress/:movieId {progress:0-1}`
- `GET /api/stats`, `GET /health`

## Deploy — Render free tier
1. Push this folder to GitHub (as its own repo or monorepo path).
2. Render dashboard → New → **Blueprint** → select repo (`render.yaml` is included).
   Or New → Web Service: build `npm install`, start `npm start`, health check `/health`, region **Oregon** (closest to Supabase us-west-1).
3. Set env vars: `DATABASE_URL` (Supabase pooler URL), `JWT_SECRET` (generate), `CORS_ORIGIN` (your Vercel app URL, e.g. `https://metfilix.vercel.app`).
4. No-CORS-error checklist: exact origin match (https, no trailing slash), `Authorization` + `Content-Type` are pre-approved, preflights cached 24h, mobile apps (no Origin) always allowed.
5. Staying awake on free (no more Bad Gateway): free services **sleep after ~15 min idle** (first hit takes ~30-60s). Two free layers are built in — **nothing to sign up for**:
   - In-app self-ping (`src/keepalive.js`): while awake, the server GETs its own `/health` every `KEEPALIVE_INTERVAL_MS` (default 10 min). Uses Render's auto-provided `RENDER_EXTERNAL_URL`, so zero config. Disable with `KEEPALIVE_ENABLED=false`.
   - GitHub Actions (`.github/workflows/keepalive.yml`): pings `/health` every 10 min — **this is what wakes a sleeping service**. Push a commit at least every 60 days (GitHub pauses idle schedules), or add UptimeRobot/cron-job.org as backup.
   - One always-warm service ≈ 720h/month fits in Render's free allowance. Expect ~50-150ms API times once warm.
## Tables
`users`, `profiles`, `movies` (category/lang/img/video_url/genres/rank/progress), `hero_slides`, `rows_config`, `my_list`, `watch_progress`

## Flutter wiring
Set `lib/api.dart` baseUrl to `http://10.0.2.2:5000` (emulator) or `http://localhost:5000` (web). Dashboard uses same.
