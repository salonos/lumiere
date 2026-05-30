# SalonOS — Project Guide

> A multi-tenant salon management web app for small independent salons in Sri Lanka.
> Built on **Next.js 14 (App Router)** + **Supabase** (Postgres + Auth). No other backend.

The first real customer is **Pastel 93** (Pannipitiya) — a nails / waxing / threading salon.
The schema and feature set were initially shaped around a fictional "Test Salon" demo
(Sandya Perera's hair-and-facial salon) and have since been extended for Pastel 93's
real price list — which is structurally more demanding (tiered wax pricing, per-finger
nail art, modifier extras). Both salons coexist in the same database, separated by RLS.

---

## 1 · What this app actually does

It's a single working surface for a small salon owner to run their day:

- See today's appointments, week and month revenue at a glance
- Book customers in via a multi-service form with per-service staff assignment, station-availability checks, and conflict detection
- Move appointments around the calendar by drag-and-drop (day-grid view) or click-to-edit (week/month)
- Mark complete and capture payment method + discount in one flow → customer stats update automatically
- Reassign a staff member mid-day if someone calls in sick
- Track customer history, notes, visit counts, total spend, tags (VIP / Regular / Sensitive / New)
- Manage services (with optional tiered prices, modifier add-ons, per-finger pricing, patch-test flag)
- Manage staff + station types (e.g. "Wax Room × 1") and which services each station can host
- Log expenses (cash / card / transfer + bill number + vendor) and see income vs. expense for any period — this month, last 3 months, this year, or all time
- Run a payroll report by month showing each staff member's commission owed, and **mark a month's payroll paid** to post it straight into the income/expense report as a Staff Wages expense
- See revenue / cancellation / top-service / top-customer reports (filter by month / quarter / year)
- A public **/book/[slug]** page customers can hit without logging in to start a booking (WhatsApp hand-off)

Everything is real Supabase data — no mock-data anywhere in the runtime path.

---

## 2 · Tech stack and conventions

```
Next.js 14.2.x          App Router, mostly client components ("use client")
React 18.3              Hooks + plain useState/useEffect; no Redux/Zustand/SWR
@supabase/ssr 0.10      Browser + server clients sharing cookies
@supabase/supabase-js   Direct queries; no ORM, no generated types
@fullcalendar/*         Month + week + day-grid views (the day view is custom)
Tailwind                Used minimally — most pages use inline-style + a global CSS file
TypeScript 5.6          strict; project compiles with `npx tsc --noEmit --skipLibCheck`
```

There are exactly four files in `lib/`:
- `lib/data.ts` — pure types and formatters (`ServiceCategory`, `lkr()`, `formatTime12()`, `humanError()`) plus the shared revenue helpers `appointmentBase()` and `addonTotalsByAppointment()`
- `lib/supabase.ts` — browser singleton (`createBrowserClient` from `@supabase/ssr`)
- `lib/supabase-server.ts` — server-component client that reads Next.js cookies
- `lib/supabase-admin.ts` — service-role client for server-only privileged writes (only used by `/api/signup`)

**No ORMs.** Every query is hand-written through `supabase.from("...").select(...)` etc.
RLS does all access control; app code never thinks about `salon_id`.

**No middleware-side data fetches** other than session refresh — `middleware.ts` only refreshes
the Supabase JWT and gates routes. Page data fetches live inside the page/component.

---

## 3 · Database

The database is the contract. Every page reads + writes Supabase directly; there is no app-side
data layer to lie. Schema definition lives in **`db/reset.sql`** which is the single source of truth.

### Tables

```
salons                 Top-level tenant. Name, city, address, opening_hours jsonb, booking_slug
salon_users            Links auth.users → salons (with role, defaults to 'owner')
staff                  Per-salon staff list. name, role, dob, salary, active flag
station_types          Per-salon workspaces. name + count (e.g. "Wax Room × 1")
services               Per-salon menu. name, category, duration, price, station_type_id,
                       commission_rate %, enabled, unit_label, requires_patch_test,
                       has_variants, allows_addons
service_variants       Tiered pricing for has_variants services. name + price + optional
                       duration_override (e.g. "Full Legs · Classic Strip — 3700 LKR")
service_addons         Optional modifiers that ride on top of a base service when allows_addons
                       is set. name + price + unit_label + duration_added
customers              Per-salon. id is a URL-friendly slug ("dilini-perera"), not a UUID.
                       name, phone, birthday, notes, tags text[], visits, total_spend,
                       last_visit_date
appointments           Per-salon booking. customer_id + service_id + staff_id (nullable —
                       null = unassigned / owner), date, time, duration, status
                       (pending|confirmed|completed|cancelled), tint, notes, payment_method,
                       discount_amount, plus snapshot columns: quantity, unit_label,
                       variant_id/name/price
appointment_addons     Which service_addons were applied to a given appointment. Snapshots
                       name + price + quantity + unit_label so history survives edits.
expenses               Per-salon expense log. date, description, category (CHECK list),
                       amount, payment_method (cash|card|transfer), bill_number, vendor, notes.
                       Plus payroll-completion bookkeeping: source ('manual'|'payroll'),
                       period_year, period_month. A partial unique index on
                       (salon_id, period_year, period_month) WHERE source='payroll' stops
                       the same month's payroll being recorded twice.
```

### Multi-tenancy & RLS

The load-bearing piece is one tiny function:

```sql
create or replace function public.current_salon_id() returns uuid
language sql stable security definer
set search_path = public, pg_temp as $$
  select salon_id from public.salon_users where user_id = auth.uid()
$$;
```

Every per-salon table has:
- `salon_id uuid not null default public.current_salon_id() references salons(id) on delete cascade`
- `enable row level security`
- A single policy: `for all using (salon_id = public.current_salon_id()) with check (salon_id = public.current_salon_id())`

So app code never sends `salon_id` on insert — the default fills it from the logged-in user's
session. Two salons cannot see each other's anything. The same pattern covers `service_variants`,
`service_addons`, `expenses`, `appointment_addons`.

**One footgun to remember:** Supabase SQL Editor runs as the `postgres` role where `auth.uid()`
is `null`, so `current_salon_id()` returns `null` and the default cannot fill `salon_id`.
Any seed script run from the SQL Editor must pass `salon_id` explicitly. This is why
`db/pastel93_services.sql` does `select v_sid, s.id, …` rather than relying on defaults.

### `db/` directory

```
reset.sql                 Authoritative schema + Test Salon demo seed. DROPs everything,
                          CREATEs all tables / policies / indexes, then optionally seeds a
                          full Test Salon dataset (5 staff, 30 customers, ~25 appointments).
                          THIS FILE IS THE SCHEMA. Run it for a fresh install.

pastel93_setup.sql        Creates the Pastel 93 salon row + links the auth user. Run after
                          the auth user has been created in the Supabase Dashboard.

pastel93_services.sql     Seeds Pastel 93's full catalogue from the PDF price list:
                          ~52 services, 52 wax variants, 30+ add-ons. Refuses to run if
                          appointments already exist (to avoid breaking history).

expenses.sql              Standalone migration that adds/upgrades the `expenses` table. Now also
                          baked into reset.sql but kept here for in-place upgrades — it both
                          CREATEs the table fresh and ALTERs older installs to add the payroll
                          columns (source / period_year / period_month) + the partial unique index.

opening_hours.sql         Standalone migration that adds the `opening_hours jsonb` column on
                          salons. Also baked into reset.sql.

salons_update_policy.sql  Adds the UPDATE RLS policy on `salons` so owners can edit their
                          own profile from /settings. Baked into reset.sql.

services_extensions.sql   In-place upgrade for the variant / add-on / patch-test / quantity
                          extensions. Not needed for fresh installs (reset.sql includes them).

split_nails_category.sql  One-time data migration that splits old `category='Nails'` rows
                          into 'Hands' or 'Feet' based on service name. Only needed for
                          installs that pre-date the category split.
```

### Fresh install — clean slate flow

1. **Drop + create schema:** Supabase Dashboard → SQL Editor → run `db/reset.sql`.
   This wipes everything and recreates the complete schema. It also seeds Test Salon
   (linked to owner email `owner@testsalon.com` / password `123456`). If you don't want
   the demo data: after the reset, run `delete from public.salons where name = 'Test Salon';`
   (cascades through all child rows).
2. **Create the Pastel 93 auth user:** Supabase Dashboard → Authentication → Users → Add user.
   Email `pastel930925@gmail.com`, password `P@stel93!Bloom`, ✅ Auto Confirm.
3. **Create the Pastel 93 salon row:** SQL Editor → run `db/pastel93_setup.sql`.
4. **Seed Pastel 93's catalogue:** SQL Editor → run `db/pastel93_services.sql`.

### Service categories (TypeScript union, enforced in `lib/data.ts`)

```
Hair · Skin · Hands · Feet · Threading · Bridal · Massage · Wax
```

`Hands` and `Feet` replace the older single `Nails` category — a real nail salon thinks in
two completely separate workflows. The `services.category` DB column is just `text` (no CHECK
constraint), so anything is technically allowed, but the UI only renders services whose
category is in this union.

---

## 4 · The catalogue extensions (what variants / add-ons / quantity actually mean)

This is the non-obvious part of the schema, because it grew out of running Pastel 93's
real price list through the app and finding the cracks.

### Variants — tiered pricing
A single service ("Full Legs") sold at multiple prices depending on a customer-visible choice
(wax type: Classic Strip / Premium Strip / White Chocolate / Luxury). When a service has
`has_variants = true`:
- `service_variants` rows define each tier with its own price (and optional duration override)
- The booking form **requires** the user to pick a variant before submitting
- The selected variant's `name` + `price` are snapshotted onto the appointment row, so edits
  to the variant later don't rewrite history
- The detail modal subtitle shows `Full Legs · Premium Strip · 45 min`

### Add-ons — modifier extras
Optional things layered onto a base service: French finish, nail art, foil design, rhinestone, etc.
When a service has `allows_addons = true`:
- `service_addons` rows define each available extra with a price and optional `unit_label`
  (e.g. `"per finger"`) and optional `duration_added` (most add-ons happen during the base
  service so this defaults to 0)
- The booking form shows a collapsible "Add extras" panel under the service line
- For unit-labeled add-ons, a quantity input appears next to each selected one
- The applied add-ons are recorded in `appointment_addons` with snapshot name + price + qty

### Per-unit pricing (the `unit_label` field)
For services that are sold by the piece — "Acrylic One Nail Rs 500" — the service itself
carries a `unit_label`. The booking form then shows a quantity input directly under the
service dropdown. The total price is `unit_price × quantity`. The appointment row
snapshots both `quantity` and `unit_label`.

### Patch-test flag
Waxing services in Pastel 93 require a patch test 24 hours before. A service with
`requires_patch_test = true` shows a warm yellow warning banner in the booking modal:
*"Patch test required. ‹service name› needs a patch test 24 hours before this
appointment…"*. There is currently no automatic enforcement (no separate patch-test
appointment table) — it's a reminder to the staff.

