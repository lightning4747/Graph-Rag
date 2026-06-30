import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { JWT_COOKIE_NAME, decodeJwt } from '@/lib/jwt';
import { callBackend } from '@/lib/circuit-breaker';
import PatientUpdate from './PatientUpdate';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Update Patient | Clinical GraphRAG',
  description: 'Update patient demographics in the Clinical GraphRAG system.',
};

export default async function UpdatePatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  let patient = null;
  try {
    const data = await callBackend(`/api/v1/patients/${id}`, undefined, token, 'GET');
    if (data && (data as { type?: string }).type !== 'circuit_open') {
      patient = data;
    }
  } catch (err) {
    console.error(`Failed to load patient ${id} details:`, err);
  }

  if (!patient) {
    redirect('/patients');
  }

  return <PatientUpdate user={user} patient={patient} />;
}
