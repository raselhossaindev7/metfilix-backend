import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
const r = Router();

r.get('/', ah(async (req, res) => {
  const q = await query('SELECT * FROM rows_config ORDER BY position');
  res.json(q.rows);
}));

r.post('/', authRequired, adminOnly, ah(async (req, res) => {
  const { title, category, position } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const ins = await query('INSERT INTO rows_config(title,category,position) VALUES($1,$2,$3) RETURNING *', [title, category || title, position || 0]);
  res.status(201).json(ins.rows[0]);
}));

r.put('/:id', authRequired, adminOnly, ah(async (req, res) => {
  const { title, category, position } = req.body;
  const q = await query('UPDATE rows_config SET title=COALESCE($1,title), category=COALESCE($2,category), position=COALESCE($3,position) WHERE id=$4 RETURNING *', [title, category, position, req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(q.rows[0]);
}));

r.delete('/:id', authRequired, adminOnly, ah(async (req, res) => {
  const q = await query('DELETE FROM rows_config WHERE id=$1 RETURNING id', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

export default r;
