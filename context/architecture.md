# Architecture — SwiftTrack (Phase 1, Single-Tenant)

## Stack

| Layer      | Tool                     | Purpose                                          |
| ---------- | ------------------------ | ------------------------------------------------ |
| Backend    | NestJS                   | REST API, modules, guards, business logic        |
| ORM        | Prisma                   | DB schema, migrations, typed queries             |
| Database   | PostgreSQL (Docker)      | Persistence — User, TimeEntry, AppSettings        |
| Frontend   | React (Vite)             | SPA client                                       |
| Styling    | Tailwind CSS + shadcn/ui | UI components and styling                        |
| Auth       | JWT (`@nestjs/jwt` + `@nestjs/passport`/`passport-jwt`) | Stateless auth, role-based access |
| Rate limit | `@nestjs/throttler`      | Protects the unauthenticated auth routes from brute force |
| API Docs   | Swagger                  | Auto-generated API reference                     |
| Validation | `class-validator` + `class-transformer` | DTO-based request validation, global `ValidationPipe` |
| Config     | `@nestjs/config`         | Loads `.env` into `process.env` for the running app |
| Language   | TypeScript               | Throughout (backend + frontend)                  |

---

## Third-Party Library & Version Policy

- Before touching any 3rd-party library or tool in a step (installing it, upgrading it, or using an API from it for the first time), the agent looks up current official documentation online (or via MCP, if available) instead of relying on prior/training knowledge — APIs and recommended patterns change between versions.
- The agent stays aware of version compatibility across the stack (e.g. a Prisma version against the Node/TypeScript version in use, a NestJS version against `@nestjs/*` companion packages) and checks for known breaking changes before introducing or bumping a dependency.
- Whenever a specific version needs to be chosen (a new dependency, or a major/minor bump of an existing one), the agent does not decide unilaterally — it presents the options/tradeoffs found in the docs and asks the user to confirm before installing.

---

## Stack Traps

Five places where this project is on a **current** version whose API differs from what most examples, tutorials and training data describe. Do not write these from memory — the first two fail **silently**, which is worse than a compile error.

**1. shadcn here is built on Base UI, not Radix.** shadcn changed its default primitive library to Base UI in July 2026, and this project is on it: there is **no `@radix-ui/*` package installed at all**, and the components import from `@base-ui/react/*` and carry `data-slot` attributes (`frontend/src/components/ui/dialog.tsx` is the reference). Consequences when copying Radix-era shadcn code:

| Radix (wrong here) | Base UI |
|---|---|
| `asChild` | the `render` prop |
| `onOpenChange` and similar | different prop names — check the component |
| `data-[state=open]:` in class names | **silently does nothing** |

The last row is the dangerous one: no error, no warning, the styling or animation simply never applies. New components are pulled from the registry (`npx shadcn@latest add …`), which installs the Base UI version — never hand-written from a remembered example.

⚠️ **The sharpest instance: there is no `Form` component in this style, and asking for one fails silently.** Measured against the registry on 2026-08-28:

| Style | `form.json` | npm deps it pulls |
|---|---|---|
| `new-york`, `default` (Radix) | 1 file | `@radix-ui/react-label`, `@radix-ui/react-slot`, `@hookform/resolvers`, `zod`, `react-hook-form` |
| **`base-nova`** (ours) | **0 files** | none |

`base-nova/form.json` is literally `{ "$schema": …, "name": "form", "type": "registry:ui" }` — an empty shell. **`npx shadcn add form` is a silent no-op**: no file, no error, exit 0. There are no `<Form>`, `<FormField>`, `<FormItem>` or `<FormMessage>` components to import, and any tutorial offering them is describing a Radix style — copying it would drag `@radix-ui/*` into a project that today has **zero** Radix packages.

The replacement is **`field`** (`components/ui/field.tsx`, installed 2026-08-28): `Field`, `FieldSet`, `FieldLegend`, `FieldGroup`, `FieldContent`, `FieldLabel`, `FieldTitle`, `FieldDescription`, `FieldSeparator`, `FieldError`. It is **presentational only** — it imports nothing from react-hook-form, so the binding is written by hand. It is built to interoperate, though: `FieldError` takes `errors?: Array<{ message?: string }>`, which is exactly react-hook-form's error shape, so `<FieldError errors={[errors.startTime]} />` works directly. It dedupes and renders a `<ul>` when given more than one.

**Consequence for step 9:** the form pattern is established once, by hand, and the other four forms copy it. There is no library wrapper enforcing consistency here — that job falls to the first form written.

**2. Tailwind v4 is CSS-first, and there is no config file.** `frontend/src/index.css` starts with `@import "tailwindcss"` and defines theme tokens in `@theme inline`. **`tailwind.config.js` does not exist and must not be created** — v4 does not read one by default, so an agent adding a colour there will find it silently absent. Also: no `@tailwind base/components/utilities` directives (that is v3), no `content: []` array to maintain (sources are detected automatically), and `@apply` is discouraged in favour of CSS variables.

**3. `zodResolver` + `z.coerce` does not typecheck — and only that combination.** Installed 2026-08-28 and **measured**, not assumed: `zod@4.5.1`, `react-hook-form@7.86.0`, `@hookform/resolvers@5.9.1`, on TypeScript 6.0.3. A throwaway file exercising four shapes through `tsc -b` gave:

