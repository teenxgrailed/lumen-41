# Student price: runbook

40% off Pro monthly ($4.20) and Pro yearly ($35.40) for students. Lifetime
($149) is never discounted. One discount per subscription.

## How it works

- **Automatic.** A confirmed sign-in address at a recognised university, or a
  university address added in Settings → Plan and confirmed by its link, is
  the proof. Checkout (`POST /api/billing/checkout`) then sends
  `discount_code` to Creem for Pro monthly and Pro yearly only.
- **Recognised university.** `src/lib/students/university-domains.ts` matches
  the address's domain and its parents (`name@cs.ethz.ch` → `ethz.ch`)
  against a committed snapshot of Hipo's university-domains-list
  (`src/lib/students/data/university-domains.json`) and a hand-kept
  allowlist (`data/manual-allowlist.json`). Public suffixes (`edu`, `ac.uk`)
  never match. Nothing is fetched at runtime.
- **One address, one account.** `User.studentEmail` is unique.
- **Landing link.** `needt.app/students` links to
  `/auth/signin?plan=student`. Sign-in turns that into the callbackUrl
  `/settings?section=billing&offer=student`, which every sign-in path keeps,
  and Settings opens on Plan with the student block.

## Setup (owner, once per Creem store)

1. In Creem (test mode first, then live), create one discount:
   - Name: `Needt student price`
   - Code: `NEEDTSTUDENT40` (any code works; it goes in the env var)
   - Type: percentage, **40**
   - Duration: **forever**
   - Products: **Pro monthly** and **Pro yearly** only (not Lifetime)
   - No expiry, no redemption limit
2. Set `CREEM_STUDENT_DISCOUNT_CODE` to that code on web and worker.

## Manual path (no university email, school not recognised)

The person writes to students@needt.app with proof of enrolment.

1. Check the proof.
2. In Creem, create a personal discount: 40%, forever, Pro monthly + Pro
   yearly, **max redemptions 1**, code e.g. `STU-<short-id>`.
3. Record it, so checkout pre-applies their code and Settings shows them as a
   student:

   ```
   POST /api/admin/students
   { "action": "mark", "userId": "<id>", "discountCode": "STU-…",
     "studentEmail": "<their school address, if any>" }
   ```

   (admin session required; written to the audit log as `user.mark_student`).

4. Reply with the code. They can also type it at Creem's checkout themselves.

If their school should be recognised for everyone, add its domain to
`src/lib/students/data/manual-allowlist.json` in a pull request.

## Yearly re-check

Hourly worker sweep (`src/services/students/student-recheck.ts`, trials
queue, job `student-recheck`):

1. 335 days after the last proof, while a Pro subscription renews, the
   student address gets a one-click confirm link (valid 30 days).
2. Confirming renews the proof for a year.
3. Not confirmed 14 days later, and the renewal 12 to 14 days away: the price
   lapses (`studentLapsedAt`), the sign-in address gets the "student price
   ends at your next renewal" email, and the account appears with
   `needsAction: true` in `GET /api/admin/students`. A renewal nearer than 12
   days waits a period, so the notice is never short.

Manual grants without a student address are not re-checked by mail; support
reviews them once a year from the same list.

### When the yearly check fails: remove the discount by hand

Creem's API cannot add or remove a discount on a running subscription
(`POST /v1/subscriptions/{id}` takes items and a proration mode only; checked
2026-10-29 against the API reference and SDK 1.5.4). So for each
`needsAction` row, before its renewal date:

1. Remove the discount from that subscription in the Creem dashboard, if the
   dashboard allows it. If it does not, ask Creem support to, or end the
   subscription at period end and tell the person to subscribe again at the
   regular price. Do not let it renew silently at the student price after the
   email said it would not.
2. Then clear the student record:
   `POST /api/admin/students { "action": "clear", "userId": "<id>" }`.

If they confirm again before the renewal (Settings → Plan), `studentLapsedAt`
clears and the row leaves the list; nothing to do.

## Existing Pro subscribers

They can add a university address in Settings → Plan at any time. The same
API limit applies: a running subscription cannot take the discount. The
screen says so and tells them to turn off renewal and subscribe again when the
plan ends; that new checkout carries the student price.

## Refreshing the university list

```
npx tsx scripts/refresh-university-domains.ts
```

Re-downloads Hipo's JSON, keeps only the `domains` strings, drops public
suffixes and free mail domains, refuses a result under 5,000 domains, and
rewrites the snapshot. Review the diff and commit it.
