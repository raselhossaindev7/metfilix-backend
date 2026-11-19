import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { getCollection } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const r = Router();

const PROFILE_FIELDS = ['name', 'avatar', 'color', 'language', 'kids_mode', 'kids_pin'];

r.put('/', authRequired, ah(async (req, res) => {
  const users = await getCollection('users');
  const user = await users.findOne({ _id: req.user.id });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, profile } = req.body || {};
  const userSet = {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    userSet.name = String(name).trim().slice(0, 120);
  }
  if (Object.keys(userSet).length) await users.updateOne({ _id: user._id }, { $set: userSet });

  if (profile && typeof profile === 'object') {
    const profiles = await getCollection('profiles');
    const existing = await profiles.findOne({ user_id: user._id });
    const set = {};
    for (const f of PROFILE_FIELDS) {
      if (profile[f] === undefined) continue;
      if (f === 'kids_mode') set[f] = !!profile[f];
      else set[f] = String(profile[f]).slice(0, 500);
    }
    if (Object.keys(set).length) {
      if (existing) await profiles.updateOne({ _id: existing._id }, { $set: set });
      else {
        await profiles.insertOne({
          _id: randomUUID(),
          user_id: user._id,
          name: set.name || 'You',
          ...set,
          created_at: new Date(),
        });
      }
    }
  }

  res.json({ ok: true });
}));

r.post('/password', authRequired, ah(async (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: 'current and next required' });
  if (String(next).length < 4) return res.status(400).json({ error: 'New password min 4 chars' });

  const users = await getCollection('users');
  const user = await users.findOne({ _id: req.user.id });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const ok = await bcrypt.compare(String(current), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const tv = Number(user.token_version || 0) + 1;
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        password_hash: await bcrypt.hash(String(next), 10),
        token_version: tv,
      },
    }
  );

  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role, tv },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  res.json({ ok: true, token });
}));

export default r;
