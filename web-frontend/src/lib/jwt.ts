import { SignJWT, jwtVerify } from 'jose';

function getSecret() {
  const jwtSecret = process.env.JWT_SHARED_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SHARED_SECRET environment variable is not defined");
  }
  return new TextEncoder().encode(jwtSecret);
}

export interface UserPayload {
  user_id: string;
  role: 'doctor' | 'reviewer' | 'admin';
  license_num: string | null;
}

export async function issueJwt(user: UserPayload): Promise<string> {
  return await new SignJWT({
    user_id: user.user_id,
    role: user.role,
    license_num: user.license_num,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret());
}

export async function decodeJwt(token: string): Promise<UserPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    user_id: payload.user_id as string,
    role: payload.role as 'doctor' | 'reviewer' | 'admin',
    license_num: payload.license_num as string | null,
  };
}

export const JWT_COOKIE_NAME = 'token';

export const JWT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 28800, // 8 hours in seconds
  path: '/',
};
