import { Router } from 'express';
import { getCollection, clean, cleanAll, nextId } from '../db.js';
import { authRequired, requirePerm, userFromToken } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const r = Router();

function rx(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function movieFields(body) {
  const fields = ['title', 'description', 'year', 'match', 'rating', 'duration', 'category', 'lang', 'img', 'video_url', 'subtitle_url', 'genres', 'rank', 'progress', 'director', 'cast', 'video_sources', 'codec', 'is_hls'];
  const out = {};
  for (const f of fields) {
    if (body[f] === undefined) continue;
    if (f === 'genres' || f === 'cast') out[f] = toArray(body[f]);
    else if (f === 'video_sources') out[f] = Array.isArray(body[f]) ? body[f] : [];
    else out[f] = body[f];
  }
  return out;
}

const SORT = {
  views: { views: -1, id: -1 },
  likes: { likes: -1, id: -1 },
  latest: { created_at: -1, id: -1 },
};

// public: list with filters ?category=&lang=&genre=&year=&q=&sort=&page=&limit=
r.get('/', ah(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { category, lang, genre, year, q, sort } = req.query;

  const filter = {};
  if (category) filter.category = String(category);
  if (lang && lang !== 'All') filter.lang = { $in: [String(lang), 'All'] };
  if (genre && genre !== 'All') filter.genres = rx(genre);
  if (year && year !== 'All') filter.year = String(year);
  if (q) filter.$or = [{ title: rx(q) }, { description: rx(q) }];

  const movies = await getCollection('movies');
  const total = await movies.countDocuments(filter);
  const skip = (page - 1) * limit;

  let data;
  if (sort === 'top') {
    // NULLS LAST for unranked titles.
    data = await movies.aggregate([
      { $match: filter },
      { $addFields: { _missingRank: { $cond: [{ $in: [{ $type: '$rank' }, ['missing', 'null']] }, 1, 0] } } },
      { $sort: { _missingRank: 1, rank: 1, likes: -1, id: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { _missingRank: 0 } },
    ]).toArray();
  } else {
    data = await movies.find(filter).sort(SORT[sort] || SORT.latest).skip(skip).limit(limit).toArray();
  }

  res.json({ data: cleanAll(data), total, page, limit });
}));

// rows for home: grouped by category — MUST stay above /:id.
async function groupedRows(req, res) {
  const rowsCfg = await getCollection('rows_config');
  const movies = await getCollection('movies');

  const cfg = await rowsCfg.find({}).sort({ position: 1 }).toArray();
  let defs = cfg.map((c) => ({ title: c.title, category: c.category || c.title }));
  if (!defs.length) {
    const cats = await movies.distinct('category');
    defs = cats.filter(Boolean).sort().map((c) => ({ title: c, category: c }));
  }

  const lang = req.query.lang && req.query.lang !== 'All' ? String(req.query.lang) : null;
  const rows = [];
  for (const c of defs) {
    const filter = { category: c.category };
    if (lang) filter.lang = { $in: [lang, 'All'] };
    const list = await movies.find(filter).sort({ rank: 1, id: -1 }).limit(12).toArray();
    if (list.length) rows.push({ title: c.title, items: cleanAll(list) });
  }
  if (!rows.length) {
    const all = await movies.find({}).sort({ id: -1 }).limit(20).toArray();
    rows.push({ title: 'Trending Now', items: cleanAll(all) });
  }
  res.json(rows);
}
r.get('/rows/grouped', ah(groupedRows));
r.get('/rows', ah(groupedRows));

// episodes (series): public list + admin upsert.
r.get('/:id/episodes', ah(async (req, res) => {
  const movieId = Number(req.params.id);
  if (!Number.isInteger(movieId)) return res.status(404).json({ error: 'Not found' });
  const episodes = await getCollection('episodes');
  const list = await episodes.find({ movie_id: movieId }).sort({ season: 1, episode: 1 }).toArray();
  res.json(cleanAll(list));
}));

r.post('/:id/episodes', authRequired, requirePerm('movies.edit'), ah(async (req, res) => {
  const movieId = Number(req.params.id);
  if (!Number.isInteger(movieId)) return res.status(404).json({ error: 'Not found' });

  const { season, episode, title, video_url, subtitle_url, duration } = req.body || {};
  const s = Number(season || 1);
  const e = Number(episode);
  if (!e || e < 1) return res.status(400).json({ error: 'episode number required' });
  if (!video_url) return res.status(400).json({ error: 'video_url required' });

  const fields = {
    title: String(title || `Episode ${e}`).slice(0, 200),
    video_url: String(video_url),
    subtitle_url: String(subtitle_url || ''),
    duration: String(duration || ''),
  };

  const episodes = await getCollection('episodes');
  const existing = await episodes.findOne({ movie_id: movieId, season: s, episode: e });
  if (existing) {
    await episodes.updateOne({ _id: existing._id }, { $set: fields });
    const updated = await episodes.findOne({ _id: existing._id });
    return res.status(201).json(clean(updated));
  }

  const doc = {
    id: await nextId('episodes'),
    movie_id: movieId,
    season: s,
    episode: e,
    ...fields,
    created_at: new Date(),
  };
  const result = await episodes.insertOne(doc);
  doc._id = result.insertedId;
  res.status(201).json(clean(doc));
}));

// public engagement counters (used by the web watch page)
r.post('/:id/view', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const movies = await getCollection('movies');
  const result = await movies.findOneAndUpdate(
    { id },
    { $inc: { views: 1 } },
    { returnDocument: 'after', projection: { id: 1, views: 1 } }
  );
  const updated = result && 'value' in result ? result.value : result;
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ id, views: updated.views || 0 });
}));

