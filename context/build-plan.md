# Build Plan — SwiftTrack (Phase 1)

Development order. Each step must be completed (and working) before the next one starts. We don't move on to the rest of the frontend (steps 9+) before the entire backend is verified — the manual sweep (8), the service unit tests (8a), the full-stack tests against a real database (8b), and **8c**, the API changes the frontend plan turned out to need. Exception: step 0, which is built first of all, before even Docker/backend.

⚠️ **Steps 9–13b were rewritten on 2026-08-26**, after the backend was complete, to describe the API that actually exists rather than the one imagined in step 0. **Step 13a (client-side validation polish) was removed** in the same pass: it existed to defer form validation until the rules were known, and the rules have been known since the backend closed, so its content became a rule applied from step 9 onward instead of a cleanup pass at the end. The reasoning for every decision is in `progress-tracker.md` under that date.

⚠️ **Step 13 was then split into `13-1`/`13-2`/`13-3` on 2026-08-31**, before any of it was built — three pages in one step was roughly the sum of steps 10, 11 and 12 put together. The `-N` suffix follows `8b-1`/`8b-2` rather than letters, because `13b` is the Playwright step and `13a` is the one abolished above. Full reasoning at the head of §13.

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
      userId, name, canWrite,
      entries: [ { id, startTime, endTime, notes, isSplit, canEdit } ] }
    ```
    `userId`/`name` were **added in step 8d**, and `canWrite`/`canEdit` in step 8c — all four are siblings of `entries`, never members of the cycle block. `name` comes back on `/me` too, carrying the caller's own name that the employee page never prints: the same "one shape for both routes" rule this bullet opens with, and exactly what `/payroll/me` has done since step 6. Without it the admin's `/shifts/:userId` would need a second call to `GET /users` — the whole team, every pending `setupCode` included — to print one heading, while its twin page `/payroll/:userId` got the name for free
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
  - `GET /payroll/me?cycle=` (EMPLOYEE), `GET /payroll/:userId?cycle=` (ADMIN) — **identical shape**, both feed the same shared page *(built in step 12 as `PayrollSummary` + `PayrollDayTable`, and verified there to be byte-for-byte identical on the two routes)*
  - `GET /payroll/overview?cycle=` (ADMIN) — the whole team in one request
  - **Not a flat rate.** Four zones (spec §4 decision 5c, §7): Mon–Fri 08:00–17:00 base, 17:00–24:00 +33%, 00:00–08:00 +45%, Sat/Sun all day +45%. They tile the week exactly once, so surcharges never stack. A shift is cut at every zone boundary it crosses, on top of the cycle clipping from step 4
  - `rate-zones.util.ts` — all of it pure, no DB and no DI, in the shape of `cycle.util.ts`. Computed in **integer hundredths**, never decimal floats
  - **Three rounding points and no others** (spec §4 decision 5d): hours to 2 decimals per *cell* (date × zone), a zone's rate never, a zone's pay to whole ISK. `totalHours`/`totalPay`/`totalCost` are exact **sums** — never rounded again, which is what makes every column add up to the figure beneath it
  - Response carries the resolved cycle block, `hourlyRate`, `totalHours`, `totalPay`, `hasOpenShift`, the four `zones` (label, hours, rate, pay) and `days` (row per **date**, column per zone, hours only — no money). Only dates with hours
  - `hasOpenShift` is **cycle-scoped**, matched on `startTime`: open shifts are unpayable so their day is absent from `days`, and this flag is the only thing that explains the gap
  - `UsersService.findEmployeeRateAt()` (single) and `findAllEmployeeRatesAt()` (batch, for the overview) — narrow readers with explicit `select`. **Never the single reader in a loop**: fifteen employees would become fifteen round trips. *(Both took an `at` instant from step 15 on, when rate history arrived — this step built them without one, reading `User.hourlyRate` directly.)*
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

- [ ] **8c. Error codes, two recovery endpoints, and cycle locking**

  **Why this exists and why it is here.** Four decisions taken while aligning the frontend plan (session of 2026-08-26) need the API to change. None of them is a bug fix — the backend works. They are here rather than in Phase 2 for one reason: **no frontend consumes this API yet**, so each is a one-sided change today and a two-sided one later. That is the same argument that put 8b ahead of step 9.

  It is a **backend** step deliberately. Folding backend work into a frontend step would quietly break the rule that no frontend step starts before the backend is complete.

  Additive at the level of the API contract: no existing message, status code or response field changes. ⚠️ **That did not mean the test suite was untouched, and this plan claimed it did.** The claim held for the error codes (measured: 175/175 unit stayed green through all 24 conversions) but was **false for the cycle lock** — two e2e fixtures wrote shifts with an *employee* token at a date two cycles back, so they would have failed from the first day. They were rewritten as admin-written fixtures; see `progress-tracker.md` under Step 8c. Final state: 195 unit, 94 e2e.

  **1. Error codes on every domain exception.** **24 `throw` sites** gain a stable machine-readable `code` alongside the `message` they already carry — recounted during the step, since the original figure was wrong: `auth` **9** (not 10), `users` 5, `time-entries` 8, `settings` 1, `payroll` 1. The other four of the 28 HttpExceptions in `src/` are the deliberate `InternalServerErrorException`s (2 in `settings`, 1 in `payroll`), which are **not** part of the API contract and get no code — Swagger does not declare them either — plus `jwt.strategy.ts`'s 401, which is guard-level rather than domain. (A 29th `throw` exists in `rate-zones.util.ts`, but it is a plain `Error` guarding an internal invariant, not an HTTP response.) The 24 map to **17** codes, not 24: two sites needing the same sentence share one, and in the `INVALID_CREDENTIALS` case they must — separate codes for "unknown email" and "wrong password" would reopen the account enumeration their shared message closes. The shape becomes:
  ```json
  { "statusCode": 400, "code": "SHIFT_OVERLAP", "message": "This shift overlaps an existing shift." }
  ```
  The frontend maps **`code` → its own text** and never displays `message` (see architecture.md § Invariants). Why not the HTTP status alone: `400` already means at least four different things on `POST /time-entries` — an open shift exists, the shifts overlap, the time is in the future, the end precedes the start — and a status-keyed map collapses them into one sentence that tells the user nothing about what to fix. [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) is the standard answer here and says the same thing: the status is *advisory*, the discriminator belongs in the body. We take its substance (a stable identifier) without its ceremony (`type` URIs, `application/problem+json`) — this API has exactly one known client.

  This is less new than it sounds: `time-entries.service.ts` already throws `BadRequestException(OPEN_SHIFT_EXISTS)`, a shared constant introduced in step 5. The constant already holds the name; the step exposes it.

  ⚠️ The `ValidationPipe`'s own 400s are framework-generated and carry no `code`. That is expected — they are never shown to a user (architecture.md § Invariants), and the client treats a missing `code` as an unmapped failure. ⚠️ **This does qualify the motivating example above**, and the qualification was found while building: of the four meanings `400` carries on `POST /time-entries`, only two (`OPEN_SHIFT_EXISTS`, `SHIFT_OVERLAP`) are service-thrown and therefore coded. "End before start" and "time in the future" are rules 2 and 4, which live in the DTO validators. The decision stands — those two were always the pair that needed telling apart, and step 11's zod schema catches the other two before a request is sent — but the sentence overstated it.

  **2. `PATCH /users/:id/reactivate` (ADMIN).** Sets `isActive = true` on an EMPLOYEE row. Today deactivation is **irreversible through the API**: `PUT /users/:id` accepts only `name`/`hourlyRate`, and a fresh `POST /users` collides with the unique email. The only remedy is hand-editing the database — for a case (a seasonal employee returning) that is routine rather than exotic in the target market. ADMIN rows stay untouchable, via `findEmployeeByIdOrThrow`, exactly as `PUT`/`DELETE` already are.

  **3. `POST /users/:id/reset-setup-code` (ADMIN).** Issues a fresh 4-digit code and a fresh 3-day expiry for a still-pending employee. This closes a **guaranteed** dead end, not an edge case: the code lives 3 days, is issued exactly once in `createEmployee`, and has no regeneration path — so an employee hired on a Friday who sets up on Tuesday is locked out permanently. The expiry message already says *"Please contact your admin"*, pointing at someone who currently has no tool. Refuses on an already-activated account (`password !== null`) — a code is never re-issued for an account that no longer needs one.

  **4. Old cycles are read-only for EMPLOYEEs.** `POST`, `PUT` and `DELETE /time-entries` refuse when the entry falls outside the **current or previous** cycle. Once a cycle is paid, its record should not move.

  - **All three writes, not just `DELETE`.** Editing a July shift from 8 hours to 2, or adding a new one to July, corrupts a paid cycle exactly as deleting does. Locking one door and leaving two open is worse than locking none, because it reads as protection.
  - **ADMIN is exempt.** Deliberate, and it mirrors the open-shift asymmetry already in §5: the admin is the only actor who can repair a genuine historical error, and locking them out strands, among other things, the forgotten open shift of a deactivated employee — who cannot log in to clock out. That case is already a documented reason the admin needs `PUT` at all.
  - **The list response must say so, at two levels.** `GET /time-entries/me` and `GET /time-entries` add **(a)** a per-entry boolean reporting whether **the caller** may edit that row, and **(b)** a response-level `canWrite` reporting whether the caller may create a shift in this cycle at all. Both are always `true` for an ADMIN, which keeps one response shape for both routes, as §5 requires.

    The second one is not redundant: a `POST` has **no row** to hang a per-entry flag on. Without it an employee navigating ◀ to an old cycle sees "Add Shift", fills the form, and gets a 400 they had no way to anticipate — and the frontend cannot grey the button out on its own, because deciding whether a cycle is writable means resolving cycle boundaries client-side, which an invariant forbids.

    ⚠️ **`canWrite` is a sibling of `entries`, not a member of the shared cycle block.** The block's five fields (`cycle`, `prevCycle`, `nextCycle`, `cycleStart`, `cycleEnd`) are facts about the *cycle* — identical no matter who asks. `canWrite` is a fact about the *caller*, and changes with the token. Keeping it outside is what lets spec §7's "every cycle-aware response carries the same block" stay true, and keeps a meaningless field off the payroll response.
  - `TimeEntriesService` already injects `SettingsService`, so the boundary is available without new plumbing.
  - ⚠️ Accepted consequence, recorded rather than discovered later: **an error found after the window is permanent for the employee.** There is no correcting-entry mechanism (the accounting answer to a closed period), so a wrong time, a wrong date or a forgotten shift older than one cycle can only be fixed by an admin. The window spans one to two months, which covers the realistic discovery time — people notice payroll errors when they are paid.

  **Tests**: unit for the cycle-boundary refusal on all three writes and the role asymmetry; e2e for the two new endpoints, for the refusal, and for the new list field. Swagger documents both endpoints and the new field; error codes are documented per operation, which is what makes step 8's manual sweep able to see them.

- [ ] **8e. `PATCH /auth/change-password`**

  **Why this exists and why it is here.** Found while auditing the finished app for real-world operational gaps (session of 2026-09-01), not part of the original spec. `AuthService` had exactly two entry points — `login` and `setInitialPassword` — and neither gives an **already-activated** account a way to rotate or recover its password. `reset-setup-code` (step 8c) refuses an already-activated account by design, and `deactivate`/`reactivate` leave `password` untouched — so today the only remedy is a direct database edit. It is a backend-only step, in the same shape as 8c/8d: additive to the API contract, no existing route/message/status changes.

  **The endpoint.** `PATCH /auth/change-password` (Both roles), `{ currentPassword, newPassword }`. Behind `JwtAuthGuard` only — no `@Roles`, same as `GET /users/me` and `GET /settings`. `userId` comes from `@CurrentUser()`, never the body: this can only ever act on the caller's own row, mirroring the "every user-scoped service function takes `userId` explicitly" invariant.

  - `AuthService.changePassword(userId, currentPassword, newPassword)` — resolves the row through a new narrow reader, `UsersService.findCredentialsById()` (`select: { id, password }`, never a general `findById()` — that has already leaked `password`/`setupCode` twice in this project's history), `bcrypt.compare`s the current password, and on success hashes and writes through `UsersService.updatePasswordHash()`. Deliberately **not** `activateAccount()`, which also clears `setupCode`/`setupCodeExpiresAt` — fields that do not apply here, since the caller is already activated by construction (an unactivated account cannot hold a valid JWT).
  - **New error code**: `INVALID_CURRENT_PASSWORD` — deliberately distinct from `INVALID_CREDENTIALS`. The account-enumeration reasoning that forces `login` to share one code across "unknown email" and "wrong password" does not apply here: the caller is already authenticated, so there is no account left to enumerate.
  - ⚠️ **Not behind `ThrottlerGuard`** — decided explicitly (user's call, session of 2026-09-01), not merely left off. `@SkipThrottle()` on the route, so the exception is visible at the call site rather than an absence someone has to notice. Reasoning: unlike `login`, a request here already requires a valid token, so brute-forcing `currentPassword` needs a stolen session first, not just a guessable email — a materially smaller attack surface. Accepted consequence, recorded rather than discovered later: a caller holding a valid token can attempt unlimited `currentPassword` guesses.
  - ⚠️ **Does not invalidate tokens already issued.** This API has no refresh/revocation mechanism at all (an existing, accepted Phase 1 gap — see architecture.md's JWT invariant), so a token minted before the change stays valid until its own 14-day expiry. Not a new gap this step introduces, but its first case with a visible consequence: the reason to change a password (a suspected leak) is exactly the case where an attacker's copy of the old token keeps working regardless. → **Reversed in step 8f**, which added `tokenVersion` and cut the expiry to 12 hours· this bullet is left as written because it records what was true when 8e shipped.
  - **Swagger**: since `AuthController`'s other two routes are public, the class carries no shared `@ApiBearerAuth()`/401 the way every other controller's does. This route declares both itself, method-level, rather than changing the class for one route out of three.

  **Tests, in this step** (same rule as every other backend step): unit in `auth.service.spec.ts` (stubbed `UsersService`, same shape as `login`/`setInitialPassword`'s own tests) — success hashes and stores, wrong current password rejects and writes nothing, the caller's own id is what is read/written. E2e in a new `change-password.e2e-spec.ts` (real DB, shape of `activation.e2e-spec.ts`) — both roles end-to-end, `setupCode`/`setupCodeExpiresAt` untouched, `@SkipThrottle()` actually skipping (6 rapid wrong-password attempts, no 429), unauthenticated → 401, short `newPassword` → 400, unknown body property → 400 via the global `ValidationPipe`.

  ⚠️ **Fixture hazard, found while writing the e2e suite and worth recording so it is not rediscovered as a mystery failure.** `test/helpers/db.ts`'s `resetDatabase()` deliberately does **not** touch the seeded ADMIN row between tests — "the admin is a fixture, not test data" — because several assertions across the whole suite depend on `ADMIN_EMAIL`/`ADMIN_PASSWORD` still logging in. A test that changes the admin's own password and does not change it back leaves every *later* test's `loginAsAdmin()` failing, in that file and in the shared test database generally — including a re-run of the suite, since global setup's seed script skips creating an admin that already exists rather than resetting one. The fix is not to widen `resetDatabase()` (a bigger, riskier change for one test's sake) but for the one test that exercises this path to round-trip the password back within itself, through the endpoint under test.

  ⚠️ **Frontend is deliberately out of scope for this step**, mirroring how 8c's `reactivate`/`reset-setup-code` preceded their frontend consumption (13-3) by several steps. No UI, no `messages.ts` entry for `INVALID_CURRENT_PASSWORD` yet. `frontend/src/lib/messages.ts`'s comment "the backend's 17 codes" is stale by one as of this step (18) — harmless today, since `toErrorCode()` degrades an unrecognised code to `UNKNOWN_ERROR` rather than rendering `undefined` (an invariant built for exactly this kind of lag), but worth closing whenever a "Change password" UI is actually built, so the comment and the count agree again.

- [x] **8f. Change-password contract fix, token revocation, shorter expiry** — ✅ **Done 2026-09-04**

  **Why this exists.** Found while starting the frontend for 8e — and it is the exact failure the step-8b gate was built to prevent, arriving late because 8e was added *after* that gate with "frontend out of scope". `api/client.ts` logs the user out on **any** 401 that carried an `Authorization` header (a deliberate rule keyed off the header, never a list of endpoints — its own comment says so). `PATCH /auth/change-password` answered **401** for a wrong `currentPassword` and *must* send that header, unlike `login`/`set-initial-password`, which pass `auth: false`. So a typo in the current-password field would have wiped the token, bounced the user to `/login`, and told them their session had expired — never showing the real reason. Backend-only, and a prerequisite for any change-password UI.

  **Three changes, one step:**
  - **`INVALID_CURRENT_PASSWORD` moves from 401 to 400** via the existing `badRequest()` factory. The route's 401 becomes exclusively guard-level. Recorded in `error-codes.ts` beside the code itself so nobody moves it back.
  - **Token revocation via `tokenVersion`** (`Int @default(0)` on `User`, migration `add_token_version`). Signed into the JWT, compared in `JwtStrategy.validate()` **inside the `findActiveById()` read that already happens per request** — so it costs no extra query. `updatePasswordHash()` becomes `updatePasswordAndRevokeTokens()`, bumping the counter in the same `UPDATE` as the hash and returning the new value. Since that revokes the caller's own token, the route now answers `{ accessToken }` (new `ChangePasswordResponseDto`) — the session that made the change survives, every other device is out on its next request. `setInitialPassword` deliberately does **not** bump (no token can exist yet)· `deactivate`/`reactivate` do not either (`isActive` is already live). `findCredentialsById` gained `role` in its `select`, the one widening the replacement token justifies.
  - **`JWT_EXPIRY` 14d → 12h.** Orthogonal to revocation: the expiry bounds every token whether anyone asks or not, revocation fires when they do. Roughly one login per shift in a shift-tracking app. New code `NEW_PASSWORD_SAME_AS_CURRENT` rides along — a plain string comparison, not a second `bcrypt.compare`, since `currentPassword` was verified one line above.

  ⚠️ **Deploy consequence:** tokens signed before this step carry no `tokenVersion`, so `undefined !== 0` logs **every existing session out once**. Expected, one-off, and recorded rather than discovered.

  **Tests**: unit 213 → 215 (replacement token carries the *bumped* counter· same-password writes nothing· the wrong-password refusal is a `BadRequestException`, asserted by class because the status is the whole point). E2e 106 → 108, the important one being **two live sessions for one user**: change the password from one, and the other must 401 on its next request while the returned token works.

  ⚠️ **Frontend still out of scope** — 13-4 consumes this. The `messages.ts` "17 codes" comment is now stale by two (19).

- [ ] **8g. `POST /users/:id/reset-password`**

  **Why this exists and why it is here.** Raised in conversation (session of 2026-09-04): can an admin help an employee who has forgotten their password entirely — not "wants to rotate it" (8e, needs the current one), not "never activated within the 3-day window" (8c's `reset-setup-code`, refuses on purpose once a password exists). Neither existing route reaches this case, so today the only remedy is a direct database edit — the same class of gap 8e closed for self-service, still open for admin-assisted recovery. Backend-only, additive to the API contract, same shape as 8c/8e/8f.

  **The endpoint.** `POST /users/:id/reset-password` (ADMIN), no request body — the target is the URL `:id`, same as `reset-setup-code`. Sits directly beside it in `UsersController`, and `UsersService.resetPassword(id)` sits beside `resetSetupCode`/`reactivate`/`deactivate`.

  - **A new endpoint, not a relaxed guard on `resetSetupCode`.** The two look like siblings but differ sharply in blast radius: reissuing a code for a *pending* account changes nothing today (that account could never log in anyway), while nulling the password of an *activated* account ends a working session immediately and — via 8f's mechanism — kills every session currently open. `resetSetupCode`'s `409 ACCOUNT_ALREADY_ACTIVATED` is a deliberate safety rail, not an accidental restriction: its own comment calls the case "a new secret written to an account that no longer needs one." Collapsing the two would also make one "New code" button ambiguous about which of two very different things it is about to do, whenever a frontend eventually wires this up.
  - `UsersService.resetPassword(id)` resolves the row through the existing `findEmployeeByIdOrThrow()` — the same 404 (`EMPLOYEE_NOT_FOUND`) for a bad id or an ADMIN id that `PUT`/`DELETE`/`reactivate`/`resetSetupCode` already give. **No guard on activation or active state** — the one deliberate departure from mirroring `resetSetupCode`, recorded rather than left implicit:
    - **Activated** — the endpoint's whole reason to exist.
    - **Pending (never activated)** — also succeeds, rather than refusing and pointing the admin at `reset-setup-code` instead: this endpoint already produces that exact outcome (fresh code, fresh 3-day window) for free, so refusing it would be worse UX for no safety gained. The two endpoints now deliberately overlap in effect for a pending row — noted here so a future reader doesn't read it as a bug.
    - **Deactivated** — also succeeds, and does **not** implicitly reactivate (`isActive` untouched). `login`'s existing check order (`ACCOUNT_DEACTIVATED` before `ACCOUNT_NOT_ACTIVATED`) already makes the reset inert until a separate `reactivate` call — the same "fourth state" `resetSetupCode` already has on a deactivated-but-never-activated row (spec/13-3's finding). This step does not fix that quirk, only avoids making it worse.
  - One `prisma.user.update` writes `password: null`, a fresh `setupCode`/`setupCodeExpiresAt` (the same `generateSetupCode()`/`addDays()` helpers `resetSetupCode` and `createEmployee` already use), and **`tokenVersion: { increment: 1 }`** — reusing 8f's revocation mechanism, not a new one. Justification: blanking a password because it was forgotten (or because it's suspected compromised) is at least as strong a reason to kill existing sessions as a voluntary change is, arguably stronger, since the account holder did not initiate it and may not know to treat their session as compromised. Unlike `changePassword`, there is no replacement token to hand back — the caller is the admin, not the employee, and the employee has no session to preserve through this call by construction: their only way back in is the new code, handed over out of band exactly as at account creation.
  - Returns `UserResponseDto` via the existing `toResponseDto` — same shape `resetSetupCode`/`createEmployee` already return (`hasActivated` flips to `false`, the fresh `setupCode`/`setupCodeExpiresAt` are visible, `password` was never on this DTO).
  - **No new error code.** Reuses `EMPLOYEE_NOT_FOUND` for a bad id or an ADMIN id — the same code every sibling admin-write route already answers with. Deliberately **no** conflict code: unlike `resetSetupCode`, this method has no state it refuses on. Its Swagger description says so explicitly, so the missing `409` beside `resetSetupCode`'s doesn't read as an oversight.
  - ⚠️ **This is an immediately disruptive action**, unlike `reset-setup-code` on a pending row — a working account stops working the instant this is called, with no confirmation at the backend layer (a frontend concern, deferred, matching 8c/8e/8f).
  - ⚠️ **No audit trail — an accepted gap, recorded rather than absorbed silently.** No logging or audit-table infrastructure exists anywhere in this codebase today. No record is kept of which admin reset which employee's password, or when. A real audit log is a cross-cutting addition that does not belong hung off one endpoint· out of scope here, same as every other "recorded but not fixed" gap in this project (8c's fourth state, 8e's original non-revocation).
  - ⚠️ **No `ThrottlerGuard`, and deliberately no `@SkipThrottle()` either** — considered and found not to apply, rather than merely absent. Unlike `login` or `change-password`, there is no guessable secret in play: `:id` is a small sequential integer, not a credential, and a wrong one just 404s. No brute-force surface exists here beyond what already applies to every other ADMIN route.
  - **Swagger**: class-level 401 covers the missing/invalid-token case as usual, no method-level override needed (unlike `PATCH /auth/change-password`, this route has no reason to diverge). `200`/`400`/`403`/`404` documented per the class convention· the `@ApiOperation` description states plainly that the route applies to pending and deactivated rows too, and that unlike `reset-setup-code` there is no `409`.
  - **Schema**: none needed. `password`/`setupCode`/`setupCodeExpiresAt` already exist as nullable `User` columns· `tokenVersion` already exists from 8f — this step only consumes it.

  **Tests, in this step**: unit in `users.service.spec.ts` (stubbed Prisma, shape of the existing `resetSetupCode`/`reactivate` tests) — activated employee nulls the password and bumps `tokenVersion`, ADMIN id 404s without writing, pending row succeeds, deactivated row succeeds without touching `isActive`. E2e in a new `reset-password.e2e-spec.ts` (shape of `reset-setup-code`'s coverage plus 8f's two-session revocation test) — old password stops working (`ACCOUNT_NOT_ACTIVATED`, not `INVALID_CREDENTIALS`, proving the null actually landed), the new code activates a new password end to end, a token held before the call 401s on its very next request afterward, ADMIN id → 404, non-integer id → 400, EMPLOYEE caller → 403, unauthenticated → 401, pending and deactivated rows behave as described above. The 8e fixture hazard (`resetDatabase()` never touching the seeded ADMIN row) cannot recur here, since this route refuses ADMIN ids by design — noted so it isn't rediscovered as a mystery.

  ⚠️ **Frontend deliberately out of scope for this step**, mirroring 8c/8e/8f. No UI, no `messages.ts` entry needed (no new error code exists to map).

---

## Frontend

### Read this before any frontend step

Everything below applies to all of steps 9–13.

**Where the mockups stand.** Step 0 built all eight screens with fake data, and they were approved as a **visual specification**. They are kept and rewired, not rebuilt — with the classification below. The reason is specific to how this project is being built: the best-documented failure of AI-generated frontends is *inconsistency between independently generated files* ("as if ten developers worked without talking to each other"). Eight screens that already agree with each other are the only thing enforcing one visual language across eight separately-built steps.

| | Files |
|---|---|
| **Untouched** | `components/ui/*`, `index.css`, Vite/Tailwind config |
| **Markup stays, data source changes** (mocks → API) | `Header`, `ClockButton`, `ShiftList`, `EmployeeList`, `CycleNavigator`, `PayrollOverview`, `TeamPage`, `ShiftHistoryPage`, `PayrollPage`, `App.tsx` |
| **Visual structure stays, internals rewritten** (`useState` → react-hook-form + zod) | `LoginPage`, `SetInitialPasswordPage`, `ShiftForm`, `EmployeeForm`, `SettingsPage` |
| **Replaced** | `PayrollBreakdown` → two components (step 12) |
| **Deleted** | `MonthSummary` (step 10), `mocks/data.ts` (when its last importer goes) |

✅ **`mocks/data.ts` is gone, deleted in 13-3 as planned.** It was imported by **13 files** when step 9 began — including `App.tsx` and `Header.tsx` — and every frontend step detached its own, the file going only when the last one did: **13 → 5** across steps 9–12, then `PayrollOverview` (13-1), `SettingsPage` (13-2), and finally `TeamPage`, `EmployeeList` and `EmployeeForm` together in 13-3, at **5 → 4 → 3 → 0**. `frontend/src/mocks/` held nothing else and was removed with it. The rule it enforced — *a step is not finished while a file it owns still imports from `@/mocks/data`* — has no remaining subject and is kept here only as the record of how the rewiring was sequenced.

**Five doors, and nothing goes around them.** Each exists because a second implementation of the same thing is how this codebase gets a bug that nobody can see. *(Four until step 12, which added the fifth for the same reason the other four exist — see §12.)*

| Door | Rule |
|---|---|
| `api/` | Every HTTP call. **No component or page ever calls `fetch`.** |
| `hooks/useApiQuery` | Every read. **No page writes its own `useEffect` + `fetch`.** |
| `lib/datetime.ts` | Every date/time format and parse. **No component calls `new Date`, `toLocaleString` or `toLocaleDateString`.** |
| `lib/format.ts` | Every number a user reads — hours, rates, money. **No component calls `toFixed` or `toLocaleString`.** *(step 12)* |
| `lib/messages.ts` | Every string a user reads — labels and error text alike. **Nothing written inline in JSX.** |

⚠️ **`lib/` imports nothing from `api/`.** `api/client.ts` already depends on `lib/messages.ts`, so an import the other way closes a cycle that `verbatimModuleSyntax` hides today and a value import would make real. Caught in the step 12 review; the invariant is in architecture.md.

**Never, in any frontend step:**
- No `axios` — native `fetch`, wrapped once in `api/client.ts`
- No TanStack Query or other server-state library
- ~~No toast library~~ — **lifted in step 11**, as the reconsideration reserved here always allowed. `sonner` is now the one confirmation mechanism for a write that changes nothing on screen· see §11 and architecture.md § Invariants. It does **not** reopen clock-in, which stays toast-free for the reason recorded in §10
- No arithmetic on payroll figures — no `Math.round`, no summing a column, no recomputing a total. Print what the server sent
- No cycle-boundary maths — the backend returns `cycle`/`prevCycle`/`nextCycle`/`cycleStart`/`cycleEnd`, the client echoes them back
- No new dependency without asking, with the exceptions already approved here: `zod`, `react-hook-form`, `@hookform/resolvers`, `vitest`, `@playwright/test`, and shadcn components pulled from the registry

**⚠️ Five things this stack does differently from what most examples show.** They are written out in architecture.md § Stack Traps. Read that section before writing a component — it covers Base UI vs Radix (including the **missing `Form` component**), Tailwind v4's CSS-first config, the `zodResolver`/`z.coerce` type failure, where to mock in a Vitest test, and React Router's declarative mode. Getting the first two wrong fails **silently**.

**Routes and roles — explicit, never inferred.** AI-generated authorization defaults to permissive (a 2026 review found IDOR in four of six generated codebases), so this table is the contract, not a hint:

| Route | Who |
|---|---|
| `/login`, `/activate` | public |
| `/` | redirect — ADMIN → `/team`, EMPLOYEE → `/clock` |
| `/clock`, `/shifts`, `/payroll` | **EMPLOYEE only** |
| `/shifts/:userId`, `/payroll/:userId` | **ADMIN only** |
| `/team`, `/payroll-overview`, `/settings` | **ADMIN only** |

The paramless routes are EMPLOYEE-only because the endpoints behind them (`/time-entries/me`, `/payroll/me`) are. An admin has no shifts and no `hourlyRate`.

**A frontend step is done when:** the happy path works against the real backend· loading, error and empty states all exist· role restrictions match the table above· no file it owns still imports `@/mocks/data`· every string comes from `messages.ts`· `npx tsc -b` and `npm run lint` are clean· and its Vitest specs pass.

**Dependencies and components — installed 2026-08-28, before step 9.** `zod@4.5.1`, `react-hook-form@7.86.0`, `@hookform/resolvers@5.9.1` (dependencies) and `vitest@4.1.11` (dev), each checked against the registry for peer compatibility with React 19.2, Vite 8.1 and Node 22.14. From the registry: `field`, `select`, `alert-dialog`, `switch`, plus `separator` which `field` requires. `label` and `button` were already present and reported **identical** to the registry copy, so nothing was overwritten. `jsdom` and `@testing-library/react` were deliberately **not** installed — step 9's specs are pure functions, and the decision is deferred to the first step that genuinely needs a DOM. ⚠️ **That step turned out to be 10**, where they were installed: `jsdom@29.1.1`, `@testing-library/react@16.3.3` and its `@testing-library/dom@10.4.1` peer, all dev-only. ⚠️ **jsdom 30 was rejected on a measurement, not a preference** — it requires Node `^22.22.2` and this machine runs 22.14.0· 29 asks for `^22.13.0`. The DOM is opted into **per file** (`// @vitest-environment jsdom`), so the existing node-env specs are untouched, and `globals: true` was **not** enabled — it is what RTL's automatic cleanup depends on, and each DOM spec calls `cleanup()` itself instead of every existing spec inheriting a new global surface.

**⚠️ The MCP servers were considered and declined** (2026-08-28), so this is settled rather than parked. The shadcn MCP's value is registry discovery, but the one discovery that mattered — that `base-nova`'s `form` is an empty shell — came from reading the raw `form.json` and seeing `files: 0`. A natural-language layer asked *"does shadcn have a form component?"* would likely answer yes, because the item does exist. Against that, `.mcp.json` would pin `shadcn@latest` (4.19.0) beside the local 4.16.0 that actually wrote these components — a second floating copy of one tool, in a project whose stated fear is divergent dialects. The registry is plain HTTP; query it directly when something is needed. The **Playwright MCP** was not set up either· revisit at step 13b, where a real browser is the point.

---

- [ ] **9. Auth & Layout**

  Establishes four patterns every later step copies. Build them properly here and steps 10–13 are mostly wiring.

  **`api/client.ts`** — the single `fetch` wrapper.
  - Attaches `Authorization: Bearer <token>` when a token exists
  - `AbortSignal.timeout(...)` for a request ceiling — no manual `AbortController` plumbing needed
  - Throws a typed `ApiError` carrying `status` and the response's **`code`** (from step 8c). **It never reads `message`** — backend wording is for tests, Swagger and logs, never for a screen
  - Handles `204` (no body) without trying to parse JSON
  - ⚠️ **Auto-logout fires only when the failed request carried a token.** `401` on `/auth/login` means "wrong password" and belongs in the form; `401` on a request that sent a token means the session is dead — clear it and redirect to `/login`. The discriminator is *"did we send an `Authorization` header?"*, never a list of endpoints someone must remember to update
  - ⚠️ **A network failure is not a `401`.** No response means no logout — keep the token, show the error, offer a retry

  **`AuthContext`**
  - **Only the token is persisted**, in `localStorage`. The user object is never stored — it comes from the login response at login, and from `GET /users/me` on boot
  - On mount: no token → done. Token → call `GET /users/me` and hold rendering behind an `isBootstrapping` state until it answers. `401` → clear and go to `/login`. Network error → error state with retry, **token kept**
  - Why verify instead of trusting storage: `role` decides which pages render, and a stored role is user-editable — the app would draw admin pages for anyone who edits one word in devtools (no data leaks, the API still answers 403, but it is a screen nobody should see). It also keeps the name fresh and closes the one hole left in the "deactivation takes effect immediately" rule, which the backend already enforces per request. Cost is one request per **tab open**, not per navigation — the context mounts above the router
  - `login()` stores the token and sets the user from the response — no follow-up `GET /users/me`
  - `logout()` clears the token and the user

  **`hooks/useApiQuery`** — returns `{ data, error, isLoading, refetch }`.
  - Takes a fetcher and a dependency array; refetches when the deps change
  - ⚠️ **Carries the ignore-flag cleanup.** Clicking ◀ three times fast can resolve out of order and leave the page showing one cycle's data under another cycle's header. The same flag also explains the doubled requests React 19 StrictMode makes in development
  - Writes do **not** go through it — after any write the page calls `refetch()` explicitly

  **`ProtectedRoute`** — role-aware, per the table above. Unauthenticated → `/login`. Wrong role → that role's home (`/team` or `/clock`), never a blank screen.

  **`lib/datetime.ts`** — the only place dates are formatted or parsed.
  - Every formatter passes `{ timeZone: "UTC" }`. The backend is UTC end to end (`cycle.util.ts`, `rate-zones.util.ts`) because the app targets Iceland, which stays on UTC all year
  - `toIsoUtc(value)` converts a `datetime-local` value by **appending `":00.000Z"`**. ⚠️ **Never `new Date(value).toISOString()`** — that reads the value as local time and shifts it by the developer's offset, which moves the shift into a different rate zone and changes someone's pay. It looks correct and no backend test can catch it
  - `formatDate` for the payroll `date` string, which is a bare `YYYY-MM-DD` and prints as the previous day in a negative-offset browser

  **`TimezoneNotice`** — a thin bar in `AppLayout`, so it appears on every protected page.
  - Rendered **only when `new Date().getTimezoneOffset() !== 0`**. Invisible in Iceland; visible to anyone developing or travelling elsewhere
  - Zone and difference come from the **browser** (`Intl.DateTimeFormat().resolvedOptions().timeZone`), never from IP or an external service. The correct question is "does your clock differ from UTC", not "which country" — Athens needs a different sentence in January than in August, and one IP cannot express that
  - Not dismissible — someone who dismisses it then types a shift three hours wrong
  - ⚠️ Offsets are not always whole hours (India +5:30, Nepal +5:45). Format minutes, never `offset / 60`

  **`Header` / `Footer` / `AppLayout`** — reads the real user from `AuthContext`. ⚠️ [`Header.tsx`](../frontend/src/components/layout/Header.tsx) and [`App.tsx`](../frontend/src/App.tsx) currently import `currentUser` from `@/mocks/data`; the `VIEW_AS_ADMIN` constant and both imports die here.

  **`LoginPage` / `SetInitialPasswordPage`** — the first two forms, and they set the pattern: **react-hook-form + zod + shadcn `Field`**, from the very first one. Field-level errors (zod, before any request) render under the field; request-level errors (from the `code`) render above the submit button. `LoginPage` keeps its **"Activate your account"** link.

  ⚠️ **`Field`, not `Form` — this line used to say `Form`, and that component does not exist here.** In the `base-nova` style `form.json` is an empty shell, so `npx shadcn add form` writes nothing and reports no error; there are no `<Form>`/`<FormField>`/`<FormMessage>` components to import. See architecture.md § Stack Traps #1 for the measurement. `field.tsx` is installed and is presentational only, so **the binding to react-hook-form is written by hand here and copied by the other four forms** — nothing in the library enforces that they agree. `FieldError` takes react-hook-form's error shape directly: `<FieldError errors={[errors.email]} />`.

  ⚠️ **Do not use `z.coerce` in any schema.** It typechecks nowhere on this stack — see architecture.md § Stack Traps #3, where it is measured along with the two fixes. Neither of these forms needs it; `SettingsPage` and `EmployeeForm` (step 13) are where the temptation arises, and the answer there is `z.number()` plus `register(..., { valueAsNumber: true })`.

  **New error copy in `messages.ts`** (and recorded in spec §8a): the `429` text (deferred here from step 3 — the framework's `"ThrottlerException: Too many requests"` is never shown), a network-failure message, and a **session-expired** message shown on `/login` after an auto-logout, so being thrown out reads as an explanation rather than a glitch.

  ⚠️ **One code can need two sentences — design `ERRORS` so that is expressible.** The flat `Record<ErrorCode, string>` is the right default and most codes want nothing more: `EMPLOYEE_NOT_FOUND` reads the same on all seven operations that return it, and `INVALID_CYCLE` on all five. **`ACCOUNT_ALREADY_ACTIVATED` is the exception**, because the *audience* changes rather than the fact: on `/activate` an employee is being told about **their own** account (right answer: say so and send them to `/login`), while on Team an admin is being told about **someone else's** (right answer: their list is stale, refresh it). The backend is not wrong to use one code — the fact really is the same — so this is a client-side concern and it is recorded here rather than fixed there.

  The risk is not a clumsy sentence; it is that step 13, finding nowhere to put the admin's wording, writes a string inline in JSX and breaks the "every string comes from `messages.ts`" invariant. Give the map a per-screen override (a second optional lookup consulted before `ERRORS`, keyed by screen) or split the code then — but decide it **here**, while `messages.ts` is being written, not there.

  Note the general principle this is an instance of, because it recurs: **the page always knows which request it sent.** `/activate` only ever calls `set-initial-password`, Team only ever calls `reset-setup-code`, and the Clock page knows whether it pressed Clock In or Clock Out. A code is needed to tell apart failures of *one* call, never to tell apart *which* call failed.

  **Vitest, in this step**: `toIsoUtc` and the formatters (including a shift crossing midnight and a month boundary), and `client.ts`'s decision logic — 401-with-token logs out, 401-without-token does not, a network error does not. ⚠️ **Mock `fetch`, not `request()`** — mocking the wrapper you are testing proves only that the mock works, and hides a wrong header or a malformed URL.

- [ ] **10. Clock Page** (EMPLOYEE only — the admin has no clock and lands on Team instead)

  **The page is the button, plus one line about the open shift. Nothing else.**

  ⚠️ That line is an amendment of 2026-08-29, and the boundary it draws matters: "nothing else" was written to kill the month summary — the **wrong arithmetic** — not to forbid printing a field the response already carries. The rule that survives is *no hours, no money, no list*.

  **`ClockButton`**
  - On load, reads `GET /time-entries/open` → `{ openShift }` to decide its label. ⚠️ It **cannot** read this from the shift list: a shift started in the *previous* cycle is filtered out of the current one, so the button would render "Clock In" for someone already clocked in, and the clock-in would then fail
  - The response is deliberately **wrapped** — a bare `null` return makes Nest send an empty body, which `res.json()` would choke on. Read `data.openShift`, not `data`
  - **While a shift is open, one line under the button** prints its `startTime` through `lib/datetime.ts` in UTC: *"Clocked in since 28 Aug 2026, 22:40."* Already in the payload — no second request, no arithmetic. ⚠️ It shows the **date**, which is what lets someone who forgot to clock out the day before yesterday see it on the page they open every day; a "Clock Out" label alone cannot say that
  - ⚠️ **No toast, and this is the deliberate reason.** Clock-in changes two things at once — the button's text and colour, and this line appearing where there was nothing — so the confirmation is structural and **permanent**, where a toast lasts four seconds. The one recorded exception to the "no toast library" rule stays reserved for `ShiftForm` in step 11, where a save into a neighbouring cycle changes nothing on screen at all
  - **While the state is unknown, no button renders.** Loading shows a placeholder the size of the button; a failed load shows the error text and a **Retry** that calls `refetch()`. ⚠️ A disabled button still has to print a label, and printing "Clock In" to someone already clocked in is precisely the failure this endpoint exists to prevent — so the button is withheld, not disabled
  - Clock In → `POST /time-entries/clock-in` (empty body). Clock Out → `PATCH /time-entries/clock-out` (no `:id` — it closes the caller's own open shift)
  - ⚠️ **The client never sends a time.** The server writes `startTime = now` and `endTime = now` itself. This is why clock in/out is immune to a wrong clock or a foreign timezone — and why nothing here needs `lib/datetime.ts` except display
  - After either call, `refetch()` the open-shift query so the label follows the truth rather than an assumption — **after every attempt, success or failure** (decision of 2026-08-29). One rule rather than a list of codes to keep updated, and it is the only thing that answers the two cases that matter: `OPEN_SHIFT_EXISTS`/`NO_OPEN_SHIFT` mean the label was stale (a second tab, a clock-in from a phone) and without a refetch the user presses the same wrong button forever· and after a **timeout** nobody knows whether the write landed. Same reasoning as `client.ts`'s auto-logout discriminator: a rule, never a list
  - Disable the button while a request is in flight — it is the largest control on the page and a double-tap on mobile is the exact scenario the backend's partial unique index exists to survive
  - Failure renders **next to the button**, not as something that disappears: "you already have an open shift" is an instruction, and the user has to act on it

  **`MonthSummary.tsx` is deleted.** Its `Math.round(totalHours * hourlyRate)` is a flat-rate calculation, which under four rate zones is materially wrong for anyone working evenings or weekends — it cannot be rewired, only replaced. Deleting it also makes this step **independent of step 12**: the Clock page needs only the two clock endpoints and `/time-entries/open`.

  **Vitest, in this step — the first DOM tests in the project.** `useApiQuery` was built in step 9 with **no consumer and no test**, and this is where it gets both. It earns the harness rather than the button does: its ignore-flag logic is what stops three fast clicks on ◀ (step 11) from leaving one cycle's rows under another cycle's header — a wrong answer that looks entirely right. Covered: an out-of-order resolution keeping the newer result, `refetch()` re-running, and an `ApiError` arriving as its `code` while anything else degrades to `UNKNOWN_ERROR`. `ClockButton` is tested too, and is honest about why: label from `openShift`, no button while loading or failed, disabled through the write **and** the refetch behind it, error text beside it. Step 13b re-covers that behaviour in a real browser — its value here is proving the new harness works on something with two states, before step 11 points it at a dialog form.

  ⚠️ **Parked deliberately, revisit after step 13 with the app in daily use:** whether a summary returns. If it does, it is **`totalHours` and `totalPay` read straight from `GET /payroll/me` with no arithmetic**, plus the `hasOpenShift` warning — because while someone is clocked in, their current shift is unpayable and absent from the figure, and without that line the number looks wrong. It would be an **independent** query: if `/payroll/me` fails, the summary shows an error and the **button keeps working**. The button is the function of this page; a summary is information.

- [ ] **11. Shift History**

  One page, two routes: employee at `/shifts` (their own, always), admin at `/shifts/:userId`. Same components, same response shape — the admin route differs only in which endpoint it calls and in showing the employee's name. ⚠️ That name comes from the **list response itself** (`userId`/`name`, added in step 8d) — never from a second call to `GET /users`, which would download the whole team, every pending `setupCode` included, to print one heading.

  **Data**: `GET /time-entries/me?cycle=` (employee) or `GET /time-entries?userId=&cycle=` (admin). Identical shape by design.

  **`?cycle=` lives in the URL**, via `useSearchParams` — not component state.
  - Refresh keeps your place, and `/payroll/3?cycle=2026-07` is a link an admin can send
  - It is also what lets step 13's overview drill-down land on the cycle the admin was looking at, instead of resetting to the current one
  - ⚠️ **`replace`, not `push`.** Five clicks on ◀ otherwise leave five history entries, and Back walks the user cycle by cycle instead of leaving the page
  - Omit the parameter entirely on first load — the backend resolves "the cycle containing now", which is **not** the current calendar month
  - A malformed value (someone edits the address bar) is a failed load: page-body error with Retry

  **`ShiftList`** — columns **# / Start / End / Notes / Actions**, plus a marker driven by `isSplit`.
  - **`#` is the row's position in the cycle** (newest first, from 1) — a reading aid, never the entry's id
  - ⚠️ **Start and End each carry the whole instant**, `Thu 07-May 11:05`, which is why there is **no shared Date column**: an overnight shift ends on a different day than it starts, and one cell could print only one of them. The **weekday** is load-bearing — weekends are paid at +45% all day, so it is what lets someone check a payslip against this list. No year, safely: a cycle spans ~30 days and the years are in the header above
  - ⚠️ **No hours or duration column.** The API deliberately returns no hours figure (spec §4, decision 5f), and the frontend must not compute one: a **split** shift appears in *both* cycles with its full `startTime`/`endTime`, so a duration column would show 7h twice for one 7-hour shift — reintroducing exactly the double-count that splitting exists to prevent. The clipped portion is not in this response and cannot be derived without cycle maths, which is forbidden. Hours live on the Payroll page, per zone, once
  - The red **"Open"** badge marks `endTime === null` — this list is the only screen where someone who forgot to clock out can find it
  - The split marker is what explains the same shift appearing in the neighbouring cycle
  - Times are rendered through `lib/datetime.ts` (UTC), never `toLocaleString`
  - Edit and Delete are **disabled** when the per-entry field from step 8c says this caller may not edit the row, with a short explanation. Always enabled for an admin
  - **Add Shift is disabled when the response's `canWrite` is `false`** — an employee looking at a closed cycle. Read the flag· never work it out from the dates on screen

  ⚠️ **Decide here: the open-shift block is not covered by either flag.** `canWrite` and `canEdit` report the **cycle lock only**. While an employee has an open shift they may also not `POST` or `PUT` (spec §7a) — so on this screen, clocked in, Add and Edit render enabled and answer `400 OPEN_SHIFT_EXISTS`. That is the exact failure `canWrite` was invented to prevent for closed cycles, left open for a different reason.

  It was parked rather than fixed because the fix is a **product** decision, and this is the step where its cost is visible: today `DELETE` is deliberately *exempt* from the open-shift block (an employee may delete an open shift instead of clocking out), and no single per-row boolean can say "Edit no, Delete yes". Two ways out:
  - **Accept it.** The 400 is actionable ("clock out first") and renders inline. Nothing changes.
  - **Make the rule uniform** — an open shift blocks `POST`, `PUT` **and** `DELETE` — and add one response-level flag beside `canWrite` for it (proposed name `blockedByOpenShift`, kept separate so each flag carries one reason and the UI can say *which*). Verified safe: clock-out is never blocked, so there is no dead end, and an open shift older than the write window is already locked by rule 5 either way. Costs one query per employee list request, inverts one e2e test, and rewrites the rule in spec §7a, architecture.md, build-plan §5 and the `DELETE` Swagger entry.

  Deciding **during** this step is still a one-sided change: `ShiftList` is being written here anyway. Deferring past it is not.

  **`ShiftForm`** — a dialog, for add and edit.
  - `POST /time-entries` / `PUT /time-entries/:id`. react-hook-form + zod
  - **Two `datetime-local` inputs** — date *and* time at both ends. When the start is set, **prefill the end's date to the same day**. Same-day shifts then need no extra typing, and an overnight shift forces the user to move the end date explicitly, which is the point: they see that it crosses midnight instead of the form guessing for them. A single-date-plus-two-times layout cannot express `20:00 → 03:00` without inferring "+1 day", and that inference makes a zero-length shift (which the API allows) impossible to enter
  - Values are converted with `toIsoUtc()` — append `Z`, never `new Date(...)`
  - **End Time is required.** The manual path always writes a *closed* shift; clock in/out owns live ones
  - Inline hint beside the time fields: times are Iceland time (UTC), not local
  - **`userId`**: required when an admin submits (the employee whose page this is), rejected when an employee does. Without it on the admin route the shift is written to the admin's own account, which has no `hourlyRate` and appears on no page — invisible and never paid
  - zod catches end-before-start and future times before any request, so the `400` that does arrive is almost always an overlap
  - ⚠️ On edit, send **all three** fields. `PUT` is a full replacement — omitting `notes` **erases** existing notes. There is an e2e test asserting this; do not "optimise" the form to send only changed fields
  - Delete asks for confirmation first. It is permanent — there is no soft delete and no restore for time entries. The dialog names the shift being deleted and says it cannot be undone. *(Wording and dialog styling are open.)*

  **`CycleNavigator`** (◀▶) — sends back the `prevCycle`/`nextCycle` key it was given and prints `cycleStart`/`cycleEnd` as received. **It computes nothing** — not even a month rollover.

  ✅ **The recorded revisit was taken here, and the answer is `sonner`.** `ShiftForm` is a dialog that closes on success, so it cannot show its own confirmation — and a shift saved into a *different* cycle than the one on screen produces **no visible change at all**: the dialog closes, the list is identical, and it looks like nothing happened.

  The decision was made **in this step rather than in 13** on purpose: Team and Settings carry at least five more writes with the same property, and the alternative was five pages inventing five confirmations. Settings is the sharpest of them — saving there leaves the same page with the same values, which §13 already flags as needing an explicit confirmation more than any other screen.

  ⚠️ This does **not** reopen clock-in. §10's reasoning holds unchanged: that write alters the button's label *and* adds a line beneath it, so its confirmation is already structural and permanent, where a toast lasts four seconds.

  Two things about the component are recorded in architecture.md § Invariants rather than here, because they are measurements a future step must not re-derive: `npx shadcn add sonner` writes a file that **does not compile** in a Vite project (it imports `next-themes` and a Next.js route path), so `ui/sonner.tsx` is hand-trimmed· and the cross-cycle toast carries **no action button**, because naming the destination cycle would mean resolving cycle boundaries client-side, which an invariant forbids. Whether the shift is visible needs no arithmetic — the row is absent from the refetched list — so the toast says that and stops.

  **Vitest**: `toIsoUtc` round-trips for an overnight shift and one crossing a month boundary.

- [ ] **12. Payroll Breakdown**

  Same two-route pattern: `/payroll` (employee, own) and `/payroll/:userId` (admin). `?cycle=` in the URL, exactly as step 11.

  **Data**: `GET /payroll/me?cycle=` or `GET /payroll/:userId?cycle=`.

  ⚠️ **The step-0 `PayrollBreakdown` is a draft and is replaced, not extended.** It renders one Date/Hours/Pay table computed in the browser (`hoursBetween`, `isWithinCycle`, `Math.round` per row) — all of which is backend work now, and all of which produces different numbers than the server under four rate zones.

  **Two components**, both shared by the two routes:
  - **Summary** — `Zone | Hours | Rate | Total Pay`, one row per zone plus a **Total** row
  - **Day table** — `Date | Day | Evening | Night | Weekend | Total`, one row per date, **hours only, no money**

  **The rules that make this page correct:**
  - ⚠️ **No arithmetic. None.** Print `totalHours`, `totalPay` and each `day.totalHours` **as sent** — never re-add the column. The cells are decimals, and summing them in JavaScript disagrees with the server's figure about a third of the time (`1.99 + 22.35 + 2.92` → `27.259999999999998`). The server's totals are exact sums of rounded parts; a browser re-sum is a second, competing answer
  - **Zone columns and rows are generated from the `zones[]` array**, never hardcoded. A fifth zone must appear with no frontend change — that was the condition the four-zone decision was taken under
  - Zone **labels come from the response** (`zones[].label`) and are printed verbatim. The client never composes its own "+33%" — a label that stops matching its factor would make the page misstate a wage
  - ⚠️ **`date` is formatted as UTC**, through `lib/datetime.ts`. `new Date("2026-07-25")` in a negative-offset browser prints the 24th, which would move a Saturday's weekend hours onto a row labelled Friday
  - Show the **`hasOpenShift`** warning when set. It is the only thing explaining a day missing from the table because someone forgot to clock out — without it, that gap reads as a bug
  - Only dates with hours appear. An empty cycle is an **empty state**, not a blank table

  The mock helpers `hoursBetween`, `isWithinCycle` and `getMockCycle` are mock-only and must not survive into a real component.

  ✅ **Three decisions taken in this step, recorded so step 13 copies rather than re-derives them.** All three are invariants in architecture.md now.
  - **`lib/format.ts` — a fourth door**, alongside `api/`, `useApiQuery`, `datetime.ts` and `messages.ts`. `formatHours`/`formatRate`/`formatIsk`, locale pinned to `en-GB`. Decided here rather than in 13 for the same reason `sonner` was decided in 11: step 13 prints the same three kinds of figure in at least four more places (`totalCost`, the overview rows, `hourlyRate` on Team, the rate in `EmployeeForm`), and the alternative was four screens inventing four formats. ⚠️ `formatRate` **never** rounds — the measured cost is in the invariant.
  - **The day table's headers come from a local map keyed by `zone`, falling back to `zones[].label`.** §8a fixes two different sets of words and both are binding. The percentage is never copied locally.
  - **A zero renders as `—` in a day-table cell and as `0.00` in the Total row.** Deliberate: a totals row is a row of totals, and a dash there reads as "not computed" rather than "none".

  ⚠️ **`?userId=` that is not an integer still fires a request** (`/payroll/abc` → `GET /payroll/NaN` → 400, discarded· the page has already rendered `EMPLOYEE_NOT_FOUND` from its own guard). Identical in `ShiftHistoryPage` since step 11, and **left alone knowingly**: fixing it on one of two twin pages is worse than the 400 it saves. If it is ever fixed it is fixed in both, or in `useApiQuery` — which would introduce a third state (`enabled`) that all three consumer pages would have to be re-read against.

### Step 13 — split into three (2026-08-31)

⚠️ **Split before any of it was built.** As one step it was three pages, ~9 endpoints and ~6 components — roughly the sum of steps 10, 11 and 12, each of which was a single page. The reasoning is the one that already split `8b` into `8b-1`/`8b-2`, and the naming follows it deliberately: a step closes with a manual sweep, a `/review` and a spike, and step 12's `/review` produced **six findings across two components**. Across six components at once a red result is ambiguous — and this project has **five recorded measurement errors, every one of them in the harness rather than the code**.

⚠️ **`13a` and `13b` are deliberately not reused as labels.** `13b` is the Playwright step and is referenced in ~12 places across the four context files — and it was itself named `13b` rather than `14` precisely to avoid this class of rename. `13a` was **abolished** on 2026-08-26 and the spec says so in writing (*"There is no step 13a"*); reviving the label would give two different things the same name in the same file.

**The order is Overview → Settings → Team**, which is *not* the order §8 lists the pages in. Each pass earns the next:

| | Why it sits here |
|---|---|
| **13-1 Overview** | A pure read that introduces **no new pattern at all** — it copies `CycleNavigator` (step 11), `lib/format.ts` and the `<tfoot>`/`<th scope="row">` structure (step 12). The cheapest possible proof that step 12's patterns actually transfer. |
| **13-2 Settings** | The first write, on the smallest surface in the project (one `<select>`, two endpoints) — and the page where the **toast-after-write rule** is fixed, for the same reason `sonner` itself was decided in step 11 rather than here: the alternative is each page inventing its own confirmation. |
| **13-3 Team** | Last because it is the only one that is genuinely large — six endpoints, two dialogs, three badges, a filter. By then the toast rule and the confirmation-dialog pattern exist to be copied instead of invented. |

The three are independent — none reads another's data — and each detaches its own importers of `@/mocks/data` (**5 → 4 → 3 → 0**), so **13-3 is the step that deletes the file**.

---

- [ ] **13-1. Admin — Payroll Overview**

  **`PayrollOverviewPage`** — one call to `GET /payroll/overview?cycle=`, `?cycle=` in the URL as in steps 11–12.
  - Response shape, read off `PayrollOverviewResponseDto` rather than assumed: the shared cycle block (the DTO extends `CycleRangeDto`), `totalCost`, and **`rows[]`** of `{ userId, name, totalHours, totalPay, hasOpenShift }`. ⚠️ The array is **`rows`**, not `employees`
  - Rows arrive **sorted by name**, already include any deactivated employee with hours in the cycle, and carry their own totals. The mockup's per-employee `reduce` and its client-side `hasOpenShift` both go
  - `totalCost` is printed **as sent** — never re-added from the rows. Same rule as step 12's Total row and the same reason: the server's figure is an exact sum of already-rounded wages, while a browser re-sum is a second, competing answer
  - Clicking an employee → `/payroll/:userId?cycle=<same cycle>`. ⚠️ Carrying the cycle is the whole reason it lives in the URL: without it the admin drills into a number they saw in July and lands in August
  - The open-shift indicator comes from the response
  - `api/payroll.ts` gains `getPayrollOverview()` and its types, beside the two readers from step 12
  - An **empty `rows[]`** is an empty state, not a table of nothing. ⚠️ **This line said "a company with no employees yet, *or none with hours*", and the second half was wrong** — corrected in 13-1 against real data: every **active** employee is listed even at zero hours, so "nobody worked this cycle" arrives as a table of zeros and is not this state at all. `rows[]` is empty only when there is nobody employed
  - ⚠️ **The `totalCost` card still renders there, at 0** — this line previously said it "does not render", and the decision was reversed in 13-1 (`/architect`, user's call). Hiding it makes an empty team read as a **broken screen** rather than an empty one, and the card is the page: the total is what the admin opened it for, with the table below explaining where it comes from
  - Detaches `PayrollOverview.tsx` from `@/mocks/data` (**5 → 4**)

  **Nothing is invented here, and that is the point.** `CycleNavigator`, `useApiQuery`, `?cycle=` in the URL with `replace`, `lib/format.ts`, the `<tfoot>` carrying `<th scope="row">` — all of it already exists. If any of it fails to transfer, this is the cheapest place in the project to find that out.

  **Vitest**: `rows[]` rendered as given· `totalCost` printed and never summed· the drill-down link carrying the cycle· loading, error and empty states.

- [ ] **13-2. Admin — Settings**

  **`SettingsPage`** — `GET /settings`, `PUT /settings`.
  - ⚠️ **`api/settings.ts` does not exist yet.** `architecture.md` § Folder Structure lists it, but nothing has needed it until now — this step creates it. `SettingsResponseDto` is `{ cycleStartDay, cycleEndDay }`, and `PUT` requires **both**
  - ⚠️ The mockup's two free number inputs (1–31) become **one `<select>` of 11–25**, with the end day beside it as derived **text** ("Cycle ends on the 24th of the following month"). The request still sends both fields; the admin simply cannot produce an invalid pair. Backend validation stays regardless — the two are layers, not duplicates
  - react-hook-form + zod, as every form since step 9. ⚠️ **No `z.coerce`** — it does not typecheck on this stack (architecture.md § Stack Traps #3). ⚠️ **This line used to prescribe `z.number()` plus `register(..., { valueAsNumber: true })`, and that was wrong** — corrected in 13-2 against the installed types rather than by preference. `register`/`valueAsNumber` is the idiom for a **native** `<select>`, which yields a string· the page uses the shadcn/**Base UI** `Select`, whose `SelectRoot<Value>` is *generic over its value type* (`@base-ui/react@1.6.0`, `select/root/SelectRoot.d.ts`). Bound through `Controller`, the field holds a `number` end to end and there is nothing to convert. ⚠️ `onValueChange` is typed `Value | null`, so the binding has to handle the `null`
  - ⚠️ **Saving changes nothing visible on screen** — same page, same values. This page needs an explicit confirmation more than any other, or the admin clicks Save three times
  - Detaches `SettingsPage.tsx` from `@/mocks/data` (**4 → 3**)

  **The toast rule is decided in this step and copied by 13-3**, rather than each page choosing for itself — the same move `sonner` (step 11) and `lib/format.ts` (step 12) already made, and for the same reason. The rule, now an invariant in architecture.md: **a successful write is confirmed by a toast when the screen the user is left on cannot show that it happened.** It names what steps 10 and 11 already decided rather than inventing anything — clock-in takes no toast because it rewrites the button *and* adds a line beneath it, `ShiftForm` takes one because the dialog closes onto an unchanged list. For 13-3 it answers deactivate (**toast** — the row vanishes behind the filter and that reads as a hard delete) and create (**none** — the setup-code dialog opens, which is louder than any toast).

  ✅ **Resolved here: changing `cycleStartDay` warns, in two places, and they are not redundant.** A permanent line under the select says what the setting does to the past *before* an admin chooses· an `AlertDialog` on submit says it again at the moment it is actually done. Payroll is recomputed on every request and never frozen, so moving the boundary **re-slices every past cycle** — the same property that made admin-editable rate-zone percentages a *forbidden* feature. The field is deliberately editable, so the answer was never to lock it.

  ⚠️ **The dialog is not a new pattern — `DeleteShiftDialog` has been one since step 11**, and 13-2's first draft rebuilt it instead of copying it, with the *opposite* behaviour on failure. `ChangeCycleDialog` now mirrors it exactly: `onConfirm` rejecting keeps the dialog **open** with the reason inside it, both buttons disable while the write is in flight, and the page owns the write. A confirmation that closes on failure returns the user to a screen that looks unchanged — which is the very question they were asking.

  ⚠️ **`cycleEndDay = cycleStartDay - 1` is one function, `deriveCycleEndDay()` in `api/settings.ts`, and never written inline.** The client is *forced* to compute it (`PUT` requires both fields, `GET` offers no pair), so the only question is how many copies of the rule exist. The first draft had **three** — the sentence under the select, the request body, the dialog's text — which is how a page comes to *say* one day and *send* another. It is not the forbidden client-side cycle arithmetic: it resolves no boundary and produces no date, and the backend re-validates it with `@IsDayBefore`.

  **Vitest**: the `<select>` offers exactly 11–25· the derived end-day text follows the selection· submit sends **both** fields, as numbers rather than the strings a native select would yield· the confirmation appears before any write· **Cancel writes nothing**· the dialog stays open on failure and closes on success· Save is disabled until something changes and goes quiet again afterwards.

- [ ] **13-3. Admin — Team**

  **`TeamPage`** — where an admin lands after login. Data: `GET /users`, which returns EMPLOYEE rows only (never the admin) and **includes deactivated ones**.

  ⚠️ **Three states, not two.** The response carries both `isActive` and `hasActivated`, and the mockup's two badges get the third case wrong: a deactivated employee still has a password, so `hasActivated` is `true` and they render as **"Active"** — while being unable to log in at all.

  | `isActive` | `hasActivated` | Badge |
  |---|---|---|
  | `true` | `false` | **Pending** |
  | `true` | `true` | **Active** |
  | `false` | either | **third badge — deactivated** |

  ⚠️ **The `either` in that last row hides a fourth state, and it decides more than the badge** — found in 13-3 and **measured against the running backend**, not reasoned about. `isActive: false, hasActivated: false` is reachable (deactivate anyone who never activated), and three facts compound:

  - `deactivate` writes **only** `isActive: false` — the `setupCode` survives intact (verified: code `8776` still present after the `DELETE`)
  - `POST /auth/set-initial-password` checks `isActive` **before** it looks at the code, so that surviving code returns **`401 ACCOUNT_DEACTIVATED`** (verified end to end)
  - `POST /users/:id/reset-setup-code` refuses only an *already-activated* account, so on a deactivated one it returns **`200` and issues a fresh code** (verified: `7863`) — one that cannot work either

  So the badge is correct as written, but a row in this state must **hide the code and offer no "New code"**. Otherwise the page invites an admin to hand over a secret that is guaranteed to fail — the same rule that makes `Reactivate` replace `Deactivate` one column over. The predicate is **`isPending()` in `api/users.ts`**, `isActive && !hasActivated`, and it is the single implementation: `!hasActivated` alone is the bug, and the spike proves it (inverting it turns two tests red).

  - **Deactivated employees are hidden by default**, behind a toggle that **shows a count** — `Show deactivated (3)`. The list only ever grows: nobody is deleted, so mixing them in degrades the page permanently, while a filter is ten lines. ⚠️ The count is not decoration: without it the toggle is invisible, and an admin whose seasonal employee returns will try to create a new account, hit `409 email already exists`, and have no way to understand why. Their account is there — just not on screen
  - On a deactivated row, **Deactivate becomes Reactivate** (`PATCH /users/:id/reactivate`, step 8c) — never an action that is guaranteed to fail
  - Deactivating asks for confirmation, and the dialog says what actually happens: they can no longer sign in, their shifts and payroll history are kept, and ~~it cannot be undone from the app~~. ✅ **Wording resolved in 13-3, and the struck clause was false.** `PATCH /users/:id/reactivate` was added in **step 8c** precisely so that it *can* be undone, and `Reactivate` sits on the very row this dialog is about to create. The line predates that endpoint. Saying it would frighten an admin out of a reversible action, and the first person to press Reactivate would catch the dialog lying. What the sentence does have to carry is the part that is **not** obvious — that the row *disappears* (filtered, not deleted) and that payroll history survives: *"…will no longer be able to sign in, and their row moves behind “Show deactivated”. Their shifts and payroll history are kept, and you can reactivate them here at any time."*
  - Clicking an employee → their `/shifts/:userId`
  - Editing `hourlyRate` and `name` → `PUT /users/:id` (those two fields only)

  **Creating an employee — the setup code is the whole onboarding mechanism.** It is four digits, lives **3 days**, and is the only way in.
  - `POST /users` → **a dialog opens showing the code and its expiry date**. Creating an account is really two actions — make the row, then hand the code over out of band — and without this moment the second one is invisible: the form closes and the admin thinks they are finished
  - Print the **date** ("Valid until 29 August"), not a duration. A date is actionable; "3 days" is arithmetic
  - The code **also stays in the list** on every pending row, with its expiry, so it survives a dialog closed too quickly and so an admin can see one about to lapse and chase it
  - A **New code** button on pending rows → `POST /users/:id/reset-setup-code` (step 8c)

  ⚠️ **Note the deliberate difference between the two admin pages:** Payroll Overview (13-1) *shows* deactivated employees when they have hours in the cycle, Team *hides* them by default. Not an inconsistency — Overview is one cycle's payroll, Team is a staff roster. Do not "fix" one to match the other.

  **Six endpoints, and the client has one of them.** `api/users.ts` today holds `getMe()` and nothing else. This step adds the other five reads/writes and the **`UserResponse`** type — ⚠️ **declared standalone, never derived from `UserProfile`**. That is the client side of an existing invariant: the admin's view of other people carries `setupCode`/`setupCodeExpiresAt`/`isActive`/`hasActivated`, the self-view carries none of them, and subtractive derivation leaks by default. All four write endpoints return the **full** `UserResponseDto`, `reset-setup-code` included — so the new code comes back in the response and needs no follow-up read.

  **Email is a create-only field.** `PUT /users/:id` accepts `name` and `hourlyRate` only, so `EmployeeForm` in edit mode must not offer it — an editable input whose value the API silently ignores is worse than no input.

  ⚠️ **"Silently ignores" was wrong, and the correction makes this mandatory rather than tidy.** Measured in 13-3: `PUT` with an `email` property returns **`400 ["property email should not exist"]`** — the DTO is `PartialType(OmitType(CreateUserDto, ['email']))` under a global `ValidationPipe` with `forbidNonWhitelisted`. So the step-0 mockup's *disabled* input was not merely a poor affordance: had its value been submitted, **every edit would have failed**. The field is absent in edit mode, and the request body is built by branching on the mode, not by disabling a control.

  **`SCREEN_ERRORS.team` gets its first consumer.** The per-screen override was built in step 9 for exactly this: `ACCOUNT_ALREADY_ACTIVATED` reaches an employee on `/activate` about *their own* account and an admin here about *someone else's* — same fact, different useful sentence. It has been sitting unused since step 9; if this step finds nowhere to put the admin wording and writes it inline in JSX, the "every string comes from `messages.ts`" invariant breaks.

  **Deletes `mocks/data.ts`** (**3 → 0**) — `TeamPage`, `EmployeeList` and `EmployeeForm` are the last three importers.

  ✅ **Both parked decisions taken in 13-3** (`/architect`, user's call on each):
  - **The new code re-opens the same dialog** — `SetupCodeDialog`, one component with two call sites and a title that differs between them. Re-issuing has the *identical* problem to creating: the code has to leave the app in the admin's head or on paper, and a row that merely refreshes hides that there is a second step at all. The alternative — refreshing the row — was rejected because its only signal is four digits changing inside a table.
  - **Only `deactivate` gets a toast.** Create opens the code dialog, which is louder than any toast· edit, reactivate and re-issue each leave their change visible in the refetched list, which is the rule's own condition for *not* needing one. Deactivate is the exception because with the filter closed — the default — the row **vanishes**, which is exactly what a hard delete would look like.

  ⚠️ **Two things the plan did not anticipate, both found while building:**
  - **`toast.error` is introduced here, and it is not a style choice.** `Reactivate` and `New code` fire straight from a row button — the first writes in the project with **no dialog and no form** to catch a rejection, so without it they fail silently. It is also the only path by which `SCREEN_ERRORS.team` can reach anybody: `ACCOUNT_ALREADY_ACTIVATED` comes back from `reset-setup-code` against a stale list, which is the exact case the step-9 override was written for.
  - **The page has *two* empty states, not one.** `noEmployees` ("No employees yet.") covers `[]`. But **every employee being deactivated with the filter closed** empties the table while the roster is not empty — and there `noEmployees` would be plainly false, pointing an admin at "create one" when the people they want are one toggle away. Second sentence, and the toggle with its count is directly above it, which is what makes it recoverable rather than a dead end.

  **Vitest**: the three badge states from the `isActive`/`hasActivated` pair (including the deactivated-but-activated row that a two-badge design gets wrong)· the toggle's count· `Reactivate` replacing `Deactivate`· the code and its expiry **date** on a pending row· no email field in edit mode.

- [x] **13-4. Change Password (both roles)** — ✅ **Done 2026-09-04**

  The frontend 8e/8f had deliberately deferred, and the **first route in the app that both roles reach**. Everything follows the existing patterns· only two things are new.

  - **`api/auth.ts`** — `changePassword()`, the first auth call **without** `auth: false`. It acts on the caller's own row, identified by the token, so the header is mandatory — which is exactly why 8f moved a wrong current password to a 400. The file's comment now states that the two facts are one decision and neither can be flipped alone.
  - **`AuthContext.replaceToken()`** — the one genuinely new mechanism. The change revokes every token the user holds, *including the one that made the request*, so the replacement in the response has to be stored before anything else fires. It writes through the same module-level `storeToken()` as `login`, and touches no state: `user` is unchanged by a password change.
  - **`ProtectedRoute.allow` became optional** — omitting it means "signed in, either role", never "no check". Mirrors `GET /users/me` and `GET /settings`, which are role-free for the same reason. The route table in its JSDoc gained the row.
  - **`ChangePasswordPage`** — `SetInitialPasswordPage`'s form shape, inside `AppLayout` (the user is signed in, so the Header stays). Three fields· `confirmPassword` is client-only via `.refine()`, and must never be sent — the global `ValidationPipe` rejects undeclared properties, so including it would 400 every successful change. On success the form is `reset()` so a second submit cannot resend a stale password.
  - **`NOTICES.passwordChanged` names the revocation out loud.** Without that sentence the feature is invisible to the one person who asked for it, and their other device dropping reads as a bug.
  - **Header** — one `<Link>`, outside the role-specific `links` array, between two separators.

  **Tests**: `ChangePasswordPage.spec.tsx`, 10 tests, frontend total 209 → 219. The two that matter: the replacement token **is stored**, and a wrong current password **leaves the user on the page** — the explicit regression test for the bug 8f removed.

  ⚠️ `messages.ts`'s "17 codes" comment is now correct again at **19** — closed here, as 8e predicted it would be.

- [ ] **13-5. Password reset — the admin's action and the employee's way to ask for it**

  The frontend 8g deferred, and the **last consumer gap in the users API**: after it, all seven `/users` endpoints have a UI. Like 13-4 it is mostly wiring — every mechanism already exists and this step reuses rather than invents.

  ⚠️ **The button is only half of it, and the other half is the reason the feature works at all.** The person who needs a reset is the *employee*, and the screen they are stuck on is `/login`, which said only "Invalid email or password." An admin's button nobody knows to ask for is not a recovery path. So this step ships both ends: the action on Team, and the sentence on `/login` that sends people to it.

  - **`api/users.ts`** — `resetPassword()`, the seventh write, same shape as the other six.
  - **`ResetPasswordDialog`** — the **fourth** copy of the `DeleteShiftDialog` skeleton (after `DeactivateEmployeeDialog` and `ChangeCycleDialog`), deliberately identical: a rejection keeps it **open** with the reason inside, both buttons disable in flight, the page owns the write. It confirms because this is the most disruptive write on the page — the employee is signed out of every device the instant it lands, via 8f's `tokenVersion`.
  - **`SetupCodeDialog` gains a third `reason`.** Its two-variant design was already the extension point· the nested ternary became a `TITLES` map at three. Create, re-issue and reset all end the same way — a code that has to leave the app in the admin's head or on paper.
  - **The row button's gate is `!isPending(employee) && employee.isActive`**, and ⚠️ **its reason is *not* the usual one.** Everywhere else on this page a hidden button is one that would fail (`Reactivate` replacing `Deactivate`). The backend accepts a reset on **any** employee row. It is hidden on a pending row because it would duplicate `New code` sitting beside it, and on a deactivated row because the fresh code is inert until someone reactivates them — which is the action that row actually needs.
  - **No toast**, and for a sharper reason than "create opens a dialog": the reset is not finished when the request returns, only when the code reaches the employee, and the app has no channel to deliver it. A toast would announce completion at the halfway point.
  - **`NOTICES.forgotPassword` on `/login`** — static, always visible, plain text under the existing "Activate your account" link. ⚠️ It **cannot** be conditional on a failed sign-in: `login` answers `INVALID_CREDENTIALS` for an unknown email and a wrong password alike, so a hint shown only after a failure could not know which case it was answering — and someone who has forgotten their password needs to read it *before* guessing. It is not an error either, so it stays out of `SCREEN_ERRORS`, which is keyed by code.
  - It **names the activation code**, not just "contact your admin". Without that word the four digits the admin later reads out, and the link directly beneath the sentence, are three unrelated things. ⚠️ Nothing in the journey is automated — no email, no redirect, no deep link. The employee reads the hint, asks out of band, is told the code by voice, and clicks the existing link themselves.

  **Tests**: `TeamPage.spec.tsx` 33 → 39, plus a new `LoginPage.spec.tsx` (3). The two that matter: **the gate** — Reset password and New code never appear on the same row, and neither on a deactivated one — and **the hint is on screen before anything is typed**, and survives a failed sign-in rather than being replaced by the error.

  ⚠️ **No `ERRORS`/`SCREEN_ERRORS`/`ServerErrorCode` change**: 8g added no error code, so the "19 codes" comment stays right. `isPending()` and `statusBadge` are untouched too — 8g had already widened their doc comments to cover a reset employee, who is deliberately indistinguishable from a never-activated one.

- [ ] **13b. Frontend E2E (Playwright)**

  **What this layer catches that nothing else does**, measured on this project rather than assumed: during 8b, deleting `@Roles(Role.EMPLOYEE)` from `clock-in` turned **1 e2e test red while all 175 unit tests passed**. The frontend has the same class of wiring — a route guard, a button calling an endpoint, a table sending a `userId` — and no unit test can see any of it. jsdom has no layout and no real browser behaviour, so the native `datetime-local` input and real `localStorage` are only exercised here.

  **Roughly 30–35 tests**, grouped: auth and routing (login per role landing correctly, wrong password, deactivated, unactivated, activation end to end, expired code, EMPLOYEE typing `/team` being blocked, no token redirecting, **refresh preserving the session**, deactivation mid-session logging out)· clock (in, out, refresh while clocked in, double clock-in)· shifts (add with the **correct UTC time**, edit, delete with confirmation, cancelling that confirmation, ◀▶ changing cycle **and URL**, overlap surfacing, a locked cycle disabling the buttons, a split shift in both cycles)· payroll (zones and totals, **drill-down carrying the cycle**, the `hasOpenShift` warning)· team (create → code dialog, code and expiry in the list, new code, deactivate, the hidden-with-count toggle, reactivate, editing a rate)· settings.

  ⚠️ **One flow from 13-5 belongs here rather than in any unit spec, because it spans two sessions and both roles**: an admin resets an employee's password while that employee is signed in — the employee's next action 401s them out (8f's revocation, through the UI), their old password then fails at `/login`, and the new code activates a new one. Nothing below the browser can see that chain: jsdom has no second session and no real `localStorage`. The `/login` hint itself needs no test here — it is static text, already pinned in `LoginPage.spec.tsx`.

  ⚠️ **Breadth across screens, not depth on rules.** The business rules are already proven against a real database by the 81 backend e2e tests. A Playwright test submitting an overlapping shift is testing *the backend's rule* through six layers of UI — and would fail only in cases where the backend suite already failed. **One** overlap test proves the whole path; a second with different times exercises identical frontend code and adds nothing but maintenance. The one exception is **dates and times**, where different values run through genuinely different arithmetic in a real browser widget — depth is warranted there and nowhere else.

  **Setup** — the same shape as 8b, and reusing its infrastructure rather than inventing new:
  - Runs against `swifttrack_test` with the existing `_test`-suffix guard, `prisma migrate deploy` + seed, truncation between tests
  - Three processes: Postgres, backend, frontend. Playwright's `webServer` can start the last one
  - `storageState` to log in once and reuse the session — which works because the app persists only a token and rebuilds the user from `GET /users/me`
  - ⚠️ **Build the harness first and prove it with a handful of smoke tests, then write the rest** — exactly as 8b did. This project has **five recorded measurement errors and all five were the harness, never the code**; a red result against a brand-new harness is ambiguous
  - There is no CI here — the backend's 256 tests are run by hand, and so are these

  **Why after step 13**: the flows do not exist earlier. "Admin edits an employee's rate" cannot be written before Team is wired.

- [x] **14. README** — ✅ **Done 2026-09-03**, taken **before 13b** (packaging is what the examiner meets first· 13b remains open). Widened from "README" to full packaging at the user's request: `docker compose up` now runs **db + backend + frontend**, which is why spec §2 and architecture.md's stack table were both edited in the same step. `docker compose up db` still starts the database alone, so nothing about steps 1-13's local flow changed.

  **Every parked item below is closed. How:**
  - `prisma generate` on a clean clone → **option (β)**, as this plan preferred: `prisma.config.ts` no longer calls `env()`, and `"postinstall": "prisma generate"` was added. Verified by copying the backend to a temp directory **without `.env`** and running `npm install` — exit 0, client generated.
  - `frontend/.env` on a clean clone → the README orders both `.env` copies **before** their `npm` commands, and states that Vite inlines at build time. In Docker it is a build `ARG`, never a runtime `environment:` entry.
  - `start:prod` in a real deploy → **now actually deployed.** `dist/src/main.js` confirmed correct inside the image. ⚠️ It also surfaced a bug this plan could not have predicted — see the `importFileExtension` note in `progress-tracker.md` Step 14.
  - "Settings not initialised" → the entrypoint runs `prisma db seed` on every boot, so the message cannot reach a Docker user at all· the manual instruction is in the README for the non-Docker path.
  - `seed:demo` → documented, **and** wired into the container behind a `SEED_DEMO_ONLY_IF_EMPTY` guard so a restart never deletes an examiner's data.
  - The e2e prerequisite "create the database by hand" → **gone.** `docker/postgres/init-test-db.sql` creates `swifttrack_test` on first volume init. Verified: 106/106 e2e green against a database nobody created manually.
  - `npm audit` → 9 findings remain (1 moderate, 8 high) on a clean install, unchanged in kind from the `@nestjs/swagger`/`js-yaml` chain recorded in Step 3. Not fixed here· noted so it is not rediscovered.
  - `.mcp.json` → still declined, unchanged.

  <details><summary>Original step description (kept for the record)</summary>

  - Build/deploy instructions, seed script instructions
  - **The parked items that have accumulated — this is their destination.** They are listed here so step 14 does not have to go looking through `progress-tracker.md` for them:
    - ⚠️ **`prisma generate` on a clean clone.** `backend/src/generated/` is gitignored, so nothing compiles until it runs. The official fix is `"postinstall": "prisma generate"`, which **cannot be added as-is**: Prisma 7 has an open regression where `prisma generate` fails without `DATABASE_URL`, because `env()` in `prisma.config.ts` throws while the config loads — and a clean clone has no `.env`, so `npm install` itself would fail ([prisma#28590](https://github.com/prisma/prisma/issues/28590)). Three options, with (β) preferred: (α) postinstall plus a README that orders "copy `.env` before `npm install`", (β) `process.env.DATABASE_URL ?? 'placeholder'` instead of `env()`, then postinstall, (γ) no postinstall, an explicit `npm run setup`
    - ⚠️ **`frontend/.env` on a clean clone — the frontend's counterpart to the bullet above.** `VITE_API_URL` is **required and has no fallback** (decided 2026-08-28, before step 9): `api/client.ts` throws at module load naming the fix when it is missing, rather than defaulting to `http://localhost:3000`. So a fresh clone serves a blank page until `frontend/.env.example` is copied to `frontend/.env`, and the README must order that **before** `npm run dev` — exactly as it already does for the backend's `.env`. The fallback was rejected deliberately: Vite exposes **only** `VITE_`-prefixed variables, so a misspelt name resolves to `undefined`, and a fallback equal to the real dev value would make that work locally and surface only at deploy — the step 1 lesson (a fallback identical to the value under test proves nothing), in a second place. ⚠️ Vite inlines the value at **build** time, not at runtime: a production bundle carries whatever `.env` held when `npm run build` ran, so the deploy instructions must set it *before* building, never after
    - ⚠️ **`start:prod` must be tested in a real deploy.** It was pointing at a non-existent file until step 6 (`dist/main` vs the actual `dist/src/main.js`, because `prisma.config.ts` and `prisma/seed.ts` sit outside `src/` and drag the build root down a level). Fixed and verified locally, never deployed. If a clean layout is ever wanted, `"include": ["src/**/*"]` in `tsconfig.build.json` does it — but then those two files stop being compiled into `dist`
    - **"Settings not initialised. Run `npx prisma db seed`."** — this message is the deliberate alternative to documenting a 500 in Swagger (step 7, decision Δ reversed). The setup instruction belongs here, in the README, and nowhere else
    - **`npm run seed:demo`** — demo data for local development: 5 employees covering every UI state (active, pending, deactivated-with-hours, clocked-in) and ~150 shifts across three cycles. Separate from `prisma db seed` on purpose, since that one runs in production deploys and inside the e2e `globalSetup`. ⚠️ Document that it **deletes all EMPLOYEE rows and their time entries** before rebuilding, and that it refuses to run against a `*_test` database
    - **The e2e suite's prerequisites**: copy `.env.test.example` to `.env.test`, and create the database once with `docker compose exec db psql -U swifttrack -d postgres -c "CREATE DATABASE swifttrack_test;"`. `globalSetup` runs the migrations and the seed, but does **not** create the database itself — that needs a connection to `postgres` with create rights
    - **Step 13b's prerequisites** on top of those: `npx playwright install` (browser binaries are not in `node_modules`), and the fact that a run needs **three** processes up — Postgres, backend, frontend
    - **`.mcp.json`** — **declined on 2026-08-28, not merely unbuilt.** The reasoning is under § Read this before any frontend step, and it is worth restating only so nobody re-opens it as an oversight: the shadcn MCP's discovery value was outweighed by it pinning a second, floating copy of the shadcn CLI, and the registry is queryable over plain HTTP anyway. The **Playwright MCP** is a genuinely open question for step 13b, where an agent driving a real browser is the point — decide it there

  </details>

