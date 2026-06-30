'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../../patients.module.css';
import { formatErrorDetail } from '@/lib/error';

interface User {
  user_id: string;
  role: 'doctor' | 'reviewer' | 'admin';
  license_num: string | null;
}

interface Patient {
  patient_id: string;
  name: string | null;
  birth_date: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
}

interface PatientUpdateProps {
  user: User;
  patient: Patient;
}

export default function PatientUpdate({ user, patient }: PatientUpdateProps) {
  const [name, setName] = useState(patient.name || '');
  const [birthDate, setBirthDate] = useState(patient.birth_date || '');
  const [gender, setGender] = useState(patient.gender || 'Male');
  const [phone, setPhone] = useState(patient.phone || '');
  const [email, setEmail] = useState(patient.email || '');

  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  const router = useRouter();

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
      }
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorBanner('');
    setSuccessBanner('');

    // Validations
    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorBanner('Full Name is required.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (birthDate && birthDate > todayStr) {
      setErrorBanner('Birth Date cannot be in the future.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`/api/v1/patients/${patient.patient_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          birth_date: birthDate,
          gender,
          phone: phone.trim() || null,
          email: email.trim() || null,
        }),
      });

      if (res.ok) {
        setSuccessBanner(`Patient record for ${trimmedName} successfully updated!`);
        setTimeout(() => {
          router.push('/patients');
        }, 1500);
      } else {
        let errorDetail = '';
        try {
          const errJson = await res.json();
          errorDetail = formatErrorDetail(errJson.detail || errJson.error || '');
        } catch {
          errorDetail = await res.text();
        }
        setErrorBanner(errorDetail || 'Failed to update patient record.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database update failed.';
      setErrorBanner(`Network Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Left Sidebar */}
      <aside className={styles.sidebar} aria-label="Session Navigation">
        <div className={styles.sidebarTop}>
          <div className={styles.logoArea}>
            <span className={styles.logoText}>Clinical GraphRAG</span>
          </div>

          <nav className={styles.navLinks} aria-label="Dashboard Navigation">
            <Link href="/chat" className={styles.link}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Clinical Chat</span>
            </Link>

            <Link href="/ingest" className={styles.link}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Ingestion Console</span>
            </Link>

            <Link href="/patients" className={`${styles.link} ${styles.linkActive}`}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Patient Directory</span>
            </Link>

            {(user.role === 'reviewer' || user.role === 'admin') && (
              <Link href="/quarantine" id="nav-quarantine-link" className={styles.link}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Quarantine Console</span>
              </Link>
            )}
          </nav>
        </div>

        <button
          id="logout-button"
          onClick={handleLogout}
          className={styles.logoutBtn}
          aria-label="Log out of session"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>End Session</span>
        </button>
      </aside>

      {/* Main Form Workspace */}
      <main className={styles.mainPanel} aria-label="Update Patient record">
        <header className={styles.headerBar}>
          <span className={styles.headerTitle}>Update Patient Record</span>
          <button
            onClick={() => router.push('/patients')}
            className={styles.btnText}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Directory</span>
          </button>
        </header>

        <section className={styles.contentArea}>
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <h2 className={styles.formTitle}>Demographics Update</h2>
              <p className={styles.formSubtitle}>Edit demographic info. Patient ID cannot be modified.</p>
            </div>

            {errorBanner && (
              <div className={`${styles.alertBanner} ${styles.alertError}`} role="alert">
                <span>⚠ {errorBanner}</span>
              </div>
            )}

            {successBanner && (
              <div className={`${styles.alertBanner} ${styles.alertSuccess}`} role="status">
                <span>✓ {successBanner}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formRow}>
                {/* Patient ID (Read-only) */}
                <div className={styles.inputGroup}>
                  <label htmlFor="patient-id" className={styles.label}>Patient ID (Read-Only)</label>
                  <input
                    id="patient-id"
                    type="text"
                    value={patient.patient_id}
                    className={styles.input}
                    disabled
                  />
                </div>

                {/* Name */}
                <div className={styles.inputGroup}>
                  <label htmlFor="full-name" className={styles.label}>Full Name</label>
                  <input
                    id="full-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className={styles.input}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                {/* Birth Date */}
                <div className={styles.inputGroup}>
                  <label htmlFor="birth-date" className={styles.label}>Birth Date</label>
                  <input
                    id="birth-date"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={styles.input}
                    disabled={isLoading}
                    max={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>

                {/* Gender */}
                <div className={styles.inputGroup}>
                  <label htmlFor="gender" className={styles.label}>Biological Sex</label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={styles.input}
                    disabled={isLoading}
                    required
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                {/* Phone */}
                <div className={styles.inputGroup}>
                  <label htmlFor="phone" className={styles.label}>Phone Number</label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 555-0199"
                    className={styles.input}
                    disabled={isLoading}
                  />
                </div>

                {/* Email */}
                <div className={styles.inputGroup}>
                  <label htmlFor="email" className={styles.label}>Email Address</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. jdoe@example.com"
                    className={styles.input}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className={styles.actionsRow}>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={isLoading || !name.trim() || !birthDate}
                >
                  {isLoading ? 'Updating Record...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
