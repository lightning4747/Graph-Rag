import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwt, JWT_COOKIE_NAME } from './lib/jwt';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(JWT_COOKIE_NAME)?.value;
  const path = request.nextUrl.pathname;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = await decodeJwt(token);

    // If user is a doctor and trying to access /quarantine, redirect to /chat
    if (payload.role === 'doctor' && path.startsWith('/quarantine')) {
      return NextResponse.redirect(new URL('/chat', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware JWT verification failed:', error);
    // Invalid token -> clear cookie and redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(JWT_COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    '/',
    '/chat/:path*',
    '/quarantine/:path*',
    '/ingest/:path*',
    '/patients/:path*',
  ],
};