| Shape | Result |
|---|---|
| `z.object({...})` → `useForm<z.infer<S>>` | ✅ |
| `z.email()` (zod 4's top-level form, not `z.string().email()`) | ✅ |
| `.refine()` cross-field — the ShiftForm rules | ✅ |
| **`z.coerce.number()`** → `useForm<z.infer<S>>` | ❌ **TS2322** |

The failure, verbatim:

```
Type 'Resolver<{ cycleStartDay: unknown; … }, any, { cycleStartDay: number; … }>'
  is not assignable to type 'Resolver<{ cycleStartDay: number; … }, any, { … }>'.
      Type 'unknown' is not assignable to type 'number'.
```

Coercion accepts anything, so the schema's **input** type is `unknown` while its **output** is `number`. `z.infer` resolves to the output, and one type parameter cannot describe both ends. Note this is *not* the `.refine()`/`ZodEffects` problem that older write-ups blame — that case passes cleanly here.

**Two fixes, both verified to compile:**

- **A** — name both ends: `useForm<z.input<typeof S>, unknown, z.output<typeof S>>({ resolver: zodResolver(S) })`
- **B** *(preferred)* — drop coercion: keep `z.number()` in the schema and convert at the input with `register("hourlyRate", { valueAsNumber: true })`

**B** is preferred because the only places this arises are `SettingsPage` (a `<select>` of 11–25, whose values we control) and `EmployeeForm`'s `hourlyRate` — both of which are cleaner as plain numbers than as coerced strings, and neither needs the wider generic signature bleeding into every consumer of the form.

**4. In a Vitest test, mock `fetch` — not the wrapper you are testing.** Mocking `request()` to test `client.ts` proves only that the mock behaves as written, and hides precisely the bugs worth catching: a wrong header, a malformed URL, a mishandled status. Relatedly, jsdom implements **no layout** — anything depending on real dimensions, scroll position or computed CSS belongs in Playwright (step 13b), not in a Vitest spec, where it will pass or fail for the wrong reason.

**5. React Router is used in declarative mode.** `App.tsx` uses `<BrowserRouter>` + `<Routes>`, not `createBrowserRouter`. Route `loader`/`action` APIs are therefore **not available** — data loading goes through `useApiQuery`, and converting to a data router is not a step anyone is asked to take.

---

## Folder Structure

```
/
├── docker-compose.yml
├── backend/
│   ├── prisma.config.ts                   → Prisma 7 config: schema path, migrations path, seed command, datasource url
│   ├── prisma/
│   │   ├── schema.prisma                  → User, TimeEntry, AppSettings models
│   │   ├── seed.ts                        → creates the first admin
│   │   └── migrations/
│   ├── src/
│   │   ├── generated/prisma/              → Prisma Client output (generated, gitignored — never hand-edited)
│   │   ├── main.ts                        → App bootstrap, Swagger setup, global ValidationPipe (whitelist+forbidNonWhitelisted), CORS for frontend origin
│   │   ├── app.module.ts
│   │   ├── prisma/
│   │   │   ├── prisma.service.ts          → Injectable PrismaClient wrapper
│   │   │   └── prisma.module.ts
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts         → POST /auth/login, /auth/set-initial-password (both behind ThrottlerGuard)
│   │   │   ├── auth.service.ts            → login, setup-code verification, hashing — uses UsersService, never Prisma directly
│   │   │   ├── jwt.strategy.ts
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── jwt-payload.interface.ts   → { userId, role } — what is signed, and what req.user holds
│   │   │   ├── roles.guard.ts             → reads the metadata set by @Roles
│   │   │   ├── roles.decorator.ts         → @Roles('ADMIN')
│   │   │   ├── current-user.decorator.ts  → @CurrentUser() — reads req.user, replaces ad-hoc req.user!
│   │   │   └── dto/                       → login, set-initial-password, login-response
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts        → GET/POST/PUT/DELETE /users
│   │   │   ├── users.service.ts           → creates employees with setupCode, no password
│   │   │   └── dto/                       → create/update, user-response (admin view), user-profile (own view)
│   │   ├── time-entries/
│   │   │   ├── time-entries.module.ts
│   │   │   ├── time-entries.controller.ts → clock-in, clock-out, open, CRUD
│   │   │   ├── time-entries.service.ts
│   │   │   ├── time-entries.service.spec.ts
│   │   │   └── dto/                       → create/update, time-entry-response, cycle-entries-response, open-shift-response, shift-time.validator(+spec)
│   │   ├── payroll/
│   │   │   ├── payroll.module.ts
│   │   │   ├── payroll.controller.ts      → GET /payroll/me, /payroll/overview, /payroll/:userId
│   │   │   ├── payroll.service.ts         → per-employee breakdown + team overview
│   │   │   ├── payroll.service.spec.ts
│   │   │   ├── rate-zones.util.ts         → pure zone arithmetic — no DB, no DI, integer hundredths
│   │   │   ├── rate-zones.util.spec.ts
│   │   │   └── dto/                       → payroll-response (+ zone/day), payroll-overview-response
│   │   └── settings/
│   │       ├── settings.module.ts
│   │       ├── settings.controller.ts     → GET/PUT /settings
│   │       ├── settings.service.ts        → owns AppSettings + resolveCycleRange()
│   │       ├── cycle.util.ts              → pure cycle arithmetic — no DB, no DI, unit-testable standalone
│   │       ├── cycle.util.spec.ts
│   │       └── dto/                       → settings-response, update-settings, cycle-range, is-day-before.validator
│   └── test/
└── frontend/
    ├── src/
    │   ├── main.tsx
    │   ├── vite-env.d.ts                  → declares VITE_API_URL (without it, import.meta.env.VITE_API_URL is `any`)
    │   ├── App.tsx                        → Router setup (BrowserRouter + Routes — declarative, NOT createBrowserRouter)
    │   ├── context/
    │   │   └── AuthContext.tsx            → user in state, ONLY the token in localStorage· isBootstrapping
    │   ├── hooks/
    │   │   └── useApiQuery.ts             → the single read hook: { data, error, isLoading, refetch } + ignore-flag cleanup
    │   ├── lib/
    │   │   ├── messages.ts                → every user-visible string: UI copy + ERRORS (code → text)
    │   │   ├── datetime.ts                → the ONLY date/time door — always { timeZone: "UTC" }, plus toIsoUtc()
    │   │   ├── format.ts                  → the ONLY number door (step 12) — formatHours/formatRate/formatIsk
    │   │   └── utils.ts                   → cn() (shadcn)
    │   ├── api/
    │   │   ├── client.ts                  → fetch wrapper: auth header, timeout, ApiError{status,code}, 401 rule
    │   │   ├── auth.ts
    │   │   ├── users.ts
    │   │   ├── timeEntries.ts
    │   │   ├── payroll.ts
    │   │   └── settings.ts
    │   ├── pages/
    │   │   ├── LoginPage.tsx              → has "Activate account" link
    │   │   ├── SetInitialPasswordPage.tsx → email + setupCode + new password
    │   │   ├── ClockPage.tsx              → EMPLOYEE only — the clock button, nothing else
    │   │   ├── ShiftHistoryPage.tsx       → shared component, employee (/shifts) + admin (/shifts/:userId)
    │   │   ├── PayrollPage.tsx            → shared component, employee (/payroll) + admin (/payroll/:userId)
    │   │   ├── TeamPage.tsx               → admin only — first page after admin login
    │   │   ├── PayrollOverviewPage.tsx    → admin only — team list + total cost + open shifts
    │   │   └── SettingsPage.tsx           → admin only
    │   └── components/
    │       ├── layout/
    │       │   ├── Header.tsx             → logo left, username + menu right
    │       │   ├── Footer.tsx             → empty placeholder
    │       │   ├── ProtectedRoute.tsx     → role-aware route guard
    │       │   └── TimezoneNotice.tsx     → bar shown only when getTimezoneOffset() !== 0
    │       ├── clock/
    │       │   └── ClockButton.tsx
    │       ├── shifts/
    │       │   ├── ShiftList.tsx          → shared, takes userId prop
    │       │   ├── ShiftForm.tsx          → dialog, add/edit
    │       │   └── CycleNavigator.tsx
    │       ├── payroll/
    │       │   ├── PayrollSummary.tsx     → Zone | Hours | Rate | Total Pay + Total row
    │       │   ├── PayrollDayTable.tsx    → Date | <zone per column> | Total, hours only
    │       │   └── PayrollOverview.tsx    → admin — team totals + open-shift flags
    │       └── team/
    │           ├── EmployeeList.tsx
    │           └── EmployeeForm.tsx
    └── e2e/                               → Playwright (step 13b)
```

> ⚠️ **Two step-0 files do not appear above, deliberately.** `components/clock/MonthSummary.tsx` is **deleted** in step 9/10 (its flat-rate pay calculation is wrong under four rate zones), and `mocks/data.ts` dies once the last of its importers is detached — **13 at the start of step 9, 5 after step 12**, all of them the Step 13 screens (`PayrollOverview`, `EmployeeForm`, `EmployeeList`, `SettingsPage`, `TeamPage`). `components/payroll/PayrollBreakdown.tsx` was **replaced** by the two components listed above in step 12 — not extended — and is deleted.
>
> Vitest specs live beside the file they test (`datetime.spec.ts` next to `datetime.ts`), matching the backend's convention. `e2e/` is the only separate test folder.

### Component Breakdown

> UI layer: all forms/buttons/inputs are built with shadcn/ui components (Input, Button, Card, Label, etc.) instead of plain HTML elements. The state/logic sketch below is independent of this choice — it applies the same, just "dressed" with shadcn primitives in the actual build.
>
> Responsive design: the app must work well on desktop, tablet, and mobile (browser) — Tailwind breakpoints (sm/md/lg) are used wherever the layout needs it, especially in lists/tables that need to adapt to a small screen.

> ⚠️ **All five forms use `react-hook-form` + `zod` + shadcn's `Form`, from step 9 onward** — never a `useState` per field. The step-0 mockups use the older pattern and are converted as each is wired, rather than left for a cleanup pass at the end: the API's validation rules have been fixed and tested since the backend closed, so there is nothing to wait for and writing each form twice buys nothing. Two consequences worth stating: the native browser validation bubble is gone (it is unstyled *and* rendered in the **browser's** language, which would put the only non-English sentence in the app in front of a user), and every form carries **two** kinds of error — field-level from zod, before any request, and request-level from the API's error `code`.

#### LoginPage.tsx
Form: `email`, `password` (zod schema, `useForm`)
Logic: submit → `api/auth.ts` `login()` → `AuthContext.login()` → redirect ADMIN→`/team`, EMPLOYEE→`/clock`
Contains: 2 fields, submit button, request-error area above the button, link to `/activate` (text: "Activate your account" — see spec §8a).
Also renders the **session-expired** message when the redirect here came from an auto-logout — otherwise being thrown out mid-session reads as a glitch rather than an explanation.

#### SetInitialPasswordPage.tsx
Form: `email`, `setupCode`, `newPassword`, `confirmPassword` (zod schema, with the match check as a schema refinement rather than hand-written logic)
Logic: submit → `api/auth.ts` `setInitialPassword()` → redirect `/login` with a success message
Contains: 4 fields, submit button, request-error area, link back to `/login`

#### Layout: Header.tsx / Footer.tsx
Every protected page (both roles) is wrapped by `Header` (logo "SwiftTrack" on the left, username + menu on the right — dropdown with role-specific links + logout) and `Footer` (empty placeholder, filled in Phase 2).

#### Shared-page pattern: ShiftHistoryPage / PayrollPage
Both pages follow the same pattern: an employee route with no param (`/shifts`, `/payroll` — always the same), an admin route with a `:userId` param (`/shifts/:userId`, `/payroll/:userId` — whichever employee they selected). Both routes load the same page component, which passes the correct `userId` (either `"me"` or the route param) to the same shared components (`ShiftList`· `PayrollSummary` + `PayrollDayTable`). Admin-only actions inside these are shown conditionally based on `user.role`, with no separate component per role.

Both also read `?cycle=` from the URL rather than component state — see the frontend invariant. That is what carries the cycle through the admin's drill-down from Payroll Overview into one employee's breakdown.

#### ClockPage.tsx (EMPLOYEE only)
State: the open shift from `GET /time-entries/open` (read as `data.openShift` — the response is wrapped), plus in-flight/error state for the button.
Logic: the label is decided by whether an open shift exists — **never** read from the shift list, which filters out a shift started in the previous cycle. Clock In → `POST /time-entries/clock-in`· Clock Out → `PATCH /time-entries/clock-out` (no `:id`)· `refetch()` after either. The client sends **no timestamp** — the server writes `now`, which is why this path is immune to a wrong or foreign clock.
Contains: the button and nothing else. Disabled while a request is in flight. Failure renders beside the button, and stays — "you already have an open shift" is an instruction, not a notification.

#### ShiftHistoryPage.tsx
State: the cycle response (entries + cycle block), `?cycle=` from `useSearchParams`, and the add/edit dialog's open state.
Logic: `GET /time-entries/me?cycle=` or `GET /time-entries?userId=&cycle=`· `refetch()` after add/edit/delete. The ◀▶ sends back the `prevCycle`/`nextCycle` key it was handed and navigates with `replace`.
Contains: `CycleNavigator`, `ShiftList` (# / Start / End / Notes / Actions + Open badge and split marker — **no hours or duration column**, and no shared Date column either: Start and End each carry their own instant, since an overnight shift ends on a different day than it starts), `ShiftForm` in a dialog. Edit/Delete are disabled where the response says this caller may not edit the row, and **Add Shift is disabled when `canWrite` is `false`**. Delete confirms first.

#### PayrollPage.tsx
State: the payroll response, `?cycle=` from the URL.
Logic: `GET /payroll/me?cycle=` or `GET /payroll/:userId?cycle=`. **Renders only** — no arithmetic of any kind, including the Total rows.
Contains: `CycleNavigator`, `PayrollSummary` (row per zone, generated from `zones[]`, never hardcoded), `PayrollDayTable` (row per date, hours only), the `hasOpenShift` warning, and an empty state for a cycle with no hours — which replaces **both** tables rather than rendering them full of zeros, while the warning stays above it, since that is exactly the case where a cycle looks empty for a reason worth stating.
⚠️ The `hasOpenShift` warning has **two wordings**, picked by route rather than by error code: the employee is being told about *their own* unclosed shift, the admin about *someone else's*. Third instance of the same pattern, after `ACCOUNT_ALREADY_ACTIVATED` (step 9) and `OPEN_SHIFT_EXISTS` (step 11) — but not in `SCREEN_ERRORS`, which is keyed by `ErrorCode` and this is not an error. The page always knows which route it is on.

#### TeamPage.tsx (ADMIN only)
State: the employee list, the "show deactivated" toggle, the create/edit dialog, and the setup-code dialog shown after a successful create.
Logic: `GET /users` returns EMPLOYEE rows including deactivated ones. Three badge states from the pair `isActive`/`hasActivated` — a deactivated employee has a password, so a two-badge design would show them as "Active". Create → `POST /users`, then the code dialog. `PUT /users/:id` for name/hourlyRate. `DELETE` (deactivate, confirmed) and `PATCH /users/:id/reactivate`. `POST /users/:id/reset-setup-code` from a pending row.
Contains: `EmployeeList`, `EmployeeForm`, the toggle **with its count**, and the setup-code dialog carrying the code and its expiry **date**. Clicking a row → `/shifts/:userId`.

#### PayrollOverviewPage.tsx (ADMIN only)
State: the overview response, `?cycle=` from the URL.
Logic: **one** call to `GET /payroll/overview?cycle=`. Rows arrive sorted, already include any deactivated employee with hours in the cycle, and carry their own totals — the page adds nothing up, `totalCost` included.
Contains: `PayrollOverview`, `CycleNavigator`, per-employee open-shift indicator. Clicking a row → `/payroll/:userId?cycle=<the same cycle>`.

#### SettingsPage.tsx (ADMIN only)
State: `cycleStartDay` via react-hook-form, plus the day awaiting confirmation.
Logic: `GET /settings`, `PUT /settings` (both fields sent). The page owns the write and passes it down, as `ShiftHistoryPage` does. The end day is **derived text**, not an input, and the derivation is `deriveCycleEndDay()` in `api/settings.ts` — one function, three call sites, never written inline.
Contains: a single Base UI `Select` of 11–25 bound through `Controller`, the derived line beside it, a permanent line saying what moving the boundary does to past cycles, and `ChangeCycleDialog` — which mirrors `DeleteShiftDialog` exactly rather than being a second confirmation pattern.
⚠️ Two confirmations, deliberately, because they answer different questions: the **dialog** before the write asks *do you mean to re-cut every past cycle*, and the **toast** after it reports that a save which leaves the page identical actually happened. `isDirty` disabling Save is the permanent third: a toast lasts four seconds, a quiet button does not.

---

## System Boundaries

| Folder                       | Owns                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `backend/src/*/​*.controller.ts` | HTTP routes, request/response shape, guards. No business logic, no direct Prisma calls. |
| `backend/src/*/​*.service.ts`    | All business logic and Prisma queries. Every function takes `userId` explicitly.        |
| `backend/src/prisma/`         | Single shared `PrismaService`. No other module instantiates its own PrismaClient.       |
| `frontend/src/pages/`         | Page-level composition and routing only. No direct `fetch` calls.                       |
| `frontend/src/api/`           | All HTTP calls to the backend. Nothing else calls `fetch` directly.                     |
| `frontend/src/components/`    | UI only. No API calls, no business logic — receive data via props.                      |
| `frontend/src/context/`       | Global client state (auth) only.                                                        |
| `frontend/src/hooks/`         | `useApiQuery` — every read goes through it. No page writes its own `useEffect` + fetch.  |
| `frontend/src/lib/`           | `datetime.ts` owns every date format/parse· `format.ts` owns every number format· `messages.ts` owns every user-visible string. **Imports nothing from `api/`** — see the invariant. |

---

## Data Flow

### Clock In / Clock Out

```
User taps Clock In/Out button (ClockButton.tsx)
        ↓
api/timeEntries.ts → POST /time-entries/clock-in (or PATCH .../clock-out)
        ↓
TimeEntriesController → TimeEntriesService
        ↓
Prisma: create (startTime=now, endTime=null) or update (endTime=now)
        ↓
Response → ClockButton refetches GET /time-entries/open
           (after EVERY attempt, success or failure — a 400 means the
            label was stale, and after a timeout it is the only way to
            learn whether the write landed)
```

⚠️ There is no Clock page summary to refresh — `MonthSummary` was deleted in step 10. The page is the button, plus one line printing the open shift's `startTime`.

### Payroll Calculation

```
User opens Payroll page (own, or admin selects an employee)
        ↓
api/payroll.ts → GET /payroll/me?cycle=... or /payroll/:userId?cycle=...
        ↓
PayrollController → PayrollService
        ↓
Fetch TimeEntries where userId + endTime != null + OVERLAPPING the cycle
(not "starting inside it" — a shift crossing the boundary belongs to both cycles)
        ↓
rate-zones.util.ts: clip each entry to the cycle, then cut it at every zone
boundary it crosses (08:00 / 17:00 / midnight), accumulate per (date × zone)
cell, round the cells to 2 decimals
        ↓
Zone totals = exact sums of cells· zone pay = round(zoneHours × zoneRate)·
totalPay = plain sum of the four zone amounts
        ↓
Return { zones, days, totals } → PayrollSummary + PayrollDayTable render it,
computing nothing — the Total rows included (step 12)

Admin team view: GET /payroll/overview?cycle= runs the same calculation for
every employee in ONE request (4 queries total, not 4 per person), so the
overview row and that employee's own page can never disagree.
```

### Team Management (Admin)

```
Admin opens Team page
        ↓
api/users.ts → GET /users
        ↓
UsersController (RolesGuard: ADMIN) → UsersService
        ↓
Prisma: findMany (all employees)
        ↓
Admin creates employee → POST /users → Prisma: create (password=null, setupCode + 3-day expiry generated)
```

### Employee Account Activation

```
Admin creates employee (name, email, hourlyRate) via Team page
        ↓
Backend generates: setupCode (random 4-digit) + setupCodeExpiresAt (now + 3 days)
        ↓
Admin shares email + setupCode with employee (out of band — no auto email)
        ↓
Employee opens LoginPage → clicks "Activate your account" link → SetInitialPasswordPage
        ↓
Submits { email, setupCode, newPassword }
        ↓
POST /auth/set-initial-password
        ↓
AuthService validates: user exists, password is still null, code matches, code not expired
        ↓
On success: password is bcrypt-hashed and stored, setupCode + setupCodeExpiresAt cleared to null
        ↓
Employee can now log in normally with email + password
```

### Auth Flow

```
First admin seeded directly into the DB via a seed script — no public register route exists.
POST /auth/login → AuthService validates bcrypt hash → JWT { userId, role }, valid 14 days
        ↓
Checks run in this order: isActive → password !== null → bcrypt compare.
isActive comes first so an account that is both deactivated and never activated
is told it is deactivated, rather than sent down an activation path that
login would reject anyway.
        ↓
If user.password is null (not yet activated) → login fails with the exact
message "This account hasn't been activated yet. Please activate it first."
(never a generic invalid-credentials message)
        ↓
Response is { accessToken, user } — the user object is UserProfileDto, not
UserResponseDto (see Invariants: setupCode never crosses into a self-facing
response). The JWT itself carries only { userId, role }, so without the user
object the frontend could not render the Header's username.
        ↓
Frontend: AuthContext stores ONLY the accessToken in localStorage.
The user object lives in React state — from this response at login, and from
GET /users/me when a tab is opened. Nothing user-shaped is persisted, so
nothing persisted can disagree with the server (notably `role`, which decides
which pages render and would otherwise be editable in devtools).
        ↓
On boot with a stored token: AuthContext holds rendering behind
`isBootstrapping` and calls GET /users/me. 200 → user resolved.
401 → clear and go to /login. Network error → retry state, token KEPT.
Cost is one request per tab opened, not per navigation — the context
mounts above the router.
        ↓
Every subsequent request: api/client.ts attaches Authorization: Bearer <token>
        ↓
Backend: JwtAuthGuard validates token on all protected routes
         JwtStrategy.validate() re-reads the user via UsersService.findActiveById()
         and rejects if they were deactivated or deleted after the token was issued
         RolesGuard + @Roles('ADMIN') restricts admin-only routes
        ↓
A 401 on a request that CARRIED a token means the session is dead:
api/client.ts clears it and redirects to /login. A 401 on a request that
carried NO token (login, set-initial-password) is a normal domain answer
and goes back to the form. The discriminator is the header, never a list
of endpoints someone has to remember to keep updated.
```

---

## Database Schema (Prisma)

**Owned by `backend/prisma/schema.prisma`** — the executable source of truth. It generates the Prisma Client, so it is the only copy that cannot drift silently: get it wrong and the build fails.

The annotated field list — every column with the reasoning behind it — lives in **spec §3**, verified against the schema rather than paraphrased from it. The two rules Prisma's DSL cannot express are hand-written in `backend/prisma/migrations/` and are noted in place there: the `AppSettings` `CHECK ("id" = 1)`, and the partial unique index enforcing at most one open shift per user.

> This section deliberately carries **no table of its own**. It used to mirror spec §3 field for field — two hand-maintained copies of one fact, in slightly different words, so no diff could ever show them drifting apart. The heading stays because two migration files point at it by name.

---

## Environment Variables

There are **two separate paths** that read `.env`, and both must be kept working — they are not interchangeable:

| Path | Who loads `.env` | Used by |
| ---- | ---------------- | ------- |
| Prisma CLI | `import 'dotenv/config'` at the top of `prisma.config.ts` | `prisma migrate`, `prisma generate`, `prisma studio` |
| Seed script | `import 'dotenv/config'` at the top of `prisma/seed.ts` | `prisma db seed` (runs standalone via `tsx`, outside Nest) |
| Running app | `ConfigModule.forRoot({ isGlobal: true })` in `AppModule` | every request the API serves |

The running app's path is the one that is easy to get wrong: **Nest does not read `.env` on its own.** Without `ConfigModule`, `process.env.DATABASE_URL` is `undefined` and every DB query fails — but the app still *logs a clean successful startup*, because Prisma 7's `$connect()` on a driver adapter is lazy and the pg pool never dials until a real query runs.

> Consequence for verification: "the app started without errors" **never** proves DB connectivity in this stack. Only an actual query does. Likewise, a CORS check against `http://localhost:5173` proves nothing while that same value is the hardcoded fallback in `main.ts` — test with a distinct origin.

`ConfigModule.forRoot()` loads the file synchronously (`fs.readFileSync` → `process.env`) while the `@Module` decorator is being evaluated, i.e. before Nest instantiates any provider — so `PrismaService`'s constructor can safely read `process.env.DATABASE_URL` directly.

---

## Prisma Client Pattern

> Uses **Prisma ORM 7** (confirmed via official docs at implementation time — see Third-Party Library & Version Policy above). Prisma 7 changed several defaults vs. earlier majors: the client is generated to an explicit `output` path (not implicitly into `node_modules`), a `prisma.config.ts` file is required for schema path/migrations/seed config, `prisma migrate dev` no longer auto-runs `prisma generate` or the seed script (both must be invoked explicitly), and PostgreSQL now requires an explicit **driver adapter** (`@prisma/adapter-pg`) passed into the `PrismaClient` constructor — a bare connection string is no longer enough on its own.

`backend/prisma/schema.prisma` generator block:

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}
```

(`moduleFormat = "cjs"` matches this backend's CommonJS setup — `tsconfig.json` uses `module: "nodenext"` with no `"type": "module"` in `package.json`.)

`backend/prisma.config.ts`:

```typescript
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

One shared, injectable `PrismaService` — never instantiate `PrismaClient` elsewhere.

```typescript
// backend/src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Every other module imports `PrismaModule` and injects `PrismaService` into its own service — controllers never touch Prisma directly.

Command sequence after any schema change: `npx prisma generate` → `npx prisma migrate dev` → `npx prisma db seed` (each run explicitly — none of these trigger each other automatically in v7). The generated client folder (`backend/src/generated/prisma`) is build output, not hand-written source — it is gitignored, like `dist/`.

---

## Auth Guard Pattern

```typescript
// backend/src/auth/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.get<string>('role', context.getHandler());
    if (!requiredRole) return true;
    const { user } = context.switchToHttp().getRequest();
    return user?.role === requiredRole;
  }
}
```

Usage on admin-only routes:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Post()
create(@Body() dto: CreateUserDto) { ... }
```

