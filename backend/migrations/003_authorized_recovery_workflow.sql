-- Phase 3: normalized roles, authorized recovery workflow, notifications,
-- claim lifecycle/history, and durable match relationships.

CREATE TABLE user_roles (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

INSERT INTO user_roles (user_id, role)
SELECT id, CASE WHEN role = 'admin' THEN 'admin' ELSE 'student' END
FROM users
ON CONFLICT DO NOTHING;

ALTER TABLE users
  ADD COLUMN preferred_workspace VARCHAR(20) NOT NULL DEFAULT 'student';

ALTER TABLE users
  ADD CONSTRAINT users_preferred_workspace_check
  CHECK (preferred_workspace IN ('student', 'admin'));

UPDATE users SET preferred_workspace = 'admin' WHERE role = 'admin';

ALTER TABLE reports
  ADD COLUMN lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'active',
  ADD COLUMN closed_at TIMESTAMPTZ,
  ADD COLUMN closed_reason TEXT;

ALTER TABLE reports
  ADD CONSTRAINT reports_lifecycle_status_check
  CHECK (lifecycle_status IN ('active', 'closed_by_student', 'returned', 'archived'));

ALTER TABLE claims
  ADD COLUMN lost_report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 days'),
  ADD COLUMN rejection_type VARCHAR(20),
  ADD COLUMN rejection_reason TEXT,
  ADD COLUMN closed_at TIMESTAMPTZ;

ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_status_check;
ALTER TABLE claims
  ADD CONSTRAINT claims_status_check
  CHECK (status IN (
    'pending', 'under_review', 'approved', 'rejected', 'automatically_rejected',
    'cancelled', 'expired'
  )) NOT VALID;

ALTER TABLE claims
  ADD CONSTRAINT claims_rejection_type_check
  CHECK (rejection_type IS NULL OR rejection_type IN ('manual', 'automatic'));

CREATE TABLE claim_admin_notes (
  id         BIGSERIAL PRIMARY KEY,
  claim_id   INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  admin_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note       TEXT NOT NULL CHECK (LENGTH(BTRIM(note)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE claim_history (
  id          BIGSERIAL PRIMARY KEY,
  claim_id    INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type  VARCHAR(50) NOT NULL,
  from_status VARCHAR(30),
  to_status   VARCHAR(30),
  reason      TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE report_matches (
  id              BIGSERIAL PRIMARY KEY,
  lost_report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  found_report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  score           INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  evidence        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lost_report_id, found_report_id)
);

CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(40) NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  report_id  INTEGER REFERENCES reports(id) ON DELETE CASCADE,
  claim_id   INTEGER REFERENCES claims(id) ON DELETE CASCADE,
  match_id   BIGINT REFERENCES report_matches(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX notifications_match_user_type_idx
  ON notifications (user_id, match_id, type)
  WHERE match_id IS NOT NULL;

CREATE UNIQUE INDEX claims_student_found_item_idx
  ON claims (user_id, report_id)
  WHERE report_id IS NOT NULL
    AND status IN ('pending', 'under_review', 'approved');

CREATE INDEX user_roles_role_idx ON user_roles (role, user_id);
CREATE INDEX reports_owner_lifecycle_idx ON reports (user_id, lifecycle_status);
CREATE INDEX claims_lost_report_active_idx
  ON claims (lost_report_id, status)
  WHERE status IN ('pending', 'under_review', 'approved');
CREATE INDEX claims_expiration_idx
  ON claims (expires_at)
  WHERE status = 'pending';
CREATE INDEX claim_admin_notes_claim_idx ON claim_admin_notes (claim_id, created_at);
CREATE INDEX claim_history_claim_idx ON claim_history (claim_id, created_at);
CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
