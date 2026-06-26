import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { callBackend, CircuitOpenError } from '@/lib/circuit-breaker';
import { JWT_COOKIE_NAME } from '@/lib/jwt';

export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(JWT_COOKIE_NAME)?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = await callBackend('/api/v1/query', body, token);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Query proxy error:', error);
    const status = error.status || 500;
    if (error instanceof CircuitOpenError || error.code === 'EOPENBREAKER') {
      return NextResponse.json(
        {
          type: 'circuit_open',
          text: error.message || 'Backend is currently unavailable. Please try again in a moment.',
          facts: [],
        },
        { status: 503 }
      );
    }
    const body = error.body || { error: error.message || 'Internal Server Error' };
    return NextResponse.json(body, { status });
  }
}
