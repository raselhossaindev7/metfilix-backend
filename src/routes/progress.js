import { Router } from 'express';
import { getCollection } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

// Compatibility API used by the web/admin client. Keeps the public shape
// `{ progress: {movieId: 0..1}, history: [...] }` while the TV app keeps
// using /api/mylist/progress.
const r = Router();

r.get('/', authRequired, ah(async (req, res) => {
  const coll = await getCollection('watch_progress');
  const list = await coll.find({ user_id: req.user.id }).toArray();
  const progress = {};
  const history = [];
  for (const p of list) {
    progress[p.movie_id] = p.progress;
    history.push({
      movie_id: p.movie_id,
      progress: p.progress,
      updated_at: p.updated_at || null,
    });
  }
  history.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  res.json({ progress, history });
}));

r.post('/', authRequired, ah(async (req, res) => {
  const movieId = Number(req.body?.movie_id);
  const p = Number(req.body?.progress);
  if (!Number.isInteger(movieId)) return res.status(400).json({ error: 'movie_id required' });
  if (Number.isNaN(p)) return res.status(400).json({ error: 'progress 0-1 required' });

  const coll = await getCollection('watch_progress');
  await coll.updateOne(
    { user_id: req.user.id, movie_id: movieId },
    {
      $set: { progress: Math.min(1, Math.max(0, p)), updated_at: new Date() },
      $setOnInsert: { user_id: req.user.id, movie_id: movieId },
    },
    { upsert: true }
  );
  res.json({ ok: true });
}));

r.delete('/', authRequired, ah(async (req, res) => {
  const movieId = Number(req.query.movie_id ?? req.query.id);
  if (!Number.isInteger(movieId)) return res.status(400).json({ error: 'movie_id required' });
  const coll = await getCollection('watch_progress');
  await coll.deleteOne({ user_id: req.user.id, movie_id: movieId });
  res.json({ ok: true });
}));

export default r;
