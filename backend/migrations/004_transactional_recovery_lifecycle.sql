-- Phase 4: complete claim verification, return, closure, and timeline lifecycle.

ALTER TABLE users ADD COLUMN student_id TEXT;
UPDATE users SET student_id = 'STU-' || LPAD(id::text, 7, '0') WHERE student_id IS NULL;
ALTER TABLE users ALTER COLUMN student_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN student_id SET DEFAULT ('STU-' || UPPER(SUBSTRING(MD5(RANDOM()::text) FROM 1 FOR 10)));
ALTER TABLE users ADD CONSTRAINT users_student_id_unique UNIQUE (student_id);
ALTER TABLE users ADD CONSTRAINT users_student_id_nonempty CHECK (LENGTH(BTRIM(student_id)) > 0);

ALTER TABLE claims
  ADD COLUMN ownership_verification TEXT,
  ADD COLUMN supporting_information TEXT,
  ADD COLUMN student_comments TEXT,
  ADD COLUMN verification_request TEXT,
  ADD COLUMN verification_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN resubmitted_at TIMESTAMPTZ,
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN returned_at TIMESTAMPTZ,
  ADD COLUMN archived_at TIMESTAMPTZ;

UPDATE claims
SET ownership_verification = COALESCE(NULLIF(BTRIM(description), ''), 'Legacy claim verification')
WHERE ownership_verification IS NULL;

ALTER TABLE claims ALTER COLUMN ownership_verification SET NOT NULL;
ALTER TABLE claims ADD CONSTRAINT claims_ownership_verification_nonempty
  CHECK (LENGTH(BTRIM(ownership_verification)) > 0);
ALTER TABLE claims ADD CONSTRAINT claims_verification_version_positive
  CHECK (verification_version > 0);

ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_status_check;
ALTER TABLE claims ADD CONSTRAINT claims_status_check CHECK (status IN (
  'pending', 'under_review', 'action_required', 'approved', 'rejected',
  'automatically_rejected', 'cancelled', 'expired', 'returned', 'closed'
));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_lifecycle_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_lifecycle_status_check CHECK (
  lifecycle_status IN ('active', 'claimed', 'closed_by_student', 'returned', 'archived')
);

DROP INDEX IF EXISTS claims_student_found_item_idx;
CREATE UNIQUE INDEX claims_student_found_item_idx
  ON claims (user_id, report_id)
  WHERE report_id IS NOT NULL
    AND status NOT IN ('cancelled', 'expired', 'automatically_rejected');

CREATE INDEX claims_review_queue_idx
  ON claims (status, created_at DESC)
  WHERE status IN ('pending', 'under_review', 'action_required', 'approved', 'returned');
