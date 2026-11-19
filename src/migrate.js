import { connect, close } from './db.js';

// Creates collections + indexes. Idempotent: safe to run on every boot/deploy.
export async function ensureSchema() {
  const db = await connect();

  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('users').createIndex({ role: 1 }),
    db.collection('profiles').createIndex({ user_id: 1 }),

    db.collection('movies').createIndex({ id: 1 }, { unique: true }),
    db.collection('movies').createIndex({ category: 1 }),
    db.collection('movies').createIndex({ created_at: -1 }),
    db.collection('movies').createIndex({ rank: 1 }),
    db.collection('movies').createIndex({ views: -1 }),
    db.collection('movies').createIndex({ likes: -1 }),

    db.collection('rows_config').createIndex({ id: 1 }, { unique: true }),
    db.collection('rows_config').createIndex({ position: 1 }),

    db.collection('hero_slides').createIndex({ id: 1 }, { unique: true }),
    db.collection('hero_slides').createIndex({ position: 1 }),

    db.collection('episodes').createIndex({ id: 1 }, { unique: true }),
    db.collection('episodes').createIndex({ movie_id: 1, season: 1, episode: 1 }, { unique: true }),

    db.collection('my_list').createIndex({ user_id: 1, movie_id: 1 }, { unique: true }),
    db.collection('watch_progress').createIndex({ user_id: 1, movie_id: 1 }, { unique: true }),

    db.collection('comments').createIndex({ movie_id: 1, created_at: -1 }),
    db.collection('movie_requests').createIndex({ status: 1, created_at: -1 }),
    db.collection('reports').createIndex({ movie_id: 1, created_at: -1 }),
    db.collection('audit_logs').createIndex({ created_at: -1 }),
    db.collection('login_history').createIndex({ user_id: 1, created_at: -1 }),
  ]);

  // ad_settings is a single document — create the default row if missing.
  await db.collection('ad_settings').updateOne(
    { _id: 1 },
    { $setOnInsert: { pre_roll_enabled: true, pre_roll_skip_seconds: 5, updated_at: new Date() } },
    { upsert: true }
  );
}

async function run() {
  console.log('Migrating metfilix MongoDB...');
  await ensureSchema();
  console.log('Migrated (collections + indexes ready)');
  await close();
}

const isCli =
  process.argv[1] != null &&
  import.meta.url.endsWith(
    process.argv[1].replaceAll('\\', '/').split('/').pop(),
  );
if (isCli) run().catch((e) => { console.error(e); process.exit(1); });
