-- ════════════════════════════════════════════════════════════════════════════
-- SalonOS — Full database reset (Test Salon)
--
--  Drops everything in the public schema we care about, recreates the
--  full schema, RLS policies, and seeds Test Salon with medium-volume
--  dummy data: 5 staff, 30 customers, ~40 services, 5 station types,
--  and ~25 appointments spread across the next two weeks.
--
-- ── HOW TO USE ───────────────────────────────────────────────────────────────
--
--  STEP 1 — Create the owner auth user
--    Supabase Dashboard → Authentication → Users → "Add user"
--      • Email:             owner@testsalon.com
--      • Password:          123456
--      • Auto Confirm User: ✔  (tick this so they can log in immediately)
--
--  STEP 2 — Run this entire file
--    Supabase Dashboard → SQL Editor → New query → paste this file → Run.
--    The script looks up the auth user by email and links them to the
--    Test Salon row it creates.
--
--  STEP 3 — Sign in at /login
--    Email: owner@testsalon.com    Password: 123456
--
--  Re-running this script is safe — it wipes and rebuilds every table.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. CLEAN SLATE ─────────────────────────────────────────────────────────

drop table if exists public.appointments  cascade;
drop table if exists public.customers     cascade;
drop table if exists public.services      cascade;
drop table if exists public.station_types cascade;
drop table if exists public.staff         cascade;
drop table if exists public.salon_users   cascade;
drop table if exists public.salons        cascade;

drop function if exists public.current_salon_id() cascade;


-- ── 1. EXTENSIONS ──────────────────────────────────────────────────────────

create extension if not exists pgcrypto;


-- ── 2. SALONS ──────────────────────────────────────────────────────────────

create table public.salons (
  id             uuid         primary key default gen_random_uuid(),
  name           text         not null,
  city           text,
  tagline        text,
  address        text,
  phone          text,
  whatsapp       text,
  booking_slug   text         not null unique,
  opening_hours  jsonb        not null default '{}',
  created_at     timestamptz  not null default now()
);

alter table public.salons enable row level security;


-- ── 3. SALON_USERS ─────────────────────────────────────────────────────────

create table public.salon_users (
  user_id     uuid         primary key references auth.users(id) on delete cascade,
  salon_id    uuid         not null    references public.salons(id) on delete cascade,
  full_name   text,
  role        text         not null default 'owner',
  created_at  timestamptz  not null default now()
);

alter table public.salon_users enable row level security;

create policy "salon_users: read own"
  on public.salon_users for select
  using (user_id = auth.uid());


-- ── 4. current_salon_id() helper ───────────────────────────────────────────
--
--  Returns the salon_id of the currently logged-in user. Used by every
--  RLS policy below and by table DEFAULTs to scope rows to a single salon.
--  SECURITY DEFINER lets it read salon_users without recursing into its
--  own RLS. STABLE so PostgreSQL caches the result within a statement.

create or replace function public.current_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select salon_id from public.salon_users where user_id = auth.uid()
$$;

grant execute on function public.current_salon_id() to authenticated, anon;


-- Salons SELECT policy can now reference current_salon_id()
create policy "salons: own only"
  on public.salons for select
  using (id = public.current_salon_id());

create policy "salons: update own"
  on public.salons for update
  using     (id = public.current_salon_id())
  with check(id = public.current_salon_id());


-- ── 5. STAFF ───────────────────────────────────────────────────────────────

create table public.staff (
  id          bigserial    primary key,
  salon_id    uuid         not null
                           default public.current_salon_id()
                           references public.salons(id) on delete cascade,
  name        text         not null,
  role        text,
  dob         date,
  salary      numeric(10,2),
  active      boolean      not null default true,
  created_at  timestamptz  not null default now()
);

alter table public.staff enable row level security;

create policy "staff: salon all"
  on public.staff for all
  using       (salon_id = public.current_salon_id())
  with check  (salon_id = public.current_salon_id());


-- ── 6. STATION_TYPES ───────────────────────────────────────────────────────

create table public.station_types (
  id          bigserial    primary key,
  salon_id    uuid         not null
                           default public.current_salon_id()
                           references public.salons(id) on delete cascade,
  name        text         not null,
  count       integer      not null default 1 check (count >= 1),
  created_at  timestamptz  not null default now()
);

