# ONCE — the dating app that gets you offline

> **Stop matching to chat. Start matching to meet.**

ONCE is a commitment-based dating marketplace. There is no inbox. Every match is a specific plan (an experience, a time, a place, a price). Both people confirm the exact details and pay their own half. ONCE then secures the reservation and hands both people the same itinerary.

This repository is a **working MVP**, not a mockup. It has persistent data, real server-side business rules, a mock payment provider driven by signed webhooks, an admin dashboard, and automated unit and end-to-end tests.

---

## Quick start

Requirements: **Node.js 22.13+** (uses the built-in `node:sqlite`). No accounts, keys or external services are needed.

```bash
npm install
npm run dev            # http://localhost:3000
```

On first run the app creates `data/once.db` and seeds demo data. To start over, run `npm run db:reset`.

### Demo accounts

All demo accounts use the password **`showup-demo`**. The sign-in page also has one-click demo buttons.

| Who | Email | Notes |
|---|---|---|
| Ava | `ava@demo.once.date` | Has a past date with Marcus waiting for her post-date check-in |
| Ben | `ben@demo.once.date` | Has a pending invitation from Hannah |
| Admin | `admin@demo.once.date` | Full admin dashboard at `/admin` |

There are 12 more seeded members (for example `chloe@demo.once.date`), all with the same password.

**Two-person walkthrough.** Open Ava in one window and Ben in a private window.
1. Ava goes to **Discover**, opens *Coffee & a bookstore* and invites Ben.
2. Ben goes to **My Dates → Invitations** and taps **Yes, I'm in**.
3. Each of them confirms the details and commits with a test card. Try *Visa ending 0002* first to see a decline.
4. The date becomes **Confirmed**. Both see the same itinerary, venue, address and reservation code.
5. Press **Simulate: the date happened** (a demo-only control), then each person completes the private check-in. If both say yes, **Plan a second date** appears.

---

## What's real and what's simulated

| Area | Status |
|---|---|
| Auth (email + password, scrypt, httpOnly session cookies, rate limits) | **Working** |
| Onboarding, profiles, photo upload (bytes sniffed, 5 MB limit, served to members only) | **Working** |
| Discovery, filters, suggested people, compatibility and blocking rules | **Working** |
| Invitations, acceptance, matching, inventory holds, double-booking prevention | **Working** (transactional, race-safe) |
| 50/50 split, fees, idempotent payment intents, webhook processing, ledger, refunds | **Working logic** on a **simulated** provider |
| Payment provider | **Simulated.** `MockPaymentProvider` keeps its own ledger and reports every outcome through HMAC-signed webhooks. All records are flagged `is_test`. |
| Stripe | **Integration path written, not exercised** (`src/server/providers/payments/stripe.ts`). See Phase 2. |
| Venue reservations | **Simulated** (`createMockBookingProvider`). All venues are fictional and labelled “demo”. |
| Inventory | **Simulated.** Generated from each demo experience's default hours, 14 days ahead. Admins can add slots by hand. |
| Identity verification | **Simulated.** Badges read “ID verified (test)”. |
| Email | **Simulated.** Written to an outbox, visible in **Admin → Email outbox**. In-app notifications are real. |
| Reminders, expiry, completion | **Working.** A sweep runs on page loads (throttled) and at `POST /api/cron/sweep`. |
| Photography | Illustrated, category-specific art. No licensed photos are bundled. Profile photos are user uploads; seeded members show a monogram. |

There is **no chat, no inbox, and no contact-exchange feature**, by design. The end-to-end suite checks this.

---

## Architecture

- **Next.js 16** (App Router, Server Components, Server Actions), **TypeScript**, **Tailwind CSS 4**, **Zod**, **React Hook Form** for onboarding and profile editing.
- **Demo database:** SQLite via `node:sqlite` (`src/server/db/schema.sql`). There are no native dependencies and no external services.
- **Production schema:** PostgreSQL/Supabase with row-level security (`supabase/migrations/0001_init.sql`). It was applied to Postgres 16 and smoke-tested: a double-accept is refused, overselling is refused, and RLS hides a match from non-participants.
- **Providers behind interfaces** (`src/server/providers/`): payments, booking, identity, email and file storage. `src/server/context.ts` wires them up.

```
src/
  app/                 routes: (marketing) landing + policies, (auth), onboarding, (app) member area, admin, api
  app/actions/         server actions (thin: authenticate → call a service → revalidate/redirect)
  components/          UI (editorial design system in app/globals.css)
  lib/                 pure logic: money split, cancellation policy, reliability, time, catalog
  server/
    db/                schema, connection helpers, transactions, seed
    services/          all business rules (each takes the db/ctx explicitly, so it's testable)
    providers/         payment (mock + Stripe), booking, identity, email, storage
    session.ts         cookie session + role checks for Next.js
supabase/migrations/   Postgres schema with RLS (Phase 2)
tests/unit/            Vitest: business rules, payments, concurrency, authorization
e2e/                   Playwright: the full two-person journey
```

### The commitment flow

```
invite (free) ─► accept ─► match: awaiting_commitment ──► confirmed ──► completed ─► check-ins ─► (mutual yes ─► invite again)
                  │           (inventory held)              │ (both captured,         │
                  │                                         │  venue secured)         └─ no-show claim → admin review
                  └─ declined / expired                     └─ cancelled (refund per policy)
                     (nothing charged)                         expired (holds voided, inventory released)
```