// My reaction (signed-in users only) so the UI can restore like/dislike state.
r.get('/:id/reaction', authRequired, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const reactions = await getCollection('movie_reactions');
  const doc = await reactions.findOne({ user_id: req.user.id, movie_id: id });
  res.json({ action: doc?.action || null });
}));

// Like / dislike. Signed-in users get a real toggle (one reaction per movie,
// switching or removing it fixes the counters atomically). Guests can still
// add a like/dislike, but cannot take it back.
r.post('/:id/like', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });

  const raw = req.body?.action;
  const action = raw === 'dislike' ? 'dislike' : raw === 'none' ? 'none' : 'like';
  const movies = await getCollection('movies');
  const movie = await movies.findOne({ id });
  if (!movie) return res.status(404).json({ error: 'Not found' });

  const me = userFromToken(req);
  if (!me) {
    if (action === 'none') {
      return res.json({ id, likes: movie.likes || 0, dislikes: movie.dislikes || 0, action: null });
    }
    const updated = await movies.findOneAndUpdate(
      { id },
      { $inc: { [action === 'dislike' ? 'dislikes' : 'likes']: 1 } },
      { returnDocument: 'after', projection: { id: 1, likes: 1, dislikes: 1 } }
    );
    const doc = updated && 'value' in updated ? updated.value : updated;
    return res.json({
      id,
      likes: doc?.likes || 0,
      dislikes: doc?.dislikes || 0,
      action,
      anonymous: true,
    });
  }

  const reactions = await getCollection('movie_reactions');
  const existing = await reactions.findOne({ user_id: me.id, movie_id: id });
  const prev = existing?.action || null;
  if (prev === action) {
    return res.json({ id, likes: movie.likes || 0, dislikes: movie.dislikes || 0, action: prev });
  }

  const delta = { likes: 0, dislikes: 0 };
  if (prev === 'like') delta.likes--;
  if (prev === 'dislike') delta.dislikes--;
  if (action === 'like') delta.likes++;
  if (action === 'dislike') delta.dislikes++;

  if (action === 'none') {
    if (existing) await reactions.deleteOne({ _id: existing._id });
  } else {
    await reactions.updateOne(
      { user_id: me.id, movie_id: id },
      { $set: { action, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );
  }

  // Pipeline update keeps counters clamped at zero even if legacy rows drifted.
  const updated = await movies.findOneAndUpdate(
    { id },
    [{
      $set: {
        likes: { $max: [0, { $add: [{ $ifNull: ['$likes', 0] }, delta.likes] }] },
        dislikes: { $max: [0, { $add: [{ $ifNull: ['$dislikes', 0] }, delta.dislikes] }] },
      },
    }],
    { returnDocument: 'after', projection: { id: 1, likes: 1, dislikes: 1 } }
  );
  const doc = updated && 'value' in updated ? updated.value : updated;
  res.json({
    id,
    likes: doc?.likes || 0,
    dislikes: doc?.dislikes || 0,
    action: action === 'none' ? null : action,
  });
}));

r.get('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const movies = await getCollection('movies');
  const movie = await movies.findOne({ id });
  if (!movie) return res.status(404).json({ error: 'Not found' });
  res.json(clean(movie));
}));

// admin
r.post('/', authRequired, requirePerm('movies.create'), ah(async (req, res) => {
  const { title, video_url } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  const movies = await getCollection('movies');
  const doc = {
    id: await nextId('movies'),
    title,
    description: req.body.description || '',
    year: req.body.year || '2024',
    match: req.body.match || '95% Match',
    rating: req.body.rating || 'TV-MA',
    duration: req.body.duration || '2h 14m',
    category: req.body.category || 'Trending Now',
    lang: req.body.lang || 'All',
    img: req.body.img || '',
    video_url: video_url || process.env.PIXELDRAIN_TEST_VIDEO,
    subtitle_url: req.body.subtitle_url || '',
    genres: toArray(req.body.genres?.length ? req.body.genres : ['Drama']),
    rank: req.body.rank ?? null,
    progress: req.body.progress ?? null,
    director: req.body.director || '',
    cast: toArray(req.body.cast),
    video_sources: Array.isArray(req.body.video_sources) ? req.body.video_sources : [],
    codec: req.body.codec || 'h264',
    is_hls: req.body.is_hls ?? (typeof video_url === 'string' && video_url.includes('.m3u8')),
    views: 0,
    likes: 0,
    dislikes: 0,
    slug: null,
    created_at: new Date(),
  };
  const result = await movies.insertOne(doc);
  doc._id = result.insertedId;
  res.status(201).json(clean(doc));
}));

r.put('/:id', authRequired, requirePerm('movies.edit'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });

  const set = movieFields(req.body || {});
  if (!Object.keys(set).length) return res.status(400).json({ error: 'No fields' });

  const movies = await getCollection('movies');
  const result = await movies.findOneAndUpdate(
    { id },
    { $set: set },
    { returnDocument: 'after' }
  );
  const updated = result && 'value' in result ? result.value : result;
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(clean(updated));
}));

// Deleting a title must not leave orphaned rows behind: episodes, watchlists,
// progress, comments, reports and reactions all point at the movie id.
r.delete('/:id', authRequired, requirePerm('movies.delete'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const movies = await getCollection('movies');
  const result = await movies.deleteOne({ id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });

  await Promise.all([
    'episodes', 'my_list', 'watch_progress', 'comments', 'reports', 'movie_reactions',
  ].map(async (name) => {
    const coll = await getCollection(name);
    await coll.deleteMany({ movie_id: id });
  }));
  res.json({ ok: true });
}));

export default r;
