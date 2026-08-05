-- Baseline schema for Campus Lost & Found.
-- This migration intentionally preserves legacy column names and nullable
-- relationships so existing installations can adopt versioned migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id            SERIAL PRIMARY KEY,
  item_name     TEXT NOT NULL,
  category      TEXT NOT NULL,
  item_category TEXT,
  location      TEXT NOT NULL,
  date_found    DATE,
  time_found    TEXT,
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  description   TEXT,
  status        TEXT DEFAULT 'Pending',
  claim_status  TEXT DEFAULT 'pending',
  image_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
  id            SERIAL PRIMARY KEY,
  report_id     INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  student_id    TEXT,
  student_email TEXT,
  item_name     TEXT,
  location      TEXT,
  description   TEXT,
  image_url     TEXT,
  status        TEXT DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  sender_type    TEXT NOT NULL DEFAULT 'student',
  sender_role    TEXT NOT NULL DEFAULT 'student',
  recipient_role TEXT NOT NULL DEFAULT 'admin',
  sender_id      TEXT NOT NULL DEFAULT '',
  message        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibility additions for databases created by older server startup DDL.
ALTER TABLE claims ADD COLUMN IF NOT EXISTS report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS student_email TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE claims ALTER COLUMN report_id DROP NOT NULL;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS item_category TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS time_found TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS claim_status TEXT DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_type TEXT DEFAULT 'student';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_role TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_role TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE messages
SET sender_role = COALESCE(NULLIF(sender_role, ''), NULLIF(sender_type, ''), 'student')
WHERE sender_role IS NULL OR sender_role = '';

UPDATE messages
SET recipient_role = CASE
  WHEN sender_role = 'admin' THEN 'student'
  ELSE 'admin'
END
WHERE recipient_role IS NULL OR recipient_role = '';

UPDATE messages
SET sender_type = sender_role
WHERE sender_type IS NULL OR sender_type = '';

ALTER TABLE messages ALTER COLUMN sender_type SET DEFAULT 'student';
ALTER TABLE messages ALTER COLUMN sender_role SET DEFAULT 'student';
ALTER TABLE messages ALTER COLUMN recipient_role SET DEFAULT 'admin';

