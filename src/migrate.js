import { query, getPool } from './db.js';

const ddl = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT,
  color TEXT,
  kids_pin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movies (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  year TEXT,
  match TEXT,
  rating TEXT,
  duration TEXT,
  category TEXT,
  lang TEXT DEFAULT 'All',
  img TEXT,
  video_url TEXT,
  genres JSONB DEFAULT '[]',
  rank INT,
  progress INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rows_config (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  position INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS my_list (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  movie_id INT REFERENCES movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id,movie_id)
);

CREATE TABLE IF NOT EXISTS watch_progress (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  movie_id INT REFERENCES movies(id) ON DELETE CASCADE,
  progress DOUBLE PRECISION NOT NULL CHECK (progress >=0 AND progress <=1),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id,movie_id)
);

CREATE TABLE IF NOT EXISTS hero_slides (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  season TEXT,
  description TEXT,
  match TEXT,
  rating TEXT,
  seasons TEXT,
  bg TEXT,
  position INT DEFAULT 0
);

-- Low-RAM TV / 4K adaptive sources (idempotent upgrades for existing DBs).
-- video_url stays the primary/master URL (prefer master.m3u8 HLS).
-- video_sources = JSON ladder e.g. [{"label":"1080p HLS","url":".../v2/index.m3u8","hls":true}]
ALTER TABLE movies ADD COLUMN IF NOT EXISTS video_sources JSONB DEFAULT '[]';
ALTER TABLE movies ADD COLUMN IF NOT EXISTS codec TEXT DEFAULT 'h264';
ALTER TABLE movies ADD COLUMN IF NOT EXISTS is_hls BOOLEAN DEFAULT FALSE;
`;  

async function run() {
  console.log('Migrating metfilix DB...');
  await ensureSchema();
  console.log('Migrated');
  await getPool().end();
}

// Exported for boot-time auto-migration (src/index.js calls ensureSchema()
// on every start, so Render deploys heal themselves — no manual step).
// NOTE: never end the pool here; the CLI runner below does that.
export async function ensureSchema() {
  await query(ddl);
}

// CLI only: `npm run migrate`. When imported (index.js boot), do nothing.
const isCli =
  process.argv[1] != null &&
  import.meta.url.endsWith(
    process.argv[1].replaceAll('\\', '/').split('/').pop(),
  );
if (isCli) run().catch(e => { console.error(e); process.exit(1); });
