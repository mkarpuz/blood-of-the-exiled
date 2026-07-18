CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower_idx ON accounts (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id);

CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  state jsonb NOT NULL,
  last_quiz_at bigint NOT NULL DEFAULT 0,
  last_lethal_quiz_at bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_name_lower_idx ON characters(lower(name));

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text NOT NULL,
  language text NOT NULL,
  encrypted_source text NOT NULL,
  character_count integer NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materials_account_idx ON materials(account_id);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  encrypted_content text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  verified boolean NOT NULL DEFAULT false,
  seen_count integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_material_idx ON questions(material_id);

CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  correct boolean NOT NULL,
  lethal boolean NOT NULL,
  response_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempts_character_idx ON attempts(character_id);

CREATE TABLE IF NOT EXISTS auctions (
  id uuid PRIMARY KEY,
  seller_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item jsonb NOT NULL,
  price integer NOT NULL CHECK (price > 0),
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auctions_status_expiry_idx ON auctions(status, expires_at);

CREATE TABLE IF NOT EXISTS world_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS economy_audit (
  id uuid PRIMARY KEY,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS economy_audit_character_idx ON economy_audit(character_id);

CREATE TABLE IF NOT EXISTS chat_moderation (
  id uuid PRIMARY KEY,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  reason text NOT NULL,
  excerpt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
