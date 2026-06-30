import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { callBackend } from '@/lib/circuit-breaker';
import { JWT_COOKIE_NAME } from '@/lib/jwt';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(JWT_COOKIE_NAME)?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await callBackend('/api/v1/patients', undefined, token, 'GET');
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Patients GET proxy error:', error);
    const status = error.status || 500;
    const body = error.body || { error: error.message || 'Internal Server Error' };
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(JWT_COOKIE_NAME)?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = await callBackend('/api/v1/patients', body, token, 'POST');
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Patients POST proxy error:', error);
    const status = error.status || 500;
    const body = error.body || { error: error.message || 'Internal Server Error' };
    return NextResponse.json(body, { status });
  }
}
