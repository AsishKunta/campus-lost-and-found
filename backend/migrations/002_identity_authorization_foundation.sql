-- Schema foundations for trusted identity and authorization.
-- Authentication behavior is intentionally not implemented in this phase.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'student';

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS user_id INTEGER;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_user_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_user_id_fkey'
      AND conrelid = 'reports'::regclass
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT reports_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_sender_user_id_fkey'
      AND conrelid = 'messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_sender_user_id_fkey
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('student', 'admin')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_category_check'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT reports_category_check
      CHECK (category IN ('Lost', 'Found')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_status_check'
  ) THEN
    ALTER TABLE claims
      ADD CONSTRAINT claims_status_check
      CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_role_check'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_sender_role_check
      CHECK (sender_role IN ('student', 'admin')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_recipient_role_check'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_recipient_role_check
      CHECK (recipient_role IN ('student', 'admin')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_expiry_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_expiry_check
      CHECK (expires_at > created_at);
  END IF;
END
$$;

-- Existing installations may contain historical values that do not satisfy
-- new controlled-state checks. NOT VALID preserves those rows while enforcing
-- each constraint for all new and changed data.

CREATE UNIQUE INDEX IF NOT EXISTS claims_one_approved_per_report_idx
  ON claims (report_id)
  WHERE status = 'approved' AND report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_user_id_idx
  ON sessions (user_id);

CREATE INDEX IF NOT EXISTS sessions_active_expiry_idx
  ON sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS reports_user_id_idx
  ON reports (user_id);

CREATE INDEX IF NOT EXISTS reports_matching_lookup_idx
  ON reports (category, item_category, date_found);

CREATE INDEX IF NOT EXISTS reports_claim_status_idx
  ON reports (claim_status);

CREATE INDEX IF NOT EXISTS claims_user_id_idx
  ON claims (user_id);

CREATE INDEX IF NOT EXISTS claims_report_id_idx
  ON claims (report_id);

CREATE INDEX IF NOT EXISTS claims_student_email_idx
  ON claims (LOWER(student_email));

CREATE INDEX IF NOT EXISTS claims_status_idx
  ON claims (status);

CREATE INDEX IF NOT EXISTS messages_claim_created_at_idx
  ON messages (claim_id, created_at);

CREATE INDEX IF NOT EXISTS messages_sender_user_id_idx
  ON messages (sender_user_id);

