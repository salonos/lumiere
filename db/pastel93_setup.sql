-- ════════════════════════════════════════════════════════════════════════════
-- SalonOS — New salon onboarding: Pastel 93
--
--  Creates the salon record and links it to the owner's auth account.
--  Safe to run on a live database — does NOT touch any other salon's data.
--
-- ── HOW TO USE ───────────────────────────────────────────────────────────────
--
--  STEP 1 — Create the owner auth user
--    Supabase Dashboard → Authentication → Users → "Add user"
--      • Email:             pastel930925@gmail.com
--      • Password:          P@stel93!Bloom
--      • Auto Confirm User: ✔  (tick this so they can log in immediately)
--
--  STEP 2 — Run this file
--    Supabase Dashboard → SQL Editor → New query → paste → Run
--
--  STEP 3 — Sign in at /login
--    Email:    pastel930925@gmail.com
--    Password: P@stel93!Bloom
--
--  The owner can update their display name from Settings after first login.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_owner_email constant text := 'pastel930925@gmail.com';
  v_owner_uid   uuid;
  v_sid         uuid;
begin

  -- ── 1. Resolve the auth user ──────────────────────────────────────────────
  select id into v_owner_uid
    from auth.users
   where email = v_owner_email;

  if v_owner_uid is null then
    raise exception
      'Auth user % not found. '
      'Go to Supabase Dashboard → Authentication → Users → Add user, '
      'enter the email and password, tick Auto Confirm, then re-run this script.',
      v_owner_email;
  end if;

  -- Guard: don't double-create if already linked
  if exists (select 1 from public.salon_users where user_id = v_owner_uid) then
    raise exception
      'Auth user % is already linked to a salon. '
      'If you want to reset, delete the salon_users and salons rows first.',
      v_owner_email;
  end if;

  -- ── 2. Create the salon ───────────────────────────────────────────────────
  insert into public.salons (name, booking_slug, opening_hours)
  values (
    'Pastel 93',
    'pastel-93',
    '{
      "monday":    {"on": true,  "open": "09:00", "close": "19:00"},
      "tuesday":   {"on": true,  "open": "09:00", "close": "19:00"},
      "wednesday": {"on": true,  "open": "09:00", "close": "19:00"},
      "thursday":  {"on": true,  "open": "09:00", "close": "19:00"},
      "friday":    {"on": true,  "open": "09:00", "close": "20:00"},
      "saturday":  {"on": true,  "open": "09:00", "close": "20:00"},
      "sunday":    {"on": false, "open": "",       "close": ""}
    }'::jsonb
  )
  returning id into v_sid;

  -- ── 3. Link the auth user as owner ────────────────────────────────────────
  --  full_name is left null — the owner sets their name in Settings after login.
  insert into public.salon_users (user_id, salon_id, role)
  values (v_owner_uid, v_sid, 'owner');

  raise notice '';
  raise notice '✓ Pastel 93 created successfully.';
  raise notice '  Salon ID : %', v_sid;
  raise notice '  Owner    : %  (uid: %)', v_owner_email, v_owner_uid;
  raise notice '  Login at /login with  pastel930925@gmail.com  /  P@stel93!Bloom';
  raise notice '  (Owner should update their display name in Settings after first login.)';
  raise notice '';

end $$;
