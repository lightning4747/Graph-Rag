import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { JWT_COOKIE_NAME } from '@/lib/jwt';

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(JWT_COOKIE_NAME);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
