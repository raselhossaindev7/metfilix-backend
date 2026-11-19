# Metfilix Backend — Express + MongoDB

**Pixeldrain test video:** `https://pixeldrain.dev/api/file/UXZM8kk7` (env `PIXELDRAIN_TEST_VIDEO`)

## Quick start (Windows)
```bash
cd F:\2026-2030\tv\metfilix\metfilix-backend
npm install
# MongoDB must be running (local service on 127.0.0.1:27017, or MongoDB Atlas)
cp .env.example .env
# edit MONGODB_URI + JWT_SECRET
npm run migrate
npm run seed
npm run dev   # http://localhost:5000
```

**Local MongoDB (already installed as a Windows service):**
```
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=metfilix
```
Or via Docker:
```bash
docker run --name metfilix-mongo -p 27017:27017 -d mongo:7
```

**MongoDB Atlas (for Render/Vercel):**
```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=metfilix
```

## API
- `POST /api/auth/register {email,password,name}` → `{token,user}`
- `POST /api/auth/login {email,password}` → `{token,user}`  (demo: `demo@metfilix.com / demo123`, admin: `admin@metfilix.com / admin123`)
- `GET /api/auth/me` Bearer → `{user,profiles}`
- `GET /api/movies?category=&lang=&genre=&year=&q=&sort=&page=&limit=` → `{data,total}`
- `GET /api/movies/rows/grouped?lang=` → `[{title,items}]` (home rows)
- `GET /api/movies/:id`
- `POST/PUT/DELETE /api/movies` admin Bearer
- `GET /api/hero` → hero slides
- `GET/POST /api/rows` admin
- `GET /api/mylist` Bearer, `POST /api/mylist/:movieId`, `DELETE`
- `GET /api/mylist/progress` , `POST /api/mylist/progress/:movieId {progress:0-1}`
- `GET /api/stats`, `GET /health`

## Deploy — Vercel (serverless)
1. Push this repo to GitHub, then Vercel → New Project → import it.
   `vercel.json` rewrites every path to `api/index.js`, which serves the
   same Express app (`src/app.js`) serverlessly. `src/index.js` (with
   `app.listen`) is only for local/Render — never imported on Vercel.
2. Set env vars in Vercel → Project → Settings → Environment Variables
   (all environments): `MONGODB_URI` (Atlas URI), `MONGODB_DB`, `JWT_SECRET`, and:
   `CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:5174,https://metfilix-frontend.vercel.app`
   Exact origins, comma-separated, **no trailing slash**. Vercel preview
   deploys (`https://<project>-*.vercel.app`) are auto-allowed.
3. Redeploy. Verify: `curl -s -o /dev/null -w "%{http_code}" https://<backend>.vercel.app/api/hero` → `200`.
4. ⚠️ Never configure CORS as a fixed string — that echoes one origin to every site and blocks the rest.

## Deploy — Render free tier
1. Push this folder to GitHub (as its own repo or monorepo path).
2. Render dashboard → New → **Blueprint** → select repo (`render.yaml` is included).
   Or New → Web Service: build `npm install`, start `npm start`, health check `/health`.
3. Set env vars: `MONGODB_URI` (MongoDB Atlas URI — Render cannot reach localhost),
   `MONGODB_DB`, `JWT_SECRET` (generate), `CORS_ORIGIN` (your app URL).
4. Free services **sleep after ~15 min idle** (first hit takes ~30-60s).
   - In-app self-ping (`src/keepalive.js`): while awake, GETs its own `/health`
     every `KEEPALIVE_INTERVAL_MS` (default 10 min). Disable with `KEEPALIVE_ENABLED=false`.
   - GitHub Actions (`.github/workflows/keepalive.yml`): pings `/health` every 10 min.

## Collections
`users`, `profiles`, `movies`, `rows_config`, `hero_slides`, `my_list`,
`watch_progress`, `episodes`, `comments`, `movie_requests`, `reports`,
`ad_settings`, `audit_logs`, `login_history`, `counters` (numeric `id` sequence).

Documents expose a numeric `id` (not `_id`) so existing URLs like
`/api/movies/123` keep working.

## Flutter / TV wiring
Set the app's backend base URL to `http://<PC-LAN-IP>:5000` (local) or the
deployed URL. The Expo TV app is configured in `src/lib/api.ts`.
