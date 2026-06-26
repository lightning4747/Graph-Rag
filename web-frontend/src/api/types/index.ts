/**
 * Shared API types for the Next.js server-side proxy layer.
 *
 * These are the canonical shapes that both controllers and route handlers
 * code against. Frontend components import from @/components or this file —
 * never from individual route.ts files.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  ok: true;
}

// ---------------------------------------------------------------------------
// Query  (mirrors spec/plan.md §Phase 5 QueryResponse schema)
// ---------------------------------------------------------------------------

export type QueryResponseType =
  | 'generated'
  | 'fallback_raw_facts'
  | 'unknown_intent'
  | 'circuit_open'; // frontend-only synthetic type when circuit breaker is open

export interface QueryRequest {
  question: string;
  patient_id?: string;
}

export interface QueryResponse {
  type: QueryResponseType;
  text: string;
  facts: Record<string, unknown>[];
  intent?: string | null;
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export interface IngestRequest {
  note_text: string;
  note_id?: string | null;
}

export interface IngestResponse {
  note_id: string;
  written: unknown[];
  quarantined: unknown[];
}

// ---------------------------------------------------------------------------
// Quarantine
// ---------------------------------------------------------------------------

export type QuarantineStatus = 'pending_review' | 'approved' | 'rejected';

export interface QuarantineItem {
  id: string;
  note_id: string;
  extraction_payload: Record<string, unknown>;
  errors: string[];
  status: QuarantineStatus;
  created_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
}

export interface QuarantineActionResponse {
  ok: boolean;
  status: QuarantineStatus;
}

// ---------------------------------------------------------------------------
// Shared error shape
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
}
