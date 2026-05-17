-- ════════════════════════════════════════════════════════════════════════════
-- SalonOS — Add a new salon owner (manual onboarding template)
-- Use this during the testing period to register owners without self-signup.
--
-- HOW TO USE
-- ──────────
-- 1. Fill in the ── CONFIG ── block below (all the CHANGE ME values).
-- 2. Run the STEP 1 block in Supabase → SQL Editor.
-- 3. Go to Supabase → Authentication → Users → "Add user":
--      • Enter the owner's email and a temporary password.
--      • Tick "Auto Confirm User" so they can log in immediately.
-- 4. Run the STEP 2 block to link the auth user to their salon.
-- 5. Share the login URL and credentials with the owner.
--
-- This file is a reusable template — duplicate it or re-run it for each
-- new salon. It is safe to re-run: all inserts use ON CONFLICT guards.
-- ════════════════════════════════════════════════════════════════════════════


-- ── CONFIG — edit these values before running ──────────────────────────────

-- Salon details
\set salon_name     'Salon Name Here'           -- CHANGE ME  e.g. 'Pastel 93'
\set salon_city     'City Here'                 -- CHANGE ME  e.g. 'Pannipitiya'
\set salon_tagline  ''                          -- optional   e.g. 'Soft hands. Quiet rooms.'
\set salon_address  ''                          -- optional   e.g. '93 High Level Road, Pannipitiya'
\set salon_phone    ''                          -- optional   e.g. '+94 77 123 4567'
\set salon_whatsapp ''                          -- optional   e.g. '+94 77 123 4567'
\set salon_slug     'salon-slug-here'           -- CHANGE ME  URL-safe, unique e.g. 'pastel93'

-- Owner details (must match the email used when creating the auth user)
\set owner_email    'owner@example.com'         -- CHANGE ME
\set owner_name     'Owner Full Name'           -- CHANGE ME  e.g. 'Sandya Perera'

-- ═══════════════════════════════════════════════════════════════════════════


-- ── STEP 1 — Create the salon ───────────────────────────────────────────────
-- Run this block first, before creating the auth user.

INSERT INTO public.salons (name, city, tagline, address, phone, whatsapp, booking_slug)
VALUES (
  :'salon_name',
  NULLIF(:'salon_city',     ''),
  NULLIF(:'salon_tagline',  ''),
  NULLIF(:'salon_address',  ''),
  NULLIF(:'salon_phone',    ''),
  NULLIF(:'salon_whatsapp', ''),
  :'salon_slug'
)
ON CONFLICT (booking_slug) DO UPDATE SET
  name          = EXCLUDED.name,
  city          = EXCLUDED.city,
  tagline       = EXCLUDED.tagline,
  address       = EXCLUDED.address,
  phone         = EXCLUDED.phone,
  whatsapp      = EXCLUDED.whatsapp;


-- ── PAUSE — create the auth user in the dashboard before continuing ─────────
--
-- Supabase Dashboard → Authentication → Users → "Add user"
--   Email:              <owner_email from CONFIG>
--   Password:           choose a temporary password and share it securely
--   Auto Confirm User:  ✔  (tick this so they can log in immediately)
--
-- Then run STEP 2 below.
-- ────────────────────────────────────────────────────────────────────────────


-- ── STEP 2 — Link the auth user to their salon ──────────────────────────────
-- Run this block AFTER the auth user has been created in the dashboard.

INSERT INTO public.salon_users (user_id, salon_id, full_name, role)
SELECT
  u.id,
  s.id,
  :'owner_name',
  'owner'
FROM       auth.users   u
INNER JOIN public.salons s ON s.booking_slug = :'salon_slug'
WHERE u.email = :'owner_email'
ON CONFLICT (user_id) DO UPDATE SET
  salon_id  = EXCLUDED.salon_id,
  full_name = EXCLUDED.full_name,
  role      = EXCLUDED.role;


-- ── VERIFY — confirm both rows were created ─────────────────────────────────

SELECT
  s.name        AS salon,
  s.city,
  s.booking_slug,
  su.full_name  AS owner,
  su.role,
  u.email,
  su.created_at
FROM       public.salon_users su
INNER JOIN public.salons      s ON s.id  = su.salon_id
INNER JOIN auth.users         u ON u.id  = su.user_id
WHERE s.booking_slug = :'salon_slug';


-- ════════════════════════════════════════════════════════════════════════════
-- DONE. The owner can now log in at /login with their email and password.
-- ════════════════════════════════════════════════════════════════════════════
