'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push('/chat');
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('An error occurred. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <main className={styles.card} aria-labelledby="login-title">
        <div className={styles.header}>
          <h1 id="login-title" className={styles.title}>Clinical GraphRAG</h1>
          <p className={styles.subtitle}>Sign in to access secure patient insights</p>
        </div>

        {error && (
          <div className={styles.errorContainer} role="alert" id="login-error-msg">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.inputGroup}>
            <label htmlFor="login-email-input" className={styles.label}>
              Professional Email
            </label>
            <input
              id="login-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="e.g. physician@clinic.org"
              required
              disabled={isLoading}
              aria-required="true"
              aria-describedby={error ? "login-error-msg" : undefined}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="login-password-input" className={styles.label}>
              Password
            </label>
            <input
              id="login-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="••••••••"
              required
              disabled={isLoading}
              aria-required="true"
            />
          </div>

          <button
            id="login-submit-button"
            type="submit"
            className={styles.button}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Verifying Credentials...' : 'Sign In'}
          </button>
        </form>
      </main>
    </div>
  );
}
