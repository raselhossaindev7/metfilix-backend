import { Router } from 'express';
import { getCollection, clean, cleanAll, nextId } from '../db.js';
import { authRequired, requirePerm } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

// ── comments ────────────────────────────────────────────────────────────────
export const commentsRoutes = Router();

commentsRoutes.get('/', ah(async (req, res) => {
  const comments = await getCollection('comments');
  const filter = {};
  if (req.query.movie_id !== undefined) filter.movie_id = Number(req.query.movie_id);
  const list = await comments.find(filter).sort({ created_at: -1 }).limit(100).toArray();

  // The admin moderation screen lists every comment, so it needs the movie
  // title; the public watch page asks for one movie and skips the extra query.
  if (filter.movie_id === undefined && list.length) {
    const movies = await getCollection('movies');
    const ids = [...new Set(list.map((c) => c.movie_id))];
    const found = await movies.find(
      { id: { $in: ids } },
      { projection: { id: 1, title: 1 } }
    ).toArray();
    const byId = new Map(found.map((m) => [m.id, m.title]));
    return res.json(cleanAll(list).map((c) => ({ ...c, movie_title: byId.get(c.movie_id) || '' })));
  }
  res.json(cleanAll(list));
}));

commentsRoutes.post('/', ah(async (req, res) => {
  const { movie_id, name, message } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'message required' });
  const doc = {
    id: await nextId('comments'),
    movie_id: Number(movie_id) || 0,
    name: String(name || 'Guest').slice(0, 80),
    message: String(message).slice(0, 500),
    created_at: new Date(),
  };
  const comments = await getCollection('comments');
  await comments.insertOne(doc);
  res.status(201).json(clean(doc));
}));

commentsRoutes.delete('/', authRequired, requirePerm('comments.moderate'), ah(async (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
  const comments = await getCollection('comments');
  await comments.deleteOne({ id });
  res.json({ ok: true });
}));

// ── broken-link reports ─────────────────────────────────────────────────────
export const reportsRoutes = Router();

reportsRoutes.get('/', authRequired, requirePerm('reports.view'), ah(async (req, res) => {
  const reports = await getCollection('reports');
  const movies = await getCollection('movies');
  const list = await reports.find({}).sort({ created_at: -1 }).toArray();
  const ids = [...new Set(list.map((r) => r.movie_id))];
  const found = ids.length ? await movies.find({ id: { $in: ids } }, { projection: { id: 1, title: 1 } }).toArray() : [];
  const byId = new Map(found.map((m) => [m.id, m.title]));
  res.json(list.map((r) => ({
    id: r.id ?? String(r._id),
    movie_id: r.movie_id,
    title: byId.get(r.movie_id) || '',
    reason: r.reason || '',
    created_at: r.created_at,
  })));
}));

reportsRoutes.post('/', ah(async (req, res) => {
  const { movie_id, reason } = req.body || {};
  const doc = {
    id: await nextId('reports'),
    movie_id: Number(movie_id) || 0,
    reason: String(reason || 'broken').slice(0, 300),
    created_at: new Date(),
  };
  const reports = await getCollection('reports');
  await reports.insertOne(doc);
  res.status(201).json(clean(doc));
}));

reportsRoutes.delete('/', authRequired, requirePerm('reports.delete'), ah(async (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
  const reports = await getCollection('reports');
  await reports.deleteOne({ id });
  res.json({ ok: true });
}));

// ── movie requests ──────────────────────────────────────────────────────────
export const requestsRoutes = Router();

requestsRoutes.get('/', authRequired, requirePerm('requests.view'), ah(async (req, res) => {
  const requests = await getCollection('requests');
  const list = await requests.find({}).sort({ created_at: -1 }).toArray();
  res.json(list.map((r) => ({
    id: r.id ?? String(r._id),
    title: r.title || '',
    details: r.details || '',
    status: r.status || 'pending',
    created_at: r.created_at,
  })));
}));

requestsRoutes.post('/', ah(async (req, res) => {
  const { title, details } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
  const doc = {
    id: await nextId('requests'),
    title: String(title).slice(0, 200),
    details: String(details || '').slice(0, 1000),
    status: 'pending',
    created_at: new Date(),
  };
  const requests = await getCollection('requests');
  await requests.insertOne(doc);
  res.status(201).json(clean(doc));
}));

requestsRoutes.delete('/', authRequired, requirePerm('requests.moderate'), ah(async (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
  const requests = await getCollection('requests');
  await requests.deleteOne({ id });
  res.json({ ok: true });
}));

requestsRoutes.put('/', authRequired, requirePerm('requests.moderate'), ah(async (req, res) => {
  const { id, status } = req.body || {};
  if (!['pending', 'added', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid status' });
  const requests = await getCollection('requests');
  const result = await requests.updateOne({ id: Number(id) }, { $set: { status } });
  if (!result.matchedCount) return res.status(404).json({ error: 'Request not found' });
  res.json({ ok: true, status });
}));