### How the effective price is calculated everywhere
Anywhere the system needs to know what an appointment actually costs (customer total_spend
update on completion, payment-step net amount, detail-modal "Amount received"):

```
unit_price       = variant_price ?? service.price
base_line        = unit_price * quantity
addons_total     = sum over selected appointment_addons of price * quantity
effective_price  = base_line + addons_total
net_received     = max(0, effective_price - discount_amount)
```

Two shared helpers in `lib/data.ts` keep this consistent across **every** money surface:

```ts
appointmentBase(row)                 // (variant_price ?? services.price) × quantity
addonTotalsByAppointment(addonRows)  // Map<appointment_id, Σ price × qty> for a batch
```

The pattern everywhere is: fetch the appointments, fetch their `appointment_addons` in one
`.in("appointment_id", ids)` query, build the add-on map, then
`effective = appointmentBase(row) + addonMap.get(row.id)`. This is now used in
`app/calendar/page.tsx`, `components/AppointmentDetailModal.tsx`, `app/reports/page.tsx`
(revenue, top services/customers, trend, commissions, payment breakdown),
`app/payroll/page.tsx` (reconciliation + commissions), `app/expenses/page.tsx` (income),
`app/dashboard/page.tsx` (week/month revenue), and `app/customers/[id]/page.tsx` (visit
history). Before this, those surfaces read raw `services.price` and silently under-counted
any booking with a tier, a quantity, or an add-on.

