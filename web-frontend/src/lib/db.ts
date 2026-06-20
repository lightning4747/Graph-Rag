import { Pool } from 'pg';

// Prevent multiple pools during Next.js hot-reloading in development
const globalForPg = global as unknown as { pgPool?: Pool };

export const pool = globalForPg.pgPool || new Pool({
  connectionString: process.env.AUTH_DB_DSN,
});

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}

export interface DbUser {
  user_id: string;
  email: string;
  password_hash: string;
  role: 'doctor' | 'reviewer' | 'admin';
  license_num: string | null;
  created_at: Date;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const query = 'SELECT user_id, email, password_hash, role, license_num, created_at FROM users WHERE email = $1';
  const res = await pool.query(query, [email]);
  if (res.rows.length === 0) {
    return null;
  }
  return res.rows[0] as DbUser;
}
