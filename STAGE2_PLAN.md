# SalonOS — Stage 2 Implementation Plan

> **Theme:** flip the app outward — customers book themselves, the salon messages
> them automatically, and the platform operator can run the business. Stage 1 built
> the salon owner's private console; Stage 2 adds the customer-facing layer, the
> first automation, and a cross-tenant **operator console** for managing salon
> accounts and the subscriptions they pay the platform.
>
> Status: **PLAN — FINALIZED.** Decisions locked to the recommended defaults (§7).
> The only two items still gated on you are external/paid: a messaging provider
> (blocks reminders delivery, R4) and a payment processor (blocks online billing, C4).
> Everything else is buildable now.

---

## 0 · The three pillars (and the order)

| | Pillar A — Self-service booking | Pillar B — Reminders & notifications | Pillar C — Operator console (accounts & billing) |
|---|---|---|---|
| Who it serves | The salon's **customers** | The salon's **customers** | **You** — the SalonOS operator |
| Value | Acquisition — fills the calendar without the owner typing | Retention — fewer no-shows, more repeat visits | Run the business — track tenants, collect subscriptions |
| External cost | **None** | **Messaging provider + per-message fees** | **None** for v1 (manual payment recording) |
| Risk | Medium (public write path, slot math) | Low code risk; blocked on provider creds/budget | **High blast radius — cross-tenant access** |
| Build order | **First** | Second | Independent — slot it in whenever collecting money matters |

**Why A first:** it grows revenue, it produces the phone numbers B needs, and it
forces us to build the *trusted server-side write path* that both B and C reuse.
B's UI and queue can be built without a provider; only delivery is blocked on creds.
**C is independent** of A/B and reuses the same service-role server pattern, so it
can be built right after A's foundation if collecting subscriptions is the priority.

---

## 1 · Shared foundation — a trusted server-side write path

The single new capability both pillars need.

**Problem.** Public/anon visitors have no salon session, so RLS's
`current_salon_id()` returns `null` — they cannot insert customers/appointments,
and we must not loosen RLS to let them. We also can't trust anything the browser
sends (salon_id, price, duration, chosen slot).

**Pattern.** Next.js **Route Handlers** (`app/api/book/...`) using the existing
service-role admin client (`lib/supabase-admin.ts`), exactly like `/api/signup`:
1. Resolve the salon **server-side** from the URL `booking_slug` — never from a
   client-sent id.
2. Re-load services / variants / add-ons / station capacity / opening hours from
   the DB and **recompute** price + duration. Ignore client-sent money.