---

## Account Activation Pattern

```typescript
// backend/src/users/users.service.ts
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createEmployee(dto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        hourlyRate: dto.hourlyRate,
        role: 'EMPLOYEE',
        password: null,
        setupCode: this.generateSetupCode(),        // random 4-digit string
        setupCodeExpiresAt: addDays(new Date(), 3),
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async activateAccount(email: string, hashedPassword: string) {
    return this.prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        setupCode: null,           // always cleared — never reusable
        setupCodeExpiresAt: null,
      },
    });
  }
}

// backend/src/auth/auth.service.ts — never queries Prisma directly for User data
@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async setInitialPassword(email: string, code: string, newPassword: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) throw new NotFoundException('User not found');
    // isActive is checked here, before the activation state, exactly as login does.
    // Without it a deactivated employee whose setupCode is still valid can set a
    // password: no breach (login re-checks isActive), but an unauthenticated
    // endpoint writes to a deactivated account and their Team-page badge flips
    // from "Pending" to "Active" right after the admin deactivated them.
    if (!user.isActive) throw new UnauthorizedException('This account is no longer active.');
    if (user.password) throw new ConflictException('This account has already been activated.');
    if (user.setupCode !== code) throw new UnauthorizedException('Invalid activation code.');
    if (new Date() > user.setupCodeExpiresAt!) throw new UnauthorizedException('This activation code has expired. Please contact your admin.');

    const hashed = await bcrypt.hash(newPassword, 10);
    return this.usersService.activateAccount(email, hashed);
  }
}
```

