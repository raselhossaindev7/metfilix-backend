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
  await ready();
  return app(req, res);
}
