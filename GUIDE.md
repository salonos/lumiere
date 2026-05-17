# SalonOS — Build Guide

A multi-tenant salon management web app built on **Next.js 14 (App Router)** and **Supabase**. Branded *Lumière*. Designed for small Sri Lankan salons.

---

## What's been built so far

### Authentication & multi-tenancy
Every protected route is gated by a logged-in Supabase user. Each user belongs to exactly one **salon**, and every piece of data they read or write is automatically scoped to that salon by Postgres RLS policies. Two salons can never see each other's customers, services, appointments, or settings.

- **Salons** table holds salon profile (name, city, tagline, contact, booking slug)
- **Salon_users** table links each `auth.users` row to a `salons.id` with a role
- **Customers / Services / Appointments** all carry a `salon_id` column, auto-filled on insert by a Postgres trigger so app code doesn't have to think about it
- Helper SQL function `public.current_salon_id()` returns the signed-in user's salon
- RLS policies on every table use that function for both `USING` (reads) and `WITH CHECK` (writes)
- **Middleware** (`middleware.ts`) refreshes the session on every request, redirects unauthenticated users to `/login`, and bounces already-signed-in users away from the login page
- **Login page** runs a real `supabase.auth.signInWithPassword()` flow with proper error messages, loading state, and a `?from=…` redirect parameter so deep-links survive the auth round-trip
- **Sign out** lives in the sidebar dropdown under your avatar
- **Public booking page** at `/book/[slug]` is the only authenticated-bypass route — it reads the salon and its enabled services via dedicated public RLS policies

