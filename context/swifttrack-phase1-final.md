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

### User
| Field | Type | Notes |
|---|---|---|
| id | Int (PK) | |
| name | String | |
| email | String | unique — the only identifier, no separate username |
| password | String? | nullable — bcrypt hashed once set· null until the employee activates their account |
| role | Enum | ADMIN \| EMPLOYEE |
| hourlyRate | Int? | nullable — EMPLOYEE only· ISK, always an integer (no decimals)· admin never clocks in/out, so never needs an hourlyRate |
| isActive | Boolean | default true — `DELETE` deactivates, doesn't actually delete (preserves time/payroll history) |
| setupCode | String? | random 4-digit code, generated when the admin creates the employee· cleared after activation |
| setupCodeExpiresAt | DateTime? | createdAt + 3 days· cleared after activation |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### TimeEntry
> All timestamps are stored and computed in **UTC**. The app is built exclusively for use in Iceland, which stays on UTC year-round (no DST) — so no timezone conversion is needed anywhere in the system.

| Field | Type | Notes |
|---|---|---|
| id | Int (PK) | |
| userId | Int (FK) | |
| startTime | DateTime | full timestamp, UTC |
| endTime | DateTime? | **nullable** — null while the shift is "open" (forgotten clock out) |
| notes | String? | optional notes |
| createdAt | DateTime | |
| updatedAt | DateTime | |

> No `status` field (PENDING/APPROVED/REJECTED) — removed. Every entry counts directly toward the calculation, as long as it has an `endTime` (i.e. it's "closed").

### AppSettings
| Field | Type | Notes |
|---|---|---|
| id | Int (PK) | fixed, always `1` — a single unique row |
| cycleStartDay | Int | default 25· allowed range **11–25** (see §4, decision 5a). The only field the cycle arithmetic reads |
| cycleEndDay | Int | default 24 (of the following month — the cycle "wraps" across the month boundary, e.g. 25 June → 24 July). Always exactly `cycleStartDay - 1`, so allowed range **10–24**. Stored and validated, but **derived** — never used to compute a boundary |

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
| GET | `/users` | ADMIN | List of all employees, with a derived `hasActivated: password !== null` |
| GET | `/users/me` | Both | Details of the logged-in user |
| POST | `/users` | ADMIN | Create a new employee (name, email, hourlyRate — **no** password). Generates setupCode + 3-day expiry |
| PUT | `/users/:id` | ADMIN | Edit (name, hourlyRate) |
| DELETE | `/users/:id` | ADMIN | Soft delete — sets `isActive = false`, doesn't actually delete |

### Time Entries
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/time-entries/clock-in` | EMPLOYEE | Starts a new entry (startTime = now, endTime = null) |
| PATCH | `/time-entries/clock-out` | EMPLOYEE | Closes the current open entry (endTime = now) |
| POST | `/time-entries` | Owner or ADMIN | Manually add a forgotten/missing shift — explicit `startTime`, `endTime`, `notes`, plus `userId` when an ADMIN calls (rejected from an EMPLOYEE, who always writes to themselves). Distinct from clock-in, which always writes `startTime = now, endTime = null`. Always produces a **closed** shift: `endTime` is required here and on `PUT`, may not be before `startTime`, neither timestamp may be in the future, and the shift may not overlap another of the same user (see §7a) |
| GET | `/time-entries/me` | EMPLOYEE | My own entries for a cycle (optional `?cycle=`, defaults to the current one). Returns the resolved cycle block plus per-entry `isSplit`. **No hours figure** — see §4, decision 5f |
| GET | `/time-entries?userId=&cycle=` | ADMIN | Entries for any employee — **same response shape** as `/me`, since both feed the same shared `ShiftList` + `CycleNavigator` |
| GET | `/time-entries/open` | EMPLOYEE | The caller's open shift, or `null` — what the Clock page's button state is read from. Returned **wrapped** as `{ openShift: … \| null }`: Nest answers a bare `null` with an empty body rather than the JSON literal `null`, and `api/client.ts` calls `res.json()` on every response, so the endpoint whose normal answer is "nothing" would be the one that breaks it |
| PUT | `/time-entries/:id` | Owner or ADMIN | Edit (startTime, endTime, notes) |
| DELETE | `/time-entries/:id` | Owner or ADMIN | Delete |

### Payroll
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/payroll/me?cycle=2026-07` | EMPLOYEE | My own payroll breakdown (the admin has no payroll of their own — doesn't work hours). Returns the cycle block, `hourlyRate`, `totalHours`, `totalPay`, `hasOpenShift`, the four `zones` and the `days` table (see §7) |
| GET | `/payroll/:userId?cycle=2026-07` | ADMIN | Payroll for a specific employee — **identical shape** to `/me`, since both feed the same shared `PayrollBreakdown`. A deactivated employee resolves normally (they still worked the hours)· any id that is not an EMPLOYEE, the admin's own included, is a 404 |
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

The spec gives an employee `POST`/`PUT`/`DELETE` over their **own** entries (§4, decisions 2 & 4) — they write the hours they are paid for, which was accepted deliberately. These four rules are what stop an entry from being *impossible* or *double-counted*. They apply to `POST /time-entries` and `PUT /time-entries/:id` (the manual path), never to clock-in/clock-out.

| # | Rule | Why |
|---|---|---|
| 1 | `endTime` is **required** — the manual path never leaves a shift open | The form is for shifts that already ended; clock in/out is for live ones. Keeps "at most one open shift" enforced in one place, and stops `PUT` reopening a closed shift so its hours silently vanish |
| 2 | `endTime` may not be **before** `startTime` → 400 (equal is allowed) | A reversed shift is impossible. Without this it would be paid as 0 hours with no error anywhere, because the payroll clipping clamps at 0 — a safety net for the arithmetic, not a validation |
| 3 | Two shifts of the same user may not **overlap** → 400 | 08:00-16:00 plus 12:00-20:00 pays 16 hours for 12 worked. An open shift occupies `[startTime, ∞)` for this check; on `PUT` the edited row is excluded from its own |
| 4 | Neither timestamp may be **after `now`** (equal allowed) | Rejects future-dated work, and makes rule 3 hold at the clock-in door for free: if no closed shift reaches `now`, clock-in at `now` cannot land inside one |

**The open-shift block is asymmetric by role.** While the row's owner has an open shift, an **EMPLOYEE** may not `POST` or `PUT` at all — not even on the open row — and unblocks by clocking out. An **ADMIN** is subject only to rule 3. The employee half makes an overlap created by clock-out impossible by construction. The admin half is required, not convenient: clock-out is EMPLOYEE-only and closes the caller's *own* shift, so `PUT` is the only tool for someone else's open shift — otherwise a **deactivated** employee's open shift (they can no longer log in) stays open forever, and the admin is locked out of the ledger while anyone is on shift.

---

## 8. Frontend Screens

Every page (for both roles) includes a **Header** (logo "SwiftTrack" on the left, username + menu on the right) and a **Footer** (empty placeholder for now).

### Employee
| # | Page | Content |
|---|---|---|
| 1 | Login / Account Activation | Login with email+password· separate link/page for activation (email + setupCode + new password) |
| 2 | **Clock** (main page, **employee only** — admin has no clock in/out) | 1) Large **Clock In / Clock Out** button (first on the page) 2) Below: month summary (hours, estimated pay) |
| 3 | Shift History | List of entries, add a forgotten shift, edit/delete, ◀▶ arrows to navigate cycles |
| 4 | Payroll Breakdown | **Shared page with the admin** (see below) — breakdown for the selected cycle. **Two components**: a summary (one line per rate zone — label, hours, rate, pay — plus the total) and a day-by-day table (row per date, column per zone, hours only). ⚠️ The step-0 mockup was a **draft** and is superseded: it rendered a Date/Hours/Pay table computed in the browser· see §7 and §4 decision 5e |

