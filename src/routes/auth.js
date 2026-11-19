import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { getCollection, clean } from '../db.js';
import { ah } from '../middleware/async.js';
import { z } from 'zod';

const r = Router();
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(4), name: z.string().min(1).optional() });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function sign(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(user) {
  return { id: user._id, email: user.email, role: user.role, name: user.name };
}

r.post('/register', ah(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { email, password, name } = parsed.data;

  const users = await getCollection('users');
  const exists = await users.findOne({ email });
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  const user = {
    _id: id,
    email,
    password_hash: hash,
    name: name || email.split('@')[0],
    role: 'user',
    status: 'active',
    token_version: 0,
    created_at: new Date(),
  };
  await users.insertOne(user);

  const profiles = await getCollection('profiles');
  const tpl = [
    { name: 'You', avatar: 'https://i.pravatar.cc/150?img=12', color: '#1E90FF' },
    { name: 'Kids', avatar: 'https://i.pravatar.cc/150?img=8', color: '#FFD700' },
    { name: 'Mom', avatar: 'https://i.pravatar.cc/150?img=5', color: '#32CD32' },
  ];
  await profiles.insertMany(tpl.map((p) => ({
    _id: randomUUID(),
    user_id: id,
    ...p,
    kids_pin: null,
    language: 'English',
    kids_mode: false,
    created_at: new Date(),
  })));

  const token = sign(user);
  res.json({ token, user: publicUser(user) });
}));

r.post('/login', ah(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { email, password } = parsed.data;

  const users = await getCollection('users');
  const user = await users.findOne({ email });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = sign(user);
  res.json({ token, user: publicUser(user) });
}));

r.get('/me', ah(async (req, res) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const users = await getCollection('users');
    const user = await users.findOne({ _id: payload.id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const profiles = await getCollection('profiles');
    const list = await profiles.find({ user_id: user._id }).sort({ created_at: 1 }).toArray();
    res.json({
      user: { ...clean(user), password_hash: undefined },
      profiles: list.map(clean),
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}));

export default r;
