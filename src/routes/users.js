import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getCollection } from '../db.js';
import { authRequired, requirePerm } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const r = Router();
const ROLES = new Set(['user', 'support', 'moderator', 'editor', 'admin']);

function publicUser(u) {
  return {
    id: u._id,
    email: u.email,
    name: u.name || '',
    role: u.role || 'user',
    status: u.status || 'active',
    created_at: u.created_at,
  };
}

async function adminCount() {
  const users = await getCollection('users');
  return users.countDocuments({ role: 'admin', status: { $ne: 'suspended' } });
}

r.get('/', authRequired, requirePerm('users.view'), ah(async (req, res) => {
  const users = await getCollection('users');
  const list = await users.find({}).sort({ created_at: -1 }).toArray();
  res.json(list.map(publicUser));
}));

r.put('/', authRequired, requirePerm('users.manage'), ah(async (req, res) => {
  const { id, name, role, status, password } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });
  if (role !== undefined && !ROLES.has(role)) return res.status(400).json({ error: 'invalid role' });
  if (status !== undefined && !['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'invalid status' });
  if (password !== undefined && String(password).length < 4) return res.status(400).json({ error: 'password min 4 chars' });

  const users = await getCollection('users');
  const user = await users.findOne({ _id: id });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const losingAdmin = user.role === 'admin' && ((role !== undefined && role !== 'admin') || status === 'suspended');
  if (losingAdmin && (await adminCount()) <= 1) {
    return res.status(400).json({ error: 'Cannot demote or suspend the last admin' });
  }

  const set = {};
  if (name !== undefined) set.name = String(name).slice(0, 120);
  if (role !== undefined) set.role = role;
  if (status !== undefined) set.status = status;
  if (password !== undefined) {
    set.password_hash = await bcrypt.hash(String(password), 10);
    set.token_version = Number(user.token_version || 0) + 1;
  }
  if (status === 'suspended') set.token_version = Number(user.token_version || 0) + 1;

  if (Object.keys(set).length) await users.updateOne({ _id: id }, { $set: set });
  const updated = await users.findOne({ _id: id });
  res.json(publicUser(updated));
}));

r.delete('/', authRequired, requirePerm('users.manage'), ah(async (req, res) => {
  const id = String(req.query.id || '');
  if (!id) return res.status(400).json({ error: 'id required' });
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' });

  const users = await getCollection('users');
  const user = await users.findOne({ _id: id });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin' && (await adminCount()) <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last admin' });
  }

  await Promise.all([
    users.deleteOne({ _id: id }),
    getCollection('profiles').then((c) => c.deleteMany({ user_id: id })),
    getCollection('my_list').then((c) => c.deleteMany({ user_id: id })),
    getCollection('watch_progress').then((c) => c.deleteMany({ user_id: id })),
    getCollection('movie_reactions').then((c) => c.deleteMany({ user_id: id })),
  ]);
  res.json({ ok: true });
}));

export default r;
