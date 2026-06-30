import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { JWT_COOKIE_NAME, decodeJwt } from '@/lib/jwt';
import PatientCreate from './PatientCreate';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Patient | Clinical GraphRAG',
  description: 'Add a new patient node to the Clinical GraphRAG system.',
};

export default async function CreatePatientPage() {
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

  return <PatientCreate user={user} />;
}
