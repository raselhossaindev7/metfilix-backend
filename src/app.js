import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import moviesRoutes from './routes/movies.js';
import rowsRoutes from './routes/rows.js';
import mylistRoutes from './routes/mylist.js';
import episodesRoutes from './routes/episodes.js';
import usersRoutes from './routes/users.js';
import auditRoutes, { auditMutations } from './routes/audit.js';
import { commentsRoutes, reportsRoutes, requestsRoutes } from './routes/moderation.js';
import profileRoutes from './routes/profile.js';
import progressRoutes from './routes/progress.js';
import heroRoutes from './routes/hero.js';
import metadataRoutes from './routes/metadata.js';
import { getCollection, cleanAll, ping } from './db.js';
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

// ---- CORS: hardcoded production origins + env allowlist ----
export const normalizeOrigin = (s) => s.trim().replace(/\/+$/, '');
// PERMANENT FIX: never depend on Vercel env alone (it was unset → prod blocked).
// These two frontends are always allowed, no matter what CORS_ORIGIN is set to.
export const HARDCODED_ORIGINS = [
  'https://metfilix.online',
  'https://www.metfilix.online',
  'https://metfilix-frontend.vercel.app',
];
export const allowList = [...new Set([
  ...HARDCODED_ORIGINS,
  ...(process.env.CORS_ORIGIN || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean),
])];

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
  // 4. dev/LAN convenience: Expo web and TVs on private networks (any port)
  if (
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
      normalized
    )
  ) {
    return true;
  }
  // 5. dev default: allow local frontends when no allowlist configured
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
// Explicit preflight handler — guarantees OPTIONS never hits 404 on Vercel/Render.
app.options(/.*/, cors(corsOptions));
// Ensure caches vary on Origin (correct caching with credentials + allowlist)
app.use((req, res, next) => { res.header('Vary', 'Origin'); next(); });
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
// Record successful authenticated mutations for the admin audit log.
app.use(auditMutations);

app.get('/health', (req, res) => res.json({ ok: true, service: 'metfilix-backend', time: new Date().toISOString() }));
// HTML status dashboard — open in a browser to see at a glance if the API is running
app.get('/', ah(async (req, res) => {
  const started = Date.now();
  const origins = [...allowList];
  let db = { ok: false, latencyMs: -1 };
  let counts = null;
  try {
    await ping();
    db = { ok: true, latencyMs: Date.now() - started };
    const [users, movies, mylist] = await Promise.all([
      getCollection('users'),
      getCollection('movies'),
      getCollection('my_list'),
    ]);
    const [u, m, l] = await Promise.all([
      users.countDocuments(),
      movies.countDocuments(),
      mylist.countDocuments(),
    ]);
    counts = { users: u, movies: m, mylist: l };
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
app.use('/api/hero', heroRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/rows', rowsRoutes);
app.use('/api/mylist', mylistRoutes);
app.use('/api/episodes', episodesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/progress', progressRoutes);

// stats for dashboard / analytics (one round-trip instead of many)
app.get('/api/stats', ah(async (req, res) => {
  const [users, movies, mylist, comments, requests, reports, episodes] = await Promise.all([
    getCollection('users'),
    getCollection('movies'),
    getCollection('my_list'),
    getCollection('comments'),
    getCollection('requests'),
    getCollection('reports'),
    getCollection('episodes'),
  ]);
  const [u, m, l, c, rq, rp, totals, seriesIds] = await Promise.all([
    users.countDocuments(),
    movies.countDocuments(),
    mylist.countDocuments(),
    comments.countDocuments(),
    requests.countDocuments({ status: 'pending' }),
    reports.countDocuments(),
    movies.aggregate([
      {
        $group: {
          _id: null,
          views: { $sum: { $ifNull: ['$views', 0] } },
          likes: { $sum: { $ifNull: ['$likes', 0] } },
        },
      },
    ]).toArray(),
    episodes.distinct('movie_id'),
  ]);
  const t = totals[0] || {};
  res.json({
    users: u,
    movies: m,
    mylist: l,
    views: t.views || 0,
    likes: t.likes || 0,
    series: seriesIds.filter((id) => Number.isInteger(id)).length,
    comments: c,
    requests: rq,
    reports: rp,
  });
}));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal error', detail: err.message }); });

export default app;