3. Re-validate slot availability server-side (don't trust the client's pick).
4. Insert with the admin client; the row's `salon_id` is set explicitly to the
   resolved salon (admin client bypasses RLS, so the default won't fire).

**Invariant added:** service-role key stays server-only — Route Handlers + the
Edge Function. Never imported into a `"use client"` file.

---

## 2 · Pillar A — Self-service booking on `/book/[slug]`

Today the public page lists services and hands off to WhatsApp. Stage 2 turns it
into a real booking funnel.

### 2.1 Schema / RLS changes
- **`appointments.source text not null default 'staff'`** — values `'staff' | 'online'`.
  Lets the owner see which bookings came in by themselves (a chip on the calendar).
- **No new `booking_requests` table.** Online bookings insert directly as
  `status = 'pending'` and reuse the existing confirm → complete lifecycle.
- **Public RLS surface stays minimal.** We already have public read for the salon
  (by slug) and enabled services. Add public read only for `service_variants` /
  `service_addons` that belong to enabled services, plus `station_types` **count**
  and `staff` **name** (active) if we offer staff preference. **Appointments are
  never publicly readable** — all slot math happens server-side with the admin
  client, so no other customer's bookings leak.
- **(Optional, defer to 2.x)** `appointments.hold_expires_at timestamptz` for short
  slot holds to avoid double-booking races. Not needed for v1 (we re-validate at
  submit and the row lands as `pending`).

### 2.2 Free-slot algorithm (server-side, in the `/slots` handler)
Inputs: `slug` → salon_id, `serviceId(s)` → total duration + station_type_id(s),
`date`.
1. Read `opening_hours` for that weekday → `[open, close]`. Closed ⇒ no slots.
2. Generate candidate starts at a fixed granularity (**default 30 min** — see open
   decisions) from `open` to `close − totalDuration`.
3. Admin-load that day's non-cancelled appointments: `time, duration, staff_id,
   service_id` (→ station_type_id).
4. A candidate is **available** when, for its `[start, start+duration)` window:
   - **Station capacity:** overlapping appointments using the same `station_type_id`
     `< station.count`. (Services with no station skip this.)
   - **Staff (if a specific staff member was requested):** that staff has no
     overlapping appointment.
5. Return the available start times.

This is the same overlap logic already proven in `AppointmentFormModal`'s
station/staff conflict checks — lifted to the server and run against the whole day.

**v1 simplification:** one service per online booking. Multi-service sequential
booking (like the staff form) is **Stage 2.x**.

### 2.3 Public UX flow (`/book/[slug]`)
1. **Pick service** — variant picker if `has_variants`, add-ons if `allows_addons`,
   quantity if `unit_label`. Reuse the effective-price formula for the running total.
2. **Pick date** → call `POST /api/book/[slug]/slots` → render available times.
3. **Pick time** (+ optional staff preference).
4. **Your details** — name + phone (phone required here so we can confirm/remind).
5. **Review** (price recomputed) → submit → `POST /api/book/[slug]`.
6. **Confirmation** screen with a reference; Pillar B sends a confirmation message
   if enabled.

### 2.4 Endpoints
- `POST /api/book/[slug]/slots` → `{ date, serviceIds }` ⇒ `{ slots: string[] }`.
- `POST /api/book/[slug]` → full booking; server re-validates the slot, inserts the
  customer (slug `id`, with `-NNNN` collision retry — same trap as the staff form),
  the appointment (`status='pending'`, `source='online'`), and any `appointment_addons`.
  Returns the new appointment id.
- Both resolve the salon by slug, use the admin client, and **never trust client
  salon_id / price / duration**.

### 2.5 Owner side
- A small **"Online"** chip (driven by `source='online'`) on the calendar event and
  dashboard row, so the owner knows to confirm it. No other change — pending
  bookings already flow through the existing UI.

---

## 3 · Pillar B — Reminders & notifications

Today `/reminders` shows static templates and `/settings` toggles do nothing.

### 3.1 Provider decision — **the blocker**
Pick a messaging provider and fund it before this pillar can actually send:
- **Twilio** — global, WhatsApp + SMS, well-documented.
- **MessageBird / others** — similar.
- **Sri-Lanka-local SMS gateway** (Dialog / Mobitel / text.lk) — cheaper local SMS,
  no WhatsApp.
Secrets live in the **Edge Function environment**, never in the repo.

### 3.2 Schema
- **`salons.reminder_settings jsonb`** — persists the toggles: `confirmation`,
  `reminder_24h`, `followup`, `birthday`, plus `lead_hours` and per-type message
  templates. Replaces today's dead local-only toggles.
- **`sent_reminders` table** (salon-scoped RLS):
  `id, salon_id, appointment_id (nullable), customer_id, type
  ('confirmation'|'reminder_24h'|'followup'|'birthday'), channel ('whatsapp'|'sms'),
  to_phone, status ('queued'|'sent'|'failed'), provider_msg_id, error, created_at,
  sent_at`. **Unique `(appointment_id, type)`** so a reminder is never sent twice.

### 3.3 Delivery — Supabase Edge Function + cron
- Edge Function **`send-reminders`** (Deno), scheduled daily via `pg_cron` /
  Supabase scheduled trigger (e.g. 9am).
- For each salon with `reminder_24h` on: find tomorrow's **confirmed** appointments
  that have a phone and **no** `sent_reminders` row of that type → render the
  template → call the provider → write a `sent_reminders` row. Idempotent via the
  unique constraint, so reruns/retries don't double-send.
- **Booking confirmations** fire inline from the `POST /api/book` path right after a
  successful insert (or a DB trigger → function), not from the daily cron.
- The function uses the service-role key from its own env.

### 3.4 UI wiring
- `/settings` toggles read/write `salons.reminder_settings`.
- `/reminders` shows real history from `sent_reminders` + template previews from
  settings. (These two screens can be built and shipped **before** a provider
  exists — they just queue / display.)

---

## 4 · Pillar C — Operator console: salon accounts & billing (`/admin`)

A super-admin surface for **you, the SalonOS operator** — completely separate from
any salon owner's console. It manages the tenants (salons) and the **subscription
payments they make to the platform**. Note this is distinct from a salon's own
income/expenses (Stage 1) — those are the salon's books; this is *your* books.

### 4.1 Who is the admin? (the access model — most important part)
- New table **`platform_admins (user_id uuid pk → auth.users, name text, created_at)`**.
- A platform admin is **cross-tenant** — they are NOT in `salon_users` and must NOT
  use `current_salon_id()` (which scopes to a single salon).
- **Recommended pattern: a service-role-backed `/admin` area.** Every `/admin` server
  component and Route Handler first verifies `is_platform_admin(auth.uid())`, then uses
  the service-role client to read/write across all salons. **Tenant RLS stays exactly
  as it is** — we do *not* bolt `OR is_platform_admin()` onto a dozen table policies
  (one mistake there leaks every tenant's data). The cross-tenant bypass lives only in
  verified server code, mirroring `/api/signup`.
- `middleware.ts` gates `/admin/*`: must be signed in **and** present in
  `platform_admins`, otherwise redirect/404 (don't even reveal the route exists).

### 4.2 Schema — billing
- **`salons` subscription columns:** `plan text default 'standard'`,
  `subscription_status text default 'trial'` (check:
  `trial | active | past_due | suspended | cancelled`), `trial_ends_at date`,
  `current_period_end date`, `monthly_fee numeric(10,2)`.
- **`salon_payments` table** — payments the salon makes *to the platform*:
  `id, salon_id, amount, period_start, period_end, method
  ('cash'|'card'|'transfer'|'online'), status ('paid'|'pending'|'failed'),
  reference, notes, paid_at, created_at`. RLS: a salon owner may **read their own**
  rows (billing history on their side); **only platform admins write** (server-side
  via service-role). Never confuse this with the Stage-1 `expenses` table.
- **`platform_admins`** as above.

### 4.3 Payment handling — manual first, online later
- **v1 = manual recording (recommended).** The operator records that a salon paid for
  a period (amount + method + reference) → inserts a `salon_payments` row (`paid`) and
  advances `current_period_end`. This is the exact pattern we just shipped for payroll
  "mark paid." **No card data is ever touched.**
- **v2 = online billing (Stripe / local gateway).** Hosted Checkout + customer portal
  so the salon pays itself; a webhook updates `salon_payments` + `subscription_status`.
  **We never store or handle raw card numbers** — the provider's hosted pages own PCI
  scope. This is a later increment, *not* Stage 2 v1.

### 4.4 Suspension enforcement (optional in Stage 2)
- When `subscription_status` is `suspended` / `past_due`, `middleware.ts` can route that
  salon's owner to a billing wall instead of the app. Build it as a switch we can flip
  on once billing is real — ship the admin **views** first, enforcement later.

### 4.5 Admin UX
- **Overview:** active salons, trials ending soon, past-due count, **MRR** (sum of
  active `monthly_fee`), payments collected this month.
- **Salons list:** name · city · owner email · plan · status chip · period end · last
  payment. Filter by status; search by name.
- **Salon detail:** profile, subscription (plan + status + period end + fee), **payment
  history**, and actions — **Record payment**, **Change plan**, **Suspend / Reactivate**.
  Light usage stats (appointment / customer counts) are a nice-to-have.
- **Record payment** modal mirrors the payroll "mark paid" flow.

### 4.6 Endpoints / components
- `/admin` — server component, admin-gated: overview + salons list (service-role reads).
- `/admin/salons/[id]` — detail + actions.
- `POST /api/admin/salons/[id]/payment` · `/plan` · `/status` — admin-gated Route
  Handlers using service-role; **every one re-checks `is_platform_admin`** (never trust
  the route gate alone).

---

## 5 · Security & privacy checklist (applies throughout)

- Service-role key server-only (Route Handlers + Edge Function env). Never in client code.
- All public-booking inputs validated server-side; price/duration recomputed from DB;
  client-sent `salon_id` / price ignored.
- **Rate-limit** `/slots` and `/book` (IP-based) to prevent spam and slot enumeration.
- Phone numbers are PII — used only for the salon's own messaging, never exposed
  across salons (no public read of customers/appointments).
- Idempotency everywhere money/messages happen: unique constraints on
  `sent_reminders(appointment_id, type)` and the customer-slug retry on booking.
- Consider a lightweight anti-abuse check (honeypot field / simple challenge) on the
  public booking POST — **Stage 2.x**, not v1.
- **Pillar C is the highest-blast-radius surface in the whole app** — it can read and
  write *every* tenant. Gate it twice (middleware + a re-check inside each handler),
  keep tenant RLS untouched, never expose `/admin` or `/api/admin` to salon owners,
  and treat the `platform_admins` table as the one source of truth for who's god.

---

## 6 · Build sequence

**Track A→B (customer-facing):**
1. **Foundation + A2/A4** — `source` column, public-RLS audit, slot algorithm,
   `/slots` + `/book` Route Handlers (no paid dependency).
2. **A3** — public booking UI on `/book/[slug]`.
3. **A5** — owner-side "Online" chip.
4. **B2 + B4** — `reminder_settings`, `sent_reminders`, settings + reminders wiring
   (queues / displays; still no provider needed).
5. **B1 + B3** — provider integration + `send-reminders` Edge Function + cron
   (**needs provider creds**).

**Track C (operator console) — independent, can run in parallel or first:**
1. **C1 schema + gate** — `platform_admins`, `is_platform_admin()`, `salons`
   subscription columns, `salon_payments`; `/admin` middleware gate.
2. **C2 views** — `/admin` overview + salons list + salon detail (service-role reads).
3. **C3 actions** — record payment / change plan / suspend (manual billing, no card data).
4. **C4 (later)** — online billing (Stripe) + suspension enforcement wall.

Steps A1–4 and all of C1–3 ship real value with **zero** external cost; only B5
(messaging) and C4 (online billing) need third-party accounts.

---

## 7 · Decisions — finalized

Locked to the recommended defaults. Change any by telling me; otherwise these are
what gets built.

1. **Online bookings — single service first**, multi-service in a later increment. ✅
2. **Online bookings land as `pending`** for owner approval (no auto-confirm). ✅
3. **Messaging provider — PENDING your choice + budget.** Only gates reminders
   *delivery* (R4). The reminders UI/queue (R3) ships without it. ⏳
4. **Slot granularity — 30 min.** ✅
5. **No online deposit/prepayment** in Stage 2. ✅
6. **Billing — manual recording now** (no card data), online (Stripe) as a later
   increment (C4). ✅
7. **Subscription — one flat `monthly_fee` per salon**; tiered plans later. ✅
8. **Suspension — track status only** in Stage 2; enforce the app-lock later. ✅
9. **Platform admins — a `platform_admins` table** from day one (works for one
   operator or a team). ✅

---

## 8 · Release plan & deployment timeline

Stage 2 is **not one big-bang deploy** — it ships as independent releases, each
deployable on its own. Effort below is in *focused build sessions* (≈ a half-to-full
dev-day each) — estimates, not calendar promises, since the pace depends on how many
sessions we run.

| Release | Scope | Effort | External dependency |
|---|---|---|---|
| **R1 — Self-service booking** | A1 foundation (`source`, RLS audit) + A2 slot algorithm + A4 endpoints + A3 public UI + A5 owner chip | ~4–6 sessions | **None** |
| **R2 — Operator console** | C1 schema + admin gate + C2 views + C3 manual billing actions | ~3–5 sessions | **None** |
| **R3 — Reminders UI + queue** | B2 schema (`reminder_settings`, `sent_reminders`) + B4 settings/reminders wiring (queues + shows history; no send yet) | ~2 sessions | **None** |
| **R4 — Messaging delivery** | B1 provider + B3 Edge Function + daily cron | ~2–3 sessions | **Messaging account + budget** |
| **Later — Online billing (C4)** | Stripe Checkout + webhook + suspension enforcement wall | ~3–4 sessions | **Stripe account** |

**No-cost Stage 2 = R1 + R2 + R3** ≈ **9–13 sessions**, shipping as three separate
deploys. R4 and C4 add on top whenever the external accounts are in place.

### Deployment prerequisites (one-time, non-code)
- A hosting target — **Vercel** is the natural fit for Next.js (the app isn't deployed
  anywhere yet; today it runs via `npm run dev`).
- Production env vars set on the host: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- The production Supabase project with all `db/*.sql` applied (incl. the Stage 2
  migrations once written).
- A domain (the public `/book/[slug]` page needs to be reachable by customers).
- **R4 only:** messaging provider account + secrets in the Edge Function env + enable
  `pg_cron` / scheduled triggers.
- **C4 only:** Stripe account + a webhook endpoint.

### Bottom line on "when is it ready to deploy?"
- **First customer-facing release (R1)** is deployable after its ~4–6 build sessions —
  that's the earliest real go-live, and it needs nothing external.
- **The full no-cost Stage 2 (R1–R3)** lands within roughly a dozen sessions, as three
  incremental deploys you can ship the moment each passes review.
- **Reminders actually sending (R4)** and **online billing (C4)** are not blocked by
  build time — they're blocked on *you* setting up the provider / Stripe accounts.
  Once those exist, each is ~2–4 sessions.

---

## 9 · Docs

On approval, fold the agreed scope into `GUIDE.md`: the new `source` column,
`sent_reminders`, `platform_admins`, `salon_payments`, the `salons` subscription
columns, the `/api/book` + `/admin` endpoints, the slot algorithm, the
`reminder_settings` shape — and move these items from **"Not started"** to
**"In progress."** `GUIDE.md` stays the single cheat sheet; this file is the
working plan and can be deleted once Stage 2 ships.
