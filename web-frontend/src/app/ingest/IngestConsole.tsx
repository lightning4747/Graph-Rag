'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './ingest.module.css';
import { formatErrorDetail } from '@/lib/error';

interface User {
  user_id: string;
  role: 'doctor' | 'reviewer' | 'admin';
  license_num: string | null;
}

interface IngestResponse {
  note_id: string;
  written: string[];
  quarantined: Array<{
    type: 'prescription' | 'condition' | 'observation' | string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: Record<string, any>;
    errors: string[];
  }>;
}

interface IngestConsoleProps {
  user: User;
}

// Autocomplete patient pool config
const PATIENTS_POOL = [
  'CASE_9942A',
  'PATIENT_QUARANTINE_TEST',
  'CASE_interaction_test_patient',
  'CASE_contraindication_test_patient',
  'CASE_dosage_test_patient'
];

export default function IngestConsole({ user }: IngestConsoleProps) {
  // Lazy state initializations from localStorage/defaults
  const [patientId, setPatientId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('clinical-rag-draft');
        if (cached) {
          const draft = JSON.parse(cached);
          return draft.patientId || '';
        }
      } catch {}
    }
    return '';
  });

  const [encounterDate, setEncounterDate] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('clinical-rag-draft');
        if (cached) {
          const draft = JSON.parse(cached);
          if (draft.encounterDate) return draft.encounterDate;
        }
      } catch {}
    }
    return new Date().toISOString().split('T')[0];
  });

  const [encounterType, setEncounterType] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('clinical-rag-draft');
        if (cached) {
          const draft = JSON.parse(cached);
          return draft.encounterType || 'Outpatient';
        }
      } catch {}
    }
    return 'Outpatient';
  });

  const [noteText, setNoteText] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('clinical-rag-draft');
        if (cached) {
          const draft = JSON.parse(cached);
          return draft.noteText || '';
        }
      } catch {}
    }
    return '';
  });
  
  // Drag and drop state
  const [isDragActive, setIsDragActive] = useState(false);
  
  // Loading & Submission state
  const [isLoading, setIsLoading] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(0);
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [result, setResult] = useState<IngestResponse | null>(null);

  const router = useRouter();

  const [filteredPatients, setFilteredPatients] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const patientInputWrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save draft dynamically as user types
  useEffect(() => {
    if (isLoading) return; // Don't cache during submission
    const draft = { patientId, encounterDate, encounterType, noteText };
    try {
      localStorage.setItem('clinical-rag-draft', JSON.stringify(draft));
    } catch {
      console.warn('Failed to update local draft cache');
    }
  }, [patientId, encounterDate, encounterType, noteText, isLoading]);

  // Debounced search logic for patient autocomplete (fully asynchronous)
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = patientId.trim();
      if (trimmed.length < 2) {
        setFilteredPatients([]);
        setShowSuggestions(false);
        return;
      }
      const matches = PATIENTS_POOL.filter(p =>
        p.toLowerCase().includes(trimmed.toLowerCase())
      );
      setFilteredPatients(matches);
      setShowSuggestions(matches.length > 0);
      setHighlightedIndex(-1);
    }, 200);

    return () => clearTimeout(handler);
  }, [patientId]);

  // Click outside listener for suggestions list
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (patientInputWrapperRef.current && !patientInputWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePatientInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || filteredPatients.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % filteredPatients.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + filteredPatients.length) % filteredPatients.length);
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < filteredPatients.length) {
        e.preventDefault();
        setPatientId(filteredPatients[highlightedIndex]);
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const processFile = (file: File) => {
    const isTxt = file.type === 'text/plain' || file.name.endsWith('.txt');
    const isMd = file.name.endsWith('.md');
    
    if (isTxt || isMd) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setNoteText(event.target.result as string);
        }
      };
      reader.readAsText(file);
    } else {
      setErrorBanner('Unsupported file format. Please upload a .txt or .md clinical note.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDropzoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to clear the current draft note?')) {
      setPatientId('');
      const today = new Date().toISOString().split('T')[0];
      setEncounterDate(today);
      setEncounterType('Outpatient');
      setNoteText('');
      setErrorBanner('');
      setSuccessBanner('');
      setResult(null);
      try {
        localStorage.removeItem('clinical-rag-draft');
      } catch {
        // ignore
      }
    }
  };

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

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorBanner('');
    setSuccessBanner('');
    setResult(null);

    // Front-end Validation
    const trimmedPatientId = patientId.trim();
    const trimmedNote = noteText.trim();
    
    if (!trimmedPatientId) {
      setErrorBanner('Patient ID is required.');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedPatientId)) {
      setErrorBanner('Patient ID must only contain alphanumeric characters, underscores, or dashes (no spaces).');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (encounterDate > todayStr) {
      setErrorBanner('Encounter date cannot be in the future.');
      return;
    }

    if (trimmedNote.length < 15) {
      setErrorBanner('Clinical note text is too short. Please input a valid note (minimum 15 characters).');
      return;
    }

    setIsLoading(true);
    setPipelineStage(1);

    // Simulate pipeline stage step-ups for UX visual progress
    const timer1 = setTimeout(() => setPipelineStage(2), 800);
    const timer2 = setTimeout(() => setPipelineStage(3), 2000);

    try {
      const res = await fetch('/api/v1/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: trimmedPatientId,
          encounter_date: encounterDate,
          encounter_type: encounterType,
          note_text: trimmedNote,
        }),
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      if (res.ok) {
        const data: IngestResponse = await res.json();
        setResult(data);
        
        // Remove draft cached note on successful submission
        try {
          localStorage.removeItem('clinical-rag-draft');
        } catch {}

        const totalQuarantined = data.quarantined.length;
        if (totalQuarantined === 0) {
          setSuccessBanner(`Clinical note parsed successfully! All clinical entities written to Neo4j Graph. Note ID: ${data.note_id}`);
        } else {
          setErrorBanner(`Ingestion complete with warnings: ${totalQuarantined} entities failed grounding checks and were quarantined.`);
        }
      } else {
        let errorDetail = '';
        try {
          const errJson = await res.json();
          errorDetail = formatErrorDetail(errJson.detail || errJson.error || '');
        } catch {
          errorDetail = await res.text();
        }
        setErrorBanner(`Ingestion failed: ${errorDetail || res.statusText || 'Unknown error'}`);
      }
    } catch (err: unknown) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      const errMsg = err instanceof Error ? err.message : 'The ingestion service is currently unreachable.';
      setErrorBanner(`Network Error: ${errMsg}`);
    } finally {
      setIsLoading(false);
      setPipelineStage(0);
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

            <Link href="/ingest" className={`${styles.link} ${styles.linkActive}`}>
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

      {/* Right Main Panel */}
      <main className={styles.mainPanel} aria-label="Ingestion Workspace">
        <header className={styles.headerBar}>
          <span className={styles.headerTitle}>Ingestion Console</span>
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

        {/* Content Area */}
        <section className={styles.contentArea}>
          {/* Left Pane: note editor */}
          <div className={styles.pane}>
            <div>
              <h2 className={styles.paneTitle}>Clinical Record Ingest</h2>
              <p className={styles.paneSubtitle}>Input patient encounter metadata and paste raw clinical notes to index them in Clinical GraphRAG.</p>
            </div>

            <form onSubmit={handleIngest} className={styles.form}>
              <div className={styles.metadataRow}>
                {/* Patient ID with autocomplete */}
                <div className={styles.inputGroup} ref={patientInputWrapperRef}>
                  <label htmlFor="patient-id-input" className={styles.label}>Patient ID</label>
                  <input
                    id="patient-id-input"
                    type="text"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    onKeyDown={handlePatientInputKeyDown}
                    onFocus={() => {
                      if (patientId.trim().length >= 2 && filteredPatients.length > 0) {
                        setShowSuggestions(true);
                      }
                    }}
                    placeholder="e.g. CASE_9942A"
                    className={styles.input}
                    disabled={isLoading}
                    required
                    autoComplete="off"
                  />
                  {showSuggestions && filteredPatients.length > 0 && (
                    <ul className={styles.suggestionsList} role="listbox">
                      {filteredPatients.map((pat, idx) => (
                        <li
                          key={pat}
                          role="option"
                          aria-selected={idx === highlightedIndex}
                          className={`${styles.suggestionItem} ${idx === highlightedIndex ? styles.suggestionItemHovered : ''}`}
                          onClick={() => {
                            setPatientId(pat);
                            setShowSuggestions(false);
                          }}
                        >
                          {pat}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Encounter Date */}
                <div className={styles.inputGroup}>
                  <label htmlFor="encounter-date" className={styles.label}>Encounter Date</label>
                  <input
                    id="encounter-date"
                    type="date"
                    value={encounterDate}
                    onChange={(e) => setEncounterDate(e.target.value)}
                    className={styles.input}
                    disabled={isLoading}
                    max={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
              </div>

              {/* Encounter Type */}
              <div className={styles.inputGroup}>
                <label htmlFor="encounter-type" className={styles.label}>Encounter Type</label>
                <select
                  id="encounter-type"
                  value={encounterType}
                  onChange={(e) => setEncounterType(e.target.value)}
                  className={styles.input}
                  disabled={isLoading}
                  required
                >
                  <option value="Outpatient">Outpatient Consultation</option>
                  <option value="Inpatient">Inpatient Admission</option>
                  <option value="Emergency">Emergency Department</option>
                  <option value="Telehealth">Telehealth / Remote Visit</option>
                  <option value="Ambulatory">Ambulatory Care</option>
                </select>
              </div>

              {/* File Dropzone */}
              <div
                className={`${styles.dropzone} ${isDragActive ? styles.dropzoneActive : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={handleDropzoneClick}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".txt,.md"
                  style={{ display: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                />
                <svg
                  className={styles.dropzoneIcon}
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div className={styles.dropzoneText}>
                  Drag & Drop a note (.txt, .md) or click below to write
                </div>
                <div className={styles.dropzoneSubtext}>Maximum file size 5MB</div>
              </div>

              {/* Textarea */}
              <div className={styles.inputGroup}>
                <label htmlFor="note-text-area" className={styles.label}>Clinical Note Text</label>
                <textarea
                  id="note-text-area"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Paste or write the patient's clinical note here..."
                  className={styles.textarea}
                  disabled={isLoading}
                  required
                />
                <div className={styles.counterRow}>
                  <span>{noteText.length} characters • {noteText.split(/\s+/).filter(Boolean).length} words</span>
                </div>
              </div>

              <div className={styles.actionsRow}>
                <button
                  type="button"
                  onClick={handleReset}
                  className={styles.resetBtn}
                  disabled={isLoading}
                >
                  Reset Draft
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={isLoading || !noteText.trim() || !patientId.trim()}
                >
                  {isLoading ? 'Running Verification...' : 'Submit Note Ingest'}
                </button>
              </div>
            </form>
          </div>

          {/* Right Pane: results and loading feedback */}
          <div className={styles.pane} style={{ position: 'relative' }}>
            <h2 className={styles.paneTitle}>Extraction Feedback</h2>
            
            {/* Empty State */}
            {!isLoading && !result && !errorBanner && !successBanner && (
              <div className={styles.emptyReport}>
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className={styles.emptyReportText}>
                  Waiting for document upload.<br />
                  Submit a clinical note to see extracted entities, grounding checks, and database status in real-time.
                </p>
              </div>
            )}

            {/* Error Banner */}
            {errorBanner && !isLoading && (
              <div className={`${styles.alertBanner} ${styles.alertWarning}`} role="alert">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <h4 style={{ fontWeight: '600' }}>Warning / Errors Encountered</h4>
                  <p style={{ marginTop: '2px', fontSize: '13px' }}>{errorBanner}</p>
                </div>
              </div>
            )}

            {/* Success Banner */}
            {successBanner && !isLoading && (
              <div className={`${styles.alertBanner} ${styles.alertSuccess}`} role="status">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div>
                  <h4 style={{ fontWeight: '600' }}>Success</h4>
                  <p style={{ marginTop: '2px', fontSize: '13px' }}>{successBanner}</p>
                </div>
              </div>
            )}

            {/* Ingestion Loading Pipeline Feedback */}
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ animation: 'spin 1.2s linear infinite', color: 'hsl(var(--primary))' }}
                  >
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                  <h3 style={{ marginTop: '16px', fontWeight: '600' }}>Processing Ingest</h3>
                  <p style={{ fontSize: '13px', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>AI pipeline extracting and verifying clinical context</p>
                </div>

                <div className={styles.progressList}>
                  <div className={styles.progressItem}>
                    {pipelineStage >= 1 ? (
                      <span className={styles.progressLabelDone}>✓ Note Sent to Secure Ingest Proxy</span>
                    ) : (
                      <span className={styles.progressLabelPending}>○ Note Sent to Secure Ingest Proxy</span>
                    )}
                  </div>
                  <div className={styles.progressItem}>
                    {pipelineStage >= 2 ? (
                      pipelineStage === 2 ? (
                        <span className={styles.progressLabelActive}>▶ Running LLM Medical Entity Extraction...</span>
                      ) : (
                        <span className={styles.progressLabelDone}>✓ Medical Entities Extracted</span>
                      )
                    ) : (
                      <span className={styles.progressLabelPending}>○ Running LLM Medical Entity Extraction</span>
                    )}
                  </div>
                  <div className={styles.progressItem}>
                    {pipelineStage >= 3 ? (
                      <span className={styles.progressLabelActive}>▶ Verifying Clinical Grounding & Writing Graph...</span>
                    ) : (
                      <span className={styles.progressLabelPending}>○ Verifying Clinical Grounding & Writing Graph</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Results Output Viewer */}
            {result && !isLoading && (
              <div className={styles.resultsSummary}>
                <div>
                  <span style={{ fontSize: '11px', color: 'hsl(var(--text-subtle))' }}>INGESTED NOTE ID</span>
                  <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>
                    {result.note_id}
                  </div>
                </div>

                {/* Written Section (Neo4j) */}
                <div className={styles.resultsSection}>
                  <h3 className={styles.sectionHeading}>Written to Neo4j Knowledge Graph ({result.written.length})</h3>
                  {result.written.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'hsl(var(--text-subtle))', fontStyle: 'italic' }}>
                      No entities successfully passed the verifier grounding checks.
                    </div>
                  ) : (
                    <div className={styles.entityGrid}>
                      {result.written.map((item, idx) => {
                        const [category, code] = item.split(':');
                        return (
                          <div key={idx} className={`${styles.entityCard} ${styles.entityCardSuccess}`}>
                            <div className={styles.entityHeader}>
                              <span className={styles.entityTitle}>{code}</span>
                              <span style={{
                                fontSize: '10px',
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'hsla(140, 12%, 55%, 0.1)',
                                color: 'hsl(var(--success))',
                                fontWeight: 'bold',
                                border: '1px solid hsla(140, 12%, 55%, 0.2)'
                              }}>{category}</span>
                            </div>
                            <div className={styles.entityDetails}>
                              Grounded status: Written & linked to active consultation.
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Quarantined Section (PostgreSQL) */}
                <div className={styles.resultsSection}>
                  <h3 className={styles.sectionHeading}>Quarantined & Flagged for Review ({result.quarantined.length})</h3>
                  {result.quarantined.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'hsl(var(--success))', fontWeight: '500' }}>
                      Zero violations found. Clear grounding check match.
                    </div>
                  ) : (
                    <div className={styles.entityGrid}>
                      {result.quarantined.map((item, idx) => {
                        return (
                          <div key={idx} className={`${styles.entityCard} ${styles.entityCardWarning}`}>
                            <div className={styles.entityHeader}>
                              <span className={styles.entityTitle} style={{ color: 'hsl(var(--warning))' }}>
                                {item.type === 'prescription' ? item.payload.drug_mentioned_text : item.type === 'condition' ? item.payload.condition_mentioned_text : item.payload.observation_type}
                              </span>
                              <span style={{
                                fontSize: '10px',
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'hsla(35, 45%, 50%, 0.1)',
                                color: 'hsl(var(--warning))',
                                fontWeight: 'bold',
                                border: '1px solid hsla(35, 45%, 50%, 0.2)'
                              }}>{item.type}</span>
                            </div>
                            <div className={styles.entityDetails}>
                              {item.type === 'prescription' && (
                                <p>Extracted Dose: {item.payload.dose_amount_text || 'N/A'} • Frequency: {item.payload.frequency_text || 'N/A'}</p>
                              )}
                              {item.type === 'condition' && (
                                <p>ICD-10 Guess: {item.payload.icd10_guess || 'N/A'}</p>
                              )}
                              {item.type === 'observation' && (
                                <p>Value: {item.payload.value_text || 'N/A'}</p>
                              )}
                              
                              <ul className={styles.errorList}>
                                {item.errors.map((err, errIdx) => (
                                  <li key={errIdx} className={styles.errorText}>⚠ {err}</li>
                                ))}
                              </ul>

                              {(user.role === 'reviewer' || user.role === 'admin') && (
                                <button
                                  type="button"
                                  onClick={() => router.push('/quarantine')}
                                  className={styles.btnQuarantineAudit}
                                >
                                  Go to Quarantine Console to audit item
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Global CSS spinner rule */}
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