### Pages
| Page | What it does | Data source |
|---|---|---|
| `/` | Marketing landing page | Static |
| `/login` | Real email + password sign-in | Supabase Auth |
| `/dashboard` | Today's appointments, week revenue (with delta vs last week), month revenue, "Worth a message" customers, dynamic greeting + subtitle | Supabase (server component) |
| `/calendar` | Week grid + list view; click any event to open the **AppointmentDetailModal** for status changes; inline action buttons in list view | Supabase |
| `/customers` | Searchable list, filterable by All / Regulars / New / Quiet (haven't seen in 8 weeks) | Supabase |
| `/customers/[id]` | Full profile, real visit history, persistent notes, "Book again" pre-fills appointment modal, real call/WhatsApp links | Supabase |
| `/services` | Full CRUD with optimistic updates — toggle Live/Hidden, add, edit, remove | Supabase |
| `/reports` | Revenue (with delta), appointments completed/cancelled, new customers, last-6-months revenue trend chart, top services by revenue, top customers by spend, real cancellation summary. Range selector: month / quarter / year | Supabase |
| `/reminders` | Read-only preview of the four message templates with a "coming soon" banner; toggles live in Settings | Static |
| `/settings` | Loads the salon's actual profile from Supabase, edits + saves back. Hours and reminder toggles are local-only (Phase 4). Account section is read-only and shows real email | Supabase |
| `/book/[slug]` | Public booking page — reads the salon by slug, shows live services, hands off to WhatsApp to finalise | Supabase (public RLS) |

### Appointment lifecycle
- **Create**: `AppointmentFormModal` (used by dashboard, calendar, customer profile)
- **Confirm** *(pending → confirmed)*: list-view button + detail modal
- **Complete** *(any active → completed)*: list-view button + detail modal. **Side effect**: customer's `visits += 1`, `total_spend += service.price`, `last_visit_date = appointment.date` (all in one round trip from the calendar page)
- **Cancel**: list-view button + detail modal

The dashboard counts and the reports page both read these statuses correctly — `confirmedCount` and `pendingCount` come from raw `status`, not from the displayed chip set (which is what an earlier bug did).

---

## Database

Run the SQL files in `db/` in order, once each, in Supabase → SQL Editor:

| File | Purpose |
|---|---|
| `db/002_multi_tenant.sql` | Schema migration: salons + salon_users tables, salon_id columns + indexes, auto-fill trigger, RLS function + policies, Pastel 93 row, optional migration of existing data, linking SQL for the Sandya user (run after creating the auth user in the Dashboard) |
| `db/003_public_booking.sql` | Public read policies on `salons` (by booking_slug) and `services` (enabled = true) for the unauthenticated booking page |

There's no `001_initial.sql` in this repo — the initial `customers`, `services`, `appointments` tables were created during the very first chat session before the migrations folder existed. They're already in your Supabase project. The `002_*` script targets that existing schema and adds the multi-tenant layer on top.

### Initial user / salon

Run `002_multi_tenant.sql`, then:

1. **Supabase → Authentication → Users → "Add user → Create new user"**
   - Email: `sandya@pastel93.lk`
   - Password: `Pastel93!Sandya`
   - **Auto Confirm User: ✔**
2. Run the linking block at the bottom of `002_multi_tenant.sql` (it's idempotent)
3. Run `003_public_booking.sql`
4. `npm install && npm run dev`, visit any page, sign in with the credentials above

To add a second salon, insert another row into `salons`, create another auth user, then insert a row into `salon_users` linking them. The two will not see each other's data — verified by the RLS `USING` clauses.

---

## Project layout

```
SalonOS/
├── app/
│   ├── layout.tsx                  # Root layout, fonts, metadata
│   ├── page.tsx                    # Landing page
│   ├── login/page.tsx              # Sign-in form
│   ├── dashboard/page.tsx          # Server component — today's view
│   ├── calendar/page.tsx           # Week grid + list, status actions
│   ├── customers/
│   │   ├── page.tsx                # List view
│   │   └── [id]/page.tsx           # Profile + history + notes
│   ├── services/page.tsx           # CRUD
│   ├── reports/page.tsx            # Analytics
│   ├── reminders/page.tsx          # Template preview (read-only)
│   ├── settings/page.tsx           # Salon profile editor
│   └── book/[salon]/page.tsx       # Public booking
├── components/
│   ├── Modal.tsx                   # Generic editorial modal
│   ├── ConfirmDialog.tsx
│   ├── Toast.tsx
│   ├── StatCard.tsx
│   ├── Sidebar.tsx                 # Desktop nav with avatar + sign-out
│   ├── MobileTopBar.tsx            # Mobile header
│   ├── MobileTabBar.tsx            # Mobile bottom tabs (auto-detects active)
│   ├── AppointmentRow.tsx          # Dashboard row with WhatsApp + profile actions
│   ├── AppointmentFormModal.tsx    # Create appointment
│   ├── AppointmentDetailModal.tsx  # View + change status
│   ├── CustomerFormModal.tsx       # Create customer (slug-based id, birthday picker)
│   ├── ServiceFormModal.tsx        # Create/edit service
│   └── NewAppointmentButton.tsx    # Client wrapper for server-rendered dashboard
├── lib/
│   ├── data.ts                     # Types + pure helpers only (mock data removed)
│   ├── supabase.ts                 # Browser client (createBrowserClient)
│   └── supabase-server.ts          # Server-component client (cookie reader)
├── middleware.ts                   # Session refresh + route guard
├── db/
│   ├── 002_multi_tenant.sql
│   └── 003_public_booking.sql
├── GUIDE.md                        # This file
├── GUIDE.pdf                       # Original design document
├── tailwind.config.ts
├── tsconfig.json
├── next.config.mjs
└── package.json
```

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npx tsc --noEmit     # type check (no compile output)
```

Environment variables in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

---

## Recent QA pass (2026-05-15)

A full audit found and fixed:

**Critical bugs**
- The "Quiet" customer filter looked for a `"Worth a message"` tag that no part of the app ever set — it filtered to zero results forever. Now correctly filters by `last_visit_date < 8 weeks ago`.
- `MobileTopBar` showed hardcoded "SP" initials. Now pulls the signed-in user's actual initials.
- `MobileTabBar` had `active` props on only 3 of 7 pages. Replaced the prop with `usePathname()` auto-detection so it just works everywhere.
- `AppointmentFormModal` could trigger a React warning by setting state after unmount during in-flight fetch. Added a `cancelled` flag in the effect cleanup.
- Settings page was 100% local state with hardcoded "Maison Beauté" / `passwordstub` placeholders — "Save changes" did nothing. Now loads and saves the real salon profile to Supabase. Account email is read-only and pulled from auth.
- Dashboard's "Saved by reminders · LKR 12,000" stat card was static. Replaced with a real **This month** revenue card computed from completed appointments.
- Customer profile history showed "With Sandya" on every row — removed (no stylist concept in the schema yet).
- Reminders page imported entire mock data arrays. Rewritten as a static template preview with an honest "coming soon" banner pointing back to Settings.
- Public booking page (`/book/[salon]`) ignored the `[salon]` route param and hardcoded everything including the day "Thursday". Now reads the real salon by slug, lists live services, and produces a working WhatsApp deeplink for booking.

**Dead code removed**
- `lib/data.ts` was 240+ lines of mock customers/services/appointments/reminders. Trimmed to ~85 lines of type definitions and pure helpers actually in use. Removed: `TODAY`, `services`, `customers`, `appointments`, `reminderTemplates`, `sentReminders`, `endTime`, `parseISODate`, `initialsOf`, `appointmentsFor`, plus `Customer / Appointment / AppointmentStatus / ReminderType / ReminderTemplate / ReminderStatus / SentReminder` types.
- Stray `D:SalonOSdb` folder created by a Windows path escaping bug — deleted.
- Stale error message strings referring to "run the write-access SQL in Supabase" (from the original RLS setup chat) — replaced with multi-tenant-aware messages.

**UX inconsistencies**
- Landing page "proof strip" listed *Lumière* (the product brand) as a customer salon. Replaced with *Pastel 93*.
- Landing page testimonial said "Lumière · Pannipitiya" — that's the product brand, not a location. Now reads "Pastel 93 · Pannipitiya".
- Supabase joined-row type quirks (returns `salons` as `T[]` not `T`) were silently wrong in both the Sidebar and Settings page. Both now normalise with `Array.isArray(...) ? […][0] : …`.

---

## What's next

The major unfinished pieces, ordered by impact:

1. **WhatsApp reminder integration** — wire `Settings → Reminders` toggles to real delivery. Likely a Supabase Edge Function on a daily cron, hitting a WhatsApp Business provider (Twilio, MessageBird, or a Sri Lanka–local gateway). Also tracks a `sent_reminders` table so the Reminders page can show real activity.
2. **Self-service slot booking** on `/book/[slug]` — date picker, free-slot calculation from the salon's `services.duration` + existing appointments + opening hours, customer + appointment insert via a server action using the service-role key (since the public page is unauthenticated).
3. **Opening hours persistence** — add a `hours jsonb` column on `salons`, save the Settings hours grid to it.
4. **Reminder template persistence** — add `reminder_settings jsonb` on `salons`, save the toggles.
5. **Logo upload** for salon profile — Supabase Storage bucket scoped by `salon_id`.
6. **Stylist concept** — currently appointments don't have a `stylist_id`. Once added, the customer profile history can show "With X" again truthfully.

---

## Architecture notes for future contributors

- **Server vs client components**: The dashboard is the only server-rendered Supabase consumer (it uses `createSupabaseServer()` and reads cookies). Everything else is `"use client"` and uses the browser singleton from `lib/supabase.ts`. Both go through the same auth session because `@supabase/ssr` shares cookies between them.
- **The auto-fill `salon_id` trigger** is the load-bearing convenience here. App code can insert `customers`, `services`, `appointments` without ever passing `salon_id` — the trigger reads `auth.uid()` and sets it. If you want to insert across salons from app code (you don't), the trigger only fills when `salon_id IS NULL`, so an explicit value would win.
- **No service-role key in app code.** The anon key + RLS + auto-fill trigger is enough for everything except the future public-booking insert path, which will need a server action with the service role key gated by salon slug validation.
- **Customer IDs are slugs**, not UUIDs (`anushka-fernando` rather than `e1d3…`). This is intentional — the URL stays readable. The slug is generated client-side from the name, with a `-NNNN` suffix on collision. Renaming a customer doesn't change the URL.
