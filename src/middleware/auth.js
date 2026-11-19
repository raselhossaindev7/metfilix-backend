import jwt from 'jsonwebtoken';
import { getCollection } from '../db.js';

// Verifies the JWT *and* the live account: a suspended user or an old token
// (issued before a password change / role change) must stop working at once.
// The role is always read from the database — never trusted from the token.
export async function authRequired(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = h.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    const users = await getCollection('users');
    const user = await users.findOne(
      { _id: payload.id },
      { projection: { email: 1, role: 1, status: 1, token_version: 1 } }
    );
    if (!user) return res.status(401).json({ error: 'User not found' });
    if ((user.status || 'active') === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }
    // Tokens signed before this feature have no `tv`; treat that as version 0.
    if (Number(payload.tv || 0) !== Number(user.token_version || 0)) {
      return res.status(401).json({ error: 'Session expired — sign in again' });
    }
    req.user = {
      ...payload,
      id: user._id,
      email: user.email,
      role: user.role || 'user',
    };
    return next();
  } catch (e) {
    return next(e);
  }
}

// For public endpoints that personalise their answer when a token happens to
// be present (e.g. "did I already like this movie?"). Never fails the request.
export function userFromToken(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    return payload?.id ? payload : null;
  } catch {
    return null;
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Mirrors the admin app's lib/rbac.ts so editors/moderators keep working.
export const PERMISSIONS = {
  user: [],
  support: ['reports.view', 'requests.view', 'users.view'],
  moderator: ['reports.view', 'reports.delete', 'requests.view', 'requests.moderate', 'comments.moderate', 'users.view'],
  editor: [
    'movies.create', 'movies.edit', 'movies.delete',
    'hero.manage', 'rows.manage',
    'reports.view', 'reports.delete', 'requests.view', 'requests.moderate',
    'comments.moderate', 'users.view',
  ],
  admin: ['*'],
};

export function can(role, perm) {
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes('*') || perms.includes(perm);
}

export function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Missing token' });
    if (!can(req.user.role, perm)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
