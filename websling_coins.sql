-- =============================================================
-- WEBSLING PARKOUR — coin wallet migration
-- Adds a persistent coin balance to each pilot profile.
-- Safe to re-run (IF NOT EXISTS / OR REPLACE).
-- =============================================================

ALTER TABLE websling_profiles
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;

-- Atomic coin top-up for the signed-in pilot.
-- Returns the pilot's new total balance.
CREATE OR REPLACE FUNCTION websling_add_coins(p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total INTEGER;
BEGIN
  UPDATE websling_profiles
     SET coins = coins + GREATEST(p_amount, 0)
   WHERE user_id = auth.uid()
  RETURNING coins INTO new_total;

  RETURN COALESCE(new_total, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION websling_add_coins(INTEGER) TO anon, authenticated;