- [x] **15. Rate history (`UserRate`) — a raise applies forward** — ✅ **Done 2026-09-05**

  **A bug fix, and the first change since step 6 to touch the payroll pipeline.** Raising an employee's `hourlyRate` repriced **every cycle they had ever worked**, cycles already paid included: pay is derived from the rate on every request, and nothing recorded what the rate used to be. This was spec §13 gap 1, which the project had recorded as accepted rather than overlooked.

  **The decision** (spec §4, decision 5g): a cycle is priced with the rate **in force at its start**, resolved **once per cycle**. A raise entered mid-cycle takes effect at the **next** one, and the admin does not pick the date.

  ⚠️ **Prorating within a cycle was rejected on structural grounds, not taste.** It partitions the cycle by rate period, turning four money roundings into eight (breaking decision 5d), and the summary shows one `rate` per zone — it would need two rows per zone or a blended rate that cannot reproduce its own Pay column. **Do not "fix" the anchoring as if it were an oversight.**

  ⚠️ **A payroll snapshot per closed cycle — what §13 itself names — was also rejected here.** It needs a cycle-closing mechanism that does not exist, it collides with the "never frozen" invariant that two other decisions rest on, and it would not fix the bug alone: until a cycle closes a raise still rewrites it, and the current cycle is exactly where a raise lands. `UserRate` is forward-compatible with it.

  - **Schema**: `UserRate` (`userId`, `hourlyRate`, `effectiveFrom`, `@@unique([userId, effectiveFrom])`), declared in the `init` migration alongside the other three tables — we are in dev, so the table went where it belongs rather than arriving as a migration on top. `User.hourlyRate` **stays** as the current rate: eight read paths want "what are they paid now" and none is cycle-aware.
  - **`SettingsService.resolveRateEffectiveFrom()`** — the next cycle's start, sibling of `resolveWritableCycleStart()`. All cycle arithmetic stays in one module.
  - **`UsersService`** — `findEmployeeRateAt(id, at)` and `findAllEmployeeRatesAt(at)` **replace** the old pair. The team reader batches into **two** queries and folds in memory· the overview goes 4 → 5 queries. The write pairs the `User` update with a `UserRate` upsert in the codebase's first `$transaction`. `createEmployee` writes the first row at the **epoch** — an admin may write a shift at any past date, and a cycle with no rate in force would 500 the whole overview.
  - **`PayrollService`** — `getPayrollForCycle` now resolves the cycle **before** the employee. ⚠️ `summarise()` and `requireHourlyRate()` are **unchanged**, which was the acceptance criterion and held: neither appears in the diff.
  - **`PUT /users/:id`** — body unchanged. The same rate resubmitted writes nothing (the form always sends both fields)· two raises in one cycle upsert to one row. The Swagger description had documented the bug as behaviour and was replaced.
  - **Frontend** — one permanent line under the rate field in edit mode, copying `SettingsPage`'s existing choice of a line over a toast.

  **Tests**: 213 → **234** unit, 106 → **121** e2e, 219 → **230** frontend. The headline e2e is the bug report executed: price a cycle, raise the rate, re-read that cycle and get a **byte-identical** body, then read the next one at the new rate. ⭐ **Spike passed** — removing the `effectiveFrom <= at` filter turned three e2e tests red with exactly the reported symptom (`Expected: 2450, Received: 3000`), so the tests are not empty.

  ⚠️ **§13 gap 1 was narrowed, not closed.** Payroll is still recomputed on every request: editing a **shift** in a past cycle still moves that cycle's total, and a zone-percentage change still would. Only the rate is historised.

---

## Rule for every step

Before a module is considered "done":
1. The happy path works
2. Role restrictions (ADMIN vs EMPLOYEE) work, where applicable
3. It has Swagger decorators *(backend steps only — the frontend has its own checklist under § Read this before any frontend step, which adds loading/error/empty states, detaching from `@/mocks/data`, and clean `tsc -b` + lint)*
4. It follows the invariants in `architecture.md` (e.g. `userId` explicit in every service query)
5. Every piece of text the user sees is in English. **UI copy** (titles, buttons, links, badges, rate-zone labels, payroll column headers) comes from spec §8a **verbatim**, via `frontend/src/lib/messages.ts` — never paraphrased, never written inline. **Error/feedback messages** are not bound to §8a's *table*: write a sensible one where it does not cover a case, and improving an existing one needs no spec update. ⚠️ That is a rule about the documentation, not about the tests — the specs assert these messages **verbatim**, so changing one is a deliberate edit that shows up as a failing test rather than slipping through
