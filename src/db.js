import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') || process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  // tuned for serverless/free-tier Postgres (pooler): few warm conns, fast recycle
  max: Number(process.env.PGPOOL_MAX || 5),
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (e) => console.error('PG pool error', e));

export const query = (text, params) => pool.query(text, params);
export const getPool = () => pool;
export default pool;
