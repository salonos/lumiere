-- ============================================================
--  004_service_commission_staff_assign.sql
--  • Adds commission_rate to services (per-service, not per-staff)
--  • Adds staff_id to appointments (nullable; NULL = owner did it)
--
--  Commissions belong to the service rendered, credited to whoever
--  performed it.  If no staff was assigned when an appointment is
--  completed, the owner is assumed to have done the work (unless the
--  appointment was cancelled due to no-show or leave).
--
--  Run AFTER 003_staff_stations.sql.
-- ============================================================

-- ── 1. commission_rate on services ───────────────────────────────────────────
--
--  Stored as a percentage (0–100).  NULL means "no commission for this
--  service" (e.g. retail add-ons, consultation, or owner-only services).

alter table public.services
  add column if not exists commission_rate numeric(5,2)
  check (commission_rate is null
      or (commission_rate >= 0 and commission_rate <= 100));

-- ── 2. staff_id on appointments ──────────────────────────────────────────────
--
--  Which staff member performed the service for this appointment.
--  NULL  → owner did it (default when no one is explicitly assigned).
--  SET NULL on staff deletion so past records aren't broken.

alter table public.appointments
  add column if not exists staff_id bigint
  references public.staff(id) on delete set null;

-- ── 3. Verify ────────────────────────────────────────────────────────────────

select column_name, data_type
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   in ('services', 'appointments')
  and  column_name  in ('commission_rate', 'staff_id')
order  by table_name, column_name;
