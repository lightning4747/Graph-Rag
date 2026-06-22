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
          <span>{text}</span>
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
