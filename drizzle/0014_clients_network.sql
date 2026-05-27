-- 0014_clients_network.sql
--
-- Network — light contact-book for the people orbiting her practice
-- before (and after) they become clients. Three new columns on `clients`:
--
--   is_lead             — true while they're in the network but haven't
--                          had a first session. Auto-flips to false the
--                          moment a session is scheduled for them.
--                          Manual override available from the profile.
--   met_on              — optional date she first met them (separate from
--                          first_session — could be earlier).
--   met_via_client_id   — optional FK to another client; lets her track
--                          "this person came from Sarah's referral" as a
--                          structured link rather than just free text.
--
-- The pre-existing `how_they_found_me` text field is reused as the
-- free-form source ("Olga's birthday party", "Insight Timer DM", etc.).
--
-- Index on (account_id, is_lead) so the /network page query is cheap.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS met_on DATE,
  ADD COLUMN IF NOT EXISTS met_via_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_lead_idx ON clients(account_id, is_lead);
