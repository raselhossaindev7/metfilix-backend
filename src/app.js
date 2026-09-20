import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import moviesRoutes from './routes/movies.js';
import rowsRoutes from './routes/rows.js';
import mylistRoutes from './routes/mylist.js';
import { query } from './db.js';
import { statusPage } from './status.js';
import { ah } from './middleware/async.js';
import { readFileSync } from 'fs';

dotenv.config();

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

export const app = express();

// Render / proxies: correct client IPs + lean headers
app.set('trust proxy', 1);
app.disable('x-powered-by');
// gzip JSON (rows/posters payloads) — big win on slow networks
app.use(compression());

// ---- CORS: env allowlist, credentials-safe, no-origin friendly ----
// CORS_ORIGIN="https://app.vercel.app,https://admin.vercel.app" (comma-separated, no trailing slash)
// Supports exact origins + wildcards like "https://*.vercel.app", and auto-allows
// Vercel preview deploys (*.vercel.app) when a vercel.app origin is allowlisted.
export const normalizeOrigin = (s) => s.trim().replace(/\/+$/, '');
export const allowList = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

function wildcardToRegExp(pattern) {
  return new RegExp(
    '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$'
  );
}

export function isOriginAllowed(origin) {
  if (!origin) return true; // mobile apps, curl, server-to-server (no Origin header)
  const normalized = normalizeOrigin(origin);
  // 1. exact match
  if (allowList.includes(normalized)) return true;
  // 2. explicit wildcard entries, e.g. https://*.vercel.app
  for (const entry of allowList) {
    if (entry.includes('*') && wildcardToRegExp(entry).test(normalized)) return true;
  }
  // 3. Vercel preview convenience: if any allowlisted origin is on
  //    *.vercel.app, allow sibling preview deployments of the same project.
  //    e.g. allowlist has https://metfilix-frontend.vercel.app →
  //    allow https://metfilix-frontend-abc123.vercel.app
  try {
    const url = new URL(normalized);
    if (url.hostname.endsWith('.vercel.app')) {
      const vercelAllowed = allowList.filter((a) => {
        try { return new URL(a).hostname.endsWith('.vercel.app'); } catch { return false; }
      });
      for (const allowed of vercelAllowed) {
        try {
          const base = new URL(allowed).hostname.replace(/\.vercel\.app$/, '');
          // preview hostnames start with "<project>-" or equal the base
          if (url.hostname === base + '.vercel.app' || url.hostname.startsWith(base + '-')) return true;
        } catch { /* ignore malformed allowlist entry */ }
      }
    }
  } catch { /* ignore malformed Origin */ }
  // 4. dev default: allow local frontends when no allowlist configured
  if (allowList.length === 0 && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true;
  return false;
}

export const corsOptions = {
  origin: (origin, cb) => {
    // IMPORTANT: never pass an Error here. `cb(new Error(...))` turns a
    // blocked origin into a 500 with no CORS headers (confusing in DevTools).
    // `cb(null, false)` correctly omits ACAO so the browser blocks cleanly.
    // NEVER use a fixed string like origin: 'http://localhost:5173' — that
    // echoes one origin to every site and breaks all other frontends.
    if (isOriginAllowed(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
  optionsSuccessStatus: 204,
  maxAge: 86400, // cache preflight 24h → fewer OPTIONS round-trips
};
app.use(cors(corsOptions));
// Ensure caches vary on Origin (correct caching with credentials + allowlist)
app.use((req, res, next) => { res.header('Vary', 'Origin'); next(); });
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'metfilix-backend', time: new Date().toISOString() }));
// HTML status dashboard — open in a browser to see at a glance if the API is running
app.get('/', ah(async (req, res) => {
  const started = Date.now();
  const origins = (process.env.CORS_ORIGIN || '').split(',').map(normalizeOrigin).filter(Boolean);
  let db = { ok: false, latencyMs: -1 };
  let counts = null;
  try {
    await query('SELECT 1');
    db = { ok: true, latencyMs: Date.now() - started };
    const [u, m, l] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM movies'),
      query('SELECT COUNT(*) FROM my_list'),
    ]);
    counts = { users: Number(u.rows[0].count), movies: Number(m.rows[0].count), mylist: Number(l.rows[0].count) };
  } catch (e) {
    db = { ok: false, latencyMs: -1, error: e.message };
  }
  res.type('html').send(statusPage({
    service: 'metfilix-backend',
    version: pkg.version || '1.0.0',
    uptime: process.uptime(),
    time: new Date().toISOString(),
    db, counts, origins,
  }));
}));
app.get('/api/hero', ah(async (req, res) => {
  const q = await query('SELECT * FROM hero_slides ORDER BY position');
  res.json(q.rows);
}));
app.use('/api/auth', authRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/rows', rowsRoutes);
app.use('/api/mylist', mylistRoutes);

// stats for dashboard
app.get('/api/stats', ah(async (req, res) => {
  const users = await query('SELECT COUNT(*) FROM users');
  const movies = await query('SELECT COUNT(*) FROM movies');
  const mylist = await query('SELECT COUNT(*) FROM my_list');
  res.json({ users: Number(users.rows[0].count), movies: Number(movies.rows[0].count), mylist: Number(mylist.rows[0].count) });
}));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal error', detail: err.message }); });

export default app;