### Admin, additionally
| # | Page | Content |
|---|---|---|
| 5 | Team | **First/main page after login for the admin** (no Clock/clock in-out). List of employees with an **"Active"/"Pending"** badge (see §8a), create new, edit hourlyRate. Clicking an employee → goes to that **specific employee's** Shift History |
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
| Clock in/out button | **Clock In** / **Clock Out** |
| Rate-zone labels (Payroll Breakdown) | **Day** / **Evening +33%** / **Night +45%** / **Weekend +45%** — returned by the API as `zones[].label` and printed **verbatim**· the client never derives a percentage of its own |
| Payroll summary columns | **Zone** / **Hours** / **Rate** / **Total Pay**, with a **Total** row |
| Payroll day-table columns | **Date** / **Day** / **Evening** / **Night** / **Weekend** / **Total**, with a **Total** row |

### Messages (errors / feedback) — **not** binding, recorded wording
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

## 10. Docker Setup

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: swifttrack
      POSTGRES_PASSWORD: swifttrack
      POSTGRES_DB: swifttrack
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

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
8. **Full check before touching React** — the manual Postman/Swagger sweep (8), the service unit tests (8a) and the full-stack tests against a real database (8b). All three gate step 9· see `build-plan.md` for what each one covers and why they are not the same check three times
9. Frontend: Auth (Login + SetInitialPasswordPage) + Auth Context + Header/Footer
10. Frontend: Clock Page (clock in/out first, summary after)
11. Frontend: Shift History (shared component, employee + admin)
12. Frontend: Payroll Breakdown (shared component, employee + admin)
13. Frontend: Admin — Team, Payroll Overview, Settings
14. README (build/deploy instructions)

---

## 12. Prompt-starter for Claude Code

> I want to build a time-tracking & payroll app (SwiftTrack, single-tenant) with a NestJS backend, Prisma ORM, PostgreSQL (Docker), React frontend (Vite + Tailwind), JWT auth with ADMIN/EMPLOYEE roles. I have the full spec in a file [attach swifttrack-phase1-final.md]. Start with the backend: Prisma schema (User, TimeEntry, AppSettings), docker-compose.yml, seed script for the first admin, then the Users module, then the Auth module (login + set-initial-password — AuthService uses UsersService, NO register route), then the Settings module (it owns the pay cycle, and TimeEntries depends on it), then TimeEntries. IMPORTANT: every new employee is created WITHOUT a password — the backend generates a random 4-digit setupCode with a 3-day expiry, and the employee activates their own account via `/auth/set-initial-password`. The Payroll service is **not** a flat rate: hours are priced in four rate zones (see §7), and rounding happens at exactly three points (§4, decision 5d).

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
