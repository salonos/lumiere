-- ============================================================
-- SalonOS — Self-contained seed / reset script
-- Applies any missing schema migrations first, then loads data.
-- Safe to re-run: all ALTER TABLE use IF NOT EXISTS.
-- Run in Supabase SQL editor (service-role context).
-- ============================================================

-- ── Schema: migration 004 ─────────────────────────────────────────────────────
-- commission_rate on services (per-service %, credited to performing staff)
alter table public.services
  add column if not exists commission_rate numeric(5,2)
  check (commission_rate is null
      or (commission_rate >= 0 and commission_rate <= 100));

-- staff_id on appointments (NULL = owner performed the service)
alter table public.appointments
  add column if not exists staff_id bigint
  references public.staff(id) on delete set null;

-- ── Schema: migration 005 ─────────────────────────────────────────────────────
-- Payment info captured when appointment is marked complete
alter table public.appointments
  add column if not exists payment_method text
  check (payment_method in ('cash', 'card', 'transfer'));

alter table public.appointments
  add column if not exists discount_amount numeric(10,2) not null default 0
  check (discount_amount >= 0);

-- Station type link on services (which physical station this service uses)
alter table public.services
  add column if not exists station_type_id bigint
  references public.station_types(id) on delete set null;

-- ── Schema: migration 006 ─────────────────────────────────────────────────────
alter table public.customers
  add column if not exists birthday date;

-- ── Data ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_sid   uuid;
  v_nail  bigint;
  v_hair  bigint;
  v_pedi  bigint;
  v_wax   bigint;
