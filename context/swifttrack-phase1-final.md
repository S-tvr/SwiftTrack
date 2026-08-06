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
| 6 | Currency | Icelandic króna (ISK) — no decimals. `hourlyRate` and every computed pay amount are always whole integers (Int), never decimal |
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
| GET | `/time-entries/me` | EMPLOYEE | My own entries for a cycle (optional `?cycle=`, defaults to the current one). Returns the resolved cycle block plus per-entry `hoursInCycle`/`isSplit` |
| GET | `/time-entries?userId=&cycle=` | ADMIN | Entries for any employee — **same response shape** as `/me`, since both feed the same shared `ShiftList` + `CycleNavigator` |
| GET | `/time-entries/open` | EMPLOYEE | The caller's open shift, or `null` — what the Clock page's button state is read from. Returned **wrapped** as `{ openShift: … \| null }`: Nest answers a bare `null` with an empty body rather than the JSON literal `null`, and `api/client.ts` calls `res.json()` on every response, so the endpoint whose normal answer is "nothing" would be the one that breaks it |
| PUT | `/time-entries/:id` | Owner or ADMIN | Edit (startTime, endTime, notes) |
| DELETE | `/time-entries/:id` | Owner or ADMIN | Delete |

### Payroll
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/payroll/me?cycle=2026-07` | EMPLOYEE | My own payroll breakdown (the admin has no payroll of their own — doesn't work hours) |
| GET | `/payroll/:userId?cycle=2026-07` | ADMIN | Payroll for a specific employee |

### Settings
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/settings` | Both | Current cycle settings |
| PUT | `/settings` | ADMIN | Update cycleStartDay/cycleEndDay. Both fields are required· `cycleStartDay` must be 11–25 and `cycleEndDay` must be exactly `cycleStartDay - 1`, otherwise 400 (see §4, decision 5a) |

**Architectural rule**: Every service function whose data belongs to a specific user (time entries, personal payroll, own profile) explicitly takes `userId` as an argument and uses it in the query filter — never a silent or missing filter. Doesn't apply to functions that are intentionally global (e.g. `getAllEmployees()`, `getSettings()`) — those correctly don't take a `userId`.

---

## 7. Pay Calculation Logic (Service layer)

**Flat rate, with boundary splitting (§4, decision 5b):**
```
relevantEntries = the user's closed TimeEntries (endTime != null) that OVERLAP the cycle
                  — i.e. startTime < cycleEndExclusive AND endTime > cycleStart.
                  Not "entries whose startTime falls inside the cycle": a shift that
                  crosses the boundary is relevant to both cycles it touches.

hoursInCycle(entry) = max(0, min(entry.endTime, cycleEndExclusive)
                             - max(entry.startTime, cycleStart)) / 3_600_000
                  — the intersection of the shift with the cycle, in fractional hours.
                  For a shift entirely inside the cycle this is simply its full length.

totalHours = Σ hoursInCycle(entry)                  (UTC, fractional hours allowed here)
totalPay   = round(totalHours × user.hourlyRate)    (ISK — rounded to an integer as the FINAL step)
```

Open shifts (`endTime = null`) contribute **0 hours** — they cannot be split without an end — and are listed under the cycle their `startTime` falls in.

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
| 2 | `endTime` may not be **before** `startTime` → 400 (equal is allowed) | A reversed shift is impossible. Today it would be paid as 0 hours with no error, because `hoursInCycle` clamps at 0 — a safety net, not a validation |
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
| 4 | Payroll Breakdown | **Shared page with the admin** (see below) — breakdown for the selected cycle |

### Admin, additionally
| # | Page | Content |
|---|---|---|
| 5 | Team | **First/main page after login for the admin** (no Clock/clock in-out). List of employees with an **"Active"/"Pending"** badge (see §8a), create new, edit hourlyRate. Clicking an employee → goes to that **specific employee's** Shift History |
| 6 | Payroll Overview | List of employees, total monthly cost, indicator for open shifts per employee, ◀▶ arrows to navigate cycles. Clicking an employee → goes to that **specific employee's** Payroll Breakdown |
| 7 | Settings | cycleStartDay / cycleEndDay |

**Design decision**: Two pages are **shared components**, reused for both roles — only the route/`userId` changes:
- **Shift History** (`ShiftList`): Employee sees it via `/shifts` (always their own), Admin via `/shifts/:userId` (whichever employee they selected)
- **Payroll Breakdown** (`PayrollBreakdown`): Employee sees it via `/payroll` (always their own), Admin via `/payroll/:userId` (whichever employee they selected — from Team or Payroll Overview)

Admin-only extra buttons/actions inside these shared components are shown conditionally based on `role`, with no separate component needed per role.

---

## 8a. UI Copy (English — binding)

All user-facing text is in English.

### Page titles
| Page | UI Title |
|---|---|
| Login / Account Activation | Login / Account Activation |
| Clock | Clock |
| Shift History | Shift History |
| Payroll Breakdown | Payroll Breakdown |
| Team | Team |
| Payroll Overview | Payroll Overview |
| Settings | Settings |

### Buttons / links / badges
| Element | English text |
|---|---|
| Login page link for account activation | **Activate your account** |
| Badge for an activated employee | **Active** |
| Badge for a not-yet-activated employee | **Pending** |
| Clock in/out button | **Clock In** / **Clock Out** |

### Messages (errors / feedback)
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

> This table is the source of truth for exact wording. The agent does not paraphrase these strings freely — it uses them exactly as written (can store them in a constants file in the frontend, e.g. `messages.ts`). It only covers the cases listed· messages for anything else are written as needed and don't have to be added here.

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
6. Payroll module — Stage A (flat rate)
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

> I want to build a time-tracking & payroll app (SwiftTrack, single-tenant) with a NestJS backend, Prisma ORM, PostgreSQL (Docker), React frontend (Vite + Tailwind), JWT auth with ADMIN/EMPLOYEE roles. I have the full spec in a file [attach swifttrack-phase1-final.md]. Start with the backend: Prisma schema (User, TimeEntry, AppSettings), docker-compose.yml, seed script for the first admin, then the Users module, then the Auth module (login + set-initial-password — AuthService uses UsersService, NO register route), then the TimeEntries/Settings modules. IMPORTANT: every new employee is created WITHOUT a password — the backend generates a random 4-digit setupCode with a 3-day expiry, and the employee activates their own account via `/auth/set-initial-password`. The Payroll service does a flat-rate calculation.

---

*Note: this is the full scope of this file. Future extensions or optional extras are not mentioned here — they live separately, in another file outside the one given to the coding agent.*
