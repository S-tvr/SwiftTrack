# SwiftTrack — Phase 1 (Single-Tenant) — Final Spec

## 1. Goal
Time tracking & payroll calculation app for **a single business**. The admin (employer) manages employees. Employees clock in/out and view their pay.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS |
| ORM | Prisma |
| Database | PostgreSQL (DB only in Docker· backend/frontend run locally) |
| Frontend | React (Vite) + Tailwind CSS |
| Auth | JWT |
| API Docs | Swagger |

---

## 3. Domain Model

> **Source of truth: `backend/prisma/schema.prisma`.** Every type, default and constraint below is copied from it — verified, not paraphrased. The schema generates the Prisma Client, so it is the one copy that cannot drift silently: if it is wrong, the build fails. **Never edit a type here alone.** What this section adds is the *why*, which a schema cannot carry.
>
> Two rules are enforced in the database but are **not expressible in Prisma's DSL**, so they live in hand-written migrations under `backend/prisma/migrations/`. Both are noted in place below.

### `enum Role`
`ADMIN | EMPLOYEE` — always imported from the generated client, never hand-written as a union (see architecture.md § Invariants).

### User
| Field | Prisma | Notes |
|---|---|---|
| id | `Int @id @default(autoincrement())` | |
| name | `String` | |
| email | `String @unique` | the only identifier — no separate username |
| password | `String?` | bcrypt hashed once set· null until the employee activates their account |
| role | `Role` | |
| hourlyRate | `Int?` | EMPLOYEE only· ISK, always an integer (no decimals)· the admin never clocks in/out, so never needs one |
| isActive | `Boolean @default(true)` | `DELETE` deactivates, doesn't actually delete — preserves time/payroll history |
| setupCode | `String?` | random 4-digit code, generated when the admin creates the employee· cleared after activation |
| setupCodeExpiresAt | `DateTime?` | createdAt + 3 days· set and cleared **together** with `setupCode`, never separately |
| createdAt | `DateTime @default(now())` | |
| updatedAt | `DateTime @updatedAt` | |
| timeEntries | `TimeEntry[]` | relation |

### TimeEntry
> All timestamps are stored and computed in **UTC**. The app is built exclusively for use in Iceland, which stays on UTC year-round (no DST) — so no timezone conversion is needed anywhere in the system.

| Field | Prisma | Notes |
|---|---|---|
| id | `Int @id @default(autoincrement())` | |
| userId | `Int` | |
| startTime | `DateTime` | full timestamp, UTC |
| endTime | `DateTime?` | **nullable** — null while the shift is "open" (forgotten clock out) |
| notes | `String?` | optional notes |
| createdAt | `DateTime @default(now())` | |
| updatedAt | `DateTime @updatedAt` | |
| user | `User @relation(fields: [userId], references: [id])` | |

`@@index([userId, startTime])` — every cycle query filters on exactly this pair.

⚠️ **DB-level, hand-written** (`..._time_entry_single_open_shift`): `CREATE UNIQUE INDEX "TimeEntry_one_open_shift_per_user" ON "TimeEntry" ("userId") WHERE "endTime" IS NULL`. A *partial* index, because the rule is "at most one **open** shift per user" and a user may have any number of closed ones. It closes the check-then-act window the service-level check leaves open.