---

## Payroll Calculation Pattern

```typescript
// backend/src/payroll/payroll.service.ts
async getPayrollForCycle(userId: number, cycle?: string) {
  // Through UsersService, never prisma.user directly — that model has one owner
  // (see Invariants). And through a reader narrow enough to answer only this
  // question, so password/setupCode are never loaded to compute a wage.
  // A non-EMPLOYEE id (the admin's own included) resolves to null → 404.
  const employee = await this.usersService.findEmployeeRate(userId);
  if (!employee) throw new NotFoundException(`Employee with id ${userId} not found.`);
  const hourlyRate = this.requireHourlyRate(employee); // null → loud 500, never 0

  // Cycle boundaries come from SettingsService, which owns AppSettings — this
  // service never computes them itself. The cycle wraps across the month boundary,
  // and `cycle` being undefined means "the cycle containing now".
  const { range, cycleDto } = await this.settingsService.resolveCycleRange(cycle);

  const [shifts, openShiftCount] = await Promise.all([
    // Overlap, not containment: a shift that starts before the cycle and ends
    // inside it (or vice versa) is relevant to this cycle for the part that falls
    // within it. `lt`/`gt` (never `lte`/`gte`) against the exclusive boundary is
    // what makes adjacent cycles fit together with no gap and no double count.
    // ⚠️ NOT the GET /time-entries query — that one also lists OPEN shifts.
    this.prisma.timeEntry.findMany({
      where: {
        userId: { in: [userId] },
        endTime: { not: null, gt: range.start },
        startTime: { lt: range.endExclusive },
      },
      select: { startTime: true, endTime: true }, // narrow: pricing needs only these
    }),
    // Open shifts have no end and cannot be priced, so their day is missing from
    // the breakdown entirely. This flag is what lets the page explain the gap.
    // Matched on startTime and scoped to the cycle: a shift running right now is
    // no reason to warn about a cycle from three months ago.
    this.prisma.timeEntry.count({ where: { userId: { in: [userId] }, endTime: null,
      startTime: { gte: range.start, lt: range.endExclusive } } }),
  ]);

  // All the arithmetic lives in rate-zones.util.ts — pure, no DB, no DI, and
  // computed in integer hundredths rather than decimal floats.
  const days = buildDayZoneHours(shifts, range);      // rounds hours ONCE, per cell
  const zoneTotals = sumZoneCentiHours(days);         // exact sums of those cells

  const zones = PAY_ZONES.map(({ zone, label }) => {
    const rate = zoneRateCentiIsk(hourlyRate, zone);  // exact — never rounded
    return { zone, label,
      hours: centiToNumber(zoneTotals[zone]),
      rate:  centiToNumber(rate),
      pay:   zonePayIsk(zoneTotals[zone], rate) };    // the ONLY money rounding
  });

  return {
    ...cycleDto, // cycle/prevCycle/nextCycle/cycleStart/cycleEnd — the backend is
                 // the single source of truth; the frontend only displays these
    userId: employee.id, name: employee.name, hourlyRate,
    totalHours: centiToNumber(days.reduce((s, d) => s + d.totalCentiHours, 0)),
    totalPay: zones.reduce((s, z) => s + z.pay, 0),   // plain sum, never re-rounded
    hasOpenShift: openShiftCount > 0,
    zones,
    days: days.map(toDayDto),
  };
}
```

`getOverview(cycle?)` runs the **same** `summarise()` helper over every employee,
after one batched query for the team's shifts (`userId: { in: ids }`) — never
`findEmployeeRate()` in a loop, which would turn fifteen employees into fifteen
round trips on a page that should cost one.

---

## Invariants

Rules the AI agent (Claude Code) must never violate:

