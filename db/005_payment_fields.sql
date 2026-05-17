-- ============================================================
--  005_payment_fields.sql
--  • Adds payment_method + discount_amount to appointments
--    (captured when an appointment is marked complete)
--  • Adds station_type_id to services
--    (links a service to the physical station it requires;
--     used for capacity / double-booking checks)
--
--  Run AFTER 004_service_commission_staff_assign.sql.
-- ============================================================

-- ── 1. Payment info on appointments ──────────────────────────────────────────

alter table public.appointments
  add column if not exists payment_method text
  check (payment_method in ('cash', 'card', 'transfer'));

alter table public.appointments
  add column if not exists discount_amount numeric(10,2) not null default 0
  check (discount_amount >= 0);

-- ── 2. Station type link on services ─────────────────────────────────────────
--
--  Which kind of station does this service occupy while running?
--  NULL = no dedicated station (e.g. consultation, add-on).

alter table public.services
  add column if not exists station_type_id bigint
  references public.station_types(id) on delete set null;

-- ── 3. Verify ────────────────────────────────────────────────────────────────

select table_name, column_name, data_type
from   information_schema.columns
where  table_schema = 'public'
  and  ((table_name = 'appointments' and column_name in ('payment_method','discount_amount'))
     or (table_name = 'services'     and column_name = 'station_type_id'))
order  by table_name, column_name;
