import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { JWT_COOKIE_NAME, decodeJwt } from '@/lib/jwt';
import { callBackend } from '@/lib/circuit-breaker';
import PatientDirectory from './PatientDirectory';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Patient Directory | Clinical GraphRAG',
  description: 'Manage and search patient files in the Clinical GraphRAG system.',
};

export default async function PatientsPage() {
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

  let initialPatients = [];
  try {
    const data = await callBackend('/api/v1/patients', undefined, token, 'GET');
    if (data && (data as { type?: string }).type !== 'circuit_open') {
      initialPatients = data;
    }
  } catch (err) {
    console.error('Failed to load initial patients list:', err);
  }

  return <PatientDirectory user={user} initialPatients={initialPatients} />;
}
