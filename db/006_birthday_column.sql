-- Add birthday column to customers table.
-- Collected in the Add Customer form; used by the Birthday wish reminder template.

alter table public.customers
  add column if not exists birthday date;
