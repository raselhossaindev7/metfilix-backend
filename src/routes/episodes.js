import { Router } from 'express';
import { getCollection, clean, cleanAll } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const r = Router();

// Public — latest episodes across all series (notifications feed).
// MUST stay above /:id, otherwise "recent" lands in the :id handler.
r.get('/recent', ah(async (req, res) => {
  const episodes = await getCollection('episodes');
  const movies = await getCollection('movies');

  const list = await episodes.find({}).sort({ created_at: -1 }).limit(10).toArray();
  const ids = [...new Set(list.map((e) => e.movie_id))];
  const found = ids.length ? await movies.find({ id: { $in: ids } }).toArray() : [];
  const byId = new Map(found.map((m) => [m.id, m]));

  res.json(cleanAll(list.map((e) => ({
    ...e,
    movie_title: byId.get(e.movie_id)?.title ?? null,
    movie_img: byId.get(e.movie_id)?.img ?? null,
  }))));
}));

r.get('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const episodes = await getCollection('episodes');
  const ep = await episodes.findOne({ id });
  if (!ep) return res.status(404).json({ error: 'Not found' });
  res.json(clean(ep));
}));

r.put('/:id', authRequired, adminOnly, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });

  const fields = ['season', 'episode', 'title', 'video_url', 'subtitle_url', 'duration'];
  const set = {};
  for (const f of fields) {
    if (req.body[f] === undefined) continue;
    if (f === 'season' || f === 'episode') set[f] = Number(req.body[f]);
    else set[f] = String(req.body[f]).slice(0, 500);
  }
  if (!Object.keys(set).length) return res.status(400).json({ error: 'No fields' });

  const episodes = await getCollection('episodes');
  const result = await episodes.findOneAndUpdate({ id }, { $set: set }, { returnDocument: 'after' });
  const updated = result && 'value' in result ? result.value : result;
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(clean(updated));
}));

r.delete('/:id', authRequired, adminOnly, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const episodes = await getCollection('episodes');
  await episodes.deleteOne({ id });
  res.json({ ok: true });
}));

export default r;