---

## 5 · Pages

| Route | Purpose | Component / data |
|---|---|---|
| `/` | Redirects to `/dashboard` (handled in middleware) | — |
| `/login` | Real `signInWithPassword()` flow, `?from=…` deep-link survival | Supabase Auth |
| `/signup` + `/api/signup` | Create a new salon — auth user signs up, then POSTs salon name + their name. The API route uses the service-role admin client to insert the salon and link rows. | `lib/supabase-admin.ts` |
| `/dashboard` | Server component. Today's appointments with chips, this-week revenue (with delta vs. last week), this-month revenue, "Worth a message" customers (haven't visited in 8 weeks), dynamic greeting | `createSupabaseServer()` |
| `/calendar` | Three views (Month / Week / Day). Day view is a custom staff-column grid with drag-and-drop reschedule + reassign-by-dragging-to-another-column. Click any event to open the detail modal. | FullCalendar + bespoke `StaffDayView` |
| `/customers` | Searchable list, filters by All / Regulars / New / Quiet (haven't seen in 8 weeks). Avatar colour legend | Supabase |
| `/customers/[id]` | Full profile, real visit history with prices, persistent notes, "Book again" pre-fills the appointment modal, WhatsApp + call links | Supabase |
| `/services` | Full CRUD via the rich `ServiceFormModal`. Cards show TIERED / EXTRAS / PATCH TEST chips at a glance. Toggle Live / Hidden | Supabase, with multi-table sync (services + service_variants + service_addons) |
| `/staff` | Staff CRUD + station-type CRUD on the same page. Before deactivating or deleting a staff member with upcoming appointments, opens `StaffReassignModal` to choose a replacement | Supabase |
| `/reports` | Revenue (with delta), appointments completed/cancelled, new customers, revenue trend chart (4 weekly bars for month / 3 monthly for quarter / 12 monthly for year — matches the range selector), top services, top customers, payment-method breakdown, staff commissions, cancellation summary | Supabase |
| `/expenses` | Expense CRUD + Income vs Expense breakdown table (Cash / Card / Transfer / Unrecorded income from completed appointments). Range selector: **Month** (with month nav) / **Last 3 months** / **This year** / **All time**. Net profit line goes green or red. Payroll-sourced expenses show a "Payroll" badge | Supabase |
| `/payroll` | Daily reconciliation + monthly staff payroll. Monthly view aggregates per-staff totals (salary + commission earned on the full effective ticket) and has a **Mark payroll as paid** action — pick a payment method, and it writes a single Staff Wages expense (source='payroll', dated to month end) that flows into the income/expense report. A "Paid ✓" banner with **Mark as unpaid** (deletes that expense) shows once recorded | Supabase |
| `/reminders` | Static template preview with "coming soon" banner — toggles live in /settings. **Not wired to any sending pipeline yet.** | — |
| `/settings` | Edits salon profile + opening hours (jsonb on salons.opening_hours). Reminder toggles are local-only. Account section is read-only and shows auth email | Supabase |
| `/book/[slug]` | Public route (auth-bypassed via middleware + public RLS policies on `salons` by `booking_slug` and `services` where `enabled=true`). Lists services, hands off to WhatsApp | Supabase (public policies) |

### Appointment lifecycle (the most important flow)

`pending` → `confirmed` → `completed` (or `cancelled` at any active step)

- **Create**: `AppointmentFormModal` — multi-service in one booking, per-service staff,
  variant picker if needed, add-on extras with quantity, patch-test warning, three live conflict
  checks (station capacity, per-service staff, customer double-booking)
- **Confirm** *(pending → confirmed)*: detail-modal button
- **Complete**: opens an inline payment-capture step inside the detail modal — payment method
  (cash / card / transfer) is **required**, optional discount. On confirm, the appointment
  status flips and the customer's `visits`, `total_spend`, and `last_visit_date` update in
  the same flow. Total_spend uses the **effective price** (variant + addons + quantity),
  not the raw service.price
- **Cancel**: clicking "Cancel appointment" no longer cancels immediately — it shows an
  inline red confirmation panel ("Cancel this appointment? customer's service on date at time
  will be marked as cancelled. This cannot be undone.") with "Never mind" / "Yes, cancel it"
  buttons. Designed to prevent fat-finger cancellations
- **Reschedule** + **Reassign staff**: live in the detail modal, side-by-side with the cancel
  flow. Reassign is also possible via drag-and-drop in the day view

---

## 6 · Components

```
Modal.tsx                   Editorial-style modal shell with eyebrow + title + subtitle + footer
ConfirmDialog.tsx           Yes / no confirmation built on Modal
Toast.tsx                   Bottom-of-screen toast with success / error / info tones
StatCard.tsx                Hero stat card (used on dashboard)
Sidebar.tsx                 Desktop nav with avatar dropdown for sign-out
MobileTopBar.tsx            Mobile header with hamburger drawer
MobileTabBar.tsx            Mobile bottom tabs (auto-detects active route)
AppointmentRow.tsx          Compact row used by dashboard and customer profile

AppointmentFormModal.tsx    Booking modal — the most complex component in the codebase.
                            Multi-service lines, per-service staff, variant picker, add-on
                            panel with quantity, three live conflict checks, customer
                            combobox with new-customer inline form, patch-test warning,
                            running total, station availability per slot
AppointmentDetailModal.tsx  View an appointment, change its status, reschedule, reassign
                            staff, capture payment, see the variant + add-on breakdown
StaffReassignModal.tsx      Reassign upcoming appointments before deactivating / deleting
                            a staff member

ServiceFormModal.tsx        Service CRUD with embedded variant + add-on editors. When the
                            capability toggles (has_variants / allows_addons) are checked,
                            inline editable lists appear. Parent (services/page.tsx) does
                            a wipe-and-insert multi-table sync on save
StaffFormModal.tsx          Staff CRUD
StationTypeFormModal.tsx    Station-type CRUD with service assignment

CustomerFormModal.tsx       Customer CRUD with auto-slug ID generation
NewAppointmentButton.tsx    Client wrapper used by the server-rendered dashboard so the
                            "New appointment" button can open AppointmentFormModal
```

---

## 7 · Authentication

- Supabase Auth (email + password). `signInWithPassword()` on the login page; cookies
  managed by `@supabase/ssr` so server and client components share the session
- `middleware.ts` refreshes the session on every request via `getUser()` (NOT `getSession()`
  — that one doesn't refresh expired tokens), redirects unauthenticated users to `/login`,
  redirects already-logged-in users away from `/login`, and bounces `/` to `/dashboard`
- Public routes (no auth required): `/login`, `/book/*`, `/api/*`
- Sign out from the avatar tile at the bottom of the sidebar
- New-salon self-signup is wired at `/signup` → `/api/signup` route — it uses the admin
  service-role client to insert the `salons` and `salon_users` rows after verifying the
  user's JWT, because the user has no `salon_id` link yet so their own session can't satisfy
  the salons-insert RLS policy

---

## 8 · Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npx tsc --noEmit --skipLibCheck     # type check (project compiles clean today)
```

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>     # only for /api/signup
```

---

## 9 · Status — what's done vs. what's next

### ✅ Done

- Multi-tenant DB with RLS on every table, including the catalogue-extension tables
- Full appointment lifecycle (create → confirm → complete with payment → side-effect customer stats)
- Multi-service bookings with per-service staff for accurate commission attribution
- Service variants (tiered pricing) — picker in booking, snapshot in appointment
- Service add-ons (modifier extras) with per-finger / per-nail quantity
- Per-unit pricing on the base service itself (the "per nail" Acrylic One Nail case)
- Patch-test warning banner (advisory, not enforced)
- Cancellation confirmation step (two-click cancel to prevent accidents)
- Staff CRUD + station-type CRUD + reassign-before-deactivate flow
- Drag-and-drop calendar (FullCalendar week/month + custom staff-column day view)
- Expense logging with category + bill number + vendor + payment method
- Income vs Expense report (income from completed appointments by payment method) with a
  range selector — month / last 3 months / this year / all time
- **Payroll completion** — marking a month paid records the total as a Staff Wages expense
  (source='payroll'), so it appears in the income/expense report; a partial unique index
  prevents double-recording, and "Mark as unpaid" deletes the expense to undo
- **Effective-price consistency fix** — dashboard, reports, payroll and expenses all now
  use `appointmentBase()` + add-on totals instead of raw `services.price`, so tiers,
  quantities and add-ons are counted in every revenue/commission/income figure
- Reports with range selector (month / quarter / year) and matching revenue trend chart
- Payroll report (day reconciliation + month per-staff commissions)
- Opening hours persisted in `salons.opening_hours jsonb`, respected by FullCalendar
  business-hours overlay
- Public booking page reads the salon by slug, lists live services, hands off to WhatsApp
- Self-service salon signup via `/signup` + `/api/signup`
- Sandya's Test Salon seed (demo data) + Pastel 93's full real catalogue seed
- The categories were split from `Nails` into `Hands` and `Feet` to match how nail salons
  actually think — see `db/split_nails_category.sql` for the migration if upgrading
- Mobile-responsive layouts: drawer nav, bottom tab bar, day-view-only on mobile

### 🟡 Partial / advisory only

- **Patch-test enforcement.** The flag shows a warning but there's no separate `patch_tests`
  table or scheduling logic. Staff confirm verbally.
- **Reminders.** The Settings page has toggles for the four message types, and the
  `/reminders` page shows static template previews — but there's no sending pipeline.
- **Public booking — slot picking.** The `/book/[slug]` page lists services but doesn't
  yet let the customer pick a date/time. They hand off to WhatsApp to finalise.

### 🔴 Not started

- **WhatsApp / SMS reminder delivery.** A Supabase Edge Function on a daily cron hitting
  a WhatsApp Business API provider (Twilio / MessageBird / a Sri Lanka–local gateway).
  Also a `sent_reminders` table to back the /reminders page.
- **Self-service slot booking on `/book/[slug]`.** Date picker, free-slot calculation
  from `services.duration` + existing appointments + opening hours + station capacity,
  customer + appointment insert via a server action with the service-role key.
- **Reminder template persistence.** Save the Settings toggles to `salons.reminder_settings jsonb`.
- **Logo upload** for salon profile — Supabase Storage bucket scoped by `salon_id`.
- **Multi-station services.** A single service currently has one `station_type_id`.
  Pastel 93's kids packages (nails + hair braiding + makeup) would benefit from a
  `service_station_types` join table. Not blocking — pinned to one station today.
- **Package / combo services with itemised reporting.** Pastel 93's wax combos (Classic
  Combo at Rs 18,500) are modeled as a single flat-priced service with a description
  listing components. A proper "package expands to components" concept would let reports
  attribute the revenue back to individual body parts.

---

## 10 · Architecture invariants (preserve these)

- **No `salon_id` in app code.** Inserts must rely on the default + RLS auto-fill. The
  trigger / default fires only when the column is `NULL`, so explicit values would win —
  don't pass them from the browser.
- **No service-role key in client code.** `lib/supabase-admin.ts` is server-only and
  imported by exactly one route (`/api/signup`). If you add another use case, that code
  must also be on the server side (route handler, server action, or edge function).
- **Snapshots, not joins, for historical reads.** When an appointment is created, its
  `variant_name` / `variant_price` and each `appointment_addons.name` / `.price` are
  copied from the master tables. If the owner later edits the variant or deletes an
  add-on, past receipts stay intact.
- **Effective price, not service.price.** Anywhere money matters — customer `total_spend`
  on completion, the "Amount received" line in the detail modal, dashboard/reports/payroll/
  expenses totals, customer visit history — use `(variant_price ?? servicePrice) × quantity
  + sum(addons)`. Use the shared `appointmentBase()` + `addonTotalsByAppointment()` helpers
  from `lib/data.ts` rather than re-deriving it; the raw `service.price` is just the base /
  fallback and reading it alone will under-count any tiered / per-unit / add-on booking.
- **Customer IDs are slugs — and there is NO DB default for them.** `dilini-perera`, not a
  UUID. `customers.id` is a `text` primary key the app must fill in itself: every code path
  that inserts a customer has to generate the slug from the name with `toSlug()` and include
  `id` in the insert, retrying with a `-NNNN` suffix on a `23505` collision. Two paths create
  customers today — `components/CustomerFormModal.tsx` and the inline "New customer" flow in
  `components/AppointmentFormModal.tsx` (`submit()`); both follow this pattern. If you ever
  insert a customer without `id`, Postgres raises a NOT-NULL violation (`23502`) which
  `humanError()` surfaces as the misleading *"A required field is empty"* — so that message on
  a new-customer booking almost always means a missing slug, not a missing form field.
  Renaming a customer does not change the URL.
- **One server component:** the dashboard. Everything else is `"use client"`. The
  dashboard uses `createSupabaseServer()` and reads cookies for SSR; the rest use the
  browser singleton. Both share the same session because of `@supabase/ssr`'s cookie API.
- **Inline styles are fine.** Most pages use inline `style={{}}` objects instead of
  Tailwind utility classes. The codebase mixes both. Don't refactor working inline styles
  to Tailwind for its own sake.
- **Modal form CSS is global and aggressive — watch the cascade.** `app/globals.css` styles
  *every* element inside `.modal-body`: `label` gets `text-transform: uppercase` + wide
  `letter-spacing` + `display: block`, and `input/select/textarea` get `width: 100%`. That's
  what you want for normal form fields, but if you use a `<label>` as a clickable row wrapper
  (e.g. the add-on checkboxes in `AppointmentFormModal.tsx`) or a bare `<input type="checkbox">`,
  they inherit those rules — the text comes out UPPER-CASED and letter-spaced and the checkbox
  stretches to full width, crushing the text into a one-word-per-line column. Fix is to
  override inline: on the label `textTransform: "none", letterSpacing: "normal"`; on the
  checkbox `width: 16, height: 16, flexShrink: 0`. Prefer a non-`label` wrapper for custom rows
  when you don't need the implicit click-to-toggle.
- **Postgres column casing matters when reading joins.** Supabase types nested joins as
  arrays even when the relationship is one-to-one — always normalise with
  `Array.isArray(x.salons) ? x.salons[0] : x.salons`. The Sidebar and Settings page both
  do this.

---

## 11 · Where to look for common tasks

| If you want to… | Start here |
|---|---|
| Add a new field to a service | `db/reset.sql` (services table) + `lib/data.ts` (Service type) + `components/ServiceFormModal.tsx` |
| Change how the booking total is computed | `components/AppointmentFormModal.tsx` (`linePrice`, `lineDuration` helpers) and `app/calendar/page.tsx` (`effectivePrice` build in `fetchApts`) |
| Add a new page in the nav | `components/Sidebar.tsx` + `components/MobileTabBar.tsx` (add to "more" group) |
| Add a new RLS-scoped table | Copy the pattern from `service_variants` in `db/reset.sql`: `salon_id default current_salon_id() references salons(id)`, `enable rls`, single `for all using/with check` policy |
| Add a new salon manually | Create auth user in Supabase Dashboard → write a setup script modelled on `db/pastel93_setup.sql` → seed catalogue |
| Debug "why isn't this row visible?" | Almost always RLS. Confirm `auth.uid()` returns the right user; confirm `salon_users` has a row linking them to the salon; confirm `current_salon_id()` returns non-null when called as that user |
| Add a new reports metric | `app/reports/page.tsx` — `fetchReports()` runs all queries via `Promise.all`, then computes everything in JS. Add to the data type, the fetch, and the render |
| Understand the booking flow end-to-end | Read `components/AppointmentFormModal.tsx` top-to-bottom (it's long but linear) then trace `submit()` → `appointments` insert → `appointment_addons` insert |
