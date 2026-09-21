import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const r = Router();

// Public — latest episodes across all series (notifications feed).
// MUST stay above /:id, otherwise "recent" lands in the :id handler.
r.get('/recent', ah(async (req, res) => {
  try {
    const q = await query(
      `SELECT e.id, e.movie_id, e.season, e.episode, e.title, e.duration, e.created_at,
              m.title AS movie_title, m.img AS movie_img
       FROM episodes e JOIN movies m ON m.id = e.movie_id
       ORDER BY e.created_at DESC LIMIT 10`
    );
    res.json(q.rows);
  } catch {
    // pre-migrate DB without the episodes table — empty feed, not a 500
    res.json([]);
  }
}));

r.get('/:id', ah(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const q = await query('SELECT * FROM episodes WHERE id=$1', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(q.rows[0]);
}));

r.put('/:id', authRequired, adminOnly, ah(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const fields = ['season', 'episode', 'title', 'video_url', 'subtitle_url', 'duration'];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f}=$${idx++}`);
      vals.push(f === 'season' || f === 'episode' ? Number(req.body[f]) : String(req.body[f]).slice(0, 500));
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(req.params.id);
  try {
    const q = await query(`UPDATE episodes SET ${sets.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
    if (!q.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(q.rows[0]);
  } catch {
    res.status(503).json({ error: 'episodes unavailable — run migrate' });
  }
}));

r.delete('/:id', authRequired, adminOnly, ah(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  await query('DELETE FROM episodes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

export default r;
