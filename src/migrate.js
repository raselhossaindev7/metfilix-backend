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
`;

async function run() {
  console.log('Migrating metfilix DB...');
  await query(ddl);
  console.log('Migrated');
  await getPool().end();
}
run().catch(e => { console.error(e); process.exit(1); });
