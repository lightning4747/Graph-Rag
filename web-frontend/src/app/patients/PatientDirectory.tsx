'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './patients.module.css';

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

interface PatientDirectoryProps {
  user: User;
  initialPatients: Patient[];
}

export default function PatientDirectory({ user, initialPatients }: PatientDirectoryProps) {
  const [patients] = useState<Patient[]>(initialPatients);
  const [searchQuery, setSearchQuery] = useState('');
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

  // Filter patients dynamically based on ID or Name
  const filteredPatients = patients.filter((patient) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    
    const matchesId = patient.patient_id.toLowerCase().includes(q);
    const matchesName = patient.name ? patient.name.toLowerCase().includes(q) : false;
    
    return matchesId || matchesName;
  });

  const getGenderBadgeClass = (gender: string | null) => {
    if (!gender) return '';
    const g = gender.toLowerCase();
    if (g === 'male') return `${styles.patientGenderBadge} ${styles.genderMale}`;
    if (g === 'female') return `${styles.patientGenderBadge} ${styles.genderFemale}`;
    return `${styles.patientGenderBadge} ${styles.genderOther}`;
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

      {/* Main Directory Workspace */}
      <main className={styles.mainPanel} aria-label="Patient Registry Console">
        <header className={styles.headerBar}>
          <span className={styles.headerTitle}>Patient Directory</span>
          <span style={{ fontSize: '12px', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '6px' }}>
            User Role: <span className={user.role === 'doctor' ? styles.badgeDoctor : user.role === 'reviewer' ? styles.badgeReviewer : styles.badgeAdmin} style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: '600',
              textTransform: 'capitalize',
              border: '1px solid currentColor',
              backgroundColor: 'transparent'
            }}>{user.role}</span>
          </span>
        </header>

        <section className={styles.contentArea}>
          {/* Search and Action Bar */}
          <div className={styles.searchBarRow}>
            <div className={styles.searchWrapper}>
              <svg
                className={styles.searchIcon}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Patient ID or Name..."
                className={styles.searchInput}
              />
            </div>
            <button
              onClick={() => router.push('/patients/create')}
              className={styles.btnPrimary}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create Patient</span>
            </button>
          </div>

          {/* Table Directory */}
          {filteredPatients.length === 0 ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyStateTitle}>No Patients Found</h3>
              <p className={styles.emptyStateText}>
                {searchQuery ? `No records match the filter query "${searchQuery}".` : 'The patient registry is empty.'}
              </p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Patient ID</th>
                    <th className={styles.th}>Full Name</th>
                    <th className={styles.th}>Birth Date</th>
                    <th className={styles.th}>Gender</th>
                    <th className={styles.th}>Phone</th>
                    <th className={styles.th}>Email</th>
                    <th className={styles.th} style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient.patient_id} className={styles.tr}>
                      <td className={`${styles.td} ${styles.patientIdCol}`}>
                        {patient.patient_id}
                      </td>
                      <td className={styles.td} style={{ fontWeight: '500' }}>
                        {patient.name || 'N/A'}
                      </td>
                      <td className={styles.td}>
                        {patient.birth_date || 'N/A'}
                      </td>
                      <td className={styles.td}>
                        {patient.gender ? (
                          <span className={getGenderBadgeClass(patient.gender)}>
                            {patient.gender}
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className={styles.td}>
                        {patient.phone || 'N/A'}
                      </td>
                      <td className={styles.td} style={{ color: 'hsl(var(--text-muted))' }}>
                        {patient.email || 'N/A'}
                      </td>
                      <td className={styles.td} style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => router.push(`/patients/update/${patient.patient_id}`)}
                          className={styles.btnSecondary}
                        >
                          Update Record
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
