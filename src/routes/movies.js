import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';

const r = Router();

// public: list with filters ?category=&lang=&q=&page=&limit=
r.get('/', async (req, res) => {
  const { category, lang, q, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const conds = [];
  const vals = [];
  let idx = 1;
  if (category) { conds.push(`category = $${idx++}`); vals.push(category); }
  if (lang && lang !== 'All') { conds.push(`lang = $${idx++} OR lang='All'`); vals.push(lang); }
  if (q) { conds.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`); vals.push(`%${q}%`); idx++; }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const countQ = await query(`SELECT COUNT(*) FROM movies ${where}`, vals);
  const total = Number(countQ.rows[0].count);
  const dataQ = await query(`SELECT * FROM movies ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...vals, Number(limit), offset]);
  res.json({ data: dataQ.rows, total, page: Number(page), limit: Number(limit) });
});

r.get('/:id', async (req, res) => {
  const q = await query('SELECT * FROM movies WHERE id=$1', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(q.rows[0]);
});

// admin
r.post('/', authRequired, adminOnly, async (req, res) => {
  const { title, description, year, match, rating, duration, category, lang, img, video_url, genres, rank, progress } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const ins = await query(
    `INSERT INTO movies(title,description,year,match,rating,duration,category,lang,img,video_url,genres,rank,progress)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [title, description || '', year || '2024', match || '95% Match', rating || 'TV-MA', duration || '2h 14m', category || 'Trending Now', lang || 'All', img || '', video_url || process.env.PIXELDRAIN_TEST_VIDEO, JSON.stringify(genres || ['Drama']), rank || null, progress || null]
  );
  res.status(201).json(ins.rows[0]);
});

r.put('/:id', authRequired, adminOnly, async (req, res) => {
  const fields = ['title','description','year','match','rating','duration','category','lang','img','video_url','genres','rank','progress'];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const f of fields) if (req.body[f] !== undefined) { sets.push(`${f}=$${idx++}`); vals.push(f === 'genres' ? JSON.stringify(req.body[f]) : req.body[f]); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(req.params.id);
  const q = await query(`UPDATE movies SET ${sets.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(q.rows[0]);
});

r.delete('/:id', authRequired, adminOnly, async (req, res) => {
  const q = await query('DELETE FROM movies WHERE id=$1 RETURNING id', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// rows for home: grouped by category
r.get('/rows/grouped', async (req, res) => {
  const cats = await query("SELECT DISTINCT category FROM movies ORDER BY category");
  const rows = [];
  for (const c of cats.rows) {
    const lang = req.query.lang && req.query.lang !== 'All' ? req.query.lang : null;
    const q = lang ? await query('SELECT * FROM movies WHERE category=$1 AND (lang=$2 OR lang=\'All\') ORDER BY rank NULLS LAST, id DESC LIMIT 12', [c.category, lang]) : await query('SELECT * FROM movies WHERE category=$1 ORDER BY rank NULLS LAST, id DESC LIMIT 12', [c.category]);
    rows.push({ title: c.category, items: q.rows });
  }
  // ensure at least fallback if empty
  if (!rows.length) {
    const all = await query('SELECT * FROM movies ORDER BY id DESC LIMIT 20');
    rows.push({ title: 'Trending Now', items: all.rows });
  }
  res.json(rows);
});

export default r;