alter table public.station_types enable row level security;

create policy "station_types: salon all"
  on public.station_types for all
  using       (salon_id = public.current_salon_id())
  with check  (salon_id = public.current_salon_id());


-- ── 7. SERVICES ────────────────────────────────────────────────────────────

create table public.services (
  id               bigserial    primary key,
  salon_id         uuid         not null
                                default public.current_salon_id()
                                references public.salons(id) on delete cascade,
  name             text         not null,
  category         text,
  description      text,
  duration         integer      not null default 60,    -- minutes
  price            numeric(10,2) not null default 0,    -- LKR
  commission_rate  numeric(5,2)
                   check (commission_rate is null
                       or (commission_rate >= 0 and commission_rate <= 100)),
  station_type_id  bigint       references public.station_types(id) on delete set null,
  enabled          boolean      not null default true,
  created_at       timestamptz  not null default now()
);

alter table public.services enable row level security;

create policy "services: salon all"
  on public.services for all
  using       (salon_id = public.current_salon_id())
  with check  (salon_id = public.current_salon_id());


-- ── 8. CUSTOMERS ───────────────────────────────────────────────────────────

create table public.customers (
  id               text         primary key,       -- slug-style, e.g. "dilini-perera"
  salon_id         uuid         not null
                                default public.current_salon_id()
                                references public.salons(id) on delete cascade,
  name             text         not null,
  phone            text,
  birthday         date,
  notes            text,
  tags             text[]       not null default '{}',
  visits           integer      not null default 0,
  total_spend      numeric(12,2) not null default 0,
  last_visit_date  date,
  created_at       timestamptz  not null default now()
);

alter table public.customers enable row level security;

create policy "customers: salon all"
  on public.customers for all
  using       (salon_id = public.current_salon_id())
  with check  (salon_id = public.current_salon_id());


-- ── 9. APPOINTMENTS ────────────────────────────────────────────────────────

create table public.appointments (
  id               bigserial    primary key,
  salon_id         uuid         not null
                                default public.current_salon_id()
                                references public.salons(id) on delete cascade,
  customer_id      text         not null references public.customers(id) on delete cascade,
  service_id       bigint       not null references public.services(id)  on delete restrict,
  staff_id         bigint                references public.staff(id)      on delete set null,
  date             date         not null,
  time             time         not null,
  duration         integer      not null default 60,
  status           text         not null default 'confirmed'
                                check (status in ('pending','confirmed','completed','cancelled')),
  notes            text,
  tint             text         check (tint is null or tint in ('pink','champagne','plum')),
  payment_method   text         check (payment_method is null or payment_method in ('cash','card','transfer')),
  discount_amount  numeric(10,2) not null default 0 check (discount_amount >= 0),
  created_at       timestamptz  not null default now()
);

alter table public.appointments enable row level security;

create policy "appointments: salon all"
  on public.appointments for all
  using       (salon_id = public.current_salon_id())
  with check  (salon_id = public.current_salon_id());


-- ════════════════════════════════════════════════════════════════════════════
--  SEED DATA
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_owner_email constant text := 'owner@testsalon.com';
  v_sid       uuid;
  v_owner_uid uuid;
  v_nail      bigint;
  v_hair      bigint;
  v_pedi      bigint;
  v_wax       bigint;
  v_facial    bigint;
  v_dilanka   bigint;
  v_sachini   bigint;
  v_kumudu    bigint;
  v_pradeep   bigint;
  v_anushka   bigint;
