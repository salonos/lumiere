-- ============================================================
--  003_staff_stations.sql
--  Staff roster and station types tables for Lumière SalonOS.
--
--  Run this in the Supabase SQL editor (or psql) after
--  002_multi_tenant.sql has been applied.
--
--  Prerequisites:
--    • public.salons table exists
--    • public.current_salon_id() function exists
-- ============================================================

-- ── 1. Staff ─────────────────────────────────────────────────────────────────

create table public.staff (
  id              bigserial     primary key,
  salon_id        uuid          not null
                                default public.current_salon_id()
                                references public.salons(id) on delete cascade,
  name            text          not null,
  role            text,
  dob             date,
  salary          numeric(10,2),          -- LKR per month
  active          boolean       not null  default true,
  created_at      timestamptz   not null  default now()
);

alter table public.staff enable row level security;

create policy "staff: salon select"
  on public.staff for select
  using (salon_id = public.current_salon_id());

create policy "staff: salon insert"
  on public.staff for insert
  with check (salon_id = public.current_salon_id());

create policy "staff: salon update"
  on public.staff for update
  using (salon_id = public.current_salon_id());

create policy "staff: salon delete"
  on public.staff for delete
  using (salon_id = public.current_salon_id());

-- ── 2. Station types ─────────────────────────────────────────────────────────
--
--  A "station type" is a physical workspace in the salon, e.g.
--  "Styling Chair", "Wax Station", "Facial Bed".  `count` is the
--  number of that type available simultaneously (used for capacity
--  checks when booking).

create table public.station_types (
  id         bigserial   primary key,
  salon_id   uuid        not null
                         default public.current_salon_id()
                         references public.salons(id) on delete cascade,
  name       text        not null,
  count      integer     not null  default 1
             check (count >= 1),
  created_at timestamptz not null  default now()
);

alter table public.station_types enable row level security;

create policy "station_types: salon select"
  on public.station_types for select
  using (salon_id = public.current_salon_id());

create policy "station_types: salon insert"
  on public.station_types for insert
  with check (salon_id = public.current_salon_id());

create policy "station_types: salon update"
  on public.station_types for update
  using (salon_id = public.current_salon_id());

create policy "station_types: salon delete"
  on public.station_types for delete
  using (salon_id = public.current_salon_id());

-- ── 3. Verify ────────────────────────────────────────────────────────────────

select 'staff' as table_name, count(*) from public.staff
union all
select 'station_types', count(*) from public.station_types;