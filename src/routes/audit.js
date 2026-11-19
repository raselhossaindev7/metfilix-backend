import { Router } from 'express';
import { getCollection, nextId } from '../db.js';
import { authRequired, requirePerm } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const r = Router();

r.get('/', authRequired, requirePerm('audit.view'), ah(async (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const logs = await getCollection('audit_logs');
  const list = await logs.find({}).sort({ created_at: -1 }).limit(limit).toArray();
  res.json(list.map((l) => ({
    id: l.id ?? String(l._id),
    actor_email: l.actor_email || '',
    action: l.action || '',
    target: l.target || '',
    created_at: l.created_at,
  })));
}));

// Fire-and-forget audit trail for any successful authenticated mutation.
export function auditMutations(req, res, next) {
  res.on('finish', () => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (res.statusCode >= 400 || !req.user?.id) return;
    const fullPath = `${req.baseUrl}${req.path}`;
    // High-frequency / session noise is not worth auditing.
    if (/^\/api\/(auth|progress|mylist)(\/|$)/.test(fullPath)) return;
    const action = `${req.method} ${fullPath}`.replace(/\/$/, '');
    const target = String(
      req.query.id || req.params.id || req.params.movieId || req.body?.id || req.body?.movie_id || ''
    );
    getCollection('audit_logs')
      .then(async (logs) => {
        await logs.insertOne({
          id: await nextId('audit_logs'),
          actor_id: req.user.id,
          actor_email: req.user.email || '',
          action,
          target,
          created_at: new Date(),
        });
      })
      .catch(() => {});
  });
  next();
}

export default r;
