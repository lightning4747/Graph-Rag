import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { JWT_COOKIE_NAME, decodeJwt } from '@/lib/jwt';
import IngestConsole from './IngestConsole';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ingestion Console | Clinical GraphRAG',
  description: 'Secure clinical note parser and verification pipeline.',
};

export default async function IngestPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(JWT_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/login');
  }

  let user;
  try {
    user = await decodeJwt(token);
  } catch {
    redirect('/login');
  }

  return <IngestConsole user={user} />;
}
