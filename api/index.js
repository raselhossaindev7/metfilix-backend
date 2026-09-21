// Vercel serverless entry — `vercel.json` rewrites every path here.
// Do NOT app.listen() in this file: Vercel freezes the process between
// invocations, so no keep-alive timers either (see src/keepalive.js).
import dotenv from 'dotenv';

dotenv.config();

import app from '../src/app.js';
import { ensureSchema } from '../src/migrate.js';

// Run once per cold start; the resolved promise is reused while warm.
// Never rejects (resets to null so the next request retries the migrate).
let schemaReady = null;
function ready() {
  if (!schemaReady) {
    schemaReady = ensureSchema()
      .then(() => console.log('Schema ensured'))
      .catch((e) => {
        console.error('Schema ensure failed (will retry next request):', e.message);
        schemaReady = null;
      });
  }
  return schemaReady;
}

export default async function handler(req, res) {
  // Never block a request on migration: Vercel kills hobby functions at ~10s,
  // so awaiting ensureSchema() on a cold start (paused Supabase wakes slowly)
  // turns every first hit into a 504. Wait at most ~6s for the migrate, then
  // serve anyway — endpoints fail fast (500/503 JSON) instead of hanging.
  // The migration promise is shared per cold start and retries next request.
  try {
    await Promise.race([ready(), new Promise((r) => setTimeout(r, 6000))]);
  } catch { /* ready() already logs + resets for retry */ }
  return app(req, res);
}
