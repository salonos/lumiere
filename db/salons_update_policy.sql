-- Add missing UPDATE policy to salons table.
-- Run this in the Supabase SQL Editor if you already ran db/reset.sql.
-- Safe to re-run (DROP IF EXISTS guard).

DROP POLICY IF EXISTS "salons: update own" ON public.salons;

CREATE POLICY "salons: update own"
  ON public.salons FOR UPDATE
  USING     (id = public.current_salon_id())
  WITH CHECK(id = public.current_salon_id());

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'salons';
