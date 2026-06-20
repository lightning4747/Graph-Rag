import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { JWT_COOKIE_NAME } from '@/lib/jwt';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(JWT_COOKIE_NAME)?.value;

  if (token) {
    redirect('/chat');
  } else {
    redirect('/login');
  }
}
