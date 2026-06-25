'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './chat.module.css';
import ChatResponse, { QueryResponse } from '@/components/ChatResponse';

interface User {
  user_id: string;
  role: 'doctor' | 'reviewer' | 'admin';
  license_num: string | null;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  response?: QueryResponse;
}

interface ChatDashboardProps {
  user: User;
}

export default function ChatDashboard({ user }: ChatDashboardProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [patientId, setPatientId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userMsgText = question.trim();
    const activePatientId = patientId.trim();
    const newUserMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userMsgText,
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setQuestion('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsgText,
          patient_id: activePatientId ? activePatientId : undefined,
        }),
      });

      if (res.ok) {
        const data: QueryResponse = await res.json();
        const newAssistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          sender: 'assistant',
          text: data.text,
          response: data,
        };
        setMessages((prev) => [...prev, newAssistantMsg]);
      } else {
        // HTTP Error (e.g. 500 or 403)
        let errorDetail = '';
        let returnedType = '';
        try {
          const rawText = await res.text();
          try {
            const errJson = JSON.parse(rawText);
            errorDetail = errJson.detail || errJson.error || '';
            returnedType = errJson.type || '';
          } catch {
            errorDetail = rawText;
          }
        } catch {
          errorDetail = res.statusText || 'Unknown error';
        }

        const isUnavailable = res.status === 503 || res.status === 502 || res.status === 504 || returnedType === 'circuit_open';
        const responseType = isUnavailable ? 'circuit_open' : 'generated';

        let textMsg = '';
        if (isUnavailable) {
          textMsg = errorDetail || `Server is temporarily unavailable (${res.status}).`;
        } else if (res.status === 401) {
          textMsg = `Authentication Error: ${errorDetail || 'Session expired or unauthorized.'} (Status 401).`;
        } else if (res.status === 403) {
          textMsg = `Access Denied: ${errorDetail || 'You do not have permission to query this clinical graph.'} (Status 403).`;
        } else if (res.status === 400) {
          textMsg = `Request Error: ${errorDetail || 'Invalid query parameter or scope.'} (Status 400).`;
        } else {
          textMsg = `Server Error: ${errorDetail || 'Internal server error occurred.'} (Status ${res.status}).`;
        }

        const fallbackMsg: Message = {
          id: `assistant-${Date.now()}`,
          sender: 'assistant',
          text: `Request failed: ${errorDetail}`,
          response: {
            type: responseType,
            text: textMsg,
            facts: [],
          },
        };
        setMessages((prev) => [...prev, fallbackMsg]);
      }
    } catch (err: any) {
      // Network failure / Circuit open from opossum proxy route
      const networkErrorMsg: Message = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: 'The backend service is currently unreachable.',
        response: {
          type: 'circuit_open',
          text: err.message || 'Network connectivity issue or remote service failure.',
          facts: [],
        },
      };
      setMessages((prev) => [...prev, networkErrorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const EXAMPLE_QUERIES = [
    { label: 'Dosage lookup', q: 'What is the max dose of Metformin for Type 2 Diabetes?', pid: '' },
    { label: 'Drug interactions', q: 'Are there any interactions between Metformin and Amlodipine?', pid: '' },
    { label: 'Active prescriptions', q: 'Show active prescriptions for this patient.', pid: 'CASE_9942A' },
    { label: 'Contraindications', q: 'What are the contraindications for Amlodipine?', pid: '' },
    { label: 'Treatment options', q: 'What medications treat Type 2 Diabetes?', pid: '' },
  ];

  const fillExample = (q: string, pid: string) => {
    setQuestion(q);
    setPatientId(pid || '');
  };

  const getRoleBadgeClass = (role: string) => {
    if (role === 'doctor') return styles.badgeDoctor;
    if (role === 'reviewer') return styles.badgeReviewer;
    return styles.badgeAdmin;
  };

  return (
    <div className={styles.container}>
      {/* Left Sidebar */}
      <aside className={styles.sidebar} aria-label="Session Navigation">
        <div className={styles.sidebarTop}>
          <div className={styles.logoArea}>
            <svg
              className={styles.logoIcon}
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span className={styles.logoText}>Clinical GraphRAG</span>
          </div>

          <div className={styles.sessionCard}>
            <span className={styles.sessionTitle}>Authorized Session</span>
            <div className={styles.sessionDetail}>
              <strong>ID:</strong> {user.user_id}
            </div>
            {user.license_num && (
              <div className={styles.sessionDetail}>
                <strong>License:</strong> {user.license_num}
              </div>
            )}
            <span className={`${styles.badge} ${getRoleBadgeClass(user.role)}`}>
              {user.role}
            </span>
          </div>

          <nav className={styles.navLinks} aria-label="Dashboard Navigation">
            <Link href="/chat" className={`${styles.link} ${styles.linkActive}`}>
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
      <main className={styles.mainPanel} aria-label="Clinical Chat Workspace">
        <header className={styles.headerBar}>
          <span className={styles.headerTitle}>Active Consultation</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Deterministic Hallucination Filter: Active</span>
        </header>

        {/* Message Thread */}
        <section
          className={styles.messageArea}
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.length === 0 ? (
            <div className={styles.welcomeCard}>
              <h2 className={styles.welcomeTitle}>Welcome, {user.role === 'admin' ? 'Administrator' : 'Doctor'}</h2>
              <p className={styles.welcomeText}>
                Ask clinical questions about dosage limits, drug interactions, active prescriptions, contraindications,
                or treatment options. All answers are grounded in structured graph records and number-verified.
              </p>
              <div className={styles.exampleSection}>
                <p className={styles.exampleTitle}>
                  Try an example
                </p>
                <div className={styles.exampleList}>
                  {EXAMPLE_QUERIES.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => fillExample(ex.q, ex.pid)}
                      className={styles.exampleButton}
                    >
                      <span className={styles.exampleBadge}>
                        {ex.label}
                        {ex.pid ? ` · Patient ID: ${ex.pid}` : ''}
                      </span>
                      <span className={styles.exampleText}>{ex.q}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={msg.sender === 'user' ? styles.userMsgRow : styles.assistantMsgRow}
              >
                {msg.sender === 'user' ? (
                  <div className={styles.userMsgBubble}>{msg.text}</div>
                ) : (
                  msg.response && <ChatResponse response={msg.response} />
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className={styles.assistantMsgRow}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#64748b',
                  fontSize: '14px',
                  fontStyle: 'italic',
                }}
                aria-busy="true"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: 'spin 1.2s linear infinite' }}
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
                <span>Analyzing clinical graph...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </section>

        {/* Input Area */}
        <footer className={styles.inputArea}>
          <form onSubmit={handleAsk}>
            <div className={styles.optionalRow}>
              <div className={styles.patientInputWrapper}>
                <label htmlFor="chat-patient-id-input" className={styles.patientLabel}>
                  Patient ID (Optional)
                </label>
                <input
                  id="chat-patient-id-input"
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="e.g. CASE_9942A"
                  className={styles.patientInput}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className={styles.form} style={{ marginTop: '8px' }}>
              <div className={styles.textareaWrapper}>
                <textarea
                  id="chat-question-input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk(e);
                    }
                  }}
                  placeholder="e.g. 'What is the max dose of Metformin for Type 2 Diabetes?' — or click an example above"
                  className={styles.textarea}
                  required
                  disabled={isLoading}
                />
              </div>

              <button
                id="chat-submit-button"
                type="submit"
                className={styles.submitBtn}
                disabled={isLoading || !question.trim()}
              >
                <span>Ask Portal</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </form>
        </footer>
      </main>

      {/* Global CSS animation spinner trick */}
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