begin

  /* ── Resolve the auth user ── */
  select id into v_owner_uid from auth.users where email = v_owner_email;
  if v_owner_uid is null then
    raise exception
      'Auth user % not found. Create it in Supabase Dashboard → Authentication → Users first (with auto-confirm).',
      v_owner_email;
  end if;

  /* ── Create the salon ── */
  insert into public.salons (name, city, tagline, address, phone, whatsapp, booking_slug, opening_hours)
  values ('Test Salon', 'Colombo', 'A quieter way to run your salon.',
          '93 Galle Road, Colombo 03', '+94 77 123 4567', '+94 77 123 4567', 'test-salon',
          '{"monday":{"on":true,"open":"09:00","close":"19:00"},
            "tuesday":{"on":true,"open":"09:00","close":"19:00"},
            "wednesday":{"on":true,"open":"09:00","close":"19:00"},
            "thursday":{"on":true,"open":"09:00","close":"19:00"},
            "friday":{"on":true,"open":"09:00","close":"20:00"},
            "saturday":{"on":true,"open":"09:00","close":"20:00"},
            "sunday":{"on":false,"open":"","close":""}}'::jsonb)
  returning id into v_sid;

  /* ── Link the auth user as owner ── */
  insert into public.salon_users (user_id, salon_id, full_name, role)
  values (v_owner_uid, v_sid, 'Sandya Perera', 'owner');

  /* ── Station types ── */
  insert into public.station_types (salon_id, name, count) values
    (v_sid, 'Hair & Makeup',     2),
    (v_sid, 'Nail & Manicure',   2),
    (v_sid, 'Pedicure',          2),
    (v_sid, 'Wax',               1),
    (v_sid, 'Facial Room',       1);

  select id into v_hair   from public.station_types where salon_id = v_sid and name = 'Hair & Makeup';
  select id into v_nail   from public.station_types where salon_id = v_sid and name = 'Nail & Manicure';
  select id into v_pedi   from public.station_types where salon_id = v_sid and name = 'Pedicure';
  select id into v_wax    from public.station_types where salon_id = v_sid and name = 'Wax';
  select id into v_facial from public.station_types where salon_id = v_sid and name = 'Facial Room';

  /* ── Staff (5 members) ── */
  insert into public.staff (salon_id, name, role, dob, salary, active) values
    (v_sid, 'Dilanka Perera',     'Stylist',           '1992-04-15',  85000, true),
    (v_sid, 'Sachini Rathnayake', 'Stylist',           '1995-08-22',  72000, true),
    (v_sid, 'Kumudu Wijesinghe',  'Nail Technician',   '1990-11-03',  68000, true),
    (v_sid, 'Pradeep Silva',      'Skin Therapist',    '1988-02-19',  78000, true),
    (v_sid, 'Anushka Fernando',   'Massage Therapist', '1993-06-30',  70000, true);

  select id into v_dilanka from public.staff where salon_id = v_sid and name = 'Dilanka Perera';
  select id into v_sachini from public.staff where salon_id = v_sid and name = 'Sachini Rathnayake';
  select id into v_kumudu  from public.staff where salon_id = v_sid and name = 'Kumudu Wijesinghe';
  select id into v_pradeep from public.staff where salon_id = v_sid and name = 'Pradeep Silva';
  select id into v_anushka from public.staff where salon_id = v_sid and name = 'Anushka Fernando';

  /* ── Services (~40 total) ── */

  -- HAIR
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Ladies Cut & Blowdry',  'Hair', 'Precision cut finished with a blowdry and style.',                60,  2500, 12, v_hair, true),
    (v_sid, 'Gents Cut',             'Hair', 'Clean, classic cut for men.',                                    30,  1000, 10, v_hair, true),
    (v_sid, 'Blowdry & Style',       'Hair', 'Blowdry and set to your preference.',                            45,  1500, 10, v_hair, true),
    (v_sid, 'Hair Colour (Full)',    'Hair', 'Full head colour using professional-grade dye.',                120,  8000, 15, v_hair, true),
    (v_sid, 'Highlights',            'Hair', 'Partial or full highlights for a sun-kissed finish.',            90,  6500, 15, v_hair, true),
    (v_sid, 'Balayage',              'Hair', 'Hand-painted colour for a natural gradient effect.',            150, 12000, 15, v_hair, true),
    (v_sid, 'Keratin Treatment',     'Hair', 'Smoothing and frizz control. Lasts up to 3 months.',            120, 10000, 15, v_hair, true),
    (v_sid, 'Deep Conditioning',     'Hair', 'Intensive moisture treatment for dry or damaged hair.',          45,  2000, 10, v_hair, true),
    (v_sid, 'Hair Updo',             'Hair', 'Elegant updo for events and formal occasions.',                  60,  3500, 12, v_hair, true);

  -- SKIN (facial room)
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Classic Facial',        'Skin', 'Cleanse, exfoliate, tone, and moisturise for everyday glow.',   60,  3500, 12, v_facial, true),
    (v_sid, 'Deep Cleanse Facial',   'Skin', 'Targeted deep cleanse for congested or acne-prone skin.',       75,  5500, 12, v_facial, true),
    (v_sid, 'Brightening Facial',    'Skin', 'Vitamin C treatment for uneven skin tone.',                     60,  4500, 12, v_facial, true),
    (v_sid, 'Anti-Ageing Facial',    'Skin', 'Firming and hydrating facial targeting fine lines.',            75,  6000, 12, v_facial, true);

  -- NAILS
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Classic Manicure',      'Nails', 'Shape, buff, cuticle care, and polish.',                       45,  1500, 10, v_nail, true),
    (v_sid, 'Gel Manicure',          'Nails', 'Long-lasting gel polish — chip-free for 2–3 weeks.',           60,  2800, 10, v_nail, true),
    (v_sid, 'Acrylic Extensions',    'Nails', 'Full set of acrylic nail extensions.',                         90,  5000, 10, v_nail, true),
    (v_sid, 'Nail Art (per set)',    'Nails', 'Custom nail art designs — consult for options.',               45,  1200, 10, v_nail, true),
    (v_sid, 'Nail Removal',          'Nails', 'Safe removal of gel, acrylic, or extensions.',                 30,   800,  8, v_nail, true);

  -- PEDICURE
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Classic Pedicure',      'Nails', 'Soak, shape, cuticle care, and polish.',                       60,  2000, 10, v_pedi, true),
    (v_sid, 'Spa Pedicure',          'Nails', 'Classic pedicure with a hot-stone foot massage.',              75,  3200, 10, v_pedi, true),
    (v_sid, 'Gel Pedicure',          'Nails', 'Spa pedicure finished with long-lasting gel polish.',          75,  3800, 10, v_pedi, true),
    (v_sid, 'Medical Pedicure',      'Nails', 'Therapeutic care for calluses and cracked heels.',             90,  4500, 10, v_pedi, true);

  -- THREADING (no station)
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Eyebrow Threading',     'Threading', 'Precise shaping and definition for brows.',                15,   300, 10, null, true),
    (v_sid, 'Upper Lip Threading',   'Threading', 'Quick and clean upper lip hair removal.',                  10,   200, 10, null, true),
    (v_sid, 'Full Face Threading',   'Threading', 'Brows, upper lip, chin, forehead, and sideburns.',         30,   700, 10, null, true);

  -- BRIDAL (hair & makeup station)
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Bridal Hair & Makeup',  'Bridal', 'Complete bridal look — hair styling and full makeup.',       240, 25000, 15, v_hair, true),
    (v_sid, 'Trial Hair & Makeup',   'Bridal', 'Pre-wedding trial run of your chosen bridal look.',          120, 12000, 15, v_hair, true),
    (v_sid, 'Bridal Party Makeup',   'Bridal', 'Makeup for bridesmaids and the wedding party.',               90,  8000, 15, v_hair, true),
    (v_sid, 'Formal Updo',           'Bridal', 'Elegant updo for engagement ceremonies and events.',          75,  4500, 12, v_hair, true);

  -- MASSAGE (no station — uses massage bed)
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Swedish Relaxation',       'Massage', 'Full-body Swedish massage for deep relaxation.',         60,  4500, 12, null, true),
    (v_sid, 'Head & Shoulder Massage',  'Massage', 'Targeted relief for neck, shoulders, and scalp.',        30,  2000, 12, null, true),
    (v_sid, 'Full Body Massage',        'Massage', 'Extended full-body massage with aromatherapy oils.',     90,  7000, 12, null, true),
    (v_sid, 'Foot Massage',             'Massage', 'Reflexology-inspired foot and calf massage.',            30,  1800, 12, null, true);

  -- WAX
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Eyebrow Wax',           'Wax', 'Clean eyebrow shaping with warm wax.',                          15,   500, 10, v_wax, true),
    (v_sid, 'Underarm Wax',          'Wax', 'Underarm waxing for clean, smooth results.',                    20,   800, 10, v_wax, true),
    (v_sid, 'Half Leg Wax',          'Wax', 'Lower-leg wax from ankle to knee.',                             30,  1800, 10, v_wax, true),
    (v_sid, 'Full Leg Wax',          'Wax', 'Complete leg wax from ankle to upper thigh.',                   45,  3000, 10, v_wax, true),
    (v_sid, 'Bikini Line Wax',       'Wax', 'Neat bikini line waxing.',                                      20,  2000, 10, v_wax, true),
    (v_sid, 'Brazilian Wax',         'Wax', 'Full Brazilian wax for a clean, smooth finish.',                30,  3500, 10, v_wax, true),
    (v_sid, 'Full Body Wax',         'Wax', 'Complete full-body waxing session.',                            90,  8500, 10, v_wax, true);

  /* ── Customers (30 total) ── */
  insert into public.customers
    (id, salon_id, name, phone, birthday, tags, visits, total_spend, last_visit_date)
  values
    -- VIPs (5)
    ('dilini-perera',        v_sid, 'Dilini Perera',        '+94771234567', '1990-03-12', array['VIP','Regular'],                        28, 185000, '2026-05-10'),
    ('ayesha-fernando',      v_sid, 'Ayesha Fernando',      '+94772345678', '1988-07-04', array['VIP','Regular'],                        22, 142000, '2026-05-08'),
    ('nadeesha-silva',       v_sid, 'Nadeesha Silva',       '+94773456789', '1985-12-22', array['VIP'],                                  31, 210000, '2026-05-14'),
    ('kumari-jayawardena',   v_sid, 'Kumari Jayawardena',   '+94774567890', '1992-09-15', array['VIP','Regular'],                        19, 125000, '2026-05-01'),
    ('priyanka-weerasinghe', v_sid, 'Priyanka Weerasinghe', '+94775678901', '1987-05-29', array['VIP'],                                  35, 268000, '2026-05-12'),

    -- Regulars (7)
    ('sachini-rajapaksa',    v_sid, 'Sachini Rajapaksa',    '+94776789012', '1991-08-08', array['Regular'],                              12,  68000, '2026-04-28'),
    ('ruwani-bandara',       v_sid, 'Ruwani Bandara',       '+94777890123', '1989-02-14', array['Regular'],                               9,  52000, '2026-04-20'),
    ('malsha-wickramasinghe',v_sid, 'Malsha Wickramasinghe','+94778901234', '1994-11-11', array['Regular','Sensitive / Allergic'],       14,  78500, '2026-05-05'),
    ('nadeeka-gunasekara',   v_sid, 'Nadeeka Gunasekara',   '+94779012345', '1986-06-23', array['Regular'],                              11,  62000, '2026-04-15'),
    ('thisari-karunarathne', v_sid, 'Thisari Karunarathne', '+94770123456', '1993-10-30', array['Regular'],                               8,  44000, '2026-04-30'),
    ('ishara-dissanayake',   v_sid, 'Ishara Dissanayake',   '+94761234567', '1990-04-18', array['Regular'],                              16,  95000, '2026-05-09'),
    ('manori-abeywickrama',  v_sid, 'Manori Abeywickrama',  '+94762345678', '1988-12-05', array['Regular'],                               7,  38500, '2026-04-22'),

    -- Sensitive / allergic (2)
    ('sanduni-jayasinghe',   v_sid, 'Sanduni Jayasinghe',   '+94763456789', '1995-03-08', array['Sensitive / Allergic'],                  5,  22000, '2026-04-10'),
    ('himasha-liyanage',     v_sid, 'Himasha Liyanage',     '+94764567890', '1991-07-17', array['Sensitive / Allergic','Regular'],       10,  55000, '2026-05-03'),

    -- Occasional (6)
    ('lakmini-senarath',     v_sid, 'Lakmini Senarath',     '+94765678901', '1992-09-09', array[]::text[],                                4,  18000, '2026-03-28'),
    ('dulani-amarasinghe',   v_sid, 'Dulani Amarasinghe',   '+94766789012', null,         array[]::text[],                                3,  14500, '2026-03-15'),
    ('chathurya-madusanka',  v_sid, 'Chathurya Madusanka',  '+94767890123', '1994-01-26', array[]::text[],                                2,   8000, '2026-04-05'),
    ('yasoda-rathnayake',    v_sid, 'Yasoda Rathnayake',    '+94768901234', '1989-11-20', array[]::text[],                                5,  27000, '2026-04-18'),
    ('kavindi-samaraweera',  v_sid, 'Kavindi Samaraweera',  '+94769012345', null,         array[]::text[],                                3,  12500, '2026-03-20'),
    ('shenal-athukorala',    v_sid, 'Shenal Athukorala',    '+94760123456', '1996-08-14', array[]::text[],                                4,  19000, '2026-04-25'),

    -- New (10)
    ('tharushi-kumarasinghe',v_sid, 'Tharushi Kumarasinghe','+94751234567', null,         array['New'],                                   1,   3500, '2026-05-15'),
    ('harshani-gunawardane', v_sid, 'Harshani Gunawardane', '+94752345678', '1997-06-02', array['New'],                                   0,      0,  null),
    ('sashini-lokuge',       v_sid, 'Sashini Lokuge',       '+94753456789', null,         array['New'],                                   1,   2500, '2026-05-13'),
    ('amayaa-de-silva',      v_sid, 'Amayaa De Silva',      '+94754567890', '1999-02-19', array['New'],                                   0,      0,  null),
    ('yehani-mahawela',      v_sid, 'Yehani Mahawela',      '+94755678901', null,         array['New'],                                   1,   4500, '2026-05-11'),
    ('thilini-rathnasiri',   v_sid, 'Thilini Rathnasiri',   '+94756789012', '1995-10-07', array['New'],                                   0,      0,  null),
    ('madumali-herath',      v_sid, 'Madumali Herath',      '+94757890123', null,         array['New'],                                   1,   1500, '2026-05-14'),
    ('reshani-pathirana',    v_sid, 'Reshani Pathirana',    '+94758901234', '1998-04-25', array['New'],                                   0,      0,  null),
    ('vinuri-wickremaratne', v_sid, 'Vinuri Wickremaratne', '+94759012345', null,         array[]::text[],                                2,   9000, '2026-04-28'),
    ('punsara-kodikara',     v_sid, 'Punsara Kodikara',     '+94750123456', '1993-12-30', array[]::text[],                                2,   7500, '2026-05-02');

  /* ── Appointments (~25 across the next 2 weeks) ──
     Today per the app is 2026-05-19. Mix of completed (past),
     confirmed (upcoming), and a few pending/cancelled. */

  insert into public.appointments
    (salon_id, customer_id, service_id, staff_id, date, time, duration, status, tint, notes, payment_method, discount_amount)
  select
    v_sid,
    apt.customer_id,
    (select id from public.services where salon_id = v_sid and name = apt.service_name),
    apt.staff_id,
    apt.date::date,
    apt.time::time,
    apt.duration,
    apt.status,
    apt.tint,
    apt.notes,
    apt.payment_method,
    apt.discount_amount
  from (values
    -- ── Past (completed) ──
    ('dilini-perera',        'Balayage',             v_sachini, '2026-05-12', '10:00', 150, 'completed', 'plum',      null,                      'card',     0),
    ('ayesha-fernando',      'Gel Manicure',         v_kumudu,  '2026-05-13', '14:30',  60, 'completed', 'pink',      null,                      'cash',     0),
    ('priyanka-weerasinghe', 'Bridal Hair & Makeup', v_sachini, '2026-05-14', '08:00', 240, 'completed', 'champagne', 'Engagement ceremony.',    'transfer', 2000),
    ('ishara-dissanayake',   'Classic Facial',       v_pradeep, '2026-05-15', '11:00',  60, 'completed', 'plum',      null,                      'cash',     0),
    ('nadeesha-silva',       'Highlights',           v_sachini, '2026-05-16', '13:00',  90, 'completed', 'plum',      'Same shade as last time.','card',     500),
    ('himasha-liyanage',     'Swedish Relaxation',   v_anushka, '2026-05-17', '15:30',  60, 'completed', 'pink',      'Sensitive scalp — gentle.','card',    0),
    ('malsha-wickramasinghe','Gel Pedicure',         v_kumudu,  '2026-05-18', '10:30',  75, 'completed', 'plum',      null,                      'cash',     0),

    -- ── Today (mixed) ──
    ('dilini-perera',        'Ladies Cut & Blowdry', v_dilanka, '2026-05-19', '09:00',  60, 'confirmed', 'plum',      null,                      null,       0),
    ('sachini-rajapaksa',    'Classic Manicure',     v_kumudu,  '2026-05-19', '10:30',  45, 'confirmed', 'pink',      null,                      null,       0),
    ('ruwani-bandara',       'Full Body Massage',    v_anushka, '2026-05-19', '11:00',  90, 'confirmed', 'plum',      null,                      null,       0),
    ('tharushi-kumarasinghe','Eyebrow Threading',    null,      '2026-05-19', '13:00',  15, 'pending',   null,        'First visit — walk-in.',  null,       0),
    ('ayesha-fernando',      'Hair Updo',            v_sachini, '2026-05-19', '15:00',  60, 'confirmed', 'champagne', null,                      null,       0),

    -- ── Tomorrow ──
    ('kumari-jayawardena',   'Brightening Facial',   v_pradeep, '2026-05-20', '09:30',  60, 'confirmed', 'plum',      null,                      null,       0),
    ('nadeeka-gunasekara',   'Highlights',           v_sachini, '2026-05-20', '10:00',  90, 'confirmed', 'plum',      null,                      null,       0),
    ('manori-abeywickrama',  'Spa Pedicure',         v_kumudu,  '2026-05-20', '14:00',  75, 'confirmed', 'pink',      null,                      null,       0),
    ('thisari-karunarathne', 'Classic Facial',       v_pradeep, '2026-05-20', '16:30',  60, 'confirmed', 'plum',      null,                      null,       0),

    -- ── Rest of this week ──
    ('amayaa-de-silva',      'Classic Manicure',     v_kumudu,  '2026-05-21', '10:00',  45, 'confirmed', 'pink',      'First visit.',            null,       0),
    ('priyanka-weerasinghe', 'Keratin Treatment',    v_sachini, '2026-05-21', '13:00', 120, 'confirmed', 'plum',      null,                      null,       0),
    ('yasoda-rathnayake',    'Gel Pedicure',         v_kumudu,  '2026-05-22', '11:00',  75, 'confirmed', 'plum',      null,                      null,       0),
    ('lakmini-senarath',     'Head & Shoulder Massage', v_anushka, '2026-05-22', '15:00',  30, 'confirmed', 'pink',    null,                      null,       0),
    ('sanduni-jayasinghe',   'Deep Cleanse Facial',  v_pradeep, '2026-05-23', '10:00',  75, 'confirmed', 'plum',      'Sensitive — patch test.', null,       0),
    ('vinuri-wickremaratne', 'Eyebrow Wax',          null,      '2026-05-23', '14:30',  15, 'pending',   null,        null,                      null,       0),

    -- ── Next week ──
    ('reshani-pathirana',    'Hair Colour (Full)',   v_sachini, '2026-05-26', '09:00', 120, 'confirmed', 'plum',      'First-time colour.',      null,       0),
    ('madumali-herath',      'Gel Manicure',         v_kumudu,  '2026-05-27', '11:30',  60, 'confirmed', 'pink',      null,                      null,       0),
    ('dilini-perera',        'Bridal Party Makeup',  v_sachini, '2026-05-28', '07:30',  90, 'confirmed', 'champagne', 'Sister''s wedding.',      null,       0),
    ('chathurya-madusanka',  'Full Leg Wax',         null,      '2026-05-29', '13:00',  45, 'cancelled', null,        'Customer rescheduled.',   null,       0)
  ) as apt(customer_id, service_name, staff_id, date, time, duration, status, tint, notes, payment_method, discount_amount);

  raise notice 'Reset complete. Salon: %  (Test Salon, slug: test-salon)', v_sid;
  raise notice 'Owner: % linked to auth user %', v_owner_email, v_owner_uid;
  raise notice 'Seeded: 5 staff · 5 station types · ~40 services · 30 customers · ~25 appointments';
  raise notice 'Sign in at /login with % / 123456', v_owner_email;
end $$;


-- ── VERIFY ─────────────────────────────────────────────────────────────────

select 'salons'        as table_name, count(*) from public.salons
union all select 'salon_users',    count(*) from public.salon_users
union all select 'staff',          count(*) from public.staff
union all select 'station_types',  count(*) from public.station_types
union all select 'services',       count(*) from public.services
union all select 'customers',      count(*) from public.customers
union all select 'appointments',   count(*) from public.appointments
order by table_name;
