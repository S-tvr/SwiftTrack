# Build Plan — SwiftTrack (Phase 1)

Development order. Each step must be completed (and working) before the next one starts. We don't move on to the rest of the frontend (steps 9+) before the entire backend is verified — that means all the way through **step 8b**: the manual sweep (8), the service unit tests (8a) and the full-stack tests against a real database (8b). Exception: step 0, which is built first of all, before even Docker/backend.

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
  - `PUT /settings` (ADMIN) — updates cycleStartDay/cycleEndDay. Both fields required· `cycleStartDay` 11–25 and `cycleEndDay` exactly `cycleStartDay - 1`, enforced by `class-validator` (custom `@IsDayBefore`), otherwise 400. See spec §4 decision 5a for why the range is restricted — contiguous cycles, and no day-of-month clamping ever needed
  - `resolveCycleRange()` lives here, not in `PayrollService`. The date arithmetic itself is a **pure function** (`cycle`, `cycleStartDay` → `{ start, endExclusive }`) with no DB access, in `cycle.util.ts`· `SettingsService` reads the singleton row and calls it. `TimeEntriesService` and `PayrollService` inject `SettingsService` instead of resolving cycles themselves — same pattern as `AuthService` going through `UsersService` for every `User` query
  - `cycle.util.ts` also owns `isSplitAcrossCycle()`, `shiftCycleKey()` (◀▶ prev/next), and `resolveCurrentCycleKey()` (the `?cycle=` omitted default). All pure, all consumed by steps 5 and 6 — one implementation each, for the same reason `resolveCycleRange()` moved here. *(It originally owned `hoursWithinCycle()` too· that went in step 6 when the shift list stopped reporting hours and left it with no callers — the shift/cycle clipping now happens per (date × zone) in `rate-zones.util.ts`.)*
  - **Unit tests for `cycle.util.ts` are written in this step, not deferred to 8a.** The functions have no HTTP surface until step 5, so the alternative would be a throwaway verification script· step 8a extends these and adds the payroll-level tests
  - A missing `AppSettings` row (migrations run without the seed) fails loudly with a 500 naming the fix — never a silent `upsert` to defaults, which would move the payroll boundary by up to two weeks with no signal
  - **Why this moved ahead of Time Entries:** Settings owns `AppSettings` and depends on nothing beyond Prisma and the guards, while **both** Time Entries (`?cycle=` filter) and Payroll need cycle boundaries. In the original order, step 4 would have had to improvise cycle maths that step 6 would then write a second time — exactly what the "single source of truth for cycle boundaries" invariant exists to prevent. Only 4 and 5 swap· steps 6+ are untouched.

