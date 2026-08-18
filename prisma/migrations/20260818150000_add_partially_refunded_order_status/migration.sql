-- Add partially_refunded to OrderStatus so a partial refund on a terminal
-- order can be reflected on the order itself (full refunds use `refunded`).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'partially_refunded';
