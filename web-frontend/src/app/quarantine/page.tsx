import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { JWT_COOKIE_NAME, decodeJwt } from '@/lib/jwt';
import { callBackend } from '@/lib/circuit-breaker';
import QuarantineConsole from './QuarantineConsole';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quarantine Console | Clinical GraphRAG',
  description: 'Audit system for ungrounded and confusable clinical extractions requiring human review.',
};

export default async function QuarantinePage() {
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

  // Double check authorization (doctor should be redirected to chat)
  if (user.role === 'doctor') {
    redirect('/chat');
  }

  let initialItems = [];
  try {
    initialItems = await callBackend(
      '/api/v1/quarantine?status_filter=pending_review',
      undefined,
      token,
      'GET'
    );
    // If backend returns open circuit fallback, default to empty list
    if (initialItems && (initialItems as any).type === 'circuit_open') {
      initialItems = [];
    }
  } catch (err) {
    console.error('Failed to load initial quarantined items:', err);
  }

  return <QuarantineConsole user={user} initialItems={initialItems} />;
}
