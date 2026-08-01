-- Reverses migration.sql in this folder. Not run by `prisma migrate deploy`
-- (Prisma has no native down migrations); apply manually with
-- `prisma db execute --file .../down.sql` if a rollback is needed.
DROP TABLE IF EXISTS "vendor_capacity";
DROP TABLE IF EXISTS "vendor_trust_signals";
DROP TYPE IF EXISTS "vendor_capacity_type";
DROP TYPE IF EXISTS "vendor_trust_signal_status";
DROP TYPE IF EXISTS "vendor_trust_signal_type";
