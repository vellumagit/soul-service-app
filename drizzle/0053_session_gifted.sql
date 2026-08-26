-- Let a completed 1-on-1 session be marked "free / no charge" (a gift, a comp,
-- a first-one's-on-me) — mirroring the existing gifted Circle seats. It's stored
-- as payment_method = 'gifted' with paid = false + amount 0, and excluded from
-- every "unpaid" nag and total, so it clears the list without pretending it was
-- paid.
--
-- ADD VALUE is additive + safe. IF NOT EXISTS makes it idempotent (Postgres 12+).
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'gifted';
