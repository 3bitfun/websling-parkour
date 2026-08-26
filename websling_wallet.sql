-- =============================================================
-- WEBSLING PARKOUR — guest wallet (cash + upgrades)
-- Keyed by a stable client-generated owner id, so it works
-- with or without auth. Safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS websling_wallet (
  owner TEXT PRIMARY KEY,
  cash INTEGER NOT NULL DEFAULT 0 CHECK (cash >= 0),
  upgrades JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE websling_wallet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS websling_wallet_read ON websling_wallet;
CREATE POLICY websling_wallet_read ON websling_wallet FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS websling_wallet_write ON websling_wallet;
CREATE POLICY websling_wallet_write ON websling_wallet FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS websling_wallet_update ON websling_wallet;
CREATE POLICY websling_wallet_update ON websling_wallet FOR UPDATE TO anon, authenticated USING (true);