BEGIN

  /* 0. Resolve salon */
  SELECT id INTO v_sid FROM public.salons LIMIT 1;
  IF v_sid IS NULL THEN
    RAISE EXCEPTION 'No salon found. Create a salon first.';
  END IF;

  /* 1. Clean slate (FK order) */
  DELETE FROM public.appointments  WHERE salon_id = v_sid;
  DELETE FROM public.customers     WHERE salon_id = v_sid;
  DELETE FROM public.staff         WHERE salon_id = v_sid;
  DELETE FROM public.services      WHERE salon_id = v_sid;
  DELETE FROM public.station_types WHERE salon_id = v_sid;

  /* 2. Station types */
  INSERT INTO public.station_types (salon_id, name, count) VALUES
    (v_sid, 'Nail & Manicure', 2),
    (v_sid, 'Hair & Makeup',   2),
    (v_sid, 'Pedicure',        2),
    (v_sid, 'Wax',             1);

  SELECT id INTO v_nail FROM public.station_types WHERE salon_id = v_sid AND name = 'Nail & Manicure';
  SELECT id INTO v_hair FROM public.station_types WHERE salon_id = v_sid AND name = 'Hair & Makeup';
  SELECT id INTO v_pedi FROM public.station_types WHERE salon_id = v_sid AND name = 'Pedicure';
  SELECT id INTO v_wax  FROM public.station_types WHERE salon_id = v_sid AND name = 'Wax';

  /* 3. Staff — 2 generalists */
  INSERT INTO public.staff (salon_id, name, role, active) VALUES
    (v_sid, 'Dilanka Perera',     'Stylist', true),
    (v_sid, 'Sachini Rathnayake', 'Stylist', true);

  /* 4. Services
     station_type_id = NULL  →  no dedicated station (threading, skin, massage)
  */

  -- HAIR
  INSERT INTO public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  VALUES
    (v_sid, 'Ladies Cut & Blowdry',  'Hair', 'Precision cut finished with a blowdry and style.',                60,  2500, 12, v_hair, true),
    (v_sid, 'Gents Cut',             'Hair', 'Clean, classic cut for men.',                                    30,  1000, 10, v_hair, true),
    (v_sid, 'Blowdry & Style',       'Hair', 'Blowdry and set to your preference.',                            45,  1500, 10, v_hair, true),
    (v_sid, 'Hair Colour (Full)',     'Hair', 'Full head colour using professional-grade dye.',                120,  8000, 15, v_hair, true),
    (v_sid, 'Highlights',            'Hair', 'Partial or full highlights for a sun-kissed finish.',            90,  6500, 15, v_hair, true),
    (v_sid, 'Balayage',              'Hair', 'Hand-painted colour for a natural gradient effect.',            150, 12000, 15, v_hair, true),
    (v_sid, 'Keratin Treatment',     'Hair', 'Smoothing and frizz control. Lasts up to 3 months.',            120, 10000, 15, v_hair, true),
    (v_sid, 'Deep Conditioning',     'Hair', 'Intensive moisture treatment for dry or damaged hair.',          45,  2000, 10, v_hair, true),
    (v_sid, 'Hair Updo',             'Hair', 'Elegant updo for events and formal occasions.',                  60,  3500, 12, v_hair, true);

  -- SKIN  (no station)
  INSERT INTO public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  VALUES
    (v_sid, 'Classic Facial',        'Skin', 'Cleanse, exfoliate, tone, and moisturise for everyday glow.',   60,  3500, 12, NULL, true),
    (v_sid, 'Deep Cleanse Facial',   'Skin', 'Targeted deep cleanse for congested or acne-prone skin.',       75,  5500, 12, NULL, true),
    (v_sid, 'Brightening Facial',    'Skin', 'Vitamin C treatment for uneven skin tone.',                     60,  4500, 12, NULL, true),
    (v_sid, 'Anti-Ageing Facial',    'Skin', 'Firming and hydrating facial targeting fine lines.',            75,  6000, 12, NULL, true);

  -- NAILS  (Nail & Manicure station)
  INSERT INTO public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  VALUES
    (v_sid, 'Classic Manicure',      'Nails', 'Shape, buff, cuticle care, and polish.',                       45,  1500, 10, v_nail, true),
    (v_sid, 'Gel Manicure',          'Nails', 'Long-lasting gel polish — chip-free for 2–3 weeks.',           60,  2800, 10, v_nail, true),
    (v_sid, 'Acrylic Extensions',    'Nails', 'Full set of acrylic nail extensions.',                         90,  5000, 10, v_nail, true),
    (v_sid, 'Nail Art (per set)',     'Nails', 'Custom nail art designs — consult for options.',               45,  1200, 10, v_nail, true),
    (v_sid, 'Nail Removal',          'Nails', 'Safe removal of gel, acrylic, or extensions.',                 30,   800,  8, v_nail, true);

  -- PEDICURE  (Pedicure station)
  INSERT INTO public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  VALUES
    (v_sid, 'Classic Pedicure',      'Nails', 'Soak, shape, cuticle care, and polish.',                       60,  2000, 10, v_pedi, true),
    (v_sid, 'Spa Pedicure',          'Nails', 'Classic pedicure with a hot-stone foot massage.',              75,  3200, 10, v_pedi, true),
    (v_sid, 'Gel Pedicure',          'Nails', 'Spa pedicure finished with long-lasting gel polish.',          75,  3800, 10, v_pedi, true),
    (v_sid, 'Medical Pedicure',      'Nails', 'Therapeutic care for calluses, cracked heels, and nail concerns.', 90, 4500, 10, v_pedi, true);

  -- THREADING  (no station)
  INSERT INTO public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  VALUES
    (v_sid, 'Eyebrow Threading',     'Threading', 'Precise shaping and definition for brows.',                15,   300, 10, NULL, true),
    (v_sid, 'Upper Lip Threading',   'Threading', 'Quick and clean upper lip hair removal.',                  10,   200, 10, NULL, true),
    (v_sid, 'Chin Threading',        'Threading', 'Chin hair removal by threading.',                          10,   200, 10, NULL, true),
    (v_sid, 'Full Face Threading',   'Threading', 'Brows, upper lip, chin, forehead, and sideburns.',         30,   700, 10, NULL, true);

  -- BRIDAL  (Hair & Makeup station)
  INSERT INTO public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  VALUES
    (v_sid, 'Bridal Hair & Makeup',  'Bridal', 'Complete bridal look — hair styling and full makeup.',       240, 25000, 15, v_hair, true),
    (v_sid, 'Trial Hair & Makeup',   'Bridal', 'Pre-wedding trial run of your chosen bridal look.',          120, 12000, 15, v_hair, true),
    (v_sid, 'Bridal Party Makeup',   'Bridal', 'Makeup for bridesmaids and the wedding party.',              90,   8000, 15, v_hair, true),
    (v_sid, 'Formal Updo',           'Bridal', 'Elegant updo for engagement ceremonies and events.',         75,   4500, 12, v_hair, true);

  -- MASSAGE  (no station)
  INSERT INTO public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  VALUES
    (v_sid, 'Swedish Relaxation',         'Massage', 'Full-body Swedish massage for deep relaxation.',        60,  4500, 12, NULL, true),
    (v_sid, 'Head & Shoulder Massage',    'Massage', 'Targeted relief for neck, shoulders, and scalp.',       30,  2000, 12, NULL, true),
    (v_sid, 'Full Body Massage',          'Massage', 'Extended full-body massage with aromatherapy oils.',    90,  7000, 12, NULL, true),
    (v_sid, 'Foot Massage',               'Massage', 'Reflexology-inspired foot and calf massage.',           30,  1800, 12, NULL, true);

  -- WAX  (Wax station)
  INSERT INTO public.services
    (salon_id, name, category, description, duration, price, commission_rate, station_type_id, enabled)
  VALUES
    (v_sid, 'Eyebrow Wax',           'Wax', 'Clean eyebrow shaping with warm wax.',                          15,   500, 10, v_wax, true),
    (v_sid, 'Upper Lip Wax',         'Wax', 'Quick upper lip hair removal with warm wax.',                   10,   350, 10, v_wax, true),
    (v_sid, 'Chin Wax',              'Wax', 'Chin hair removal with warm wax.',                              10,   300, 10, v_wax, true),
    (v_sid, 'Underarm Wax',          'Wax', 'Underarm waxing for clean, smooth results.',                    20,   800, 10, v_wax, true),
    (v_sid, 'Half Leg Wax',          'Wax', 'Lower-leg wax from ankle to knee.',                             30,  1800, 10, v_wax, true),
    (v_sid, 'Full Leg Wax',          'Wax', 'Complete leg wax from ankle to upper thigh.',                   45,  3000, 10, v_wax, true),
    (v_sid, 'Bikini Line Wax',       'Wax', 'Neat bikini line waxing.',                                      20,  2000, 10, v_wax, true),
    (v_sid, 'Brazilian Wax',         'Wax', 'Full Brazilian wax for a clean, smooth finish.',                30,  3500, 10, v_wax, true),
    (v_sid, 'Full Body Wax',         'Wax', 'Complete full-body waxing session.',                            90,  8500, 10, v_wax, true);

  /* 5. Customers — 30 total, varied for stress testing */
  INSERT INTO public.customers
    (id, salon_id, name, phone, tags, visits, total_spend, last_visit_date)
  VALUES
    -- VIP regulars
    ('dilini-perera',        v_sid, 'Dilini Perera',        '+94771234567', ARRAY['VIP','Regular'],                        28, 185000, '2026-05-10'),
    ('ayesha-fernando',      v_sid, 'Ayesha Fernando',      '+94772345678', ARRAY['VIP','Regular'],                        22, 142000, '2026-05-08'),
    ('nadeesha-silva',       v_sid, 'Nadeesha Silva',       '+94773456789', ARRAY['VIP'],                                  31, 210000, '2026-05-14'),
    ('kumari-jayawardena',   v_sid, 'Kumari Jayawardena',   '+94774567890', ARRAY['VIP','Regular'],                        19, 125000, '2026-05-01'),
    ('priyanka-weerasinghe', v_sid, 'Priyanka Weerasinghe', '+94775678901', ARRAY['VIP'],                                  35, 268000, '2026-05-12'),

    -- Regulars
    ('sachini-rajapaksa',    v_sid, 'Sachini Rajapaksa',    '+94776789012', ARRAY['Regular'],                              12,  68000, '2026-04-28'),
    ('ruwani-bandara',       v_sid, 'Ruwani Bandara',       '+94777890123', ARRAY['Regular'],                               9,  52000, '2026-04-20'),
    ('malsha-wickramasinghe',v_sid, 'Malsha Wickramasinghe','+94778901234', ARRAY['Regular','Sensitive / Allergic'],        14,  78500, '2026-05-05'),
    ('nadeeka-gunasekara',   v_sid, 'Nadeeka Gunasekara',   '+94779012345', ARRAY['Regular'],                              11,  62000, '2026-04-15'),
    ('thisari-karunarathne', v_sid, 'Thisari Karunarathne', '+94770123456', ARRAY['Regular'],                               8,  44000, '2026-04-30'),
    ('ishara-dissanayake',   v_sid, 'Ishara Dissanayake',   '+94761234567', ARRAY['Regular'],                              16,  95000, '2026-05-09'),
    ('manori-abeywickrama',  v_sid, 'Manori Abeywickrama',  '+94762345678', ARRAY['Regular'],                               7,  38500, '2026-04-22'),

    -- Sensitive / allergic
    ('sanduni-jayasinghe',   v_sid, 'Sanduni Jayasinghe',   '+94763456789', ARRAY['Sensitive / Allergic'],                  5,  22000, '2026-04-10'),
    ('himasha-liyanage',     v_sid, 'Himasha Liyanage',     '+94764567890', ARRAY['Sensitive / Allergic','Regular'],        10,  55000, '2026-05-03'),

    -- Occasional (2–5 visits)
    ('lakmini-senarath',     v_sid, 'Lakmini Senarath',     '+94765678901', ARRAY[]::text[],                                4,  18000, '2026-03-28'),
    ('dulani-amarasinghe',   v_sid, 'Dulani Amarasinghe',   '+94766789012', ARRAY[]::text[],                                3,  14500, '2026-03-15'),
    ('chathurya-madusanka',  v_sid, 'Chathurya Madusanka',  '+94767890123', ARRAY[]::text[],                                2,   8000, '2026-04-05'),
    ('yasoda-rathnayake',    v_sid, 'Yasoda Rathnayake',    '+94768901234', ARRAY[]::text[],                                5,  27000, '2026-04-18'),
    ('kavindi-samaraweera',  v_sid, 'Kavindi Samaraweera',  '+94769012345', ARRAY[]::text[],                                3,  12500, '2026-03-20'),
    ('shenal-athukorala',    v_sid, 'Shenal Athukorala',    '+94760123456', ARRAY[]::text[],                                4,  19000, '2026-04-25'),

    -- New (0–1 visits)
    ('tharushi-kumarasinghe',v_sid, 'Tharushi Kumarasinghe','+94751234567', ARRAY['New'],                                   1,   3500, '2026-05-15'),
    ('harshani-gunawardane', v_sid, 'Harshani Gunawardane', '+94752345678', ARRAY['New'],                                   0,      0,  NULL),
    ('sashini-lokuge',       v_sid, 'Sashini Lokuge',       '+94753456789', ARRAY['New'],                                   1,   2500, '2026-05-13'),
    ('amayaa-de-silva',      v_sid, 'Amayaa De Silva',      '+94754567890', ARRAY['New'],                                   0,      0,  NULL),
    ('yehani-mahawela',      v_sid, 'Yehani Mahawela',      '+94755678901', ARRAY['New'],                                   1,   4500, '2026-05-11'),
    ('thilini-rathnasiri',   v_sid, 'Thilini Rathnasiri',   '+94756789012', ARRAY['New'],                                   0,      0,  NULL),
    ('madumali-herath',      v_sid, 'Madumali Herath',      '+94757890123', ARRAY['New'],                                   1,   1500, '2026-05-14'),
    ('reshani-pathirana',    v_sid, 'Reshani Pathirana',    '+94758901234', ARRAY['New'],                                   0,      0,  NULL),
    ('vinuri-wickremaratne', v_sid, 'Vinuri Wickremaratne', '+94759012345', ARRAY[]::text[],                                2,   9000, '2026-04-28'),
    ('punsara-kodikara',     v_sid, 'Punsara Kodikara',     '+94750123456', ARRAY[]::text[],                                2,   7500, '2026-05-02');

  RAISE NOTICE 'Seed complete. Salon: %, Staff: 2, Services: 42, Customers: 30', v_sid;
END $$;
