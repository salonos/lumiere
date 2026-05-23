-- ── SalonOS — Expenses table ──────────────────────────────────────────────────
--
-- Tracks salon outgoings: supplies, rent, utilities, wages, equipment, etc.
-- Each row records the date, description, category, amount, payment method,
-- an optional bill/receipt number, and the vendor / purchase place.
--
-- Run in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to run multiple times (uses IF NOT EXISTS / DROP IF EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.expenses (
  id               bigserial      PRIMARY KEY,
  salon_id         uuid           NOT NULL
                                  DEFAULT public.current_salon_id()
                                  REFERENCES public.salons(id) ON DELETE CASCADE,

  -- When and what
  date             date           NOT NULL,
  description      text           NOT NULL,
  category         text           NOT NULL DEFAULT 'Other'
                                  CHECK (category IN (
                                    'Supplies', 'Rent', 'Utilities', 'Staff Wages',
                                    'Equipment', 'Marketing', 'Cleaning',
                                    'Professional Services', 'Other'
                                  )),

  -- Amount
  amount           numeric(10,2)  NOT NULL CHECK (amount > 0),

  -- How it was paid
  payment_method   text           NOT NULL
                                  CHECK (payment_method IN ('cash', 'card', 'transfer')),

  -- Receipt / vendor details
  bill_number      text,          -- receipt or invoice number (optional)
  vendor           text,          -- purchase place / supplier (optional)

  -- Free-form
  notes            text,

  created_at       timestamptz    NOT NULL DEFAULT now()
);

-- Row-level security: each salon can only see its own expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses: salon all" ON public.expenses;

CREATE POLICY "expenses: salon all"
  ON public.expenses
  FOR ALL
  USING      (salon_id = public.current_salon_id())
  WITH CHECK (salon_id = public.current_salon_id());

-- Helpful index for the monthly report query
CREATE INDEX IF NOT EXISTS expenses_salon_date
  ON public.expenses (salon_id, date DESC);
