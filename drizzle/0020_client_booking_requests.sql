-- 0020_client_booking_requests.sql
--
-- Client-initiated requests for a NEW session (distinct from
-- reschedule_requests, which targets an existing session that needs
-- to move). Surfaces in Loose Ends → "Session requests" so the
-- practitioner can reach out and confirm a time, then resolve.
--
-- Not self-serve scheduling — the practitioner still controls the
-- calendar. This is the "I'd like to book another session" path,
-- structured as a small message with optional preferred times.

CREATE TABLE IF NOT EXISTS client_booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  /** Free-text preferred times from the client ("weekday evenings, or
   *  Saturday morning"). Optional. */
  preferred_times TEXT,

  /** Optional message ("I've been sitting with something I want to talk
   *  through" / "Catching up after travel"). */
  reason TEXT,

  /** pending | acknowledged | resolved */
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  reviewed_note TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_booking_requests_account_status_idx
  ON client_booking_requests(account_id, status);
CREATE INDEX IF NOT EXISTS client_booking_requests_client_idx
  ON client_booking_requests(client_id);
