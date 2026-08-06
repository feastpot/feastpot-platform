-- Migration: add hear_about_us column to catering_enquiries
-- Allows ops to track which marketing channel drove each catering lead.

ALTER TABLE "catering_enquiries" ADD COLUMN "hear_about_us" VARCHAR(100);
