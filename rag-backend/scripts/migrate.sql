-- DDL migration script for clinical-rag

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,       -- bcrypt, salt rounds 12
    role TEXT NOT NULL CHECK (role IN ('doctor', 'reviewer', 'admin')),
    license_num TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quarantine_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id TEXT NOT NULL,
    extraction_payload JSONB NOT NULL,
    errors TEXT[] NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved', 'rejected')),
    reviewer_id UUID REFERENCES users(user_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantine_extractions(status);
CREATE INDEX IF NOT EXISTS idx_quarantine_note_id ON quarantine_extractions(note_id);
