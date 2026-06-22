import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { JWT_COOKIE_NAME, decodeJwt } from '@/lib/jwt';
import ChatDashboard from './ChatDashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Clinical Chat | Clinical GraphRAG',
  description: 'Interactive clinical Regimen Query Tool with automatic numeric safety filters.',
};

export default async function ChatPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(JWT_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/login');
  }

  let user;
  try {
    user = await decodeJwt(token);
  } catch (err) {
    redirect('/login');
  }

  return <ChatDashboard user={user} />;
}

