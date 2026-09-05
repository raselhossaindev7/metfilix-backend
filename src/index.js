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
import { readFileSync } from 'fs';
dotenv.config();

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

const app = express();
const PORT = process.env.PORT || 5000;

// Render / proxies: correct client IPs + lean headers
app.set('trust proxy', 1);
app.disable('x-powered-by');
// gzip JSON (rows/posters payloads) — big win on slow networks
app.use(compression());

// ---- CORS: env allowlist, credentials-safe, no-origin friendly ----
// CORS_ORIGIN="https://app.vercel.app,https://admin.vercel.app" (comma-separated, no trailing slash)
const allowList = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // mobile apps, curl, server-to-server
    if (allowList.length === 0) {
      // dev default: allow local frontends when no allowlist configured
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(new Error('CORS blocked'));
    }
    if (allowList.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // cache preflight 24h → fewer OPTIONS round-trips
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'metfilix-backend', time: new Date().toISOString() }));
// HTML status dashboard — open in a browser to see at a glance if the API is running
app.get('/', async (req, res) => {
  const started = Date.now();
  const origins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
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
});
app.get('/api/hero', async (req, res) => {
  const q = await query('SELECT * FROM hero_slides ORDER BY position');
  res.json(q.rows);
});
app.use('/api/auth', authRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/rows', rowsRoutes);
app.use('/api/mylist', mylistRoutes);

// stats for dashboard
app.get('/api/stats', async (req, res) => {
  const users = await query('SELECT COUNT(*) FROM users');
  const movies = await query('SELECT COUNT(*) FROM movies');
  const mylist = await query('SELECT COUNT(*) FROM my_list');
  res.json({ users: Number(users.rows[0].count), movies: Number(movies.rows[0].count), mylist: Number(mylist.rows[0].count) });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal error', detail: err.message }); });

app.listen(PORT, () => console.log(`Metfilix backend on http://localhost:${PORT} — pixeldrain test: ${process.env.PIXELDRAIN_TEST_VIDEO}`));
