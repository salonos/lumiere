-- ── SalonOS — Expenses table ──────────────────────────────────────────────────
--
-- Tracks salon outgoings: supplies, rent, utilities, wages, equipment, etc.
-- Each row records the date, description, category, amount, payment method,
-- an optional bill/receipt number, and the vendor / purchase place.
--
-- Payroll completion: when the owner marks a month's payroll as paid on the
-- Payroll page, a single row is written here with source = 'payroll' and the
-- period it covers (period_year / period_month). That makes payroll show up
-- automatically in the Income vs Expense report. The partial unique index
-- prevents paying the same month twice.
--
-- Run in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to run multiple times (uses IF NOT EXISTS / DROP IF EXISTS / ADD COLUMN
-- IF NOT EXISTS), so it both creates the table fresh AND upgrades older installs.
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

  -- ── Payroll-completion bookkeeping ──
  source           text           NOT NULL DEFAULT 'manual'
                                  CHECK (source IN ('manual', 'payroll')),
  period_year      integer,       -- for source='payroll': the month this run covers
  period_month     integer        CHECK (period_month IS NULL OR (period_month BETWEEN 1 AND 12)),

  created_at       timestamptz    NOT NULL DEFAULT now()
);

-- ── Upgrade older installs that pre-date the payroll columns ──
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS source       text    NOT NULL DEFAULT 'manual';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS period_year  integer;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS period_month integer;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_source_check'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_source_check CHECK (source IN ('manual', 'payroll'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_period_month_check'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_period_month_check
      CHECK (period_month IS NULL OR (period_month BETWEEN 1 AND 12));
  END IF;
END $$;

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

-- One payroll run per salon per month — prevents paying the same month twice
CREATE UNIQUE INDEX IF NOT EXISTS expenses_payroll_period
  ON public.expenses (salon_id, period_year, period_month)
  WHERE source = 'payroll';