1. **Accept** runs in one transaction. Two conditional updates act as race guards: the invitation is claimed only if it is still `pending`, and the slot is held only if `reserved_count < capacity`. A `CHECK` constraint backs this up. Other pending invitations for either person around the same time lapse.
2. **Each person confirms the terms.** The terms are hashed (experience, slot, time, price split, fee, deadline, late-refund %). Any change produces a new hash, so nobody can be held to details they didn't see.
3. **Each person commits.** This creates a manual-capture payment intent with an idempotency key. A partial unique index allows only one live payment per person per match, so the database itself refuses a double charge.
4. **Only verified webhooks change payment state.** The client never reports success. Each event is processed once (`provider_events`) and written to an append-only ledger (`payment_transactions`).
5. **Finalization.** When both authorizations are verified, one claim (`finalizing_at`) lets a single process secure the venue booking and then capture both payments. If anything fails, it unwinds completely: captures are refunded, holds are voided and inventory is released. Nobody pays alone.

### Cancellation policy (`src/lib/policy.ts`)

| When | Canceller | Other person |
|---|---|---|
| Before both commit | no charge | no charge |
| Confirmed, before the deadline | full refund including the fee | full refund including the fee |
| After the deadline | 50% of their half (configurable); fee kept | full refund |
| Safety / block / venue / support | full refund | full refund |

The service fee ($3 per person) and the late-refund percentage are configurable in **Admin → Fees & policy**. Existing matches keep the values they agreed to.

### Safety and privacy

- Public profiles never include email, birth date, preferences, location coordinates, or dietary/accessibility notes. A unit test asserts this. Dietary and accessibility notes go only to the venue booking.
- Only neighbourhood centroids are stored, never a home location. Distances are rounded.
- The venue name and address are revealed only after confirmation.
- Admin access is checked against `admin_roles` in the database on every page, action and service call. Non-admins get a 404.
- Reports are private to the reporter and to admins. A no-show claim affects reliability only after an admin upholds it.
- Blocking hides both people from each other, stops invitations, and cancels shared dates with full refunds.
- Other measures: rate limits on login, registration, invites and reports; deliberately generic login and registration errors; constant-time password checks; security headers; photos served only to signed-in members; and Server Actions' built-in origin checks.

---

## Testing

```bash
npm test               # Vitest: 40 unit/integration tests against an in-memory database
npm run test:e2e       # Playwright: builds, then runs the journey on a fresh database
npm run typecheck
npm run lint
```

The unit tests cover: the 50/50 split, cancellation outcomes, reliability tiers, the full commit flow (including a declined card), idempotent and double-charge-proof payments, webhook signature rejection and duplicate delivery, concurrent accepts, overselling, double-booking, unwinding a failed booking, policy-based refunds, commitment expiry, self-matching, mutual preferences, blocking, participant-only access, private-field exclusion, admin enforcement, auth, adults-only onboarding, independent post-date feedback, mutual-yes repeat dates, and no-show review.

The end-to-end suite runs against a production build with its own throwaway database. It drives Ava and Ben through discovery → invite → accept → declined card → both commit → identical itinerary → check-ins → second date → cancellation and refund → no chat → admin access control → block → persistence.

> In this cloud environment Playwright uses the preinstalled Chromium at `/opt/pw-browsers/chromium`. Elsewhere, run `npx playwright install chromium` once.

---

## Environment variables

None are required for demo mode. See `.env.example`.

| Variable | Purpose |
|---|---|
| `ONCE_DB_PATH` | SQLite file location (default `./data/once.db`) |
| `MOCK_WEBHOOK_SECRET` | HMAC secret for mock webhooks |
| `PAYMENT_PROVIDER` | `mock` (default) or `stripe` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe test-mode keys (Phase 2) |
| `CRON_SECRET` | Bearer token for `POST /api/cron/sweep` (required in production) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Phase 2 |

---

## Deployment

**Demo deployment (single server).** Any Node 22 host with a persistent disk works, for example Fly.io, Render or a VM:

```bash
npm ci && npm run build && npm start
```

Mount persistent storage at `./data` (or set `ONCE_DB_PATH`). Then schedule `POST /api/cron/sweep` with `Authorization: Bearer $CRON_SECRET` every 5 minutes.

Serverless hosts with ephemeral filesystems, such as Vercel, need the Phase 2 database. SQLite on an ephemeral disk would lose data.

## Phase 2 — integration points

1. **Supabase.** Apply `supabase/migrations/0001_init.sql`, move auth to Supabase Auth (Apple and Google sign-in become configuration), and port `src/server/db` helpers to Postgres. Services already take the database explicitly, and the transactional `accept_invitation` function mirrors the TypeScript race guards.
2. **Stripe Connect.** Set `PAYMENT_PROVIDER=stripe` with test keys and point a Stripe webhook at `/api/webhooks/payments`. Replace the test-card picker with Stripe Elements (a PaymentIntent `client_secret` with `capture_method=manual`). Add Connect destination charges or transfers to pay venues. ONCE does not hold funds or claim escrow; take legal advice before changing that.
3. **Venue booking.** Implement `BookingProvider` for real partners (direct APIs, OpenTable, Resy or SevenRooms) and replace the generated demo inventory with partner availability.
4. **Identity verification.** Implement `IdentityProvider` (Stripe Identity, Persona or Onfido). Badges drop “(test)” automatically.
5. **Email and push.** Implement `EmailProvider` (Resend, Postmark or SES) and add web push.
6. **Moderation tooling.** Add a case history per member, evidence attachments and SLA queues.

## Naming

**ONCE** is a working name. Before launch, check trademark, domain and app-store availability, and look for conflicts with existing dating, events and hospitality brands. The brief lists alternatives (SHOWUP, PLANS, IN PERSON, and others).