- [ ] **5. Time Entries module** *(swapped with Settings)*
  - `POST /time-entries/clock-in` (EMPLOYEE) — fails if the user already has an open entry (`endTime = null`)· never a second open shift at the same time
  - `PATCH /time-entries/clock-out` (EMPLOYEE) — takes no `:id`· closes the caller's own open entry, fails if there is none
  - `POST /time-entries` (Owner or ADMIN) — manually add a forgotten or missing shift, with explicit `startTime`/`endTime`/`notes`. **Distinct from clock-in**, which always writes `startTime = now, endTime = null` and refuses when a shift is open. Required by the approved `ShiftForm` mockup ("Add a forgotten or missing shift") and by step 11's `ShiftForm (add/edit/delete)` — without it that UI has no API to call
    - `userId` is part of **this** DTO (and only this one): **required when an ADMIN calls, rejected when an EMPLOYEE calls** (who always writes to themselves). The approved `ShiftList` renders "Add Shift" on the admin's `/shifts/:userId` route too, and without `userId` that button writes the shift to the **admin's own** account — which has no `hourlyRate`, no Clock page and does not appear in `GET /users`. It would never surface and never be paid. This is assignment at creation, not the reassignment that `PUT` forbids. The target must be an EMPLOYEE row (deactivated included, so history stays repairable), else 404
  - `GET /time-entries/me` (EMPLOYEE, optional `?cycle=`) and `GET /time-entries?userId=&cycle=` (ADMIN) — **the same response shape**, because both feed the same `ShiftList` component with the same `CycleNavigator` (employee at `/shifts`, admin at `/shifts/:userId`). The admin route needs `?cycle=` for exactly the reason the employee one does: without it the ◀▶ has no key to send and no dates to print
    ```
    { cycle, prevCycle, nextCycle, cycleStart, cycleEnd,
      entries: [ { id, startTime, endTime, notes, isSplit } ] }
    ```
    `isSplit` marks a shift that extends beyond this cycle — it is what explains the same row reappearing when the ◀▶ moves to the neighbouring cycle. ⚠️ **No hours figure** (spec §4, decision 5f): under rate zones one number per shift is not what anyone is paid, and a second hours figure would round at a different unit than payroll's cells and be able to disagree with it. Hours live only in `GET /payroll`
  - ⚠️ **The list query is NOT the payroll query.** Payroll takes closed shifts overlapping the cycle. The list must additionally show **open** shifts (`endTime = null`), which `endTime: { not: null }` would silently drop — and the approved `ShiftList` renders a red **"Open"** badge for exactly those, so an employee who forgot to clock out would have no screen on which to find and fix it. Open shifts cannot overlap-match (they have no end), so they are selected by `startTime` instead, per the invariant in architecture.md:
    ```ts
    where: { userId, OR: [
      { endTime: { not: null, gt: start }, startTime: { lt: endExclusive } }, // closed: overlapping
      { endTime: null, startTime: { gte: start, lt: endExclusive } },         // open: by startTime
    ]}
    ```
    An open shift reports `isSplit: false` — it has no end, so it cannot be split
  - `GET /time-entries/open` (EMPLOYEE) — the caller's open shift, or `null`, **wrapped as `{ openShift }`**. Needed by step 10: `ClockButton` must render "Clock In" or "Clock Out" on page load, and it cannot read that off the list, because an open shift started in the *previous* cycle is filtered out of the current one. Without this the button renders the wrong label and clock-in then fails with "You already have an open shift". The wrapper is not decoration: Nest answers a bare `null` return with an **empty body** rather than the JSON literal `null`, so the step-9 `api/client.ts` doing `res.json()` on every response would throw on precisely the endpoint whose normal answer is "nothing"
  - `PUT /time-entries/:id` (Owner or ADMIN) — DTO accepts `startTime`/`endTime`/`notes` only, **never `userId`**: unlike `POST`, this would *move* an existing shift between people. Not a `PartialType` of the create DTO — `startTime`/`endTime` are both required (`notes` optional), which matches what `ShiftForm` sends anyway and keeps one rule instead of two
  - `DELETE /time-entries/:id` (Owner or ADMIN)
  - **Tests are written in this step, not deferred to 8a** (same reasoning as `cycle.util.spec.ts` in step 4: the four write rules interlock, and a rule proved only by hand is a snapshot). Two levels: the cross-field validators as pure specs (rules 2 and 4), and `time-entries.service.spec.ts` with **stubbed Prisma** (rules 1 and 3, the role asymmetry, the `userId` rules, clock-in/out refusing with a 400 whose message names the open shift, owner-or-ADMIN resolving to 404, and the list response shape). ⚠️ What this deliberately does **not** prove: a stub returns whatever it was told, so the boundary case that matters most — a shift ending exactly when the next begins must **not** collide — is asserted against the shape of the `where` clause (`gt`/`lt`, never `gte`/`lte`) and is only really proved by **8b** against real SQL
  - **The four write rules — decided, no longer open.** Each one guessed wrong changes what people get paid, so they are stated here rather than left to the implementation:
    1. **`endTime` is required on `POST` and `PUT`.** The manual form is the tool for *closed* shifts; clock in/out is the tool for *live* ones. Nothing the form touches stays open, so the "at most one open shift" rule needs enforcing in exactly one place (clock-in) instead of three. Consequence accepted: an open shift cannot be edited while it is open — the employee clocks out first, then corrects it. Consequence for step 11: End Time becomes `required` in `ShiftForm`
    2. **`endTime` may not be *before* `startTime`** → 400. Equal is allowed (a zero-length entry is harmless — 0 hours — and can carry notes). Reversed is impossible, not unusual, and the payroll clipping's `Math.max(0, …)` would silently pay it as 0 with no error anywhere: that clamp is a safety net for the arithmetic, never a substitute for validation
    3. **No two shifts of the same user may overlap** → 400. Two entries 08:00-16:00 and 12:00-20:00 pay 16 hours for 12 worked. Nobody is in two shifts at once, so a collision is always an error, never a valid case. An **open** shift occupies `[startTime, ∞)` for this check. On `PUT` the row being edited is excluded (`id: { not: id }`), or every edit collides with itself
    4. **`startTime`/`endTime` may not be *after* `now`** (equal is fine, so writing the minute that just passed does not race). This is what makes rule 3 airtight at the clock-in door for free: if no closed shift can ever reach `now`, then clock-in at `now` can never land inside one, and no extra query is needed there
  - **The open-shift block is asymmetric by role, deliberately.** When the row's owner has an open shift: an **EMPLOYEE** may not `POST` or `PUT` at all (not even on the open row) — clock-out is the one way to unblock, and it is always available to them. An **ADMIN** is subject only to the collision rule. Both halves are load-bearing: clock-out is EMPLOYEE-only and closes *the caller's own* shift, so `PUT` is the admin's only tool — without the exception, an open shift belonging to a **deactivated** employee (who can no longer log in at all) would stay open forever, and the admin would be locked out of the whole ledger for as long as anyone happened to be on shift. The check always reads the **row owner's** state, never the caller's
  - ⚠️ Accepted gap, recorded rather than ignored: the collision check is check-then-act, so two concurrent submits can both pass. No DB-level exclusion constraint in Phase 1 (it would need `btree_gist` + `tstzrange` + a `NULL endTime` branch). Blast radius is one duplicate row the admin can delete — unlike the `P2002` case in step 2, there is no cheap driver-level catch to pair it with
  - **Owner-or-ADMIN is enforced in the service, never by a guard.** The ownership filter goes straight into the Prisma `where` (`{ id, ...(role === ADMIN ? {} : { userId }) }`), so "not yours" and "doesn't exist" collapse into one 404 and there is no separate check to forget on one of the three routes. `RolesGuard` compares a single role and cannot express ownership, and a guard would have to query Prisma — which only services may do.
  - Clock-in/clock-out error copy is recorded in spec §8a. The wording is **not** binding (see §8a's own note)· what matters is that both refuse with a 400 that names the cause, and that "an open shift already exists" is **one shared constant** across clock-in and the manual write path — same situation, same required action, one string
  - Nothing extra is needed to keep a deactivated employee out: `JwtStrategy` re-checks `isActive` on every request (see architecture.md § Invariants), so a token issued before deactivation stops working everywhere at once — this module included.

- [ ] **6. Payroll module — rate zones**
  - `GET /payroll/me?cycle=` (EMPLOYEE), `GET /payroll/:userId?cycle=` (ADMIN) — **identical shape**, both feed the same shared `PayrollBreakdown`
  - `GET /payroll/overview?cycle=` (ADMIN) — the whole team in one request
  - **Not a flat rate.** Four zones (spec §4 decision 5c, §7): Mon–Fri 08:00–17:00 base, 17:00–24:00 +33%, 00:00–08:00 +45%, Sat/Sun all day +45%. They tile the week exactly once, so surcharges never stack. A shift is cut at every zone boundary it crosses, on top of the cycle clipping from step 4
  - `rate-zones.util.ts` — all of it pure, no DB and no DI, in the shape of `cycle.util.ts`. Computed in **integer hundredths**, never decimal floats
  - **Three rounding points and no others** (spec §4 decision 5d): hours to 2 decimals per *cell* (date × zone), a zone's rate never, a zone's pay to whole ISK. `totalHours`/`totalPay`/`totalCost` are exact **sums** — never rounded again, which is what makes every column add up to the figure beneath it
  - Response carries the resolved cycle block, `hourlyRate`, `totalHours`, `totalPay`, `hasOpenShift`, the four `zones` (label, hours, rate, pay) and `days` (row per **date**, column per zone, hours only — no money). Only dates with hours
  - `hasOpenShift` is **cycle-scoped**, matched on `startTime`: open shifts are unpayable so their day is absent from `days`, and this flag is the only thing that explains the gap
  - `UsersService.findEmployeeRate()` (single) and `findAllEmployeeRates()` (batch, for the overview) — narrow readers with explicit `select`. **Never `findEmployeeRate()` in a loop**: fifteen employees would become fifteen round trips
  - A `null` `hourlyRate` fails loudly with a 500 naming the fix — never a silent 0, which would drop that person's wages out of the team's cost
  - **Tests are written in this step**, as in steps 4 and 5 — `rate-zones.util.spec.ts` (zone boundaries, cross-midnight, Fri→Sat and Sun→Mon handovers, cross-cycle clipping, the rounding rules) and `payroll.service.spec.ts` with stubbed Prisma (404s, who appears on the overview, the query shapes, and that the overview row equals that employee's own page)

- [ ] **7. Swagger**
  - `@ApiTags`, `@ApiOperation`, `@ApiResponse` on every controller — built in with each step, not at the end. This step is therefore a **completeness sweep**, not new work: the decorators have been written inside each step since step 2, and what step 7 does is find where that slipped
  - It slipped unevenly, and the pattern is worth knowing: the three most recent modules (`settings`, `time-entries`, `payroll`) were near-complete, while the two oldest (`users`, `auth`) had **~17 undeclared status codes** between them — `users` had five routes documenting nothing but 200/201. The sweep is doc-only: no endpoint, DTO or behaviour changes
  - **Why it gates step 8 rather than being cosmetic:** step 8's manual sweep is executed *from the Swagger UI*, and 8b is written from step 8's checklist. A 409 that is not written there is a 409 nobody tries by hand and nobody turns into a test — exactly the finding `/review` raised against the payroll routes at the end of step 6
  - Conventions fixed here, recorded as invariants in architecture.md: **401 is declared once per controller class** (`@ApiResponse` is a `ClassDecorator` too, and the explorer merges class-level into every operation), **403 stays per route** because it is not uniform, and **no 500 is ever declared**
  - `persistAuthorization: true` in the `SwaggerModule.setup()` options — step 8 is driven from this UI, and without it every page refresh discards the bearer token

- [ ] **8. Full check of the backend before the frontend**
  - Full check of all endpoints via Swagger UI or Postman. **The checklist below is executed by hand here and turned into automated tests in 8b** — 8 is the first point where the system exists as a system, 8b is what stops that check from being a one-off snapshot
  - Auth flow, role restrictions, edge cases:
    - Wrong/expired setupCode on set-initial-password
    - Clock-out with no open shift
    - Double clock-in while an open shift already exists (must fail)
    - Login with `isActive = false` (must fail)
    - `POST /users` with `password` in the body (must be rejected by the ValidationPipe)
    - Cycle boundary: a shift exactly on the 25th or the 24th of the month — correct cycle
    - A shift crossing the boundary (e.g. 24 Aug 20:00 → 25 Aug 03:00) — appears in both cycles, hours split 4/3, and the two parts sum to the full shift
    - A shift crossing a **zone** boundary (e.g. Tue 22:00 → Wed 06:00) — 2h at +33% on one date, 6h at +45% on the next, on two separate rows of the day table
    - Payroll columns add up: `Σ zones[].pay === totalPay`, `Σ days[].totalHours === totalHours`, `Σ rows[].totalPay === totalCost`
    - `GET /payroll/overview` — an active employee with no hours is listed at 0· a deactivated employee with hours in the cycle is still listed and still counted in `totalCost`· a deactivated employee with nothing in the cycle is not
    - `GET /payroll/:userId` on the admin's own id → 404
    - `PUT /settings` with a non-contiguous or out-of-range day pair (e.g. `{25, 20}`, `{10, 9}`, `{26, 25}`) — must be rejected with 400
    - CORS: a request from the frontend origin passes through normally
    - Error messages (login/set-initial-password) are in English and name the real cause — "not activated" and "no longer active" are distinguishable from a wrong password, never collapsed into one generic answer

- [ ] **8a. Unit tests — cycle resolution, Payroll, Auth & Users**

  **Why this grew beyond cycle+payroll:** step 8 is a *snapshot* — it proves the backend worked on the day it was clicked through, not that it still works after the next change. That is not hypothetical here: step 3 rewrote `JwtStrategy` to hit the database on every request, a change that passes through **every** authenticated endpoint, and nothing automated would have caught it breaking login. `AuthService` in particular is the one place where a wrong order of checks is a security bug rather than a display bug — and it has already been wrong once (`set-initial-password` was missing the `isActive` check, caught by `/review` in step 3, not by any test).

  All of these use the pattern established in `settings.service.spec.ts`: **stubbed Prisma, no database**, so they stay fast and need no fixtures.

  - `cycle.util.spec.ts` already exists from step 4 (boundaries, February, splitting, open shifts, prev/next keys, the omitted-`?cycle=` default) — extend rather than re-create. The 28/29/30/31 clamping cases from the original plan no longer apply: the 11–25 restriction means every allowed day exists in every month (spec §4 decision 5a)
  - `rate-zones.util.spec.ts` and `payroll.service.spec.ts` **already exist from step 6** — extend rather than re-create, exactly as with `cycle.util.spec.ts` and `time-entries.service.spec.ts`. They already cover the zone boundaries, the cross-midnight and cross-cycle splits, the three rounding points, the 404s and who appears on the overview. What is worth adding here: entries outside the cycle excluded, and a shift crossing the cycle boundary contributing its clipped hours to **each** of the two cycles (the parts summing to its full length)
  - Tests for `AuthService`: the order of checks in `login()` (`isActive` → `password !== null` → bcrypt compare) and in `setInitialPassword()` (`isActive` → already activated → code matches → not expired), each asserted against the **verbatim** message, as everywhere else in the suite — the order is the security property, and getting it wrong is a security bug rather than a display bug (it has already been wrong once: `set-initial-password` was missing the `isActive` check in step 3). §8a stopped being binding on the *documentation* side, but the tests stay the regression net: changing one of these sentences must be a deliberate edit that shows up here. Plus: a rejected `set-initial-password` attempt does **not** consume the setupCode
  - Tests for `UsersService`: `updateEmployee`/`deactivate` never touch an ADMIN row (404 instead)· `activateAccount` clears `setupCode` **and** `setupCodeExpiresAt` together· `toProfileDto` never carries `setupCode`, while `toResponseDto` always does for a pending employee· duplicate email yields 409 from both the explicit check and the `P2002` catch
  - `time-entries.service.spec.ts` and the validator specs **already exist from step 5** (clock-in refuses while an open shift exists· clock-out with no open shift fails· the owner-or-ADMIN filter resolves someone else's row to a 404· the four write rules and the role asymmetry) — extend rather than re-create, exactly as with `cycle.util.spec.ts`

  These stop at the service boundary on purpose — instantiating a controller directly runs **no** guard, pipe or `ValidationPipe`, because Nest applies those in the HTTP layer. A controller unit test would therefore pass even with `@Roles('ADMIN')` deleted. That layer is covered by 8b instead.

- [ ] **8b. Full-stack tests — guards, real SQL, constraints**

  **What this covers that nothing else does.** 8a proves the logic with a fake database· step 8 proves the whole system once, by hand. Four things fall between them:
  1. That `@Roles('ADMIN')` and `JwtAuthGuard` are actually **wired and executing** on each route — not merely present in the source
  2. That the Prisma queries are correct SQL against the real schema — a mock returns whatever it was told. ⚠️ **This bullet used to claim that an overlap query written with `gte` instead of `gt` "passes every 8a test". That is false, and was proved false by injecting the bug during 8b:** `time-entries.service.spec.ts` pins the exact `where` object, so the swap fails it. The real gap is narrower and still worth closing — the unit test *restates the implementation*, so a refactor that changes the query and its expected object together keeps passing while the semantics move, and no assertion about an object can show that Postgres actually accepts a back-to-back pair. 8b asserts the **outcome** (both shifts exist) rather than the query shape
  3. DB-level constraints: `CHECK ("id" = 1)` on `AppSettings`, the unique email index behind the 409
  4. That the migrations apply from an empty database, and that the seed script runs — **neither is verified anywhere today**

  ⚠️ **This step ran BEFORE 8 and 8a** (decision of 2026-08-11, recorded in `progress-tracker.md`). The dependency read as "8b is written from step 8's checklist", but that checklist is **written** in §8 above — it does not have to have been *executed* by hand first. Executing 25 checks manually and then encoding the same 25 as tests is the same work twice, with the manual half being the one that expires. 8b is also the gate for the frontend, so it carries the most risk and belongs first. §8 shrinks accordingly — see its own closing note.

  **Built in two passes, deliberately.** The project has three recorded measurement errors (steps 5, 6, 7) and **all three were the harness, never the code**. Writing 25 tests against a brand-new harness means a red result is ambiguous. So: **8b-1** builds the harness and proves it with 4 smoke tests, one per layer (a real login end to end, `JwtAuthGuard` firing, `RolesGuard` firing, and the `ValidationPipe` actually applied). **8b-2** adds the behavioural tests on top of a harness already known to work.

  **Setup** (uses `backend/test/jest-e2e.json`, unused scaffold since step 1):
  - A separate database `swifttrack_test` in the **same** Postgres container that already runs — dev data is never touched, so no truncation of real rows and no cleanup step like the one step 4 needed
  - `.env.test` (gitignored, with a committed `.env.test.example`, mirroring the existing `.env` convention) loaded with `override: true` in the jest setup file — portable, and avoids per-shell env syntax on Windows
  - Before the suite: `prisma migrate deploy` then `prisma db seed` against that URL — which is what makes point 4 above free
  - Truncate the data tables between tests, keeping the `AppSettings` singleton· run with `--runInBand`, since the tests share one database
  - ⚠️ The global `ValidationPipe` is registered in `main.ts`, **not** in `AppModule` — a testing app does not inherit it. It must be applied explicitly in the test bootstrap, or every validation assertion passes falsely
  - ⚠️ Set a `FRONTEND_URL` distinct from `http://localhost:5173` for the run, so a CORS assertion tests the configured origin rather than the hardcoded fallback (the step 1 lesson)
  - ⚠️ **`jest-e2e.json` needs `moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" }`** — the same mapping `package.json` already carries for the unit tests (step 4). The Nest CLI scaffold does not have it, and without it every spec that touches `PrismaService` dies on the Prisma 7 client's explicit `.js` specifiers
  - ⚠️ **The suite must run under `node --experimental-vm-modules`.** Prisma 7's client engine loads its WASM query compiler through a dynamic `import()`, which jest's CJS runtime refuses with *"A dynamic import callback was invoked without --experimental-vm-modules"*. This never surfaced before because **every unit test stubs Prisma** — 8b is the first place a real `PrismaClient` runs inside jest. Wired into the `test:e2e` script as `node --experimental-vm-modules node_modules/jest/bin/jest.js …`, which is portable and needs no `cross-env`
  - **A guard refuses any `DATABASE_URL` whose database name does not end in `_test`**, checked before the first query in both the jest setup file and `globalSetup`. The ordering that keeps `.env.test` ahead of `AppModule`'s `ConfigModule` is subtle (dotenv does not overwrite existing keys, so load order *is* the mechanism); if it ever breaks, the failure without this guard is silent — the run truncates the development database and every test still passes

  **Scope: the checklist in §8 becomes code** — role restrictions per route, the activation flow end to end, double clock-in, clock-out with no open shift, login while inactive/unactivated answering 401 with the two cases distinguished, asserted verbatim, `password` in `POST /users` rejected by the pipe, the cycle boundary and the split shift against real rows, the zone split across midnight, the payroll columns adding up, who appears on `/payroll/overview`, `PUT /settings` validation, CORS. Roughly 20-25 tests.

  Step 8 then keeps only what a human should actually do: read the Swagger UI, sanity-check the shape of responses, and try the things nobody thought to list.

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
  - `ClockButton` first on the page· reads `{ openShift }` from `GET /time-entries/open` (wrapped, see step 5) to know which label to render on load
  - ⚠️ **Open decision, to be taken with the page in front of us:** whether `MonthSummary` stays at all. Keeping it means two figures — hours and pay for the current cycle — read straight from `GET /payroll/me`, computing nothing. Dropping it makes the page a single-purpose button and, more usefully, makes it **independent of the Payroll module**: the Clock page would then need only the two clock endpoints and `/time-entries/open`. Nothing about the backend depends on the answer — `/payroll/me` exists either way

- [ ] **11. Shift History**
  - `ShiftList` — shared component, takes a `userId` prop· employee (`/shifts`, userId locked) + admin (`/shifts/:userId`)
  - ⚠️ **The mockup's "Hours" column goes** (and with it the `hoursBetween` mock helper). The API no longer returns an hours figure per shift — spec §4, decision 5f. Columns are Date / Start / End / Notes / Open + a **split** marker from `isSplit`, which is what explains a shift appearing in two cycles. If the page feels like it needs a number, it is a **Duration** (`end − start`), labelled as such — never "Hours", which is a payroll word
  - `ShiftForm` (add/edit/delete)
  - `CycleNavigator` (◀▶) — consumes `cycleStart`/`cycleEnd` from the backend response, computes nothing itself

- [ ] **12. Payroll Breakdown**
  - ⚠️ **The step-0 mockup is a draft and gets replaced**, not extended. It renders one Date/Hours/Pay table computed in the browser (`hoursBetween`, `isWithinCycle`, `Math.round` per row) — all of which is now backend work and all of which must go
  - **Two components**, both reused for employee (`/payroll`, userId locked) and admin (`/payroll/:userId`):
    - a **summary** — `Zone | Hours | Rate | Total Pay`, one row per zone plus a Total row (spec §8a)
    - a **day table** — `Date | Day | Evening | Night | Weekend | Total`, row per date, hours only, no money
  - Both render straight from the response: **no arithmetic, no `Math.round`, no date maths**. That includes the Total rows — print `totalHours`/`totalPay`/`day.totalHours` as sent, never re-add the column. The cells are decimals, and summing them in JS disagrees with the server's figure about a third of the time (`1.99 + 22.35 + 2.92` → `27.259999999999998`) `mocks/data.ts` helpers (`hoursBetween`, `isWithinCycle`, `getMockCycle`) are mock-only and must not survive into a real component
  - The zone columns/rows are generated **from the `zones[]` array**, never hardcoded — a fifth zone must appear with no frontend change (architecture.md § Invariants)
  - `date` is formatted **as UTC** — `new Date("2026-07-25")` in a negative-offset browser prints the previous day
  - Show the `hasOpenShift` warning: without it, a day missing because someone forgot to clock out looks like a bug in the app

- [ ] **13. Admin — Team, Payroll Overview & Settings**
  - `TeamPage` — first page after admin login. List, create, edit hourlyRate, click → employee's ShiftHistoryPage
  - `TeamPage` — badge per employee **"Active" / "Pending"** (from the `hasActivated` returned by the backend· see spec §8a)
  - `PayrollOverviewPage` — list of employees, total monthly cost, open-shifts indicator, cycle nav, click → employee's PayrollPage. Fed by **one** call to `GET /payroll/overview?cycle=`· the mockup's per-employee `reduce` and its client-side `hasOpenShift` both go. Rows arrive sorted and already include any deactivated employee with hours in the cycle
  - `SettingsPage` — cycleStartDay/cycleEndDay. ⚠️ The step-0 mockup has two free number inputs (1–31)· it becomes a **single** `<select>` of 11–25 with the end day rendered beside it as derived text ("Cycle ends on the 24th of the following month"). The request still sends both fields — the admin simply cannot produce an invalid pair. The backend validation stays regardless (see step 4)

- [ ] **13a. Client-side validation polish** (do this last, after all forms exist)
  - `zod` + `react-hook-form` (+ shadcn's `Form` component) across all forms: Login, Set Initial Password, ShiftForm, EmployeeForm, Settings
  - Replaces the native browser validation tooltip (unstyled, e.g. missing `@` in email) with styled in-app error messages
  - Replaces the current per-field `useState` pattern in each form with `useForm` + a Zod schema per form

- [ ] **14. README**
  - Build/deploy instructions, seed script instructions
  - **The parked items that have accumulated — this is their destination.** They are listed here so step 14 does not have to go looking through `progress-tracker.md` for them:
    - ⚠️ **`prisma generate` on a clean clone.** `backend/src/generated/` is gitignored, so nothing compiles until it runs. The official fix is `"postinstall": "prisma generate"`, which **cannot be added as-is**: Prisma 7 has an open regression where `prisma generate` fails without `DATABASE_URL`, because `env()` in `prisma.config.ts` throws while the config loads — and a clean clone has no `.env`, so `npm install` itself would fail ([prisma#28590](https://github.com/prisma/prisma/issues/28590)). Three options, with (β) preferred: (α) postinstall plus a README that orders "copy `.env` before `npm install`", (β) `process.env.DATABASE_URL ?? 'placeholder'` instead of `env()`, then postinstall, (γ) no postinstall, an explicit `npm run setup`
    - ⚠️ **`start:prod` must be tested in a real deploy.** It was pointing at a non-existent file until step 6 (`dist/main` vs the actual `dist/src/main.js`, because `prisma.config.ts` and `prisma/seed.ts` sit outside `src/` and drag the build root down a level). Fixed and verified locally, never deployed. If a clean layout is ever wanted, `"include": ["src/**/*"]` in `tsconfig.build.json` does it — but then those two files stop being compiled into `dist`
    - **"Settings not initialised. Run `npx prisma db seed`."** — this message is the deliberate alternative to documenting a 500 in Swagger (step 7, decision Δ reversed). The setup instruction belongs here, in the README, and nowhere else
    - **`npm run seed:demo`** — demo data for local development: 5 employees covering every UI state (active, pending, deactivated-with-hours, clocked-in) and ~150 shifts across three cycles. Separate from `prisma db seed` on purpose, since that one runs in production deploys and inside the e2e `globalSetup`. ⚠️ Document that it **deletes all EMPLOYEE rows and their time entries** before rebuilding, and that it refuses to run against a `*_test` database
    - **The e2e suite's prerequisites**: copy `.env.test.example` to `.env.test`, and create the database once with `docker compose exec db psql -U swifttrack -d postgres -c "CREATE DATABASE swifttrack_test;"`. `globalSetup` runs the migrations and the seed, but does **not** create the database itself — that needs a connection to `postgres` with create rights

---

## Rule for every step

Before a module is considered "done":
1. The happy path works
2. Role restrictions (ADMIN vs EMPLOYEE) work, where applicable
3. It has Swagger decorators
4. It follows the invariants in `architecture.md` (e.g. `userId` explicit in every service query)
5. Every piece of text the user sees is in English. **UI copy** (titles, buttons, links, badges, rate-zone labels, payroll column headers) comes from spec §8a **verbatim**, via `frontend/src/lib/messages.ts` — never paraphrased, never written inline. **Error/feedback messages** are not bound to §8a's *table*: write a sensible one where it does not cover a case, and improving an existing one needs no spec update. ⚠️ That is a rule about the documentation, not about the tests — the specs assert these messages **verbatim**, so changing one is a deliberate edit that shows up as a failing test rather than slipping through
