'use client';

import styles from './ChatResponse.module.css';
import RawFactsTable from './RawFactsTable';

export interface QueryResponse {
  type: 'generated' | 'fallback_raw_facts' | 'unknown_intent' | 'circuit_open';
  text: string;
  facts: Record<string, any>[];
  intent?: string | null;
}

interface ChatResponseProps {
  response: QueryResponse;
}

export default function ChatResponse({ response }: ChatResponseProps) {
  const { type, text, facts, intent } = response;

  const humanizeIntent = (str: string): string => {
    return str
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  return (
    <div className={styles.container}>
      {intent && intent !== 'unknown' && (
        <span className={styles.intentBadge}>
          Intent: {humanizeIntent(intent)}
        </span>
      )}

      {type === 'generated' && (
        <div className={`${styles.bubble} ${styles.generated}`}>
          <p>{text}</p>
        </div>
      )}

      {type === 'fallback_raw_facts' && (
        <div className={styles.fallbackCard}>
          <div className={styles.disclaimer}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{text}</span>
          </div>
          <RawFactsTable facts={facts} />
        </div>
      )}

      {type === 'unknown_intent' && (
        <div className={styles.unknown}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <strong>This question could not be handled by the current clinical question support.</strong>
          </div>
          <p style={{ fontSize: '13px', marginBottom: '10px', opacity: 0.8 }}>
            This system only answers specific clinical question types. Try rephrasing as one of:
          </p>
          <ul style={{ fontSize: '13px', paddingLeft: '18px', lineHeight: '1.8', opacity: 0.85 }}>
            <li><strong>Dosage lookup</strong> — &ldquo;What is the max dose of Metformin for Type 2 Diabetes?&rdquo;</li>
            <li><strong>Drug interactions</strong> — &ldquo;Are there interactions between Metformin and Amlodipine?&rdquo;</li>
            <li><strong>Active prescriptions</strong> — &ldquo;Show active prescriptions for this patient.&rdquo; (+ Patient ID)</li>
            <li><strong>Contraindications</strong> — &ldquo;What are the contraindications for Amlodipine?&rdquo;</li>
            <li><strong>Treatment options</strong> — &ldquo;What medications treat Type 2 Diabetes?&rdquo;</li>
          </ul>
        </div>
      )}

      {type === 'circuit_open' && (
        <div className={styles.errorCard}>
          <div className={styles.errorTitle}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>System Unavailable</span>
          </div>
          <p className={styles.errorText}>{text}</p>
        </div>
      )}
    </div>
  );
}
