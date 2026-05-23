-- ════════════════════════════════════════════════════════════════════════════
-- SalonOS — Pastel 93 service catalogue
--
--  Seeds every service from Pastel 93's price list, including:
--    • Variants    — for waxing tiers (Classic Strip / Premium Strip /
--                    White Chocolate / Luxury Wax) and body parts that only
--                    have the two hard-wax options
--    • Add-ons     — French / nail art / foil / rhinestone / 3D arts and the
--                    soak/gel-colour options, wired to the right base service
--    • Unit labels — for per-finger / per-nail pricing
--    • Patch-test  — flag set on all waxing services
--
-- ── PREREQUISITES ────────────────────────────────────────────────────────────
--   1. Run db/services_extensions.sql first (adds the columns/tables).
--   2. Run db/pastel93_setup.sql first (creates the salon).
--
--   Note: the SQL Editor runs as the postgres role with auth.uid() = null,
--   so current_salon_id() returns null and the table defaults cannot fill
--   salon_id automatically. Every insert below passes salon_id explicitly
--   (via v_sid) for that reason.
--
-- ── HOW TO USE ───────────────────────────────────────────────────────────────
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run
--
--   Safe to re-run: wipes the salon's services/variants/addons/station_types
--   first, then re-seeds. Will refuse if there are appointments that reference
--   any of the services (so you don't lose history).
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_sid           uuid;
  v_apt_count     integer;
  v_nail_station  bigint;
  v_pedi_station  bigint;
  v_wax_room      bigint;
begin

  -- ── Resolve the salon ───────────────────────────────────────────────────────
  select id into v_sid from public.salons where name = 'Pastel 93' limit 1;
  if v_sid is null then
    raise exception
      'Salon "Pastel 93" not found. Run db/pastel93_setup.sql first.';
  end if;

  -- ── Refuse if appointments exist (don't break history) ──────────────────────
  select count(*) into v_apt_count
    from public.appointments
   where salon_id = v_sid;
  if v_apt_count > 0 then
    raise exception
      'Pastel 93 already has % appointments. Re-seeding would drop their service references. '
      'Cancel or migrate the appointments first.',
      v_apt_count;
  end if;

  -- ── Wipe existing catalogue for this salon ──────────────────────────────────
  delete from public.service_addons   where salon_id = v_sid;
  delete from public.service_variants where salon_id = v_sid;
  delete from public.services         where salon_id = v_sid;
  delete from public.station_types    where salon_id = v_sid;

  -- ── Station types ──────────────────────────────────────────────────────────
  insert into public.station_types (salon_id, name, count) values
    (v_sid, 'Nail Station',     3),
    (v_sid, 'Pedicure Station', 2),
    (v_sid, 'Wax Room',         1);

  select id into v_nail_station from public.station_types where salon_id = v_sid and name = 'Nail Station';
  select id into v_pedi_station from public.station_types where salon_id = v_sid and name = 'Pedicure Station';
  select id into v_wax_room     from public.station_types where salon_id = v_sid and name = 'Wax Room';

  -- ═══════════════════════════════════════════════════════════════════════════
  --  MANICURES (page 4)
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled, allows_addons)
  values
    (v_sid, 'Express Manicure', 'Hands',
     'Nail trimming, shaping, cuticle care, soak, moisturising scrub, lotion, regular nail polish. (40 mins)',
     40, 3000, 10, v_nail_station, true, true),
    (v_sid, 'Classic Manicure', 'Hands',
     'Nail trimming, shaping, cuticle care, soak, moisturising scrub, deep hydration hand mask, massaging cream with hand & wooden massager, lotion, regular nail polish. (70 mins)',
     70, 3800, 12, v_nail_station, true, true),
    (v_sid, 'Premium Manicure', 'Hands',
     'Nail trimming, shaping, cuticle care, soak, moisturising scrub, deep hydration hand mask, massaging cream with hand, wooden & electric massager, lotion, regular nail polish. (90 mins)',
     90, 4500, 12, v_nail_station, true, true);

  -- Manicure add-ons (shared list — Rs 2000 for gel colour application)
  insert into public.service_addons (salon_id, service_id, name, price, unit_label, duration_added, sort_order)
  select v_sid, s.id, x.name, x.price, x.unit_label, x.duration_added, x.sort_order
    from public.services s,
         (values
           ('Soak of gel colour',     1000, null::text,   10, 0),
           ('Soak of extension',      1500, null,         15, 1),
           ('Gel colour application', 2000, null,         15, 2),
           ('French',                  100, 'per finger',  0, 3),
           ('Nail art',                150, 'per finger',  0, 4),
           ('Ombre',                   150, 'per finger',  0, 5),
           ('Cat eye',                 150, 'per finger',  0, 6),
           ('Marble',                  150, 'per finger',  0, 7),
           ('Blooming art',            150, 'per finger',  0, 8),
           ('Basic 3D arts',           300, 'per finger',  0, 9)
         ) as x(name, price, unit_label, duration_added, sort_order)
   where s.salon_id = v_sid
     and s.name in ('Express Manicure', 'Classic Manicure', 'Premium Manicure');

  -- ═══════════════════════════════════════════════════════════════════════════
  --  PEDICURES (page 5) — gel colour application is Rs 1500 (different from mani)
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled, allows_addons)
  values
    (v_sid, 'Express Pedicure', 'Feet',
     'Nail trimming, shaping, cuticle care, soak, dead skin removal, moisturising scrub, lotion, regular nail polish. (40 mins)',
     40, 3500, 10, v_pedi_station, true, true),
    (v_sid, 'Classic Pedicure', 'Feet',
     'Nail trimming, shaping, cuticle care, soak, dead skin removal, moisturising scrub, deep hydration foot mask, massaging cream with hand & wooden massager, lotion, regular nail polish. (70 mins)',
     70, 4500, 12, v_pedi_station, true, true),
    (v_sid, 'Premium Pedicure', 'Feet',
     'Nail trimming, shaping, cuticle care, soak, jelly soak, dead skin removal, moisturising scrub, deep hydration foot mask, massaging cream with hand, wooden & electric massager, lotion, regular nail polish. (90 mins)',
     90, 5500, 12, v_pedi_station, true, true);

  insert into public.service_addons (salon_id, service_id, name, price, unit_label, duration_added, sort_order)
  select v_sid, s.id, x.name, x.price, x.unit_label, x.duration_added, x.sort_order
    from public.services s,
         (values
           ('Soak of gel colour',     1000, null::text,   10, 0),
           ('Soak of extension',      1500, null,         15, 1),
           ('Gel colour application', 1500, null,         15, 2),
           ('French',                  100, 'per toe',     0, 3),
           ('Nail art',                150, 'per toe',     0, 4),
           ('Ombre',                   150, 'per toe',     0, 5),
           ('Cat eye',                 150, 'per toe',     0, 6),
           ('Marble',                  150, 'per toe',     0, 7),
           ('Blooming art',            150, 'per toe',     0, 8),
           ('Basic 3D arts',           300, 'per toe',     0, 9)
         ) as x(name, price, unit_label, duration_added, sort_order)
   where s.salon_id = v_sid
     and s.name in ('Express Pedicure', 'Classic Pedicure', 'Premium Pedicure');

  -- ═══════════════════════════════════════════════════════════════════════════
  --  NAIL ENHANCEMENTS — HAND (page 2)
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled, allows_addons, unit_label)
  values
    (v_sid, 'Acrylic on Natural Nails (Hand)',  'Hands', 'Acrylic overlay on natural nails for strength and length.',                                 75,  5000, 12, v_nail_station, true, true,  null),
    (v_sid, 'Acrylic Full Set with Tips',       'Hands', 'Full set of acrylic extensions with clear tips.',                                            90,  6500, 12, v_nail_station, true, true,  null),
    (v_sid, 'Acrylic Full Set with Coloured Tips','Hands','Full set of acrylic extensions finished with coloured tips.',                              90,  7000, 12, v_nail_station, true, true,  null),
    (v_sid, 'Acrylic Re-fills',                 'Hands', 'Refill grown-out acrylic nails — recommended every 2–3 weeks.',                              60,  5000, 12, v_nail_station, true, true,  null),
    (v_sid, 'Acrylic One Nail',                 'Hands', 'Single acrylic nail fix or addition — charged per nail.',                                    15,   500, 10, v_nail_station, true, false, 'per nail'),
    (v_sid, 'Gel on Natural Nails (Hand)',      'Hands', 'Gel overlay on natural nails for shine and protection.',                                     75,  6000, 12, v_nail_station, true, true,  null),
    (v_sid, 'Gel Extension with Tips',          'Hands', 'Gel extensions with tips for added length.',                                                 90,  8000, 12, v_nail_station, true, true,  null),
    (v_sid, 'Gel Re-fills',                     'Hands', 'Refill grown-out gel nails — recommended every 2–3 weeks.',                                  60,  6000, 12, v_nail_station, true, true,  null),
    (v_sid, 'Gel One Nail',                     'Hands', 'Single gel nail fix or addition — charged per nail.',                                        15,   600, 10, v_nail_station, true, false, 'per nail'),
    (v_sid, 'Temporary Tips',                   'Hands', 'Quick temporary nail tips for short-term wear (e.g. a single event).',                       45,  5000, 10, v_nail_station, true, true,  null);

  -- Nail enhancement add-ons (the page 3 list — French / nail art / etc, but applied as extras
  -- on top of an enhancement service, and a few standalone extras like rhinestone & 2-3 colour ombre).
  insert into public.service_addons (salon_id, service_id, name, price, unit_label, duration_added, sort_order)
  select v_sid, s.id, x.name, x.price, x.unit_label, x.duration_added, x.sort_order
    from public.services s,
         (values
           ('French',              100, 'per finger', 0, 0),
           ('Nail art',            150, 'per finger', 0, 1),
           ('Ombre',               150, 'per finger', 0, 2),
           ('2–3 colour ombre',    300, null::text,   0, 3),
           ('Cat eye',             150, 'per finger', 0, 4),
           ('Marble',              150, 'per finger', 0, 5),
           ('Blooming art',        150, 'per finger', 0, 6),
           ('Foil design',         150, null,         0, 7),
           ('Sticker arts',         50, null,         0, 8),
           ('Rhinestone',          250, null,         0, 9),
           ('Basic 3D arts',       300, 'per finger', 0, 10)
         ) as x(name, price, unit_label, duration_added, sort_order)
   where s.salon_id = v_sid
     and s.name in (
       'Acrylic on Natural Nails (Hand)','Acrylic Full Set with Tips','Acrylic Full Set with Coloured Tips',
       'Acrylic Re-fills','Gel on Natural Nails (Hand)','Gel Extension with Tips','Gel Re-fills',
       'Temporary Tips'
     );

  -- ═══════════════════════════════════════════════════════════════════════════
  --  NAIL ENHANCEMENTS — TOE (page 2)
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled, allows_addons, unit_label)
  values
    (v_sid, 'Acrylic on Natural Nails (Toe)',          'Feet', 'Acrylic overlay on natural toenails.',                                  60,  3800, 12, v_pedi_station, true, false, null),
    (v_sid, 'Acrylic Full Set with Coloured Tips (Toe)','Feet','Full set of acrylic toenail extensions with coloured tips.',            75,  4500, 12, v_pedi_station, true, false, null),
    (v_sid, 'Acrylic for Big Toe Nail',                'Feet', 'Single acrylic for a big toe — charged per nail.',                      15,   500, 10, v_pedi_station, true, false, 'per nail'),
    (v_sid, 'Gel on Natural Nails (Toe)',              'Feet', 'Gel overlay on natural toenails.',                                      60,  4800, 12, v_pedi_station, true, false, null),
    (v_sid, 'Gel Full Set with Coloured Tips (Toe)',   'Feet', 'Full set of gel toenail extensions with coloured tips.',                75,  5500, 12, v_pedi_station, true, false, null),
    (v_sid, 'Gel for Big Toe Nail',                    'Feet', 'Single gel for a big toe — charged per nail.',                          15,   600, 10, v_pedi_station, true, false, 'per nail');

  -- ═══════════════════════════════════════════════════════════════════════════
  --  NAIL REMOVAL / SOAK-OFF
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Gel Colour Soak-off',         'Hands', 'Safe removal of gel polish via soak-off.',          15, 1000,  8, v_nail_station, true),
    (v_sid, 'Extension / Gel Removal',     'Hands', 'Safe removal of extensions or gel overlays.',       20, 1500,  8, v_nail_station, true);

  -- ═══════════════════════════════════════════════════════════════════════════
  --  WAXING — NECK TO TOE (page 6) — tiered pricing
  --  Tier order (sort_order):
  --     0 = Classic Strip (soft)
  --     1 = Premium Strip (soft)
  --     2 = White Chocolate (hard)
  --     3 = Luxury Wax (hard)
  --  Some body parts only have hard wax (2 + 3) — Underarms, Bikini, Brazilian, Hollywood.
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled, has_variants, requires_patch_test)
  values
    (v_sid, 'Wax — Half Arms',   'Wax', 'Half-arm waxing. Patch test required 24 hours ahead.',     30, 2500, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Full Arms',   'Wax', 'Full-arm waxing. Patch test required 24 hours ahead.',     45, 3200, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Half Legs',   'Wax', 'Lower-leg wax from ankle to knee. Patch test required.',   30, 3200, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Full Legs',   'Wax', 'Full-leg wax from ankle to upper thigh. Patch test required.',45,3700, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Underarms',   'Wax', 'Underarm waxing (hard wax only). Patch test required.',    20, 1200, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Chest',       'Wax', 'Chest waxing. Patch test required 24 hours ahead.',         25, 1200, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Stomach',     'Wax', 'Stomach waxing. Patch test required.',                      20, 1000, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Waist Line',  'Wax', 'Waist-line waxing. Patch test required.',                   25, 1500, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Bikini Line', 'Wax', 'Bikini-line waxing (hard wax only). Patch test required.',  20, 3000, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Brazilian',   'Wax', 'Brazilian wax (hard wax only). Patch test required.',       30, 5000, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Hollywood',   'Wax', 'Hollywood wax (hard wax only). Patch test required.',       30, 5500, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Half Back',   'Wax', 'Half-back waxing. Patch test required.',                    30, 2000, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Back',        'Wax', 'Full back waxing. Patch test required.',                    45, 3000, 10, v_wax_room, true, true, true),
    (v_sid, 'Wax — Buttocks',    'Wax', 'Buttocks waxing. Patch test required.',                     25, 2000, 10, v_wax_room, true, true, true);

  -- Tier variants — Soft (Classic / Premium Strip)
  -- Half Arms: 2500 / 3000 / 4500 / 5000
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values
           ('Classic Strip',    2500, 0),
           ('Premium Strip',    3000, 1),
           ('White Chocolate',  4500, 2),
           ('Luxury Wax',       5000, 3)
         ) as v(n, p, ord)
   where s.salon_id = v_sid and s.name = 'Wax — Half Arms';

  -- Full Arms: 3200 / 3500 / 5000 / 6000
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',3200,0),('Premium Strip',3500,1),('White Chocolate',5000,2),('Luxury Wax',6000,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Full Arms';

  -- Half Legs: 3200 / 3500 / 5000 / 5700
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',3200,0),('Premium Strip',3500,1),('White Chocolate',5000,2),('Luxury Wax',5700,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Half Legs';

  -- Full Legs: 3700 / 4000 / 5500 / 6200
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',3700,0),('Premium Strip',4000,1),('White Chocolate',5500,2),('Luxury Wax',6200,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Full Legs';

  -- Underarms (hard wax only): White Chocolate 1200 / Luxury 1700
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('White Chocolate',1200,0),('Luxury Wax',1700,1)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Underarms';

  -- Chest: 1200 / 1500 / 2000 / 2500
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',1200,0),('Premium Strip',1500,1),('White Chocolate',2000,2),('Luxury Wax',2500,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Chest';

  -- Stomach: 1000 / 1200 / 1500 / 1700
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',1000,0),('Premium Strip',1200,1),('White Chocolate',1500,2),('Luxury Wax',1700,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Stomach';

  -- Waist Line: 1500 / 1800 / 2300 / 2800
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',1500,0),('Premium Strip',1800,1),('White Chocolate',2300,2),('Luxury Wax',2800,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Waist Line';

  -- Bikini Line (hard wax only): 3000 / 3500
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('White Chocolate',3000,0),('Luxury Wax',3500,1)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Bikini Line';

  -- Brazilian (hard wax only): 5000 / 5500
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('White Chocolate',5000,0),('Luxury Wax',5500,1)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Brazilian';

  -- Hollywood (hard wax only): 5500 / 6000
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('White Chocolate',5500,0),('Luxury Wax',6000,1)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Hollywood';

  -- Half Back: 2000 / 2500 / 3000 / 3500
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',2000,0),('Premium Strip',2500,1),('White Chocolate',3000,2),('Luxury Wax',3500,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Half Back';

  -- Back: 3000 / 3500 / 4000 / 5500
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',3000,0),('Premium Strip',3500,1),('White Chocolate',4000,2),('Luxury Wax',5500,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Back';

  -- Buttocks: 2000 / 2500 / 3000 / 3500
  insert into public.service_variants (salon_id, service_id, name, price, sort_order)
  select v_sid, s.id, n, p, ord
    from public.services s,
         (values ('Classic Strip',2000,0),('Premium Strip',2500,1),('White Chocolate',3000,2),('Luxury Wax',3500,3)) as v(n,p,ord)
   where s.salon_id = v_sid and s.name = 'Wax — Buttocks';

  -- ═══════════════════════════════════════════════════════════════════════════
  --  WAXING — FACIAL (page 6) — single-price flat services
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled, requires_patch_test)
  values
    (v_sid, 'Wax — In-between Brows',     'Wax', 'Quick clean-up between the brows.',                10,   400, 10, v_wax_room, true, true),
    (v_sid, 'Wax — Eyebrows',             'Wax', 'Eyebrow shaping with warm wax.',                   15,  2000, 10, v_wax_room, true, true),
    (v_sid, 'Wax — Forehead',             'Wax', 'Forehead waxing.',                                 10,  1500, 10, v_wax_room, true, true),
    (v_sid, 'Wax — Upper Lip',            'Wax', 'Upper lip waxing.',                                10,   800, 10, v_wax_room, true, true),
    (v_sid, 'Wax — Lower Lip or Chin',    'Wax', 'Lower lip or chin waxing.',                        10,  1200, 10, v_wax_room, true, true),
    (v_sid, 'Wax — Sideburns',            'Wax', 'Sideburn waxing.',                                 15,  1200, 10, v_wax_room, true, true),
    (v_sid, 'Wax — Neck',                 'Wax', 'Neck waxing.',                                     20,  3000, 10, v_wax_room, true, true),
    (v_sid, 'Wax — Full Face',            'Wax', 'Full-face waxing — brows, upper lip, chin, forehead, sideburns. Patch test required.', 35, 4000, 10, v_wax_room, true, true);

  -- ═══════════════════════════════════════════════════════════════════════════
  --  WAXING — FULL BODY COMBOS (page 6)
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled, requires_patch_test)
  values
    (v_sid, 'Classic Combo (Full Body Wax)',  'Wax',
     'Full body wax bundle — underarms (white chocolate), full arms (classic strip), stomach (classic strip), back (classic strip), waist line (classic strip), brazilian (white chocolate), full legs (classic strip).',
     180, 18500, 12, v_wax_room, true, true),
    (v_sid, 'Luxury Combo (Full Body Wax)',   'Wax',
     'Full body wax bundle — underarms (luxury), full arms (premium strip), stomach (premium strip), back (premium strip), waist line (premium strip), brazilian (luxury), full legs (premium strip).',
     180, 21000, 12, v_wax_room, true, true);

  -- ═══════════════════════════════════════════════════════════════════════════
  --  THREADING (page 8)
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Eyebrow Shape with Threading', 'Threading', 'Precise eyebrow shaping with thread.',    15,  400, 10, null, true),
    (v_sid, 'Threading — Forehead',         'Threading', 'Forehead threading.',                     10,  300, 10, null, true),
    (v_sid, 'Threading — Upper Lip',        'Threading', 'Upper lip threading.',                    10,  300, 10, null, true),
    (v_sid, 'Threading — Lower Lip',        'Threading', 'Lower lip threading.',                     5,  200, 10, null, true),
    (v_sid, 'Threading — Lower Lip with Chin','Threading','Lower lip and chin threading.',          10,  400, 10, null, true),
    (v_sid, 'Threading — Sideburns',        'Threading', 'Sideburn threading.',                     15,  700, 10, null, true),
    (v_sid, 'Threading — Cheeks',           'Threading', 'Cheek threading.',                        15,  600, 10, null, true),
    (v_sid, 'Threading — Chin & Jawline',   'Threading', 'Chin and jawline threading.',             10,  400, 10, null, true),
    (v_sid, 'Threading — Full Face',        'Threading', 'Brows, upper lip, lower lip, chin, forehead, sideburns and cheeks.', 45, 2500, 10, null, true);

  -- ═══════════════════════════════════════════════════════════════════════════
  --  KIDS (page 7)
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  values
    (v_sid, 'Tiny Tots Treat',       'Hands',
     'Soft filing, gentle scrubbing, jelly soak, detail nail care, nail shaping, cuticle care, regular nail polish with simple nail art, relaxing hand & leg massage. (40 mins)',
     40, 4000, 10, v_nail_station, true),
    (v_sid, 'Sweet Little Bliss',    'Hands',
     'Tiny Tots Treat + hair coloured braiding. (60 mins)',
     60, 5000, 10, v_nail_station, true),
    (v_sid, 'Giggles & Glamour',     'Hands',
     'Sweet Little Bliss + light shimmer makeup. (75 mins)',
     75, 6000, 10, v_nail_station, true);

  -- ── Done ────────────────────────────────────────────────────────────────────
  raise notice '';
  raise notice '✓ Pastel 93 service catalogue seeded.';
  raise notice '  Salon ID: %', v_sid;
  raise notice '  Run the queries below to inspect the catalogue.';
  raise notice '';

end $$;


-- ── VERIFY ─────────────────────────────────────────────────────────────────

select 'services'        as item, count(*) from public.services
  where salon_id = (select id from public.salons where name = 'Pastel 93')
union all
select 'service_variants',     count(*) from public.service_variants
  where salon_id = (select id from public.salons where name = 'Pastel 93')
union all
select 'service_addons',       count(*) from public.service_addons
  where salon_id = (select id from public.salons where name = 'Pastel 93')
union all
select 'station_types',        count(*) from public.station_types
  where salon_id = (select id from public.salons where name = 'Pastel 93');

-- Show services by category, with variant/addon counts:
select
  s.category,
  s.name,
  s.duration as min,
  s.price    as base_lkr,
  s.unit_label,
  case when s.has_variants  then '✓' else '' end as tiered,
  case when s.allows_addons then '✓' else '' end as extras,
  case when s.requires_patch_test then '⚠' else '' end as patch_test,
  (select count(*) from public.service_variants v where v.service_id = s.id) as variants,
  (select count(*) from public.service_addons   a where a.service_id = s.id) as addons
from public.services s
where s.salon_id = (select id from public.salons where name = 'Pastel 93')
order by s.category, s.name;
