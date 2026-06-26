/**
 * withAuth — shared authentication guard for all API route handlers.
 *
 * Reads the httpOnly JWT cookie and returns the raw token string.
 * Returns a NextResponse 401 if no token is present.
 *
 * Usage in a route handler:
 *   const result = await withAuth();
 *   if (result.error) return result.error;
 *   const { token } = result;
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { JWT_COOKIE_NAME } from '@/lib/jwt';

type AuthSuccess = { token: string; error: null };
type AuthFailure = { token: null; error: NextResponse };

export async function withAuth(): Promise<AuthSuccess | AuthFailure> {
  const cookieStore = await cookies();
  const token = cookieStore.get(JWT_COOKIE_NAME)?.value;

  if (!token) {
    return {
      token: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { token, error: null };
}
