CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  payload JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS session_archives (
  session_id TEXT PRIMARY KEY,
  archived_at TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL,
  archived_by BIGINT REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS mandate_periods (
  id BIGSERIAL PRIMARY KEY,
  start_year INTEGER NOT NULL CHECK (start_year BETWEEN 1900 AND 9999),
  end_year INTEGER NOT NULL CHECK (end_year BETWEEN start_year AND 9999),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES app_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mandate_periods_one_current_idx
  ON mandate_periods (is_current) WHERE is_current;

INSERT INTO mandate_periods (start_year, end_year)
SELECT 2026, 2032
WHERE NOT EXISTS (SELECT 1 FROM mandate_periods WHERE is_current);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES app_users(id),
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
