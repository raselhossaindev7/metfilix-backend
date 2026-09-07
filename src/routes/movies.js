import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const r = Router();

// public: list with filters ?category=&lang=&q=&page=&limit=
r.get('/', ah(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { category, lang, q } = req.query;
  const offset = (page - 1) * limit;
  const conds = [];
  const vals = [];
  let idx = 1;
  if (category) { conds.push(`category = $${idx++}`); vals.push(category); }
  if (lang && lang !== 'All') { conds.push(`lang = $${idx++} OR lang='All'`); vals.push(lang); }
  if (q) { conds.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`); vals.push(`%${q}%`); idx++; }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const countQ = await query(`SELECT COUNT(*) FROM movies ${where}`, vals);
  const total = Number(countQ.rows[0].count);
  const dataQ = await query(`SELECT * FROM movies ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...vals, limit, offset]);
  res.json({ data: dataQ.rows, total, page, limit });
}));

// rows for home: grouped by category — MUST stay above /:id.
// Express matches top-down; if /:id is first, /rows/grouped lands in /:id
// with id="rows" → Postgres integer cast error → process crash → 502.
async function groupedRows(req, res) {
  // Order rows by rows_config.position (admin-curated), not alphabetically.
  // Falls back to DISTINCT category scan when rows_config is empty.
  let titles = [];
  try {
    const cfg = await query('SELECT title, category FROM rows_config ORDER BY position');
    titles = cfg.rows.map(r => ({ title: r.title, category: r.category || r.title }));
  } catch (_) {}
  if (!titles.length) {
    const cats = await query('SELECT DISTINCT category FROM movies ORDER BY category');
    titles = cats.rows.map(c => ({ title: c.category, category: c.category }));
  }
  const rows = [];
  for (const c of titles) {
    const lang = req.query.lang && req.query.lang !== 'All' ? req.query.lang : null;
    const list = lang
      ? await query('SELECT * FROM movies WHERE category=$1 AND (lang=$2 OR lang=\'All\') ORDER BY rank NULLS LAST, id DESC LIMIT 12', [c.category, lang])
      : await query('SELECT * FROM movies WHERE category=$1 ORDER BY rank NULLS LAST, id DESC LIMIT 12', [c.category]);
    if (list.rows.length) rows.push({ title: c.title, items: list.rows });
  }
  // ensure at least fallback if empty
  if (!rows.length) {
    const all = await query('SELECT * FROM movies ORDER BY id DESC LIMIT 20');
    rows.push({ title: 'Trending Now', items: all.rows });
  }
  res.json(rows);
}
r.get('/rows/grouped', ah(groupedRows));
// alias: Flutter (lib/api.dart) + Next (dashboard-store) call /api/movies/rows?lang=
r.get('/rows', ah(groupedRows));

r.get('/:id', ah(async (req, res) => {
  // non-numeric id (e.g. /rows) → DB cast error without this guard.
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const q = await query('SELECT * FROM movies WHERE id=$1', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(q.rows[0]);
}));

// admin
r.post('/', authRequired, adminOnly, ah(async (req, res) => {
  const { title, description, year, match, rating, duration, category, lang, img, video_url, genres, rank, progress, video_sources, codec, is_hls } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const ins = await query(
    `INSERT INTO movies(title,description,year,match,rating,duration,category,lang,img,video_url,genres,rank,progress,video_sources,codec,is_hls)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [title, description || '', year || '2024', match || '95% Match', rating || 'TV-MA', duration || '2h 14m', category || 'Trending Now', lang || 'All', img || '', video_url || process.env.PIXELDRAIN_TEST_VIDEO, JSON.stringify(genres || ['Drama']), rank || null, progress || null, JSON.stringify(video_sources || []), codec || 'h264', is_hls ?? (typeof video_url === 'string' && video_url.includes('.m3u8'))]
  );
  res.status(201).json(ins.rows[0]);
}));

r.put('/:id', authRequired, adminOnly, ah(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const fields = ['title','description','year','match','rating','duration','category','lang','img','video_url','genres','rank','progress','video_sources','codec','is_hls'];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const f of fields) if (req.body[f] !== undefined) { sets.push(`${f}=$${idx++}`); vals.push((f === 'genres' || f === 'video_sources') ? JSON.stringify(req.body[f]) : req.body[f]); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(req.params.id);
  const q = await query(`UPDATE movies SET ${sets.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(q.rows[0]);
}));

r.delete('/:id', authRequired, adminOnly, ah(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const q = await query('DELETE FROM movies WHERE id=$1 RETURNING id', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

export default r;
