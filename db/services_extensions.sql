-- ════════════════════════════════════════════════════════════════════════════
-- SalonOS — Service catalogue extensions
--
--  Adds the structural concepts a real nail-and-wax salon needs:
--    • unit_label + quantity      — "per finger" / "per nail" pricing
--    • service_variants           — tiered pricing (e.g. 4 wax types per body part)
--    • service_addons             — modifiers stacked onto a base service
--    • appointment_addons         — which add-ons were applied to each booking
--    • requires_patch_test flag   — wax safety check
--
--  Safe to run on a live database — every change is additive, gated by
--  IF NOT EXISTS, and defaults to backwards-compatible behaviour
--  (has_variants=false, allows_addons=false, quantity=1).
--
--  Run in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. EXTEND services ────────────────────────────────────────────────────────

alter table public.services
  add column if not exists unit_label          text;
alter table public.services
  add column if not exists requires_patch_test boolean not null default false;
alter table public.services
  add column if not exists has_variants        boolean not null default false;
alter table public.services
  add column if not exists allows_addons       boolean not null default false;


-- ── 2. SERVICE_VARIANTS ───────────────────────────────────────────────────────
--   For services priced in tiers — e.g. "Full Legs" sold at 4 wax types,
--   each with its own price and (optionally) duration.

create table if not exists public.service_variants (
  id                bigserial     primary key,
  salon_id          uuid          not null
                                  default public.current_salon_id()
                                  references public.salons(id) on delete cascade,
  service_id        bigint        not null
                                  references public.services(id) on delete cascade,
  name              text          not null,
  price             numeric(10,2) not null default 0 check (price >= 0),
  duration_override integer       check (duration_override is null or duration_override > 0),
  sort_order        integer       not null default 0,
  enabled           boolean       not null default true,
  created_at        timestamptz   not null default now()
);

alter table public.service_variants enable row level security;

drop policy if exists "service_variants: salon all" on public.service_variants;
create policy "service_variants: salon all"
  on public.service_variants for all
  using       (salon_id = public.current_salon_id())
  with check  (salon_id = public.current_salon_id());

create index if not exists service_variants_service_idx
  on public.service_variants (service_id, sort_order);


-- ── 3. SERVICE_ADDONS ─────────────────────────────────────────────────────────
--   Optional modifiers (French finish, Nail Art per finger, Foil Design, ...)
--   that ride on top of a base service without consuming extra calendar time.
--   duration_added defaults to 0 — most add-ons happen during the base service.

create table if not exists public.service_addons (
  id              bigserial     primary key,
  salon_id        uuid          not null
                                default public.current_salon_id()
                                references public.salons(id) on delete cascade,
  service_id      bigint        not null
                                references public.services(id) on delete cascade,
  name            text          not null,
  price           numeric(10,2) not null default 0 check (price >= 0),
  unit_label      text,                                    -- "per finger" / "per nail" / null = flat
  duration_added  integer       not null default 0 check (duration_added >= 0),
  sort_order      integer       not null default 0,
  enabled         boolean       not null default true,
  created_at      timestamptz   not null default now()
);

alter table public.service_addons enable row level security;

drop policy if exists "service_addons: salon all" on public.service_addons;
create policy "service_addons: salon all"
  on public.service_addons for all
  using       (salon_id = public.current_salon_id())
  with check  (salon_id = public.current_salon_id());

create index if not exists service_addons_service_idx
  on public.service_addons (service_id, sort_order);


-- ── 4. EXTEND appointments ────────────────────────────────────────────────────
--   quantity   — for unit-priced services ("3 fingers of acrylic")
--   unit_label — snapshot of the unit at booking time
--   variant_*  — snapshot of the chosen variant; FK kept for analytics but
--               name/price are denormalised so deleting the variant won't
--               break historical receipts.

alter table public.appointments
  add column if not exists quantity integer not null default 1 check (quantity > 0);
alter table public.appointments
  add column if not exists unit_label text;
alter table public.appointments
  add column if not exists variant_id    bigint references public.service_variants(id) on delete set null;
alter table public.appointments
  add column if not exists variant_name  text;
alter table public.appointments
  add column if not exists variant_price numeric(10,2);


-- ── 5. APPOINTMENT_ADDONS ─────────────────────────────────────────────────────
--   Which add-ons were applied to each appointment. Snapshots name/price/unit
--   so editing the master add-on later doesn't rewrite history.

create table if not exists public.appointment_addons (
  id              bigserial     primary key,
  salon_id        uuid          not null
                                default public.current_salon_id()
                                references public.salons(id) on delete cascade,
  appointment_id  bigint        not null
                                references public.appointments(id) on delete cascade,
  addon_id        bigint        references public.service_addons(id) on delete set null,
  name            text          not null,
  price           numeric(10,2) not null check (price >= 0),
  quantity        integer       not null default 1 check (quantity > 0),
  unit_label      text,
  created_at      timestamptz   not null default now()
);

alter table public.appointment_addons enable row level security;

drop policy if exists "appointment_addons: salon all" on public.appointment_addons;
create policy "appointment_addons: salon all"
  on public.appointment_addons for all
  using       (salon_id = public.current_salon_id())
  with check  (salon_id = public.current_salon_id());

create index if not exists appointment_addons_apt_idx
  on public.appointment_addons (appointment_id);


-- ── 6. VERIFY ─────────────────────────────────────────────────────────────────

select
  'services columns'    as item,
  count(*) filter (where column_name in ('unit_label','requires_patch_test','has_variants','allows_addons')) as present,
  4 as expected
  from information_schema.columns
 where table_schema='public' and table_name='services'
union all
select 'appointments columns',
  count(*) filter (where column_name in ('quantity','unit_label','variant_id','variant_name','variant_price')),
  5
  from information_schema.columns
 where table_schema='public' and table_name='appointments'
union all
select 'service_variants',     (select count(*) from public.service_variants),     null
union all
select 'service_addons',       (select count(*) from public.service_addons),       null
union all
select 'appointment_addons',   (select count(*) from public.appointment_addons),   null;
