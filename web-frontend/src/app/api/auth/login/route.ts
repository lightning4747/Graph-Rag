import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db';
import { issueJwt, JWT_COOKIE_NAME, JWT_COOKIE_OPTIONS } from '@/lib/jwt';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = await issueJwt({
      user_id: user.user_id,
      role: user.role,
      license_num: user.license_num,
    });

    const response = NextResponse.json({ ok: true });
    
    // Set the cookie on the response
    response.cookies.set(JWT_COOKIE_NAME, token, JWT_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
