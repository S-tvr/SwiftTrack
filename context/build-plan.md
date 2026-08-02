# Build Plan — SwiftTrack (Phase 1)

Development order. Each step must be completed (and working) before the next one starts. We don't move on to the rest of the frontend (steps 9+) before the entire backend is verified via Swagger/Postman (step 8) — exception: step 0, which is built first of all, before even Docker/backend.

---

## Execution Rule (read first)

The agent builds **one numbered step at a time**, NEVER multiple steps together. After completing each step:
1. Stop
2. Summarize what was built (files, endpoints/components added)
3. Update `progress-tracker.md` (see AGENTS.md)
4. Wait for explicit confirmation/review from the user before moving on to the next step

It never automatically moves to the next step without this confirmation, even if the original prompt asked to "build the whole app".

---

## Step 0 — Static Mockups (before everything)

- [ ] **0. Frontend: Static mockups** (shadcn components, placeholder/fake data, NO functionality — buttons don't make real calls)
  - Login / SetInitialPasswordPage
  - Clock Page
  - Shift History
  - Payroll
  - Team
  - Payroll Overview
  - Settings
  - Goal: get look/UX approval before starting the backend. After approval, these mockups become the base on top of which real functionality is built in steps 9-13.

---

## Backend

- [ ] **1. Infra**
  - `docker-compose.yml` (DB only)
  - Prisma schema: `User` (with `password?`, `setupCode`, `setupCodeExpiresAt`, `hourlyRate` as `Int?`), `TimeEntry`, `AppSettings` (`cycleStartDay` default 25, `cycleEndDay` default 24)
  - `npx prisma migrate dev --name init`
  - `PrismaService` + `PrismaModule` (shared, injectable — see architecture.md)
  - Seed script — creates the first ADMIN directly in the database (name, email, password already set/hashed)
  - `main.ts`: global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` + CORS enabled for the frontend origin
  - `.env.example` with `DATABASE_URL`, `JWT_SECRET` (never hardcoded values in the code)

- [ ] **2. Users module**
  - `GET /users` (ADMIN) — includes derived `hasActivated: password !== null` per employee
  - `GET /users/me` (Both)
  - `POST /users` (ADMIN) — DTO with `class-validator` (only `name`, `email`, `hourlyRate` allowed· no `password` field on the DTO). Creates the employee WITHOUT a password· generates `setupCode` (random 4-digit) + `setupCodeExpiresAt` (+3 days)
  - `PUT /users/:id` (ADMIN) — DTO validation
  - `DELETE /users/:id` (ADMIN) — soft delete, sets `isActive = false`
  - Exposes `findByEmail()`, `activateAccount()` — will be used by the Auth module
  - **No guards yet.** `JwtAuthGuard`/`RolesGuard` don't exist until Step 3 — all Users routes are built open and get `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')` retrofitted in Step 3, alongside `GET /users/me` actually resolving `req.user.userId`. "Role restrictions work" for this module is verified in Step 3, not Step 2.

- [ ] **3. Auth module**
  - `POST /auth/login` — bcrypt compare, checks `password !== null` **and** `isActive === true` before issuing a JWT `{ userId, role }`
  - `POST /auth/set-initial-password` — takes `{ email, setupCode, newPassword }` (DTO validated), checks code/expiry, hashes+saves, clears setupCode/expiry
  - `JwtStrategy`, `JwtAuthGuard`
  - `RolesGuard` + `@Roles('ADMIN')` decorator
  - No `/auth/register` route — the first admin only comes from the seed script
  - `AuthService` uses `UsersService` for queries on `User` — never Prisma directly

- [ ] **4. Settings module** *(swapped with Time Entries — see below)*
  - `GET /settings` (Both)
  - `PUT /settings` (ADMIN) — updates cycleStartDay/cycleEndDay
  - `resolveCycleRange()` lives here, not in `PayrollService`. The date arithmetic itself is a **pure function** (`cycle`, `cycleStartDay`, `cycleEndDay` → `{ start, end }`) with no DB access, so step 8a can test it directly· `SettingsService` reads the singleton row and calls it. `TimeEntriesService` and `PayrollService` inject `SettingsService` instead of resolving cycles themselves — same pattern as `AuthService` going through `UsersService` for every `User` query.
  - **Why this moved ahead of Time Entries:** Settings owns `AppSettings` and depends on nothing beyond Prisma and the guards, while **both** Time Entries (`?cycle=` filter) and Payroll need cycle boundaries. In the original order, step 4 would have had to improvise cycle maths that step 6 would then write a second time — exactly what the "single source of truth for cycle boundaries" invariant exists to prevent. Only 4 and 5 swap· steps 6+ are untouched.

- [ ] **5. Time Entries module** *(swapped with Settings)*
  - `POST /time-entries/clock-in` (EMPLOYEE) — fails if the user already has an open entry (`endTime = null`)· never a second open shift at the same time
  - `PATCH /time-entries/clock-out` (EMPLOYEE) — takes no `:id`· closes the caller's own open entry, fails if there is none
  - `POST /time-entries` (Owner or ADMIN) — manually add a forgotten or missing shift, with explicit `startTime`/`endTime`/`notes`. **Distinct from clock-in**, which always writes `startTime = now, endTime = null` and refuses when a shift is open. Required by the approved `ShiftForm` mockup ("Add a forgotten or missing shift") and by step 11's `ShiftForm (add/edit/delete)` — without it that UI has no API to call
  - `GET /time-entries/me` (EMPLOYEE, optional `?cycle=`) — returns the resolved `cycleStart`/`cycleEnd` alongside the entries, per the cycle invariant
  - `GET /time-entries?userId=` (ADMIN)
  - `PUT /time-entries/:id` (Owner or ADMIN) — DTO accepts `startTime`/`endTime`/`notes` only, never `userId`
  - `DELETE /time-entries/:id` (Owner or ADMIN)
  - **Owner-or-ADMIN is enforced in the service, never by a guard.** The ownership filter goes straight into the Prisma `where` (`{ id, ...(role === ADMIN ? {} : { userId }) }`), so "not yours" and "doesn't exist" collapse into one 404 and there is no separate check to forget on one of the three routes. `RolesGuard` compares a single role and cannot express ownership, and a guard would have to query Prisma — which only services may do.
  - Clock-in/clock-out error copy is already fixed in spec §8a — use it verbatim
  - Nothing extra is needed to keep a deactivated employee out: `JwtStrategy` re-checks `isActive` on every request (see architecture.md § Invariants), so a token issued before deactivation stops working everywhere at once — this module included.

- [ ] **6. Payroll module — Stage A (flat rate)**
  - `GET /payroll/me?cycle=`
  - `GET /payroll/:userId?cycle=` (ADMIN)
  - Logic: only entries with `endTime != null`, within the cycle
  - `totalPay` always rounded to an integer (ISK, `Math.round` at the end — never in between)
  - Response includes `cycleStart`/`cycleEnd` (ISO dates) — the backend is the single source of truth for cycle boundaries, the frontend consumes them ready-made

- [ ] **7. Swagger**
  - `@ApiTags`, `@ApiOperation`, `@ApiResponse` on every controller — built in with each step, not at the end

- [ ] **8. Full check of the backend before the frontend**
  - Full check of all endpoints via Swagger UI or Postman
  - Auth flow, role restrictions, edge cases:
    - Wrong/expired setupCode on set-initial-password
    - Clock-out with no open shift
    - Double clock-in while an open shift already exists (must fail)
    - Login with `isActive = false` (must fail)
    - `POST /users` with `password` in the body (must be rejected by the ValidationPipe)
    - Cycle boundary: a shift exactly on the 25th or the 24th of the month — correct cycle
    - CORS: a request from the frontend origin passes through normally
    - Error messages (login/set-initial-password) match the spec §8a wording exactly, in English

- [ ] **8a. Unit tests — cycle resolution & Payroll**
  - Tests for `resolveCycleRange()` (now owned by `SettingsService`, step 4): cycle boundaries, edge-case months with 28/29/30/31 days. The date arithmetic is a pure function, so these tests need no database
  - Tests for `getPayrollForCycle()`: correct hour total, correct ISK rounding, entries outside the cycle are excluded, open shifts (`endTime = null`) are excluded

---

## Frontend

- [ ] **9. Auth & Layout**
  - `LoginPage` — with link **"Activate your account"** (see spec §8a)
  - `SetInitialPasswordPage` — email + setupCode + new password
  - `AuthContext` (user + token, localStorage)
  - `api/client.ts` — fetch wrapper with Authorization header
  - `ProtectedRoute` (role-aware)
  - `Header` — logo on the left, username + menu on the right (on every protected page)
  - `Footer` — empty placeholder

- [ ] **10. Clock Page** (EMPLOYEE only — admin never sees this, lands on Team instead)
  - `ClockButton` first on the page
  - `MonthSummary` below it (hours, estimated pay)

- [ ] **11. Shift History**
  - `ShiftList` — shared component, takes a `userId` prop· employee (`/shifts`, userId locked) + admin (`/shifts/:userId`)
  - `ShiftForm` (add/edit/delete)
  - `CycleNavigator` (◀▶) — consumes `cycleStart`/`cycleEnd` from the backend response, computes nothing itself

- [ ] **12. Payroll Breakdown**
  - `PayrollBreakdown` — one component, reused: employee (`/payroll`, userId locked) + admin (`/payroll/:userId`)

- [ ] **13. Admin — Team, Payroll Overview & Settings**
  - `TeamPage` — first page after admin login. List, create, edit hourlyRate, click → employee's ShiftHistoryPage
  - `TeamPage` — badge per employee **"Active" / "Pending"** (from the `hasActivated` returned by the backend· see spec §8a)
  - `PayrollOverviewPage` — list of employees, total monthly cost, open-shifts indicator, cycle nav, click → employee's PayrollPage
  - `SettingsPage` — cycleStartDay/cycleEndDay

- [ ] **13a. Client-side validation polish** (do this last, after all forms exist)
  - `zod` + `react-hook-form` (+ shadcn's `Form` component) across all forms: Login, Set Initial Password, ShiftForm, EmployeeForm, Settings
  - Replaces the native browser validation tooltip (unstyled, e.g. missing `@` in email) with styled in-app error messages
  - Replaces the current per-field `useState` pattern in each form with `useForm` + a Zod schema per form

- [ ] **14. README**
  - Build/deploy instructions, seed script instructions

---

## Rule for every step

Before a module is considered "done":
1. The happy path works
2. Role restrictions (ADMIN vs EMPLOYEE) work, where applicable
3. It has Swagger decorators
4. It follows the invariants in `architecture.md` (e.g. `userId` explicit in every service query)
5. Every piece of text the user sees (titles, buttons, messages) is in English, per spec §8a — not freely translated/paraphrased
