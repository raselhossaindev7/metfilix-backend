import { Router } from 'express';
import { getCollection, clean, cleanAll, nextId } from '../db.js';
import { authRequired, requirePerm } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

// Hero slides power the landing/backdrop carousel on the public site. Admins
// and editors can curate them; previously they were seeded once and frozen.
const r = Router();

const FIELDS = ['title', 'season', 'description', 'match', 'rating', 'seasons', 'bg', 'position', 'movie_id'];

function pick(body) {
  const out = {};
  for (const f of FIELDS) {
    if (body?.[f] === undefined) continue;
    if (f === 'position') out[f] = Number(body[f]) || 0;
    else if (f === 'movie_id') out[f] = body[f] === null || body[f] === '' ? null : Number(body[f]);
    else out[f] = String(body[f]).slice(0, 1000);
  }
  return out;
}

r.get('/', ah(async (req, res) => {
  const hero = await getCollection('hero_slides');
  const slides = await hero.find({}).sort({ position: 1, id: 1 }).toArray();
  res.json(cleanAll(slides));
}));

r.post('/', authRequired, requirePerm('hero.manage'), ah(async (req, res) => {
  const body = req.body || {};
  const hero = await getCollection('hero_slides');

  let base = pick(body);
  if (base.movie_id != null) {
    if (!Number.isInteger(base.movie_id)) return res.status(400).json({ error: 'invalid movie_id' });
    const movies = await getCollection('movies');
    const movie = await movies.findOne({ id: base.movie_id });
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    // Fill anything the admin left blank straight from the title.
    base = {
      title: body.title || movie.title,
      season: body.season || movie.duration || '',
      description: body.description || movie.description || '',
      match: body.match || movie.match || '95% Match',
      rating: body.rating || movie.rating || 'TV-MA',
      seasons: body.seasons || movie.duration || '',
      bg: body.bg || movie.img || '',
      position: Number(body.position) || 0,
      movie_id: base.movie_id,
    };
  }
  if (!base.title) return res.status(400).json({ error: 'title required' });

  const last = await hero.find({}).sort({ position: -1 }).limit(1).toArray();
  const doc = {
    id: await nextId('hero_slides'),
    title: base.title,
    season: base.season || '',
    description: base.description || '',
    match: base.match || '95% Match',
    rating: base.rating || 'TV-MA',
    seasons: base.seasons || '',
    bg: base.bg || '',
    position: base.position > 0 ? base.position : Number(last[0]?.position || 0) + 1,
    movie_id: base.movie_id ?? null,
  };
  const result = await hero.insertOne(doc);
  doc._id = result.insertedId;
  res.status(201).json(clean(doc));
}));

r.put('/:id', authRequired, requirePerm('hero.manage'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const set = pick(req.body || {});
  if (!Object.keys(set).length) return res.status(400).json({ error: 'No fields' });

  const hero = await getCollection('hero_slides');
  const result = await hero.findOneAndUpdate({ id }, { $set: set }, { returnDocument: 'after' });
  const updated = result && 'value' in result ? result.value : result;
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(clean(updated));
}));

r.delete('/:id', authRequired, requirePerm('hero.manage'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const hero = await getCollection('hero_slides');
  const result = await hero.deleteOne({ id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

export default r;
