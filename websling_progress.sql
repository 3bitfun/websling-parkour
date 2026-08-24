-- =============================================================
-- WEBSLING PARKOUR — progression: inventory, trials, coin spend
-- All objects prefixed websling_ to stay clear of your other data.
-- Safe to re-run (IF NOT EXISTS / OR REPLACE).
-- =============================================================

-- ---- inventory: unlocked gloves / suits ----
CREATE TABLE IF NOT EXISTS websling_inventory (
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
ALTER TABLE websling_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS websling_inv_read ON websling_inventory;
CREATE POLICY websling_inv_read ON websling_inventory FOR SELECT USING (true);

DROP POLICY IF EXISTS websling_inv_insert ON websling_inventory;
CREATE POLICY websling_inv_insert ON websling_inventory FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Grant an item to the caller (idempotent).
CREATE OR REPLACE FUNCTION websling_grant_item(p_item TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO websling_inventory (user_id, item_id)
  VALUES (auth.uid(), p_item)
  ON CONFLICT (user_id, item_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION websling_grant_item(TEXT) TO anon, authenticated;

-- ---- time trials: best time per pilot per circuit ----
CREATE TABLE IF NOT EXISTS websling_trials (
  user_id   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  trial_id  TEXT NOT NULL,
  time_ms   BIGINT NOT NULL CHECK (time_ms >= 0),
  set_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trial_id)
);
ALTER TABLE websling_trials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS websling_trial_read ON websling_trials;
CREATE POLICY websling_trial_read ON websling_trials FOR SELECT USING (true);

DROP POLICY IF EXISTS websling_trial_write ON websling_trials;
CREATE POLICY websling_trial_write ON websling_trials FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS websling_trial_update ON websling_trials;
CREATE POLICY websling_trial_update ON websling_trials FOR UPDATE USING (auth.uid() = user_id);

-- Upsert a trial time only if it beats the pilot's current best.
-- Returns the pilot's best time afterwards.
CREATE OR REPLACE FUNCTION websling_set_trial(p_trial TEXT, p_ms BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  best BIGINT;
BEGIN
  INSERT INTO websling_trials (user_id, trial_id, time_ms)
  VALUES (auth.uid(), p_trial, p_ms)
  ON CONFLICT (user_id, trial_id) DO UPDATE
    SET time_ms = LEAST(websling_trials.time_ms, EXCLUDED.time_ms),
        set_at  = now()
  RETURNING time_ms INTO best;
  RETURN best;
END;
$$;
GRANT EXECUTE ON FUNCTION websling_set_trial(TEXT, BIGINT) TO anon, authenticated;

-- ---- coin spending (kiosk) ----
-- Subtracts coins only if the wallet can cover it.
-- Returns the new balance, or -1 when funds are insufficient.
CREATE OR REPLACE FUNCTION websling_spend_coins(p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_total INTEGER;
BEGIN
  UPDATE websling_profiles
     SET coins = coins - p_amount
   WHERE user_id = auth.uid()
     AND coins >= p_amount
  RETURNING coins INTO new_total;

  IF new_total IS NULL THEN
    RETURN -1;
  END IF;
  RETURN new_total;
END;
$$;
GRANT EXECUTE ON FUNCTION websling_spend_coins(INTEGER) TO anon, authenticated;
