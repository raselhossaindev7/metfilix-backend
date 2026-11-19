import { Router } from 'express';
import { getCollection, clean, cleanAll, nextId } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const r = Router();

r.get('/', ah(async (req, res) => {
  const rows = await getCollection('rows_config');
  const list = await rows.find({}).sort({ position: 1 }).toArray();
  res.json(cleanAll(list));
}));

r.post('/', authRequired, adminOnly, ah(async (req, res) => {
  const { title, category, position } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  const rows = await getCollection('rows_config');
  const doc = {
    id: await nextId('rows'),
    title,
    category: category || title,
    position: Number(position) || 0,
  };
  const result = await rows.insertOne(doc);
  doc._id = result.insertedId;
  res.status(201).json(clean(doc));
}));

r.put('/:id', authRequired, adminOnly, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });

  const { title, category, position } = req.body || {};
  const set = {};
  if (title !== undefined) set.title = title;
  if (category !== undefined) set.category = category;
  if (position !== undefined) set.position = Number(position);

  const rows = await getCollection('rows_config');
  const result = await rows.findOneAndUpdate({ id }, { $set: set }, { returnDocument: 'after' });
  const updated = result && 'value' in result ? result.value : result;
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(clean(updated));
}));

r.delete('/:id', authRequired, adminOnly, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const rows = await getCollection('rows_config');
  const result = await rows.deleteOne({ id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

export default r;
