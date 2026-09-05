import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
const r = Router();

// all require auth
r.get('/', authRequired, ah(async (req, res) => {
  const q = await query('SELECT m.* FROM my_list l JOIN movies m ON m.id=l.movie_id WHERE l.user_id=$1 ORDER BY l.created_at DESC', [req.user.id]);
  res.json(q.rows);
}));

r.post('/:movieId', authRequired, ah(async (req, res) => {
  const movieId = Number(req.params.movieId);
  if (!Number.isInteger(movieId)) return res.status(400).json({ error: 'invalid movie id' });
  const exists = await query('SELECT id FROM my_list WHERE user_id=$1 AND movie_id=$2', [req.user.id, movieId]);
  if (exists.rows.length) return res.json({ already: true });
  await query('INSERT INTO my_list(user_id,movie_id) VALUES($1,$2)', [req.user.id, movieId]);
  res.status(201).json({ ok: true });
}));

r.delete('/:movieId', authRequired, ah(async (req, res) => {
  await query('DELETE FROM my_list WHERE user_id=$1 AND movie_id=$2', [req.user.id, req.params.movieId]);
  res.json({ ok: true });
}));

// progress
r.get('/progress', authRequired, ah(async (req, res) => {
  const q = await query('SELECT movie_id, progress FROM watch_progress WHERE user_id=$1', [req.user.id]);
  const map = {}; q.rows.forEach(r => map[r.movie_id] = r.progress);
  res.json(map);
}));

r.post('/progress/:movieId', authRequired, ah(async (req, res) => {
  const p = Number(req.body.progress);
  if (isNaN(p)) return res.status(400).json({ error: 'progress 0-1 required' });
  await query(`INSERT INTO watch_progress(user_id,movie_id,progress) VALUES($1,$2,$3)
    ON CONFLICT (user_id,movie_id) DO UPDATE SET progress=$3, updated_at=NOW()`, [req.user.id, req.params.movieId, Math.min(1, Math.max(0, p))]);
  res.json({ ok: true });
}));

export default r;