- Controllers contain no business logic and no direct Prisma calls — only services touch Prisma.
- Every service function whose data is scoped to a specific user (time entries, personal payroll, own profile) takes `userId` explicitly as a parameter and uses it in the query's `where` clause — never an implicit or missing filter. This does **not** apply to functions that are inherently global by design (e.g. `getAllEmployees()`, `getSettings()`, `login()`) — those correctly have no `userId` param. The rule only guards against *accidentally* returning unfiltered data where a user-scope should exist.
- No `PrismaClient` is ever instantiated outside `PrismaService`, with one sanctioned exception: `backend/prisma/seed.ts`, which runs standalone via `tsx` (outside the Nest app, so there's no DI container to inject `PrismaService` through) and therefore constructs its own `PrismaClient` the same way `PrismaService` does (same driver adapter). No other file gets this exception.
- `AuthService` never queries Prisma directly for `User` data — it always goes through `UsersService` (e.g. `usersService.findByEmail()`), which is the single owner of all `User`-model queries. This also fixes the build order: `Users` module is built before `Auth` module, since `Auth` depends on it.
- `TimeEntry.endTime = null` entries are never included in payroll totals — only "closed" shifts count.
- Only `RolesGuard` + `@Roles('ADMIN')` may restrict a route — never inline role checks scattered in controllers.
- "Owner or ADMIN" access to a specific row (time entries) is **not** a role check and is never expressed with a guard. `RolesGuard` compares a single role and knows nothing about who owns a row, and a guard would have to query Prisma — which only services may do. The service folds the ownership filter into the Prisma `where` itself (`{ id, ...(role === Role.ADMIN ? {} : { userId }) }`), so a row belonging to someone else and a row that does not exist produce the same **404**. This is deliberate on both counts: the caller learns nothing about rows that are not theirs, and there is no separate "am I the owner?" branch that can be forgotten on one route out of several. Note this is an authorization boundary, not a UI one — the API accepts any `:id` a client sends, and ids are sequential integers.
- There is no public `/auth/register` route. The first admin is seeded directly into the DB via a seed script, never created through the API.
- `POST /users` never accepts a `password` in the request body — employees are always created with `password: null` plus a fresh `setupCode` and 3-day `setupCodeExpiresAt`.
- `setupCode` and `setupCodeExpiresAt` are always cleared to `null` together, immediately after a successful `set-initial-password` call — a setup code is never reusable, even before it expires.
- `POST /auth/login` never succeeds while `user.password` is `null` — and it fails by **naming the real cause** (the account has not been activated yet, and activation is the next step), never a silent bypass and never a generic invalid-credentials answer that hides it. The wording is free (see the UI-copy invariant below)· what is fixed is that this case is distinguishable from a wrong password, because the two need different actions from the user.
- `POST /auth/login` never succeeds while `user.isActive` is `false` — and, as above, it says so rather than answering generically. This check is separate from, and in addition to, the `password !== null` check, and it runs **first**: an account that is both deactivated and never activated is told it is deactivated, rather than sent down an activation path that login would reject anyway.
- All user-facing text is in **English**, regardless of what language this document or the spec uses for internal notes. Beyond that, spec §8a splits into two halves that are **not** equally binding, and the split is deliberate:
  - **UI copy is binding and used verbatim** — page titles, buttons, links, badges, the rate-zone labels and the payroll column headers, stored in `frontend/src/lib/messages.ts` rather than written inline. The rate-zone labels are the sharp case: they are produced by the **backend** (`PAY_ZONES[].label` in `rate-zones.util.ts`) and printed unchanged by the client, so a label that stops matching its `rateFactorHundredths` makes the page misstate a wage. Changing a percentage means changing both, in one place, in the same commit.
  - **Error/feedback messages are not binding *as documentation*.** §8a records the wording currently in the code so it can be read without grepping· it does not constrain it. No user ever reads a backend string — `api/client.ts` maps the exception's **`code`** to the frontend's own text (see the error-code invariant below), and `ValidationPipe` output is never surfaced at all — so an API message may be improved without a spec change, and a case §8a does not list needs no new row. ⚠️ **The tests are a different matter: they assert these messages verbatim, and that stays.** The relaxation removes the obligation to keep a *document* in lockstep, not the regression net — changing a message should be a deliberate edit that turns a test red, not a silent drift. What is binding beyond the wording is the **behaviour**: the order of the checks, the status code returned, and the distinguishability required by the two `login` invariants above.
- Every controller endpoint that accepts a request body uses a DTO validated with `class-validator`, under a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`. Any field not declared on the DTO (e.g. a `password` sent to `POST /users`) is stripped/rejected by the framework itself — this is never enforced only by documentation or by the service layer choosing not to read the field.
- **`@ApiResponse({ status: 401 })` is declared once on the controller class, never per method.** Every route in `users`, `settings`, `time-entries` and `payroll` sits behind `JwtAuthGuard`, so the missing/invalid-token answer is identical on all of them; `@ApiResponse` is a `ClassDecorator` as well as a `MethodDecorator`, and the explorer merges class-level responses into every operation (`{...classResponses, ...methodResponses}`, so a method-level entry for the same status wins). This mirrors `@ApiBearerAuth()`, which already sits on the class for the same reason. **403 deliberately stays per route**: it is *not* uniform. Five routes carry no `RolesGuard` and therefore cannot produce a 403 at all, and they are two different categories that must not be conflated — the **both-roles** routes (`GET /users/me`, `GET /settings`), which are simply unrestricted by role, and the **owner-or-ADMIN** routes (`POST`/`PUT`/`DELETE /time-entries`), where access is decided by row ownership inside the service and someone else's row resolves to a **404, never a 403** (see the owner-or-ADMIN invariant above). A class-level 403 would therefore document a response those five can never return. Its wording also differs by role ("Not an ADMIN." vs "Not an EMPLOYEE."), which a single shared declaration could not express. `AuthController` is excluded entirely: its routes are unauthenticated, and its 401 means "invalid credentials", not "missing token".
- **Swagger documents only what a route can actually return, verified against the service — and never a 500.** The three deliberate `InternalServerErrorException`s (missing `AppSettings` row, out-of-range stored `cycleStartDay`, `null hourlyRate`) are *designed* refusals that name their own fix in the message, not part of the API contract: no client codes against them, two of the three are unreachable without hand-editing the database, and the industry convention is to document 2xx, the client-actionable 4xx, and at most **one generic** server error. The "run the seed" guidance belongs in the README, not on seven operations. (`DocumentBuilder.addGlobalResponse()` exists if a generic 500 is ever wanted — one declaration, not per route.) By the same rule, a status that exists in the code but cannot be reached is not declared: `GET /users/me` can throw 404 in `findUserByIdOrThrow`, but `JwtStrategy` has already answered 401 for a missing user and `DELETE` is soft, so no row ever disappears.
- **Every domain `code` is named in the `@ApiResponse` description of every operation that can return it.** A code the explorer does not show is a code nobody tries by hand in step 8 and nobody maps in `messages.ts` — and the client's behaviour for an unmapped code is the silent generic fallback. This is the same failure step 7 was created to catch, one level down: it is not enough for the *status* to be declared once the body carries a discriminator. The check is mechanical — for each entry in `ErrorCode`, grep the controllers for it. Statuses that carry no code (`ParseIntPipe`, `ValidationPipe`, and every 403) say so explicitly instead, so a silent description is always a gap rather than a decision.
- All `TimeEntry` timestamps are stored and compared in UTC. The app targets Iceland only (no DST, UTC year-round) — no timezone conversion logic is ever introduced.
- `hourlyRate` and every **pay amount** are Icelandic króna (ISK) and are always whole numbers (`Int`) — never `Decimal` or `Float`. The single exception is a **zone's rate** (`hourlyRate` × zone factor), which carries hundredths: it is ISK *per hour*, a multiplier and not a payment, and rounding it would make the Rate column stop reproducing the Pay column beside it.
- **There are exactly three rounding points in the payroll pipeline, and no others** (spec §4 decision 5d): (1) hours, to 2 decimals, per **cell** — one date × one zone, the finest figure ever displayed· (2) never on a zone's rate· (3) a zone's **pay**, to whole ISK. Everything above a rounded value is an exact **sum** of rounded values — `totalHours` sums the cells, `totalPay` sums the four zone amounts, `totalCost` sums the employees' `totalPay`. `totalPay` is therefore never itself rounded: rounding it again is exactly what would make the Pay column stop adding up to it.
- The rounded value is always the **canonical** one, never a display-only copy of something more precise: the 2-decimal hours are what get multiplied. Every figure the user sees is a figure the calculation actually used.
- **`GET /payroll` is the only endpoint that reports hours.** `GET /time-entries` carries `isSplit` but **no hours figure** (spec §4, decision 5f) — under rate zones a single number per shift is not what anyone is paid, and a second hours figure would round at a different unit (per shift vs per cell) and be able to disagree with the payroll breakdown. One number, one owner, nothing to reconcile. Do not add an "hours" field back to the shift list· if a sanity check is wanted there it is an explicit **Duration** (`end − start`), which is a property of the shift and not a payroll figure.
- All payroll arithmetic is done in **integer hundredths** (centihours, centi-ISK), never in decimal floats — `2450 * 1.33` in IEEE doubles is not exactly `3258.5`, and a wage must not depend on which way that lands. Conversion to a decimal number happens once, on the way out.
- The four rate zones and their percentages are **hardcoded constants** in `rate-zones.util.ts`, never `AppSettings` fields. Payroll is recomputed on every request and never frozen, so an admin-editable percentage would silently rewrite every past cycle· changing one is a developer action requiring a deploy. (The same property already applies to `hourlyRate` — see spec §13, gap 1.)
- Zone hours are accumulated across **all** of a user's shifts before the cell is rounded — never rounded per shift and then summed, which would let two short shifts on the same day each lose up to 18 seconds.
- `NIGHT` and `WEEKEND` are returned as separate zones even though they share a rate. A client can always merge two rows and can never split one, and a future change to either percentage must not be a change to the response shape.
- The payroll `zones[]` array is rendered by the frontend **as a list**, never as hardcoded columns/rows — a new zone must appear on the page with no frontend change. This is the condition the four-zone decision was taken under.
- `PayrollDayDto.date` is a bare `YYYY-MM-DD` and must be formatted **as UTC** on the client. `new Date("2026-07-25")` read in a negative-offset timezone prints the previous day, which would put a Saturday's weekend hours on a row labelled Friday.
- `AppSettings.cycleStartDay`/`cycleEndDay` default to 25/24, meaning a cycle wraps across the month boundary (e.g. 25 Jun → 24 Jul) — a cycle never resolves to a same-month start/end range.
- `cycleStartDay` is restricted to **11–25** and `cycleEndDay` must be exactly `cycleStartDay - 1` (10–24). Enforced by `class-validator` on `UpdateSettingsDto`, so it holds for any caller — a restricted `<select>` in the admin UI (Step 13) makes the mistake impossible *by accident*, the DTO makes it impossible *at all*, and the two are layers rather than duplicates (the same reasoning as `findByEmail()` + `P2002` in `createEmployee`). Two properties follow and are the reason for the range: consecutive cycles are **contiguous**, so no shift falls into a gap between cycles or into two of them at once· and every allowed day exists in every month, so day-of-month **clamping is never needed** for 28/29/30/31-day months. Because the range is fully determined by `cycleStartDay`, the arithmetic reads only that field — `cycleEndDay` is stored and validated but never computed with, so the two can never disagree about where a boundary is.
- **The cycle's end boundary is exclusive everywhere inside the backend, and inclusive only on the way out.** `computeCycleRange()` returns `{ start, endExclusive }`, and every Prisma filter compares against `endExclusive` with `lt` — never `lte`. `endExclusive` is midnight, which is simultaneously the next cycle's `start`, so adjacent cycles fit together with no gap and no overlap: that single instant is what makes shift splitting exact. Only the response DTO carries `cycleEnd = endExclusive - 1ms` (e.g. `23:59:59.999`), which exists purely so the UI can print "25 Jul – 24 Aug" without doing date arithmetic. `cycleEnd` never appears in a query and `endExclusive` never appears in a DTO — the names are what keep them apart.
- **A shift that crosses a cycle boundary is split, never assigned wholesale to one cycle.** Its hours are apportioned to each cycle it overlaps (the intersection of the shift with the cycle, done in `rate-zones.util.ts`), so the sum across all cycles always equals the hours actually worked: no hour is lost at a boundary and none is paid twice. Consequently, cycle queries select entries that **overlap** the range (`startTime < endExclusive AND endTime > start`), not entries whose `startTime` falls inside it, and the same entry legitimately appears in two cycles — flagged with `isSplit`, which is what tells the reader why. Open shifts (`endTime = null`) cannot be split — they contribute 0 hours and are listed under the cycle containing their `startTime`. **This makes the shift-list query deliberately different from the payroll query, and they must not be shared.** Payroll takes closed shifts overlapping the cycle· the list takes those *plus* open shifts matched on `startTime`, because `endTime: { not: null }` would drop them and the approved `ShiftList` renders an "Open" badge for exactly those — an employee who forgot to clock out needs a screen on which to find and fix it. For the same reason `GET /time-entries/open` exists separately: an open shift started in the previous cycle is filtered out of the current one, so the Clock page cannot learn its button state from the list.
- The backend is the single source of truth for pay-cycle date boundaries. `resolveCycleRange()` lives only in `SettingsService`, which owns the `AppSettings` row it derives from; `TimeEntriesService` and `PayrollService` inject `SettingsService` rather than resolving cycles themselves, the same way `AuthService` goes through `UsersService` for every `User` query. The date arithmetic itself lives in `cycle.util.ts` as pure functions (`cycle`, `cycleStartDay` → `{ start, endExclusive }`) with no DB and no Nest, so it can be unit-tested standalone. Every response that involves a cycle (time-entries list, payroll breakdown) returns the same block: `cycle`, `prevCycle`, `nextCycle`, `cycleStart`, `cycleEnd`. The frontend never computes cycle boundaries itself — the ◀▶ `CycleNavigator` sends back the `prevCycle`/`nextCycle` key it was handed rather than doing month arithmetic, so not even a month rollover is implemented twice.
- **`?cycle=` is optional on every cycle-aware endpoint· omitting it means "the cycle containing now", and that default is resolved in `SettingsService`, never by a caller.** The rule is `now.getUTCDate() >= cycleStartDay ? this month : the previous month` — which is *not* the current calendar month: on 3 August with a 25th boundary the current cycle is `2026-07`, and the obvious `now.toISOString().slice(0, 7)` would return `2026-08`, a cycle that has not started yet, showing the employee an empty page for work they have done. Three call sites need this default (time entries, personal payroll, the admin payroll overview), each of which would otherwise need its own copy of both the settings read and the comparison. Because the resolved `cycle` key is echoed back in the response, the client always knows which cycle it was actually given.
- `/time-entries/clock-in` and `/time-entries/clock-out` are EMPLOYEE-only — the admin never clocks in/out and has no Clock page/ClockButton in their UI. Admin lands on the Team page after login instead.
- `/time-entries/clock-in` fails (never silently creates a duplicate) if the user already has an open `TimeEntry` (`endTime = null`) — a user can have at most one open shift at a time. Enforced at **two** levels, like `User.email`: the service checks first so the ordinary case returns a clean 400 without depending on driver error codes, and a **partial unique index** (`ON "TimeEntry" ("userId") WHERE "endTime" IS NULL`, hand-written in a migration since Prisma's DSL has no `WHERE` on `@@unique`) closes the check-then-act window, with `P2002` caught and translated to the same message. Neither layer alone is enough: a double-tap on the Clock In button — the largest control on the page on mobile — would otherwise create two open shifts, and the consequences are not cosmetic. `clock-out` closes only one (it resolves the caller's open shift with `findFirst`), the survivor can never be closed by its owner at all, and the open-shift block then locks that employee out of every write until an admin intervenes.
- **The manual write path (`POST /time-entries`, `PUT /time-entries/:id`) always produces a *closed* shift — `endTime` is required on both and is never accepted as `null`.** The form is the tool for shifts that have already ended; clock in/out is the tool for live ones. This is what keeps "at most one open shift" enforceable in a single place (clock-in) instead of three, and it closes the back door where `PUT` could reopen a closed shift and make its hours vanish from payroll with no error. It follows that an open shift cannot be edited while open: the employee clocks out first and then corrects the row.
- **Two shifts of the same user may never overlap in time** — the write is rejected with a 400. Two entries 08:00-16:00 and 12:00-20:00 would pay 16 hours for 12 worked, and since nobody occupies two shifts at once, an overlap is always an error rather than a case to support. For this check an **open** shift occupies `[startTime, ∞)`, and on `PUT` the row being edited is excluded from its own check (`id: { not: id }`). Note the word *overlap* does double duty in this codebase: everywhere else it means shift ↔ **cycle** (which drives splitting and is legitimate); here it means shift ↔ **shift**, which never is.
- **`startTime` and `endTime` are never accepted in the future** (equal to `now` is allowed, so writing the minute that just passed does not race the request). Beyond rejecting obviously wrong data, this is what makes the overlap rule airtight at the clock-in door **for free**: time only moves forward, so if no closed shift can ever extend past `now`, a clock-in at `now` can never land inside one — no extra query is needed there.
- **The open-shift block is asymmetric by role, and both halves are load-bearing.** When the *row owner* has an open shift, an **EMPLOYEE** may not `POST` or `PUT` at all — not even on the open row itself — and clock-out is the one action that unblocks them. An **ADMIN** is subject only to the overlap rule. The employee half is what makes an overlap created *by clock-out* impossible by construction: if nothing can be written while a shift is open, closing it cannot swallow anything, and no interval arithmetic against the open shift is needed. The admin half is not a convenience: clock-out is EMPLOYEE-only and closes *the caller's own* shift, so `PUT` is the only tool that exists for someone else's open shift — without it, an open shift belonging to a **deactivated** employee (who can no longer log in) would stay open permanently, and an admin would be locked out of the entire ledger for as long as any employee happened to be on shift. The check always reads the **row owner's** state, never the caller's.
- **`userId` belongs to `CreateTimeEntryDto` and to no other DTO.** On create it is required for an ADMIN and rejected for an EMPLOYEE (who always writes to themselves) — the approved `ShiftList` renders "Add Shift" on the admin's `/shifts/:userId` route, and without it that button would write the shift to the admin's own account: no `hourlyRate`, no Clock page, absent from `GET /users`, never surfaced and never paid. On update it stays forbidden, because there it would *move* an existing shift between people rather than assign a new one. Assignment and reassignment are different operations and only the first one is supported.
- **A service that needs data from another module's model gets a narrow, purpose-named reader with an explicit `select` — never a general getter returning a whole row.** `UsersService` remains the single owner of `User` queries, so `TimeEntriesService` and `PayrollService` go through it (as `AuthService` already does), but what they get back is scoped to the question they asked: existence, or a rate. `findActiveById()` established this in step 3 for the same reason it matters generally — a method returning the full `User` carries `password` and `setupCode` to every future caller, and this project has already leaked exactly that twice (the removed `findById()` in step 2, the reused response DTO in step 3). Keeping the shape narrow makes the leak impossible rather than merely absent.
- The Payroll page/component is a single shared component for both roles — the admin view is the same component with `userId` unlocked instead of pinned to `me`.
- Frontend components never call `fetch` directly — all HTTP calls go through `frontend/src/api/`.
- Passwords are never stored or logged in plaintext — always bcrypt hashed before persistence.
- `AppSettings` always operates on the single fixed row (`id = 1`) — never creates a second settings row. Enforced at two levels: application code always reads/writes via `id: 1`, and the DB itself has a hand-written `CHECK ("id" = 1)` constraint (added via raw SQL in a migration, since Prisma's schema DSL has no native check-constraint syntax) — so even a mistaken `create()` with a different id fails outright instead of silently succeeding.
- `DELETE /users/:id` sets `isActive = false` — it never hard-deletes a User row, since that would cascade/orphan their TimeEntry and payroll history. Deactivated users lose access immediately — both new logins and any token they already hold (see the `JwtStrategy` invariant below) — but their historical data remains intact.
- `PUT /users/:id` and `DELETE /users/:id` operate on **EMPLOYEE rows only** — an id belonging to an ADMIN resolves to 404, never a successful write. Two reasons, both load-bearing: an admin has no `hourlyRate` by design (see § Database Schema), and deactivating the only admin is unrecoverable through the API — login checks `isActive`, there is no reactivation endpoint, and there is no public register route. The role filter lives in the service lookup (`findEmployeeByIdOrThrow`), not in the controller.
- A response DTO is never reused across trust boundaries. `UserResponseDto` is the **admin's view of other people** and deliberately carries `setupCode`; `UserProfileDto` is the **user's view of themselves** (`GET /users/me`, the `user` object in the login response) and never carries it, nor `isActive`/`hasActivated`, which are constant for anyone who just authenticated. `UserProfileDto` is declared standalone — never derived from `UserResponseDto` via `OmitType`/`PickType`, because subtractive derivation leaks by default: a field added to the admin DTO would silently flow into the auth response. Adding a field to a self-facing DTO must be a deliberate act of writing it there.
- `POST /auth/login` returns `{ accessToken, user }` — the token alone is not enough for the client, since the JWT payload carries only `{ userId, role }` and the `Header` needs `name` on every protected page. Returning the user here is what spares the frontend a follow-up `GET /users/me` on every login.
- The JWT is a single token valid for **14 days**, with no refresh-token mechanism — deliberately out of scope for Phase 1 (it would require storing a revocable token, a `/auth/refresh` route, and silent-retry logic in `api/client.ts`).
- **The token proves identity; the database decides authority.** `JwtStrategy.validate()` resolves the payload's `userId` through `UsersService.findActiveById()` on every authenticated request and rejects the request if that user is missing or `isActive` is `false` — so `DELETE /users/:id` takes effect immediately instead of leaving a deactivated user working until their token expires. `role` is read from the row for the same reason: it is current, not whatever was signed. The lookup uses `select` to fetch only `id` and `role`; running on every request, it must never pull `password`/`setupCode` into memory. This deliberately replaces the original "trust the payload, never touch the DB" decision from Step 3, which was made when every endpoint was read-only — Time Entries writes hours that become wages, and a per-endpoint check would be a rule someone must remember on each new write route.
- `POST /auth/login` and `POST /auth/set-initial-password` are rate limited to **5 requests per 60 seconds per IP** (`@nestjs/throttler`, separate bucket per route). Without it the 4-digit `setupCode` — 9,000 combinations against guessable emails on an unauthenticated endpoint — is brute-forceable. `ThrottlerModule.forRoot()` is registered in `AppModule` because the module is `@Global()`: it configures the whole app, so it belongs with the other root-level config. Configuring it throttles nothing on its own — a route is rate limited only where it opts in with `@UseGuards(ThrottlerGuard)`.
- The `Role` type always comes from the Prisma-generated client (`import { Role } from '../generated/prisma/client'`), never hand-written as `'ADMIN' | 'EMPLOYEE'`. `schema.prisma` is the single source of truth for the domain model, and a hand-copied union is a second one.
- **`setupCodeExpiresAt` travels with `setupCode` in `UserResponseDto`, and never appears in `UserProfileDto`.** The Team page prints "Valid until 29 August" — a date, not a duration — both in the dialog shown after creating an employee and on every pending row, so an admin can spot one about to lapse and chase it. A code without its expiry cannot be presented that way. Both fields are non-null in exactly the same cases, being set and cleared together.
- Every user-facing response that carries an unactivated employee includes their `setupCode`. The admin has no other channel to obtain it, and spec §5 requires them to hand it to the employee out of band — so omitting it from `GET /users`/`POST /users` breaks account activation entirely. It is naturally `null` for activated employees (cleared on activation) and for admins (never issued).
- `setupCode` is generated with a CSPRNG (`randomInt` from `node:crypto`), never `Math.random()` — it is the only secret gating access to an unactivated account.
- Uniqueness of `User.email` is enforced at **both** layers: the service checks `findByEmail()` first so the common case returns a clean 409 without depending on driver error codes, and the surrounding `create()` catches Prisma `P2002` so a concurrent double-submit races into the same 409 instead of an unhandled 500. Neither layer alone is sufficient — the check has a TOCTOU window, and the catch alone would put the happy path at the mercy of Prisma-specific error codes.

### Frontend invariants

*(Added 2026-08-26, when steps 9–13 were rewritten against the finished API. Each exists because a second implementation of the same thing is how this codebase acquires a bug nobody can see.)*

- **Every domain exception is thrown through one of the four factories in `src/common/domain-errors.ts`** (`badRequest`/`unauthorized`/`notFound`/`conflict`), never with a bare `new BadRequestException('…')`. That is what makes "carries a code" a property of the mechanism instead of a rule to remember at each new throw site. Two mechanics of `@nestjs/common` decide the shape, both verified in the installed source rather than assumed: `createBody()` returns an **object** response verbatim and does *not* merge in a `statusCode` (so the factories write it), and `initMessage()` reads `response.message`, which is what keeps `error.message` — and every `rejects.toThrow('…')` in the suite — meaningful. The existing Nest exception classes are kept rather than replaced by one `DomainException`, because several specs assert the class directly and the class name is what makes a stack trace legible. **The 24 sites map to 17 codes**: two sites needing the same sentence share one, and in the `INVALID_CREDENTIALS` case they *must* — an unknown email and a wrong password answering differently would reopen the account enumeration their shared message exists to close. Excluded by design: the three `InternalServerErrorException`s, `jwt.strategy.ts`'s guard-level 401, and every `ValidationPipe` 400.
- **Every domain exception carries a stable `code`, and the client keys its text off that — never off the status, and never off `message`.** A status is too coarse: `400` already means four different things on `POST /time-entries` (open shift exists / shifts overlap / time in the future / end before start), and a status-keyed map collapses them into one sentence that does not tell the user what to fix. [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) says the same — the status is *advisory*, the discriminator belongs in the body — and we take its substance without its ceremony (`type` URIs, `application/problem+json`), since this API has exactly one known client. The backend's `message` exists for tests, Swagger and logs; the user's sentence lives in `messages.ts` as `ERRORS: Record<ErrorCode, string>`, whose exhaustiveness the compiler enforces. ⚠️ **A code is not guaranteed to want a single sentence.** Most do — `EMPLOYEE_NOT_FOUND` reads the same across all seven operations that return it. But `ACCOUNT_ALREADY_ACTIVATED` is thrown at an employee about *themselves* on `/activate` and at an admin about *someone else* on Team, where the fact is identical and the useful sentence is not. The map must leave room for a per-screen override (see build-plan §9), or that text ends up written inline in JSX, which the invariant below forbids. The two wordings are free to differ and to change independently — the `code` is the only thing both sides agree on.
- **Only the access token is persisted. The user object is never written to `localStorage`.** It comes from the login response at login and from `GET /users/me` when a tab opens, behind an `isBootstrapping` state. Persisting the user would make storage a second source of truth for `role`, which decides which pages render and is editable by hand — and would leave one hole in the "deactivation takes effect immediately" property that `JwtStrategy` enforces on every request.
- **Auto-logout fires only for a 401 on a request that carried an `Authorization` header.** A 401 from `/auth/login` or `/auth/set-initial-password` means "wrong credentials" and belongs in the form; clearing the session there would wipe the form before the user could read why it failed. The discriminator is whether the header was sent, never a list of endpoints someone must remember to update as routes are added. **A network failure is not a 401** — no response means no logout: keep the token, show the error, offer a retry. ⚠️ Only genuine transport failures (a `TypeError` from `fetch`, or the `TimeoutError` from `AbortSignal.timeout`) are relabelled as one: anything else thrown there is a bug in the client, and disguising it as "check your connection" sends the next reader to the wrong layer.
- **`api/client.ts` is configured at module scope, never from an effect.** `AuthContext.tsx` calls `configureApiClient()` while the module is evaluating, and holds the token in a module variable rather than a ref. ⚠️ The reason is not style: React runs a **child's** effects *before* its parent's, and `AuthProvider` is the parent of every page — so a page fetching on its first commit would send its request before an effect-based registration had run, with no `Authorization` header and therefore no auto-logout either, since the rule above keys off whether a header was sent. For the same reason the 401 handler clears the token **inside the module** and only notifies React afterwards: losing the "session expired" banner is cosmetic, keeping a dead token is not. Nothing about this wiring needs React state, so nothing about it should wait for React.
- **The client's `ErrorCode` union is the backend's 17 codes plus 3 the client synthesises.** `RATE_LIMITED` (the 429's body carries no code and the throttler's wording is never shown), `NETWORK_ERROR` (no response at all) and `UNKNOWN_ERROR` (a `ValidationPipe` 400, a guard's codeless 401/403, or a code this client has not been taught). Normalising in `client.ts` is what makes `errorText(code, screen?)` **total**, so no caller has to think about HTTP. ⚠️ The union is hand-written and cannot drift-check itself against `backend/src/common/error-codes.ts` — `toErrorCode()` degrades an unrecognised code to `UNKNOWN_ERROR` rather than rendering `undefined`, and it tests membership with `Object.hasOwn` on the `ERRORS` map itself (never `in`, which would accept `"toString"` as a code).
- **`frontend/src/lib/datetime.ts` is the only place a date or time is formatted or parsed.** No component calls `new Date`, `toLocaleString` or `toLocaleDateString`. Every formatter passes `{ timeZone: "UTC" }`, matching the backend end to end. A `datetime-local` value is converted by **appending `":00.000Z"`** — ⚠️ **never `new Date(value).toISOString()`**, which reads it as local time and shifts it by the developer's offset, moving the shift into a different rate zone and changing someone's pay. That bug compiles, looks right, and no backend test can see it.
- **`frontend/src/lib/format.ts` is the only place a number is formatted** (added step 12, in the shape of `datetime.ts` and for the same reason). Three functions, and each carries a rule rather than a preference: `formatHours` prints **exactly 2 decimals** — padding `5` to `5.00` is presentation of the same value, since 2 decimals per cell is the server's canonical unit, while showing *fewer* would be a **fourth rounding point** where the pipeline is specified to have three· `formatRate` prints **exactly 2 decimals and never rounds**, because a rate shown as `3,259` instead of `3,258.50` stops reproducing the `pay` beside it — measured at ~3 ISK on one line, 0.5 ISK per surcharged hour, **systematically** in the same direction, ~50 ISK a month· `formatIsk` prints **whole ISK**, and its `maximumFractionDigits: 0` is not a rounding point because every pay amount the API sends is an `Int` computed in integer centi-ISK. The locale is pinned to `en-GB` as in `datetime.ts`. ⚠️ Nothing here computes: each function takes one number the server already decided. A fourth function joined in step 13-2 under the same rule — `formatOrdinalDay` (`24` → `"24th"`), which names the pay cycle's derived end day. Its suffix comes from `Intl.PluralRules(…, { type: "ordinal" })` rather than a last-digit rule, because the naive version produces "11st" and "12nd" and **both days are inside the range this project uses**.
- **`frontend/src/lib/` imports nothing from `frontend/src/api/`.** `lib` is the base layer and `api/client.ts` already depends on `lib/messages.ts`, so an import in the other direction closes a cycle: `messages` → `api/payroll` → `api/client` → `messages`. Caught in the step 12 review, where `SHORT_ZONE_LABELS` had been typed with `satisfies Record<PayZone, string>` against the type in `api/payroll.ts`. ⚠️ It was harmless *only* because `verbatimModuleSyntax: true` erases an `import type` outright — it becomes a real runtime cycle the moment anyone turns that into a value import, with a module load order that can differ between `npm run dev` and the production bundle, and **nothing in the toolchain catches it** (there is no `eslint-plugin-import`). The map is therefore keyed by plain `string`, and the exhaustiveness the compiler used to give is deliberately not replaced: it guarded "a zone was added without a short label", which is exactly what the fallback below absorbs.
- **The payroll day table's column headers come from a local map keyed by `zone`, with the server's `label` as the fallback** (`zoneShortLabel` in `messages.ts`). §8a fixes **two** different sets of words and both are binding: the summary prints `zones[].label` **verbatim** ("Evening +33%"), because the surcharge is checkable there against the Rate and Total Pay beside it· the day table carries **no money at all**, so a percentage in its headers is unverifiable noise across six columns, and §8a names them `Date / Day / Evening / Night / Weekend / Total`. What is never copied locally is the **percentage** — only the word — so no local string can misstate a wage. The columns themselves are still generated from `zones[]` (count, order and key), so a fifth zone appears with no frontend change, wearing its full label.
- **A payroll Total row is read, never added — including the day table's.** A column's total **is** `zones[].hours` and the grand total **is** `totalHours`, because the server builds those zone totals by summing these very cells in integer centihours (`sumZoneCentiHours` over the same filtered day list the table renders). Reading them back is not a shortcut, it is the only way to get the same answer: a JavaScript re-sum of the decimals disagrees in about a third of rows. ⚠️ Verified live in step 12 across three cycles, including one with fractional hours — the identity "summing `days[].hours[Z]` over every date equals `zones[Z].hours`" had never been checked by any test or manual sweep before.
- **The UTC rule is stated to the user rather than hidden**, but only when it matters: `TimezoneNotice` renders in the layout when `new Date().getTimezoneOffset() !== 0`, and nowhere else. In Iceland UTC *is* the wall clock, so the notice would be pure noise; outside it, a shift clocked at 15:00 local displays as 12:00 and looks like the app lost three hours. Zone and offset come from the **browser**, never from IP — the right question is "does your clock differ from UTC", and one IP needs two different answers in Athens depending on the month. Offsets are not always whole hours (India +5:30, Nepal +5:45).
- **Every read goes through `hooks/useApiQuery`.** It owns the ignore-flag cleanup, without which three fast clicks on ◀ can resolve out of order and leave one cycle's data under another cycle's header — and without which React 19's StrictMode double-invocation looks like a backend bug. Writes are explicit: the page calls `refetch()` afterwards.
- **`?cycle=` lives in the URL (`useSearchParams`), and the ◀▶ navigates with `replace`, not `push`.** The URL is what carries the cycle through the admin's drill-down from Payroll Overview into one employee's breakdown — with component state, they click a July figure and land in August. `replace` is what stops five clicks on ◀ from filling the history so that Back walks cycles instead of leaving the page.
- **The frontend performs no arithmetic on payroll figures.** No `Math.round`, no summing a column, no recomputing a total — `totalHours`, `totalPay`, `totalCost` and `day.totalHours` are printed as sent. The server's totals are exact sums of rounded parts; a browser re-sum is a second, competing answer that disagrees about a third of the time (`1.99 + 22.35 + 2.92` → `27.259999999999998`). The same rule forbids a duration column in the shift list: a **split** shift appears in two cycles carrying its full `startTime`/`endTime`, so a computed duration would show its whole length twice — reintroducing the double-count that splitting exists to prevent.
- **Which routes each role may reach is written down, never inferred.** `/clock`, `/shifts` and `/payroll` are EMPLOYEE-only (the endpoints behind them are `…/me` routes); `/shifts/:userId`, `/payroll/:userId`, `/team`, `/payroll-overview` and `/settings` are ADMIN-only; `/login` and `/activate` are public. `ProtectedRoute` enforces it, and a wrong-role visit redirects to that role's home rather than rendering a blank page. This is spelled out because generated authorization defaults to permissive — a 2026 review of AI-built codebases found IDOR in four of six, and missing role boundaries in most of them. The server is the real defence and already holds it; this keeps the UI from disagreeing with it.
- **Old cycles are read-only for an EMPLOYEE and open to an ADMIN** (step 8c). `POST`/`PUT`/`DELETE /time-entries` refuse an employee's write outside the current or previous cycle, so a paid cycle stops moving. The admin exemption mirrors the open-shift asymmetry above and for the same reason: they are the only actor who can repair a genuine historical error, including the forgotten open shift of a deactivated employee who can no longer log in to close it. The window is a **lower bound only** (`SettingsService.resolveWritableCycleStart()` — the previous cycle's start): rule 4 already refuses anything after `now`, so no upper guard is needed. `PUT` checks **both** the existing row's `startTime` and the incoming one, because the two holes are separate and one check closes only one — checking only the new value lets an employee drag a paid June shift into August, checking only the old one lets them push a current shift back into June. The list response reports this at **two** levels, because the client cannot derive either without resolving cycle boundaries, which the invariant above forbids: per entry, `canEdit` — whether **the caller** may edit *or delete* that row, anchored on `startTime` so a split shift that began in a closed cycle stays locked· and once per response, `canWrite` — whether they may create a shift in this cycle at all. The second is not redundant, since a `POST` has no row to carry a flag. ⚠️ **Both flags are cycle-scoped only and deliberately ignore the open-shift block**, which is transient (clock-out clears it), does not apply to `DELETE`, and answers with its own actionable `OPEN_SHIFT_EXISTS`. One boolean carrying two reasons would leave the UI unable to say which is in force. ⚠️ `canWrite` is a **sibling of `entries`, never a member of the shared cycle block**: those five fields describe the cycle and are the same for everyone, while this one describes the caller and changes with the token — which is what keeps "every cycle-aware response carries the same block" true and keeps a meaningless field off the payroll response.
- **Both time-entry list routes report `userId` and `name`, siblings of `entries` for the same reason `canWrite` is** (step 8d). The cycle block says *when*; these say *whose list this is*. The asymmetry they close was in the existing API rather than in any plan: `/payroll/:userId` and `/payroll/me` have returned both since step 6, from one method serving both routes, so the admin got a name on one of a person's two pages and not on its twin — and `/shifts/:userId` would otherwise have to call `GET /users` to print a heading, downloading the whole team with every pending `setupCode` to render one label. **`name` is therefore returned on `/time-entries/me` too**, where it is the caller's own and the employee page never prints it: one response shape for both routes is the rule (build-plan §5), and payroll already pays the same price. The cost is one primary-key lookup on a route that previously made none — accepted knowingly, not overlooked. It is bought through `UsersService.findEmployeeNameOrThrow()`, a narrow reader with an explicit `select` that **throws** the existing `EMPLOYEE_NOT_FOUND`, which is what lets it *replace* `assertEmployeeExists()` on the admin route instead of running beside it — existence and name are one question and stay one query. It is resolved **before** the cycle, so a bad id keeps answering 404 ahead of a malformed `?cycle=` answering 400 rather than racing it· and it carries **no `isActive` filter**, so a departed employee's history stays readable and repairable. No 404 is declared on `GET /time-entries/me`: `RolesGuard` and `JwtStrategy` have already proved the caller is an existing active EMPLOYEE, so the lookup cannot fail there — the same reasoning that keeps a 404 off `GET /users/me`.
- **A successful write is confirmed by a toast when the screen it leaves the user on cannot show that it happened** (fixed in step 13-2, so 13-3 copies a rule instead of deciding six times). This *names* what steps 10 and 11 already decided rather than adding anything: clock-in gets **no** toast because it rewrites the button and adds a line beneath it — a confirmation that is structural and permanent — while `ShiftForm` gets one because the dialog closes onto a list that may be identical. Settings is the sharpest case and the reason the rule is written down here: a save leaves the same page with the same values, so without a toast the only evidence is the Save button going quiet. Two corollaries follow for step 13-3: **deactivate takes a toast** (the row disappears behind the filter, which reads as a hard delete of someone whose payroll history is in fact kept), and **create takes none** (the setup-code dialog opens, which is louder than any toast).
- **A destructive or irreversible write is confirmed *before* it happens, by an `AlertDialog` in the shape of `DeleteShiftDialog`** (step 11) — and there is exactly one such shape. `onConfirm` returns a promise; a rejection keeps the dialog **open** with the reason rendered inside it, both buttons disable while the write is in flight, and the page owns the write while the dialog owns only the asking. Step 13-2 rebuilt this from scratch before noticing the precedent, with the opposite failure behaviour, and was corrected to mirror it: a confirmation that closes on failure returns the user to a screen that looks unchanged, which is exactly the question they were asking. ⚠️ The two mechanisms answer different questions and both can apply to one write — the dialog asks *do you mean this*, the toast reports *it happened*.
- **Every string a user reads comes from `frontend/src/lib/messages.ts`** — labels, buttons, badges and error text alike, never written inline in JSX. This is the same rule the binding half of §8a already imposes on UI copy, extended to the `ERRORS` map.
- **No new frontend dependency without a decision.** Settled and closed for Phase 1: native `fetch` (no axios — the whole value of an HTTP client concentrates in the one wrapper we write anyway, and the interceptor pattern's killer feature is silent token refresh, which this project deliberately does not have), no TanStack Query (its central benefit is a shared cache across components requesting the same data, and no two pages here share an endpoint). ⚠️ **The blanket "no toast library" was lifted in step 11** — the reasoning and the three measurements that shaped the component are at the end of this bullet. The approved additions are `zod`, `react-hook-form`, `@hookform/resolvers`, `vitest`, `@playwright/test`, `sonner`, and shadcn components pulled from the registry — plus, from step 10, the DOM test layer: `jsdom`, `@testing-library/react` and its `@testing-library/dom` peer, all dev-only. Three things about that last group are measurements rather than preferences, and are recorded so nobody re-derives them: **jsdom is pinned to 29, not 30**, because 30 requires Node `^22.22.2` while this project runs 22.14.0 (29 asks for `^22.13.0`)· the DOM is opted into **per spec file** with a `// @vitest-environment jsdom` control comment, so the pure-function specs keep running under `node`· and `globals: true` was **not** enabled — it is what RTL's automatic cleanup depends on, so each DOM spec calls `cleanup()` itself rather than every existing spec inheriting a new global surface. `@testing-library/jest-dom` was deliberately **not** added: its matchers (`toBeDisabled`, `toHaveTextContent`) are one line of plain DOM reading each. ⚠️ `fileParallelism: false` in `vite.config.ts` belongs to the same decision — booting jsdom costs ~9s per worker here, and under the default parallel forks the DOM specs failed to start at all while the node specs passed, i.e. a green-looking run that had silently skipped them.
- **`sonner` is the one confirmation mechanism for a write that changes nothing on screen** (added step 11, `sonner@2.0.8` — peers `react ^18 || ^19`, **zero runtime dependencies**). The rule it replaces was not wrong, it was aimed at a different case: step 10 refused a toast for clock-in because that write changes the button's label *and* adds a line under it, so the confirmation is already structural and **permanent**, where a toast lasts four seconds. `ShiftForm` is the opposite — a dialog that closes on success, and a shift saved into a cycle other than the one on screen leaves the list **identical**. A toast there is additive, not redundant. Deciding it in step 11 rather than step 13 was deliberate: Team and Settings carry at least five more of these (save settings, create employee, edit rate, reactivate, re-issue setup code), and five pages inventing five confirmations is exactly the divergence this file exists to prevent. ⚠️ **`npx shadcn add sonner` writes a file that does not compile** — the `base-nova` copy imports `next-themes` and `@/app/(create)/components/icon-placeholder`, a Next.js route path. Unlike the empty `form.json`, the item is real, so the failure surfaces as a broken build rather than a silent no-op. `components/ui/sonner.tsx` is therefore hand-written, and three departures from the registry copy are measurements: **no `next-themes`** (nothing in this app ever applies the `.dark` class, so it is light-only, and the registry's `theme="system"` would have made toasts follow the OS while the page stayed light — sonner's own default of `"light"` is what the app actually is)· **icons imported straight from `lucide-react`**, already a dependency, since `IconPlaceholder` exists only to swap icon libraries at install time· and **no `cn-toast` class**, which `index.css` never defines and which therefore styled nothing. The CSS-variable mapping is kept verbatim — it is the whole reason to wrap `Sonner` rather than render it bare. ⚠️ One cost is booked rather than discovered: toasts are timing-dependent DOM and are the classic source of flaky end-to-end tests, so step 13b asserts the durable state change wherever it can and the toast only where the toast *is* the change. ⚠️ **The cross-cycle toast carries no action button**, and the reason is an invariant rather than a preference: deciding *which* cycle a saved shift landed in means resolving cycle boundaries in the browser, which the rule above forbids. Whether it is visible needs no arithmetic — the row is absent from the refetched list — so the toast states that and stops there. A button that moved one cycle and still failed to reveal the shift would be worse than none.
