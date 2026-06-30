'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './quarantine.module.css';

interface User {
  user_id: string;
  role: 'doctor' | 'reviewer' | 'admin';
  license_num: string | null;
}

interface QuarantinedItem {
  id: string;
  note_id: string;
  extraction_payload: Record<string, any>;
  errors: string[];
  status: string;
  created_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
}

interface QuarantineConsoleProps {
  user: User;
  initialItems: QuarantinedItem[];
}

export default function QuarantineConsole({ user, initialItems }: QuarantineConsoleProps) {
  const [items, setItems] = useState<QuarantinedItem[]>(initialItems);
  const [selectedItem, setSelectedItem] = useState<QuarantinedItem | null>(null);
  const [editPayload, setEditPayload] = useState<Record<string, any>>({});
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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

  const openReview = (item: QuarantinedItem) => {
    setErrorBanner('');
    setSuccessBanner('');
    setSelectedItem(item);
    setEditPayload({ ...item.extraction_payload });
  };

  const closeReview = () => {
    setSelectedItem(null);
    setEditPayload({});
  };

  const handleFieldChange = (key: string, value: string) => {
    setEditPayload((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApprove = async () => {
    if (!selectedItem || isSubmitting) return;

    const itemId = selectedItem.id;
    const originalItems = [...items];
    
    // Optimistic UI update: Remove the item from list immediately
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    closeReview();
    setErrorBanner('');
    setSuccessBanner('');
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/v1/quarantine/${itemId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPayload),
      });

      if (res.ok) {
        setSuccessBanner(`Quarantined extraction ${itemId} successfully corrected and approved into Neo4j.`);
      } else {
        const errText = await res.text();
        setErrorBanner(`Failed to approve item: ${errText || 'Unknown error'}`);
        // Restore items list
        setItems(originalItems);
      }
    } catch (err: any) {
      setErrorBanner(`Network error: ${err.message || 'Failed to connect to server.'}`);
      // Restore items list
      setItems(originalItems);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedItem || isSubmitting) return;

    const itemId = selectedItem.id;
    const originalItems = [...items];
    
    // Optimistic UI update: Remove the item from list immediately
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    closeReview();
    setErrorBanner('');
    setSuccessBanner('');
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/v1/quarantine/${itemId}/reject`, {
        method: 'POST',
      });

      if (res.ok) {
        setSuccessBanner(`Quarantined extraction ${itemId} successfully rejected and removed.`);
      } else {
        const errText = await res.text();
        setErrorBanner(`Failed to reject item: ${errText || 'Unknown error'}`);
        // Restore items list
        setItems(originalItems);
      }
    } catch (err: any) {
      setErrorBanner(`Network error: ${err.message || 'Failed to connect to server.'}`);
      // Restore items list
      setItems(originalItems);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine the payload schema keys for editing
  const getPayloadFields = (payload: Record<string, any>) => {
    if ('drug_mentioned_text' in payload) {
      return [
        { key: 'drug_mentioned_text', label: 'Drug Mentioned Text', type: 'text' },
        { key: 'rxnorm_code_guess', label: 'RxNorm Code Guess (Optional)', type: 'text' },
        { key: 'dose_amount_text', label: 'Dose Amount Text', type: 'text' },
        { key: 'frequency_text', label: 'Frequency Text', type: 'text' },
        { key: 'source_sentence', label: 'Source Sentence', type: 'textarea' },
      ];
    }
    if ('condition_mentioned_text' in payload) {
      return [
        { key: 'condition_mentioned_text', label: 'Condition Mentioned Text', type: 'text' },
        { key: 'icd10_guess', label: 'ICD10 Guess (Optional)', type: 'text' },
        { key: 'source_sentence', label: 'Source Sentence', type: 'textarea' },
      ];
    }
    if ('observation_type' in payload) {
      return [
        { key: 'observation_type', label: 'Observation Type', type: 'select', options: ['Symptom', 'LabResult', 'Vitals'] },
        { key: 'value_text', label: 'Value Text', type: 'text' },
        { key: 'source_sentence', label: 'Source Sentence', type: 'textarea' },
      ];
    }
    return Object.keys(payload).map((k) => ({ key: k, label: k, type: 'text' }));
  };

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return 'N/A';
    return new Date(isoStr).toLocaleString();
  };

  return (
    <div className={styles.container}>
      {/* Left Sidebar */}
      <aside className={styles.sidebar} aria-label="Session Navigation">
        <div className={styles.sidebarTop}>
          <div className={styles.logoArea}>
            <span className={styles.logoText}>Quarantine Panel</span>
          </div>

          <nav className={styles.navLinks} aria-label="Dashboard Navigation">
            <Link href="/chat" id="nav-chat-link" className={styles.link}>
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

            <Link href="/patients" className={styles.link}>
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

            <Link href="/quarantine" className={`${styles.link} ${styles.linkActive}`}>
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
          </nav>
        </div>

        <button
          id="nav-logout-btn"
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

      {/* Main Content Area */}
      <main className={styles.mainPanel} aria-label="Quarantine Records Console">
        <header className={styles.headerBar}>
          <span className={styles.headerTitle}>Pending Extractions Audit</span>
          <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '600' }}>Reviewer Mode Active</span>
        </header>

        <section className={styles.contentArea}>
          {errorBanner && (
            <div className={styles.alertBanner} role="alert">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorBanner}</span>
            </div>
          )}

          {successBanner && (
            <div className={styles.successBanner} role="status">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{successBanner}</span>
            </div>
          )}

          {items.length === 0 ? (
            <div className={styles.emptyCard}>
              <h3>No Quarantined Extractions</h3>
              <p style={{ marginTop: '8px', fontSize: '14px' }}>
                All clinical note extractions have successfully passed the grounding validator checks.
              </p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table} id="quarantine-table">
                <thead>
                  <tr>
                    <th className={styles.th}>Note ID</th>
                    <th className={styles.th}>Quarantined Date</th>
                    <th className={styles.th}>Validation Errors</th>
                    <th className={styles.th} style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: '600', fontFamily: 'var(--font-geist-mono)' }}>
                        {item.note_id}
                      </td>
                      <td className={styles.td}>{formatDate(item.created_at)}</td>
                      <td className={styles.td}>
                        <div className={styles.errorList}>
                          {item.errors.map((err, idx) => (
                            <span key={idx} className={styles.errorTag}>
                              {err}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={styles.td} style={{ textAlign: 'right' }}>
                        <button
                          id={`quarantine-review-btn-${item.id}`}
                          onClick={() => openReview(item)}
                          className={styles.reviewBtn}
                          aria-label={`Review quarantined extraction for note ${item.note_id}`}
                        >
                          Review Item
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

      {/* Slide-over Side Review Panel */}
      {selectedItem && (
        <div className={styles.modalOverlay} onClick={closeReview}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="review-title" className={styles.modalTitle}>
                Correct & Ground Extraction
              </h2>
              <button
                id="quarantine-close-modal-btn"
                onClick={closeReview}
                className={styles.closeBtn}
                aria-label="Close review panel"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={styles.errorsBox}>
              <div className={styles.errorsTitle}>Grounding Violations</div>
              <ul>
                {selectedItem.errors.map((err, idx) => (
                  <li key={idx} className={styles.errorItem}>
                    {err}
                  </li>
                ))}
              </ul>
            </div>

            <form onSubmit={(e) => e.preventDefault()}>
              {getPayloadFields(selectedItem.extraction_payload).map((field) => (
                <div key={field.key} className={styles.inputGroup}>
                  <label htmlFor={`quarantine-input-${field.key}`} className={styles.label}>
                    {field.label}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      id={`quarantine-input-${field.key}`}
                      value={editPayload[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className={styles.input}
                      style={{ height: '80px', resize: 'vertical' }}
                      disabled={isSubmitting}
                      required={!(field.key === 'rxnorm_code_guess' || field.key === 'icd10_guess')}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      id={`quarantine-input-${field.key}`}
                      value={editPayload[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className={styles.input}
                      disabled={isSubmitting}
                      required={!(field.key === 'rxnorm_code_guess' || field.key === 'icd10_guess')}
                    >
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`quarantine-input-${field.key}`}
                      type="text"
                      value={editPayload[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className={styles.input}
                      disabled={isSubmitting}
                      required={!(field.key === 'rxnorm_code_guess' || field.key === 'icd10_guess')}
                    />
                  )}
                </div>
              ))}

              <div className={styles.actions}>
                <button
                  id="quarantine-approve-btn"
                  type="button"
                  onClick={handleApprove}
                  className={styles.btnApprove}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Approve with Corrections'}
                </button>
                <button
                  id="quarantine-reject-btn"
                  type="button"
                  onClick={handleReject}
                  className={styles.btnReject}
                  disabled={isSubmitting}
                >
                  Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
