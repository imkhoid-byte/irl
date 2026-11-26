---
name: once-change-guard
description: Use before and after changing ONCE's matching, payments, inventory, cancellation/refund, blocking or authorization code (src/server/services/*, src/lib/policy.ts, src/lib/money.ts, src/server/db/schema.ts). Maps each product invariant to the code and test that enforce it, and runs the checks that must stay green.
---

# Guarding ONCE's invariants

ONCE moves (test) money and real people's evenings. These rules are enforced
server-side and each has a test. A change that weakens one is a bug even if the
UI looks fine.

## 1. Find which invariants your change touches

| # | Invariant | Enforced in | Proved by |
|---|---|---|---|
| 1 | Nobody matches with themselves | `profiles.ts → pairEligibility`, `CHECK (from_user_id <> to_user_id)` | `rules.test.ts` "can't match with themselves" |
| 2 | A date has exactly two participants | `match_participants` unique `(match_id, role)` + trigger | schema |
| 3 | Both agree to the same terms | `dates.ts → hashTerms`, `confirmDetails` | `flow.test.ts` "requires explicit agreement" |
| 4 | Confirmed only after both pay and the venue is secured | `payments.ts → tryFinalizeMatch` | `flow.test.ts` "confirms a date only after…" |
| 5 | Inventory can't be oversold | conditional `UPDATE … reserved_count < capacity` in `respondToInvitation` | `flow.test.ts` "a slot can't be oversold" |
| 6 | Concurrent accepts can't double-book | conditional `status = 'pending'` claim; `finalizing_at` claim | `flow.test.ts` "accepted only once" |
| 7 | Refunds follow the published policy | `lib/policy.ts → cancellationOutcome`, `lifecycle.ts → cancelMatch` | `money-policy.test.ts`, `flow.test.ts` cancellation block |
| 8 | Only verified provider events set payment status | `payments.ts → receivePaymentWebhook` | `flow.test.ts` "payment webhooks" |
| 9 | No access to others' private data | `requireParticipant`, `toPublic` | `rules.test.ts` "authorization" |
| 10 | Blocking prevents discovery and matching | `candidatePool`, `pairEligibility`, `blockUser` | `rules.test.ts` "blocking…" |
| 11 | Nothing silently creates a charge | no charge without `commitPayment` by that person; agent tools can't pay | `mcp.test.ts` tool surface; eval `pay-on-behalf` |
| 12 | Test money is never confused with real | `is_test` on every money row; UI labels | `rules.test.ts`, admin payments page |

## 2. Make the change

- Keep the rule in the service layer, not in a page or server action.
- State changes that must be atomic go inside `tx(db, () => …)` (synchronous only; provider calls happen outside the transaction, then a second `tx` records the outcome).
- Prefer a conditional `UPDATE … WHERE <precondition>` and check `changes === 1` over read-then-write.
- If you change a schema, update `src/server/db/schema.ts` **and** `supabase/migrations/` together.

## 3. Prove it

Run the checks script from the repo root:

```bash
bash .claude/skills/once-change-guard/check.sh
```

It runs typecheck, lint, the unit suite (including the eval self-checks) and the
reference eval. All must pass. If you changed a rule, add or update the test in
the "Proved by" column first, and watch it fail before your fix.

For UI-visible changes, also run `npm run test:e2e`.

## 4. Report

Say which invariants the change touches, which tests prove them, and the check
output. If a test had to change, explain why the old expectation was wrong.
