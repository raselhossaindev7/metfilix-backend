// Long-running entry: local dev + Render.
// (Vercel serverless uses api/index.js instead — never app.listen there.)
import dotenv from 'dotenv';
import { app } from './app.js';
import { ensureSchema } from './migrate.js';
import { startKeepAlive } from './keepalive.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Auto-migrate on boot (idempotent IF NOT EXISTS): a deploy that adds
// columns (e.g. movies.video_sources) must not 500 until someone manually
// runs `npm run migrate`. Non-fatal — a sleeping DB must not crash boot;
// /health + logs will show the failure instead.
try {
  await ensureSchema();
  console.log('Schema ensured');
} catch (e) {
  console.error('Schema ensure failed (will retry next start):', e.message);
}

app.listen(PORT, () => { console.log(`Metfilix backend on http://localhost:${PORT} — pixeldrain test: ${process.env.PIXELDRAIN_TEST_VIDEO}`); startKeepAlive(); });
