import { Router } from 'express';
import { getCollection, cleanAll } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
const r = Router();

// all require auth
r.get('/', authRequired, ah(async (req, res) => {
  const myList = await getCollection('my_list');
  const movies = await getCollection('movies');

  const items = await myList.find({ user_id: req.user.id }).sort({ created_at: -1 }).toArray();
  const ids = items.map((i) => i.movie_id);
  if (!ids.length) return res.json([]);

  const found = await movies.find({ id: { $in: ids } }).toArray();
  const byId = new Map(found.map((m) => [m.id, m]));
  res.json(cleanAll(ids.map((id) => byId.get(id)).filter(Boolean)));
}));

r.post('/:movieId', authRequired, ah(async (req, res) => {
  const movieId = Number(req.params.movieId);
  if (!Number.isInteger(movieId)) return res.status(400).json({ error: 'invalid movie id' });

  const myList = await getCollection('my_list');
  const exists = await myList.findOne({ user_id: req.user.id, movie_id: movieId });
  if (exists) return res.json({ already: true });

  await myList.insertOne({ user_id: req.user.id, movie_id: movieId, created_at: new Date() });
  res.status(201).json({ ok: true });
}));

r.delete('/:movieId', authRequired, ah(async (req, res) => {
  const myList = await getCollection('my_list');
  await myList.deleteOne({ user_id: req.user.id, movie_id: Number(req.params.movieId) });
  res.json({ ok: true });
}));

// progress
r.get('/progress', authRequired, ah(async (req, res) => {
  const progress = await getCollection('watch_progress');
  const list = await progress.find({ user_id: req.user.id }).toArray();
  const map = {};
  list.forEach((p) => { map[p.movie_id] = p.progress; });
  res.json(map);
}));

r.post('/progress/:movieId', authRequired, ah(async (req, res) => {
  const p = Number(req.body.progress);
  if (isNaN(p)) return res.status(400).json({ error: 'progress 0-1 required' });

  const movieId = Number(req.params.movieId);
  const progress = await getCollection('watch_progress');
  await progress.updateOne(
    { user_id: req.user.id, movie_id: movieId },
    {
      $set: {
        progress: Math.min(1, Math.max(0, p)),
        updated_at: new Date(),
      },
      $setOnInsert: { user_id: req.user.id, movie_id: movieId },
    },
    { upsert: true }
  );
  res.json({ ok: true });
}));

export default r;
