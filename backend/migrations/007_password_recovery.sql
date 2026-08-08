-- Secure, expiring, single-use password recovery tokens.

CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at    TIMESTAMPTZ,
  requested_ip INET,
  CONSTRAINT password_reset_tokens_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT password_reset_tokens_used_check CHECK (used_at IS NULL OR used_at >= created_at)
);

CREATE INDEX password_reset_tokens_user_active_idx
  ON password_reset_tokens (user_id, expires_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX password_reset_tokens_expiry_idx
  ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;
