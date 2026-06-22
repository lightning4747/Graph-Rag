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
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Quarantine reject proxy error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
