import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') || process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  // tuned for serverless/free-tier Postgres (pooler): few warm conns, fast recycle
  max: Number(process.env.PGPOOL_MAX || 5),
  idleTimeoutMillis: 20000,
  // Fail fast: a DB that can't connect within 8s would otherwise hang past
  // Vercel's ~10s hobby limit → 504. Fast 500s are retried cleanly by clients.
  connectionTimeoutMillis: 8000,
});

pool.on('error', (e) => console.error('PG pool error', e));

export const query = (text, params) => pool.query(text, params);
export const getPool = () => pool;
export default pool;