> No `status` field (PENDING/APPROVED/REJECTED) — removed. Every entry counts directly toward the calculation, as long as it has an `endTime` (i.e. it's "closed").

### AppSettings
| Field | Prisma | Notes |
|---|---|---|
| id | `Int @id @default(1)` | fixed, always `1` — a single unique row |
| cycleStartDay | `Int @default(25)` | allowed range **11–25** — enforced by `class-validator` on the DTO, **not** by the database (see §4, decision 5a). The only field the cycle arithmetic reads |
| cycleEndDay | `Int @default(24)` | of the following month — the cycle "wraps" across the month boundary, e.g. 25 June → 24 July. Always exactly `cycleStartDay - 1`, so allowed range **10–24**. Stored and validated, but **derived** — never used to compute a boundary |

⚠️ **DB-level, hand-written** (`..._appsettings_singleton_check`): `ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_id_check" CHECK ("id" = 1)` — so even a mistaken `create()` with a different id fails outright instead of silently succeeding.

---

## 4. Decisions Made (summary)

| # | Topic | Decision |
|---|---|---|
| 1 | How employees are onboarded | The first admin goes directly into the database via a seed script (no `/register` route). The admin creates each employee (name, email, hourlyRate, no password) — the system generates a random 4-digit setupCode with a 3-day expiry. The employee activates their own account with email + setupCode + their own password |
| 1a | Audit log for deletions/edits | Not present in core — and the same call was made for an **approval flow** (`source`/`status`/`approvedById`), weighed when `POST /time-entries` was added and deferred for the same reason: both need domain-model changes, so both belong to a later phase. Consequence, deliberate rather than overlooked: an employee's self-reported hours carry no history, and nothing records that an entry was edited or deleted |
| 2 | Limits on time-entry corrections | An employee can edit/delete **any** of their own entries, in any cycle — no restriction |
| 3 | Forgotten Clock Out | Stays open (`endTime = null`), fixed manually later. Doesn't count toward payroll until closed |
| 4 | Who can edit entries | Both the employee (their own) and the admin (any employee's) |
| 5 | Pay cycle configuration | `AppSettings` table, configured by the admin via the UI. The cycle wraps across the month boundary (e.g. 25 → 24 of the following month). The backend is the **single source of truth** for resolving cycle boundaries — every relevant response (time-entries, payroll) includes the resolved `cycleStart`/`cycleEnd` as ISO dates, so the frontend never computes any dates itself, only displays them |
| 5a | Allowed cycle days | `cycleStartDay` is restricted to **11–25**, and `cycleEndDay` is always exactly `cycleStartDay - 1` (so 11–10 … 25–24) — any other combination is rejected with a 400. Two consequences, both deliberate: consecutive cycles are contiguous, so no shift can fall into a gap between them or into two at once; and every allowed day exists in every month, so no day-of-month clamping for 28/29/30/31-day months is ever needed. Since the range is fully determined by `cycleStartDay`, the cycle arithmetic uses **only** that field — `cycleEndDay` is stored and validated but never computed with |
| 5b | Shifts crossing a cycle boundary | A shift is **split** at the boundary: the hours before it count toward the earlier cycle, the hours after it toward the later one. A shift 24 Aug 20:00 → 25 Aug 03:00 with a 25th boundary contributes 4h to one cycle and 3h to the next. A shift is therefore never assigned wholesale to the cycle of its `startTime` — the sum over all cycles always equals the hours actually worked, and no hour is ever lost or paid twice. The boundary itself is **exclusive**: `cycleEnd` as returned by the API is the last instant *inside* the cycle (display), while every query and every hour calculation uses the exclusive instant (midnight), which is simultaneously the next cycle's start |
| 5c | Rate zones | Hours are **not** all paid at the same rate. Mon–Fri 08:00–17:00 pays the plain `hourlyRate`· Mon–Fri 17:00–24:00 pays **+33%**· Mon–Fri 00:00–08:00 pays **+45%**· Saturday and Sunday pay **+45%** for the whole 24 hours. The four zones cover every hour of the week exactly once — there is no gap and no hour that qualifies for two surcharges, so surcharges never stack. The weekend runs Saturday 00:00 → Monday 00:00: Friday evening is still the +33% zone, and Monday's small hours are the weekday +45% zone. A shift is cut at every zone boundary it crosses, the same way it is already cut at a cycle boundary (5b) — a shift Tue 22:00 → Wed 06:00 is 2h at +33% and 6h at +45%. The percentages and the 08:00/17:00 boundaries are **hardcoded constants**, not `AppSettings`: payroll is recomputed on every request and never frozen, so an admin-editable percentage would silently rewrite every past cycle. Changing one is a developer action |
| 5d | Rounding — three points, and nowhere else | (1) **Hours** are rounded to **2 decimals** per *cell* (one date × one zone), which is the finest figure ever displayed· every hour total above a cell is an exact sum of cells. The rounded value is the **canonical** one: it is what gets multiplied, not a display-only version of something more precise. There is no second hours figure anywhere to disagree with it — `GET /time-entries` deliberately reports **no hours at all** (see 5f). (2) **A zone's rate** (`hourlyRate` × the zone factor) is **never** rounded — a whole-ISK rate times 1.33 or 1.45 lands exactly on hundredths, so the rate shown is exactly the rate used. (3) **A zone's pay** is rounded to whole ISK — this is the **only** money rounding in the system. `totalPay` is a plain sum of the zone amounts and `totalCost` a plain sum of the employees' `totalPay`, so every column adds up to the figure beneath it. All of this is computed in integer hundredths, never in decimal floats: `2450 * 1.33` in IEEE doubles is not exactly 3258.5, and a wage must not depend on which way that lands |
| 5e | What the breakdown shows | Two views of the same hours, both from the backend. A **summary** with one line per zone (`label`, hours, rate, pay) and one total· and a **day-by-day table** whose rows are **dates, not shifts**, with a column per zone. Rows are dates because the zones are defined by the calendar day, so the calculation already has to cut at midnight — a night shift therefore appears as evening hours on one date and night hours on the next. Only dates with hours are listed. The day table carries **no money at all**: with ~25 rows × 4 zones it would multiply the rounding surface for no gain, and the summary already answers "how much" |
| 5f | The shift list reports no hours | `GET /time-entries` returns `startTime`/`endTime`/`notes`/`isSplit` per shift and **no hours figure**. It used to return `hoursInCycle`, which made sense when payroll was a flat rate: one shift's hours times one rate was that shift's pay. Under rate zones (5c) that is false — a shift 12:00–20:15 is 5.00 h at the base rate and 3.25 h at +33% — so a single "Hours" number there invites precisely the wrong multiplication, and would be a **second** hours figure capable of disagreeing with the payroll breakdown (they round at different units: per shift vs per cell). Hours and money therefore live in exactly one place, `GET /payroll`. `isSplit` stays and matters more without it: it is the only thing explaining why the same shift reappears when the ◀▶ navigator moves to the neighbouring cycle. Consequence for the UI: the Shift History table has no Hours column· if a sanity-check number is ever wanted there it should be an explicit **Duration** (`end − start`), which is a fact about the shift and not a payroll figure |
| 6 | Currency | Icelandic króna (ISK) — no decimals. `hourlyRate` and every computed **pay amount** are always whole integers (Int), never decimal. The one figure allowed hundredths is a zone's **rate** (see 5d): it is ISK *per hour*, a multiplier and not a payment — nobody is ever paid 3,258.50 |
| 7 | Timezone | Everything in UTC. The app is exclusively for Iceland, where there's no DST — UTC always matches local time |
| 8 | API validation | Every endpoint that accepts a body uses a DTO with `class-validator` + a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`· any field that isn't expected (e.g. a `password` sent to `POST /users`) is automatically rejected, not just "not documented" |
| 9 | UI language | All user-facing text (pages, titles, buttons, error/success messages) is in **English** — see §8a for the explicit string list |

---

## 5. Onboarding Flow

**First admin (one-time, before the first deploy):**
1. The first admin is created directly in the database via a **seed script** (name, email, password already set/hashed) — no public `/register` route exists

**Every new employee:**
2. The admin, from the `Team` page, creates the employee (`POST /users`): name, email, hourlyRate — **no** password
3. The backend automatically generates a random **4-digit setupCode** and `setupCodeExpiresAt` = now + 3 days
4. The admin gives the employee (personally, no automated email): their **email** + the **setupCode**
5. The employee goes to the `/login` page, sees a link **"Activate your account"** (see §8a for the exact UI copy)
6. On a dedicated page, they enter: email + setupCode + **their own** new password (`POST /auth/set-initial-password`)
7. The backend checks: code is correct, hasn't expired, no password already set → stores the hashed password, clears setupCode/expiry
8. The employee logs in normally via `/login` with email + password

---

## 6. REST API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | — | Returns a JWT. Fails with a clear message if `password` is still null (account not activated) |
| POST | `/auth/set-initial-password` | — | `{ email, setupCode, newPassword }` — activates the employee's account |

> No `/auth/register` route. The first admin is created only via the seed script.

### Users
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/users` | ADMIN | List of all employees, with a derived `hasActivated: password !== null`. Carries `setupCode` **and `setupCodeExpiresAt`** for pending employees — the Team page prints the expiry as a date ("Valid until 29 August"), which a code alone cannot support |
| GET | `/users/me` | Both | Details of the logged-in user |
| POST | `/users` | ADMIN | Create a new employee (name, email, hourlyRate — **no** password). Generates setupCode + 3-day expiry |
| PUT | `/users/:id` | ADMIN | Edit (name, hourlyRate) |
| DELETE | `/users/:id` | ADMIN | Soft delete — sets `isActive = false`, doesn't actually delete |
| PATCH | `/users/:id/reactivate` | ADMIN | Sets `isActive = true`. **Added in step 8c**, because deactivation was otherwise irreversible through the API: `PUT` accepts only name/hourlyRate, and a fresh `POST` collides with the unique email — the only remedy was editing the database by hand, for the routine case of a seasonal employee returning. EMPLOYEE rows only, like `PUT`/`DELETE` |
| POST | `/users/:id/reset-setup-code` | ADMIN | Issues a fresh 4-digit code and a fresh 3-day expiry for a still-pending employee· refuses once the account is activated. **Added in step 8c**, closing a guaranteed dead end rather than an edge case: the code is issued exactly once in `createEmployee`, lives 3 days, and had no regeneration path — so anyone who did not activate in time was locked out permanently, while the expiry message told them to *"contact your admin"*, who had no tool |

### Time Entries
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/time-entries/clock-in` | EMPLOYEE | Starts a new entry (startTime = now, endTime = null) |
| PATCH | `/time-entries/clock-out` | EMPLOYEE | Closes the current open entry (endTime = now) |
| POST | `/time-entries` | Owner or ADMIN | Manually add a forgotten/missing shift — explicit `startTime`, `endTime`, `notes`, plus `userId` when an ADMIN calls (rejected from an EMPLOYEE, who always writes to themselves). Distinct from clock-in, which always writes `startTime = now, endTime = null`. Always produces a **closed** shift: `endTime` is required here and on `PUT`, may not be before `startTime`, neither timestamp may be in the future, and the shift may not overlap another of the same user (see §7a) |
| GET | `/time-entries/me` | EMPLOYEE | My own entries for a cycle (optional `?cycle=`, defaults to the current one). Returns the resolved cycle block· **`userId` + `name`**, whose list it is *(added in step 8d)*· a response-level **`canWrite`** (may the caller create a shift in this cycle at all — there is no row for a `POST` to hang a flag on)· and per entry `isSplit` plus **`canEdit`**, whether the caller may still edit *or delete* that row. Both flags come from §7a rule 5, and the client may not derive either — resolving cycle boundaries is the backend's job. ⚠️ `userId`, `name` and `canWrite` all sit **beside** `entries`, not inside the cycle block: the block describes the *cycle*, these describe *whose* list it is and what *this caller* may do to it. The `name` here is the caller's own and the employee page never prints it — one shape for both routes is worth one primary-key lookup. **No hours figure** — see §4, decision 5f |
| GET | `/time-entries?userId=&cycle=` | ADMIN | Entries for any employee — **same response shape** as `/me`, since both feed the same shared `ShiftList` + `CycleNavigator`. Both flags are therefore present here too, and are always `true` for an admin· `userId`/`name` name the employee being viewed, which is what lets `/shifts/:userId` label the page without a second call to `GET /users`. Any id that is not an EMPLOYEE, the admin's own included, is a 404 — the same one `/payroll/:userId` gives, from the same kind of narrow reader |
| GET | `/time-entries/open` | EMPLOYEE | The caller's open shift, or `null` — what the Clock page's button state is read from. Returned **wrapped** as `{ openShift: … \| null }`: Nest answers a bare `null` with an empty body rather than the JSON literal `null`, and `api/client.ts` calls `res.json()` on every response, so the endpoint whose normal answer is "nothing" would be the one that breaks it |
| PUT | `/time-entries/:id` | Owner or ADMIN | Edit (startTime, endTime, notes) |
| DELETE | `/time-entries/:id` | Owner or ADMIN | Delete |

### Payroll
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/payroll/me?cycle=2026-07` | EMPLOYEE | My own payroll breakdown (the admin has no payroll of their own — doesn't work hours). Returns the cycle block, `hourlyRate`, `totalHours`, `totalPay`, `hasOpenShift`, the four `zones` and the `days` table (see §7) |
| GET | `/payroll/:userId?cycle=2026-07` | ADMIN | Payroll for a specific employee — **identical shape** to `/me`, since both feed the same shared page (`PayrollSummary` + `PayrollDayTable`, step 12· measured byte-for-byte identical on the two routes). A deactivated employee resolves normally (they still worked the hours)· any id that is not an EMPLOYEE, the admin's own included, is a 404 |
| GET | `/payroll/overview?cycle=2026-07` | ADMIN | The whole team for one cycle in **one** request: `totalCost` plus a row per employee (`userId`, `name`, `totalHours`, `totalPay`, `hasOpenShift`). Every active employee appears, even with zero hours, **plus** any deactivated employee with hours in this cycle — someone who left mid-cycle still has to be paid and still has to show up in the costs. Deliberately one call rather than one per employee: the alternative is N round trips and the team's total added up in the browser, which would put payroll arithmetic in the frontend |

### Settings
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/settings` | Both | Current cycle settings |
| PUT | `/settings` | ADMIN | Update cycleStartDay/cycleEndDay. Both fields are required· `cycleStartDay` must be 11–25 and `cycleEndDay` must be exactly `cycleStartDay - 1`, otherwise 400 (see §4, decision 5a) |

**Architectural rule**: Every service function whose data belongs to a specific user (time entries, personal payroll, own profile) explicitly takes `userId` as an argument and uses it in the query filter — never a silent or missing filter. Doesn't apply to functions that are intentionally global (e.g. `getAllEmployees()`, `getSettings()`) — those correctly don't take a `userId`.

---

## 7. Pay Calculation Logic (Service layer)

**Rate zones (§4, decision 5c), with boundary splitting (5b):**

| Zone | When | Rate |
|---|---|---|
| `DAY` | Mon–Fri 08:00–17:00 | `hourlyRate` |
| `EVENING` | Mon–Fri 17:00–24:00 | +33% |
| `NIGHT` | Mon–Fri 00:00–08:00 | +45% |
| `WEEKEND` | Sat & Sun, 00:00–24:00 | +45% |

```
relevantEntries = the user's closed TimeEntries (endTime != null) that OVERLAP the cycle
                  — i.e. startTime < cycleEndExclusive AND endTime > cycleStart.
                  Not "entries whose startTime falls inside the cycle": a shift that
                  crosses the boundary is relevant to both cycles it touches.

Each entry is clipped to [cycleStart, cycleEndExclusive) and then cut at every zone
boundary it crosses (08:00, 17:00, midnight), producing pieces of (date, zone).
Pieces are accumulated per cell — one date × one zone — across ALL of the user's
shifts, and only then rounded.

cellHours   = round2(Σ milliseconds in that cell)     ← the ONE rounding of hours
zoneHours   = Σ cellHours over the cycle              (exact sum, no rounding)
zoneRate    = hourlyRate × zoneFactor                 (exact to the hundredth, never rounded)
zonePay     = round(zoneHours × zoneRate)             ← the ONLY money rounding
totalHours  = Σ zoneHours                             (exact sum)
totalPay    = Σ zonePay                               (exact sum — never rounded again)
```

Worked example — `hourlyRate` 2,450 ISK, one cycle:

| Zone | Hours | Rate | Pay |
|---|---|---|---|
| Day | 18.87 | 2,450.00 | 46,232 |
| Evening +33% | 5.25 | 3,258.50 | 17,107 |
| Night +45% | 6.00 | 3,552.50 | 21,315 |
| Weekend +45% | 12.50 | 3,552.50 | 44,406 |
| **Total** | **42.62** | | **129,060** |

Open shifts (`endTime = null`) contribute **0 hours** — they cannot be split without an end — and are listed under the cycle their `startTime` falls in. Because their day is therefore missing from the breakdown entirely, both payroll responses carry **`hasOpenShift`** (scoped to the cycle, matched on `startTime`) so the page can explain the gap instead of leaving the employee to wonder where a day went.

An employee with a `null` `hourlyRate` fails **loudly** with a 500 naming the fix — never a silent 0, which would quietly drop that person's wages out of the team's total cost. `POST /users` requires a positive rate, so this can only arise from a row edited directly in the database.

> `cycle=2026-07` means: the cycle that **starts** in July 2026 (e.g. 25/07 → 25/08 exclusive, displayed as 25/07 – 24/08, with the defaults). The backend computes the exact boundaries from `AppSettings` and returns them ready-to-use in every relevant response — the frontend never computes any cycle dates itself (see §4, decision 5).

**Every cycle-aware response** (time entries list, payroll breakdown) carries the same block, so the ◀▶ navigator never does date arithmetic of its own — it just sends back the key it was handed:

```
{ cycle: "2026-07", prevCycle: "2026-06", nextCycle: "2026-08",
  cycleStart: "2026-07-25T00:00:00.000Z", cycleEnd: "2026-08-24T23:59:59.999Z" }
```

When `?cycle=` is omitted, the backend resolves the cycle that **contains the current moment** — note this is not the current calendar month: on 3 August with a 25th boundary, the current cycle is `2026-07`.

---

## 7a. Time-Entry Write Rules

The spec gives an employee `POST`/`PUT`/`DELETE` over their **own** entries (§4, decisions 2 & 4) — they write the hours they are paid for, which was accepted deliberately. Rules 1–4 are what stop an entry from being *impossible* or *double-counted*, and apply to `POST /time-entries` and `PUT /time-entries/:id` (the manual path), never to clock-in/clock-out. **Rule 5 is different in scope** — it applies to `DELETE` as well, and it is about *when* a shift may be written rather than what a valid one looks like.

| # | Rule | Why |
|---|---|---|
| 1 | `endTime` is **required** — the manual path never leaves a shift open | The form is for shifts that already ended; clock in/out is for live ones. Keeps "at most one open shift" enforced in one place, and stops `PUT` reopening a closed shift so its hours silently vanish |
| 2 | `endTime` may not be **before** `startTime` → 400 (equal is allowed) | A reversed shift is impossible. Without this it would be paid as 0 hours with no error anywhere, because the payroll clipping clamps at 0 — a safety net for the arithmetic, not a validation |
| 3 | Two shifts of the same user may not **overlap** → 400 | 08:00-16:00 plus 12:00-20:00 pays 16 hours for 12 worked. An open shift occupies `[startTime, ∞)` for this check; on `PUT` the edited row is excluded from its own |
| 4 | Neither timestamp may be **after `now`** (equal allowed) | Rejects future-dated work, and makes rule 3 hold at the clock-in door for free: if no closed shift reaches `now`, clock-in at `now` cannot land inside one |
| 5 | An **EMPLOYEE** may only `POST`/`PUT`/`DELETE` within the **current or previous** cycle. An **ADMIN** has no cycle limit *(added in step 8c)* | Once a cycle is paid, its record should stop moving. All three verbs, not just `DELETE`: editing a July shift from 8 hours to 2, or adding a new one to July, corrupts a paid cycle exactly as deleting it does — locking one door reads as protection while leaving two open. The admin exemption mirrors the open-shift asymmetry below and exists for the same reason: they are the only actor who can repair a genuine historical error, including the forgotten open shift of a deactivated employee who can no longer log in to close it |

⚠️ **Accepted consequence of rule 5**, recorded rather than discovered later: an error an employee finds **after** the window is permanent for them — a wrong time, a wrong date, a forgotten shift. There is no correcting-entry mechanism (the accounting answer to a closed period), so only an admin can fix it. The window spans one to two months, which covers the realistic discovery time, since people notice payroll errors when they are paid.

**The open-shift block is asymmetric by role.** While the row's owner has an open shift, an **EMPLOYEE** may not `POST` or `PUT` at all — not even on the open row — and unblocks by clocking out. An **ADMIN** is subject only to rule 3. The employee half makes an overlap created by clock-out impossible by construction. The admin half is required, not convenient: clock-out is EMPLOYEE-only and closes the caller's *own* shift, so `PUT` is the only tool for someone else's open shift — otherwise a **deactivated** employee's open shift (they can no longer log in) stays open forever, and the admin is locked out of the ledger while anyone is on shift.

---

## 8. Frontend Screens

Every page (for both roles) includes a **Header** (logo "SwiftTrack" on the left, username + menu on the right) and a **Footer** (empty placeholder for now).

### Employee
| # | Page | Content |
|---|---|---|
| 1 | Login / Account Activation | Login with email+password· separate link/page for activation (email + setupCode + new password) |
| 2 | **Clock** (main page, **employee only** — admin has no clock in/out) | The large **Clock In / Clock Out** button, plus **one line under it while a shift is open** ("Clocked in since 28 Aug 2026, 22:40" — decision of 2026-08-29, see §8a). No hours, no money, no list. ⚠️ The step-0 mockup's month summary is **removed** (decision of 2026-08-26): it computed pay as `hours × hourlyRate`, which under four rate zones is materially wrong for anyone working evenings or weekends. A summary may return later as two figures read straight from `GET /payroll/me` plus the `hasOpenShift` warning — see build-plan §10 |
| 3 | Shift History | List of entries, add a forgotten shift, edit/delete, ◀▶ arrows to navigate cycles |
| 4 | Payroll Breakdown | **Shared page with the admin** (see below) — breakdown for the selected cycle. **Two components**: a summary (one line per rate zone — label, hours, rate, pay — plus the total) and a day-by-day table (row per date, column per zone, hours only). ⚠️ The step-0 mockup was a **draft** and is superseded: it rendered a Date/Hours/Pay table computed in the browser· see §7 and §4 decision 5e |

### Admin, additionally
| # | Page | Content |
|---|---|---|
| 5 | Team | **First/main page after login for the admin** (no Clock/clock in-out). List of employees with a badge — **three** states, not two: Active / Pending / Deactivated (see §8a). ⚠️ A deactivated employee still has a password, so `hasActivated` is `true` and a two-badge design shows them as "Active" while they cannot log in at all. Deactivated rows are **hidden behind a toggle that shows a count**, and their action button is **Reactivate**. Create new, edit hourlyRate. Clicking an employee → goes to that **specific employee's** Shift History |
| 6 | Payroll Overview | List of employees, total monthly cost, indicator for open shifts per employee, ◀▶ arrows to navigate cycles. Clicking an employee → goes to that **specific employee's** Payroll Breakdown. Fed by **one** call to `GET /payroll/overview?cycle=` — the page adds nothing up itself |
| 7 | Settings | cycleStartDay / cycleEndDay |

**Design decision**: Two pages are **shared components**, reused for both roles — only the route/`userId` changes:
- **Shift History** (`ShiftList`): Employee sees it via `/shifts` (always their own), Admin via `/shifts/:userId` (whichever employee they selected)
- **Payroll Breakdown** (`PayrollBreakdown`): Employee sees it via `/payroll` (always their own), Admin via `/payroll/:userId` (whichever employee they selected — from Team or Payroll Overview)

Admin-only extra buttons/actions inside these shared components are shown conditionally based on `role`, with no separate component needed per role.

---

## 8a. UI Copy (English)

All user-facing text is in English. This section has **two halves that carry different weight** — the distinction is deliberate, not an oversight:

- **UI copy — binding.** Page titles, buttons, links, badges, rate-zone labels and payroll column headers are used exactly as written. Two reasons they stay a contract: the rate-zone labels are produced by the **backend** (`zones[].label`) and printed verbatim by the client, so a label and its `rateFactorHundredths` drifting apart would make the page misstate a wage; and the payroll column headers are the only text contract the not-yet-built pages of steps 12–13 have.
- **Messages — not binding.** The error/feedback table below is a **record of the wording currently in the code**, not a rule the code must match. The frontend maps status codes to its own text (a `ValidationPipe` message is never shown to a user in any case), so no user ever reads a backend string and improving one needs no spec change. What is binding about these cases is **behaviour, not wording** — which check runs in which order, and which status code comes back. That lives in §7a and in the invariants of `architecture.md`.

### Page titles — binding
| Page | UI Title |
|---|---|
| Login / Account Activation | Login / Account Activation |
| Clock | Clock |
| Shift History | Shift History |
| Payroll Breakdown | Payroll Breakdown |
| Team | Team |
| Payroll Overview | Payroll Overview |
| Settings | Settings |

### Buttons / links / badges — binding
| Element | English text |
|---|---|
| Login page link for account activation | **Activate your account** |
| Badge for an activated employee | **Active** |
| Badge for a not-yet-activated employee | **Pending** |
| Badge for a deactivated employee (`isActive === false`) | **Deactivated** — ⚠️ the third state, and the one a two-badge design gets wrong: a deactivated employee has a password, so `hasActivated` is `true` and they would otherwise render as "Active" |
| Team page toggle for deactivated employees | **Show deactivated (N)** — the count is **not** optional. Without it the toggle is invisible, and an admin whose seasonal employee returns creates a new account, hits `409 email already exists`, and has no way to see that the account is there but hidden |
| Action on a deactivated employee's row | **Reactivate** (replaces Deactivate — never an action guaranteed to fail) |
| Action on a pending employee's row | **New code** (re-issues the setup code and its 3-day expiry) |
| Clock in/out button | **Clock In** / **Clock Out** |
| Rate-zone labels (Payroll Breakdown) | **Day** / **Evening +33%** / **Night +45%** / **Weekend +45%** — returned by the API as `zones[].label` and printed **verbatim**· the client never derives a percentage of its own |
| Payroll summary columns | **Zone** / **Hours** / **Rate** / **Total Pay**, with a **Total** row |
| Payroll day-table columns | **Date** / **Day** / **Evening** / **Night** / **Weekend** / **Total**, with a **Total** row |

### Client-owned copy — the frontend's own text, not the backend's

Everything below lives in `frontend/src/lib/messages.ts` and is written by the client. It has no backend counterpart, so this table is the only record of it.

**The timezone notice** — a thin bar in the layout, rendered **only when `new Date().getTimezoneOffset() !== 0`**. In Iceland UTC *is* the wall clock, so it never appears there; outside it, a shift clocked at 15:00 local displays as 12:00 and looks like the app lost three hours. The zone and the difference are filled in by the browser:

> **All times are in Iceland time (UTC).** Your device (Europe/Athens) is 3 hours ahead.

The sentence is a template, not a constant — the same device shows *"3 hours ahead"* in August and *"2 hours ahead"* in January, which is precisely why the trigger is the offset and not the country. ⚠️ Offsets are not always whole hours (India +5:30, Nepal +5:45): format minutes, never `offset / 60`.

**Beside the time fields in `ShiftForm`** — static, no interpolation. This one guards the only path where a user's own clock can reach the data:

> Enter times in Iceland time (UTC), not your local time.

**Error text keyed by the exception's `code`** (see build-plan §8c). These four have no backend equivalent at all — they are codes the **client synthesises** in `api/client.ts`, so that every caller has exactly one thing to look at:

| Case | Client code | English message |
|---|---|---|
| Rate limited (429) — the framework's `"ThrottlerException: Too many requests"` is never shown | `RATE_LIMITED` | "Too many attempts. Please wait a minute and try again." |
| No response from the server (network failure — **not** a 401, and never a logout) | `NETWORK_ERROR` | "Could not reach the server. Check your connection and try again." |
| An unmapped failure: a `ValidationPipe` 400 (framework-generated, codeless by design), a guard's 401/403 (which carry no code either), or a code this client does not know | `UNKNOWN_ERROR` | "Something went wrong. Please try again." |
| Shown on `/login` after an auto-logout, so being thrown out reads as an explanation rather than a glitch. Not an error code — no request produced it | — | "Your session has expired. Please sign in again." |

**Shown in place of the activation form on success** (step 9). Without it the form simply empties, and an employee who has just created their password cannot tell whether it worked:

> Your account is ready. You can now sign in.

**Under the Clock button, only while a shift is open** (step 10). A template, with the instant filled in from `startTime` through `lib/datetime.ts` in UTC:

> Clocked in since 28 Aug 2026, 22:40.

⚠️ It carries the **date**, not only the time, and that is the whole reason it exists: a button reading "Clock Out" cannot distinguish *"I am on shift"* from *"I forgot to clock out the day before yesterday"*. This line can, on the page an employee opens every day. It is also what makes a successful clock-in visible without a toast — it appears where there was nothing, and stays for the whole shift instead of for four seconds.

**Shift history and its form** (step 11). None of this is in the binding table above, so it lives in `LABELS`/`NOTICES` and may be improved without a spec change:

- Columns **# · Start · End · Notes · Actions**, the red **Open** badge in the End cell of a shift with no end, and the **Split** marker beside the start.
  - **`#` is the row's position in the cycle**, newest first, starting at 1 — a reading aid for talking about a row, never the entry's id, which means nothing to someone holding a payslip.
  - **Start and End each carry the whole instant**, formatted `Thu 07-May 11:05`. There is no shared Date column for a reason: an overnight shift **ends on a different day than it starts**, and one cell could only ever print one of the two. The **weekday** is load-bearing rather than decorative — Saturday and Sunday are paid at +45% all day, so it is what lets a reader check a payslip against this list without counting dates. No year: a cycle spans about thirty days, so two rows cannot collide, and the years are in the cycle header above.
  - ⚠️ There is deliberately **no Hours column** — a split shift carries its full start and end in *both* cycles, so a duration printed here would count one shift twice (§4, decision 5f).
- Empty cycle: *"No shifts in this cycle."*
- Why Edit/Delete are off on a row: *"This pay cycle is closed. Ask your admin to change a shift this old."* · why Add Shift is off: *"This pay cycle is closed, so no shift can be added to it."* Both are read from `canEdit`/`canWrite`, never worked out from the dates on screen.
- The split marker's explanation: *"This shift continues into the neighbouring cycle."*
- Deleting: *"Delete this shift?"* / *"&lt;shift&gt; will be permanently deleted. This cannot be undone."* ⚠️ Permanent, unlike deactivating an employee — there is no soft delete and no restore for a time entry.

**Toast confirmations** (step 11, `sonner` — see architecture.md § Invariants for why the "no toast library" rule was lifted here):

> Shift saved.

> Shift saved. It falls outside the cycle you're viewing, so it isn't in this list.

> Shift deleted.

The second is the case the toast was adopted for: a shift saved into a cycle other than the one on screen leaves the list identical, so a closing dialog looks like nothing happened. ⚠️ **It carries no "view that cycle" action, deliberately.** Whether the shift is visible is answered without arithmetic — the row is simply absent from the refetched list — but *which* cycle it landed in is not, and resolving that client-side is forbidden. A button that moved one cycle and still failed to show the shift would be worse than no button.

**`OPEN_SHIFT_EXISTS` reads differently on Clock and on Shift History**, because the right next action differs while the fact is identical. On Clock the user pressed Clock In, so *"Please clock out first"* is literally the next step. On Shift History they are adding or editing a **past** shift while a live one runs, and the same sentence would push them to end a real shift early, add the row, and clock back in — splitting the very shift the rule protects. There it reads:

> You're currently clocked in. You can add or change past shifts once you clock out.

**Payroll Breakdown** (step 12). None of this is in the binding table above, so it lives in `LABELS`/`NOTICES` and may be improved without a spec change:

- Empty cycle: *"No hours in this cycle."* — it replaces **both** tables rather than rendering them full of zeros.
- The **`hasOpenShift` warning, in two wordings**, chosen by route. The fact is identical and the audience is not — the third instance of this pattern, after `ACCOUNT_ALREADY_ACTIVATED` (step 9) and `OPEN_SHIFT_EXISTS` (step 11):
  - own (`/payroll`): *"You have a shift in this cycle that hasn't been clocked out. Its hours are missing from this breakdown until you close it."*
  - someone else's (`/payroll/:userId`): *"This employee has a shift in this cycle that hasn't been clocked out. Its hours are missing from this breakdown until it's closed."*

  ⚠️ It says *"hasn't been clocked out"* rather than *"is clocked in now"* deliberately: the flag is matched on `startTime` inside the cycle, so it covers both the live shift and the one somebody forgot three weeks ago — and the second is the case that needs explaining.
- **`ISK` is appended to the Total Pay column only**, never to Rate — a rate is ISK *per hour*, so the bare unit would misname it.
- **`—` in a day-table cell with no hours**, so the eye finds the cells that carry hours. ⚠️ The **Total row keeps `0.00`**: a totals row is a row of totals, and a dash there reads as "not computed" rather than "none".
- The four **short zone names** for the day table's headers (`Day` / `Evening` / `Night` / `Weekend`) are the binding ones from the table above, held client-side keyed by `zone` — see architecture.md § Frontend invariants for why they are not derived from `zones[].label`, and why the **percentage** is never held locally.

**Field validation, shown by zod before any request is sent** (step 9). Distinct from the table above, which answers a request that already failed. Each mirrors a rule the backend also enforces, so the two layers agree rather than duplicate:

| Field rule | Backend counterpart | English message |
|---|---|---|
| Email format | `@IsEmail()` | "Enter a valid email address." |
| Password present | `@MinLength(1)` | "Enter your password." |
| New password length | `@MinLength(8)` | "Use at least 8 characters." |
| Activation code shape | `@Matches(/^\d{4}$/)` | "The activation code is 4 digits." |
| Password confirmation matches | **none** — the API takes no confirmation field | "Passwords do not match." |

**Form and control labels written by the client** (step 9). Recorded here because the binding table above covers only what was agreed up front, and these were not: Log out · Retry · Sign in · Email · Password · New password · Confirm password · Activation code · Activate account · Account Activation · Back to sign in. They live in `LABELS` and may be improved without a spec change, like everything else in this half of §8a.

**Open, to be written with the page in front of you** (recorded here so nobody treats them as oversights): the wording and styling of the two confirmation dialogs (deleting a shift, deactivating an employee — both must state that the action cannot be undone, and the deactivation one must say that shifts and payroll history are kept), the setup-code dialog shown after creating an employee (must show the code **and its expiry date** — a date is actionable, "3 days" is arithmetic), and the colour/icon/exact placement of error messages.

### Messages (errors / feedback) — **not** binding, recorded wording

*(These are the **backend's** strings — a record of what the API says, read by tests, Swagger and logs. No user ever sees them: the client renders its own text keyed by the exception's `code`.)*

| Case | English message |
|---|---|
| Login: account not activated (`password === null`) | "This account hasn't been activated yet. Please activate it first." |
| Login: account deactivated (`isActive === false`) | "This account is no longer active." |
| Set-initial-password: wrong setupCode | "Invalid activation code." |
| Set-initial-password: expired setupCode | "This activation code has expired. Please contact your admin." |
| Set-initial-password: account already activated | "This account has already been activated." |
| Clock-in: an open shift already exists | "You already have an open shift. Please clock out first." |
| Clock-out: no open shift | "No open shift to clock out of." |
| Manual add/edit while the employee has an open shift | "You already have an open shift. Please clock out first." — *the same string as clock-in, deliberately reused: same situation, same required action, and one string instead of two near-identical ones* |
| Manual add/edit: overlaps another shift (§7a rule 3) | "This shift overlaps an existing shift." |
| Manual add/edit: end before start (§7a rule 2) | "End time cannot be before start time." |
| Manual add/edit: timestamp in the future (§7a rule 4) | "Start time cannot be in the future." / "End time cannot be in the future." |
| Manual add: EMPLOYEE sent a `userId` | "userId can only be set by an admin." |
| Manual add: ADMIN sent no `userId` | "userId is required when an admin creates a shift." |

> **This table describes, it does not prescribe.** It lists the wording each case carries in the code today, so a reader can see it without grepping — it is not a contract the implementation must satisfy. An agent may improve any of these strings, and adding a row is optional for a case not listed.
>
> ⚠️ **This is a rule about the documentation, not about the tests.** The unit and e2e specs assert these messages **verbatim**, deliberately: that is what makes changing one a visible, deliberate act rather than something that drifts unnoticed. What the relaxation buys is that this file no longer has to be updated in lockstep — the test is the contract, this table is the description of it.
>
> What must not change without a decision is the **behaviour** behind them: the order of checks in `login()`/`setInitialPassword()`, the status code each case returns, and that login names the real cause (not activated / no longer active) instead of a generic invalid-credentials answer — all of which live in `architecture.md` § Invariants.
>
> Two of these strings are load-bearing in a way the wording is not, and both are already enforced by the code rather than by this table: `You already have an open shift. Please clock out first.` is a **single constant** reused by clock-in and the manual write path deliberately (same situation, same required action), and the surcharge in a rate-zone label must keep matching its factor — but that label belongs to the **binding** half above, not to this one.

---

## 9. Auth Flow

1. Login (email + password) → JWT with payload `{ userId, role }`. First admin: already exists in the DB (seed script). Employee: must first have activated their account (§5) before they can log in
2. Frontend: `AuthContext` holds user + token (localStorage)
3. Every request sends `Authorization: Bearer <token>`
4. Backend: `JwtAuthGuard` on all protected routes, `RolesGuard` + `@Roles('ADMIN')` decorator wherever a restriction is needed

---

## 11. Development Order

**0.** Frontend: Static mockups of all screens (shadcn components, placeholder/fake data, NO functionality — buttons don't make real calls) — Login, Clock, Shift History, Payroll, Team, Payroll Overview, Settings. Goal: get look/UX approval before starting the backend

1. Docker + Prisma schema (User, TimeEntry, AppSettings) + migration + seed script (first admin)
2. Users module (CRUD, admin-only creation with setupCode)
3. Auth module (login with activation check, set-initial-password, JWT, guards) — `AuthService` uses `UsersService` for queries on `User`, never Prisma directly
4. Settings module (GET/PUT cycle days) — also owns `resolveCycleRange()`. Built before Time Entries because both Time Entries and Payroll need cycle boundaries, and Settings itself depends on nothing else
5. Time Entries module (clock-in/out, manual add, CRUD, owner or admin permissions)
6. Payroll module — rate zones (§7) + the admin team overview
7. Swagger docs (built into each step, with decorators)
8. **Full check before touching React** — the manual Postman/Swagger sweep (8), the service unit tests (8a), the full-stack tests against a real database (8b), and **8c**: error codes, the two recovery endpoints (`reactivate`, `reset-setup-code`) and the cycle lock of §7a rule 5. All four gate step 9· see `build-plan.md` for what each one covers and why they are not the same check four times
9. Frontend: Auth (Login + SetInitialPasswordPage) + Auth Context + Header/Footer + the four shared doors (`api/client.ts`, `useApiQuery`, `lib/datetime.ts`, `lib/messages.ts`)
10. Frontend: Clock Page — **the clock in/out button and nothing else**· the step-0 month summary is removed (see §8)
11. Frontend: Shift History (shared component, employee + admin)
12. Frontend: Payroll Breakdown (shared component, employee + admin) — replaces the step-0 draft with two components
13. Frontend: Admin — **split into three on 2026-08-31**, in this order: **13-1** Payroll Overview · **13-2** Settings · **13-3** Team. Not the order §8 lists the pages in: Overview is a pure read that copies step 12's patterns without inventing one, Settings is the smallest write and fixes the confirmation rule, and Team — six endpoints, two dialogs, three badges — comes last so it copies both instead of deciding them. 13-3 is also what deletes `mocks/data.ts`
13b. Frontend E2E (Playwright) — after 13, because the flows do not exist before it
14. README (build/deploy instructions)

⚠️ Steps 9–13b were rewritten on 2026-08-26 against the finished API· the per-page specifications live in `build-plan.md`, and the reasoning in `progress-tracker.md` under that date. There is **no step 13a** — the client-side validation pass it described became a rule applied from step 9 onward (every form uses react-hook-form + zod from the start), since the validation rules have been known since the backend closed. ⚠️ That abolished label is **not** reused by the split above, and neither is `13b`, which is the Playwright step: the sub-steps take the `-N` suffix already established by `8b-1`/`8b-2`.

---

*Note: this is the full scope of this file. Future extensions or optional extras are not mentioned here — they live separately, in another file outside the one given to the coding agent.*

---

## 13. Deferred to a Later Phase — known gaps

Each of these was **considered and consciously left out**, not overlooked. They are recorded so a later session does not rediscover one as a bug and "fix" something that is working as designed. All of them need a domain-model change, which is why none of them belongs to Phase 1.

| # | Gap | What it costs today | What would fix it |
|---|---|---|---|
| 1 | **Payroll never freezes** | Pay is recomputed from raw shifts on every request, so it always reflects *current* data. Give an employee a raise and **every past cycle of theirs is silently recalculated** at the new rate· the same would apply to a zone percentage if one ever changed. Nobody is notified, because nothing is stored to compare against | A **payroll snapshot per closed cycle** — the hours, rates and amounts written down at the moment the cycle closes, and read back thereafter instead of recomputed. It also happens to be the answer if the overview ever gets slow at a much larger headcount, since the figures would already exist |
| 2 | **No audit log** (§4, decision 1a) | An employee's self-reported hours carry no history· nothing records that an entry was edited or deleted | An append-only history table |
| 3 | **No approval flow** (§4, decision 1a) | An employee writes the hours they are paid for, with no review step | `source`/`status`/`approvedById`/`approvedAt` on `TimeEntry`, plus a filter in the payroll calculation |
| 4 | **Overlapping shifts are check-then-act** (§7a rule 3) | Two simultaneous submits can both pass and create a double-counted hour. Blast radius: one duplicate row an admin can delete | A DB-level exclusion constraint (`btree_gist` + `tstzrange`, with a branch for `NULL endTime`) |
| 5 | **A forgotten open shift is only discoverable on its own cycle** | `hasOpenShift` is cycle-scoped, deliberately — it means "hours are missing from *this* cycle", so a shift running right now must not raise an alarm on a cycle from three months ago. The cost: an open shift left behind by an employee who has since been deactivated (they can no longer log in to clock out, so only the admin can close it) does not appear on the current Payroll Overview at all. It is found by navigating ◀ back to the cycle it started in, or through that employee's Shift History | A separate "outstanding items" indicator, independent of the cycle navigator — **not** by widening this flag, which would make it mean two different things |
| 6 | **User enumeration on `set-initial-password`** | An unknown email answers 404 while a real one with a wrong code answers 401 | Deliberate for a single-company internal tool where the admin creates every account. ⚠️ **Must be revisited if the app ever becomes multi-tenant**, where it would leak between companies |
