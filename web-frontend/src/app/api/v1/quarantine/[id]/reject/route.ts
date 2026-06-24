import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { callBackend } from '@/lib/circuit-breaker';
import { JWT_COOKIE_NAME } from '@/lib/jwt';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(JWT_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const data = await callBackend(
      `/api/v1/quarantine/${encodeURIComponent(id)}/reject`,
      undefined,
      token,
      'POST'
    );
    if (data && data.type === 'circuit_open') {
      return NextResponse.json(
        { error: data.text },
        { status: 503 }
      );
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Quarantine reject proxy error:', error);
    const status = error.status || 500;
    const body = error.body || { error: error.message || 'Internal Server Error' };
    return NextResponse.json(body, { status });
  }
}
