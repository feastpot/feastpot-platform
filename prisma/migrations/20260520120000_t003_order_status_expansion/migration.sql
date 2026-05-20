-- T003: expand OrderStatus enum with `needs_clarification`, `ready`, `rejected`.
-- Postgres requires ALTER TYPE ... ADD VALUE to run outside a transaction
-- block, so each value is added independently and idempotently.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'needs_clarification' BEFORE 'preparing';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ready' BEFORE 'dispatched';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'rejected' AFTER 'cancelled';
