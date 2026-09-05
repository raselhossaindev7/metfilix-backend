import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { z } from 'zod';

const r = Router();
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(4), name: z.string().min(1).optional() });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

r.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { email, password, name } = parsed.data;
  const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const ins = await query("INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'user') RETURNING id,email,role,name,created_at", [email, hash, name || email.split('@')[0]]);
  const user = ins.rows[0];
  // default profiles
  await query("INSERT INTO profiles(user_id,name,avatar,color) VALUES($1,'You','https://i.pravatar.cc/150?img=12','#1E90FF'),($1,'Kids','https://i.pravatar.cc/150?img=8','#FFD700'),($1,'Mom','https://i.pravatar.cc/150?img=5','#32CD32')", [user.id]);
  const token = sign(user);
  res.json({ token, user });
});

r.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { email, password } = parsed.data;
  const q = await query('SELECT * FROM users WHERE email=$1', [email]);
  if (!q.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const user = q.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = sign(user);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

r.get('/me', async (req, res) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'No token' });
  try {
    const p = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const q = await query('SELECT id,email,role,name,created_at FROM users WHERE id=$1', [p.id]);
    if (!q.rows.length) return res.status(404).json({ error: 'User not found' });
    const profiles = await query('SELECT * FROM profiles WHERE user_id=$1 ORDER BY id', [p.id]);
    res.json({ user: q.rows[0], profiles: profiles.rows });
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
});

export default r;
