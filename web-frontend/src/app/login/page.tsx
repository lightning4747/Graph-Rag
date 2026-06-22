import type { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Login | Clinical GraphRAG Portal',
  description: 'Secure authentication gateway for authorized clinical staff and system administrators.',
};

export default function LoginPage() {
  return <LoginForm />;
}

