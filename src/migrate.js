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

-- ── parity with frontend schema (metfilix/scripts/migrate.ts) ──
-- Engagement / details columns used by ?sort=views|likes|top and the admin editor.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS views INT NOT NULL DEFAULT 0;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS likes INT NOT NULL DEFAULT 0;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS dislikes INT NOT NULL DEFAULT 0;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS subtitle_url TEXT NOT NULL DEFAULT '';
ALTER TABLE movies ADD COLUMN IF NOT EXISTS director TEXT NOT NULL DEFAULT '';
-- NOTE: "cast" is a reserved word in Postgres → must stay double-quoted everywhere.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS "cast" JSONB DEFAULT '[]';

-- Series support: one movie/show → many S/E videos.
CREATE TABLE IF NOT EXISTS episodes (
  id SERIAL PRIMARY KEY,
  movie_id INT REFERENCES movies(id) ON DELETE CASCADE,
  season INT NOT NULL DEFAULT 1,
  episode INT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(movie_id, season, episode)
);
CREATE INDEX IF NOT EXISTS idx_episodes_movie ON episodes(movie_id);
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS subtitle_url TEXT NOT NULL DEFAULT '';

-- Community / requests / reports / ads.
CREATE TABLE IF NOT EXISTS comments (id SERIAL PRIMARY KEY, movie_id INT REFERENCES movies(id) ON DELETE CASCADE, name TEXT NOT NULL DEFAULT 'Guest', message TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS movie_requests (id SERIAL PRIMARY KEY, title TEXT NOT NULL, details TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS reports (id SERIAL PRIMARY KEY, movie_id INT REFERENCES movies(id) ON DELETE CASCADE, reason TEXT NOT NULL DEFAULT 'broken', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS ad_settings (id INT PRIMARY KEY DEFAULT 1, head_code TEXT NOT NULL DEFAULT '', pre_roll_enabled BOOLEAN NOT NULL DEFAULT TRUE, pre_roll_skip_seconds INT NOT NULL DEFAULT 5, pre_roll_image TEXT NOT NULL DEFAULT '', pre_roll_link TEXT NOT NULL DEFAULT '', banner_top TEXT NOT NULL DEFAULT '', banner_bottom TEXT NOT NULL DEFAULT '', popunder_code TEXT NOT NULL DEFAULT '', in_player_banner TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ DEFAULT NOW());
INSERT INTO ad_settings(id) VALUES(1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE ad_settings ADD COLUMN IF NOT EXISTS mid_roll_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ad_settings ADD COLUMN IF NOT EXISTS mid_roll_interval_minutes INT NOT NULL DEFAULT 15;

-- RBAC hardening (widen role set; keeps 'admin' valid for this API's adminOnly).
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user','moderator','editor','support','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, actor_id UUID REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id UUID REFERENCES users(id) ON DELETE CASCADE, ip TEXT NOT NULL DEFAULT '', ok BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());

-- Profiles + hero extras.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'English';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kids_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS movie_id INT REFERENCES movies(id) ON DELETE SET NULL;
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
