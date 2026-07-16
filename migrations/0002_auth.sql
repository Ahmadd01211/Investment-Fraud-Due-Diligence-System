-- ════════════════════════════════════════════════════════════════
--  Optional accounts (Feature B): users + sessions
--
--  Accounts are OPTIONAL — the analysis pipeline works fully signed-out.
--  Signing in adds saved report history + premium tie-in.
--
--  Passwords are hashed with PBKDF2-HMAC-SHA256 (Web Crypto) and stored as
--  (password_hash, password_salt) hex. google_sub links a Google identity.
--  Sessions are opaque 32-byte hex tokens with a 30-day expiry.
--
--  NOTE: jobs.user_id is NOT added here. SQLite's ALTER TABLE has no
--  "ADD COLUMN IF NOT EXISTS", so it would fail on DBs where the runtime
--  (jobs.ts ensureSchema) already added the column. jobs.user_id is
--  runtime-provisioned by ensureSchema() (idempotent guarded ALTER).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  name           TEXT,
  password_hash  TEXT,
  password_salt  TEXT,
  google_sub     TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
