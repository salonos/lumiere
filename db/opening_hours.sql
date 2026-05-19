-- Add opening_hours JSONB column to salons.
-- Run this in the Supabase SQL Editor if you already ran db/reset.sql.
-- Safe to re-run (IF NOT EXISTS guard).

ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS opening_hours JSONB NOT NULL DEFAULT '{}';

-- Verify
SELECT id, name, opening_hours FROM public.salons;
