# Architecture — SwiftTrack (Phase 1, Single-Tenant)

## Stack

| Layer      | Tool                     | Purpose                                          |
| ---------- | ------------------------ | ------------------------------------------------ |
| Backend    | NestJS                   | REST API, modules, guards, business logic        |
| ORM        | Prisma                   | DB schema, migrations, typed queries             |
| Database   | PostgreSQL (Docker)      | Persistence — User, TimeEntry, AppSettings        |
| Frontend   | React (Vite)             | SPA client                                       |
| Styling    | Tailwind CSS + shadcn/ui | UI components and styling                        |
| Auth       | JWT (`@nestjs/jwt`)      | Stateless auth, role-based access                |
| API Docs   | Swagger                  | Auto-generated API reference                     |
| Validation | `class-validator` + `class-transformer` | DTO-based request validation, global `ValidationPipe` |
| Language   | TypeScript               | Throughout (backend + frontend)                  |

---

## Folder Structure

```
/
├── docker-compose.yml
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma                  → User, TimeEntry, AppSettings models
│   │   └── migrations/
│   ├── src/
│   │   ├── main.ts                        → App bootstrap, Swagger setup, global ValidationPipe (whitelist+forbidNonWhitelisted), CORS for frontend origin
│   │   ├── app.module.ts
│   │   ├── prisma/
│   │   │   ├── prisma.service.ts          → Injectable PrismaClient wrapper
│   │   │   └── prisma.module.ts
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts         → POST /auth/login, /auth/set-initial-password
│   │   │   ├── auth.service.ts            → login, setup-code verification, hashing — uses UsersService, never Prisma directly
│   │   │   ├── jwt.strategy.ts
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── roles.guard.ts             → @Roles('ADMIN') decorator support
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts        → GET/POST/PUT/DELETE /users
│   │   │   └── users.service.ts           → creates employees with setupCode, no password
│   │   ├── time-entries/
│   │   │   ├── time-entries.module.ts
│   │   │   ├── time-entries.controller.ts → clock-in, clock-out, CRUD
│   │   │   └── time-entries.service.ts
│   │   ├── payroll/
│   │   │   ├── payroll.module.ts
│   │   │   ├── payroll.controller.ts      → GET /payroll/me, /payroll/:userId
│   │   │   └── payroll.service.ts         → flat-rate calc (Stage A), zones/OT later
│   │   └── settings/
│   │       ├── settings.module.ts
│   │       ├── settings.controller.ts     → GET/PUT /settings
│   │       └── settings.service.ts
│   └── test/
└── frontend/
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx                        → Router setup
    │   ├── context/
    │   │   └── AuthContext.tsx            → user + token, localStorage
    │   ├── api/
    │   │   ├── client.ts                  → fetch wrapper, Authorization header
    │   │   ├── auth.ts
    │   │   ├── users.ts
    │   │   ├── timeEntries.ts
    │   │   └── payroll.ts
    │   ├── pages/
    │   │   ├── LoginPage.tsx              → has "Activate account" link
    │   │   ├── SetInitialPasswordPage.tsx → email + setupCode + new password
    │   │   ├── ClockPage.tsx              → EMPLOYEE only — clock in/out + month summary
    │   │   ├── ShiftHistoryPage.tsx       → shared component, employee (/shifts) + admin (/shifts/:userId)
    │   │   ├── PayrollPage.tsx            → shared component, employee (/payroll) + admin (/payroll/:userId)
    │   │   ├── TeamPage.tsx               → admin only — first page after admin login
    │   │   ├── PayrollOverviewPage.tsx    → admin only — team list + total cost + open shifts
    │   │   └── SettingsPage.tsx           → admin only
    │   └── components/
    │       ├── layout/
    │       │   ├── Header.tsx             → logo left, username + menu right
    │       │   ├── Footer.tsx             → empty placeholder
    │       │   └── ProtectedRoute.tsx     → role-aware route guard
    │       ├── clock/
    │       │   ├── ClockButton.tsx
    │       │   └── MonthSummary.tsx
    │       ├── shifts/
    │       │   ├── ShiftList.tsx          → shared, takes userId prop
    │       │   ├── ShiftForm.tsx
    │       │   └── CycleNavigator.tsx
    │       ├── payroll/
    │       │   ├── PayrollBreakdown.tsx   → shared, takes userId prop
    │       │   └── PayrollOverview.tsx    → admin — team totals + open-shift flags
    │       └── team/
    │           ├── EmployeeList.tsx
    │           └── EmployeeForm.tsx
    └── test/
```

### Component Breakdown

> UI layer: all forms/buttons/inputs are built with shadcn/ui components (Input, Button, Card, Label, etc.) instead of plain HTML elements. The state/logic sketch below is independent of this choice — it applies the same, just "dressed" with shadcn primitives in the actual build.
>
> Responsive design: the app must work well on desktop, tablet, and mobile (browser) — Tailwind breakpoints (sm/md/lg) are used wherever the layout needs it, especially in lists/tables that need to adapt to a small screen.

#### LoginPage.tsx
State: `email`, `password`, `error`, `isSubmitting`
Logic: submit → `api/auth.ts` `login()` → `AuthContext.login()` → redirect ADMIN→`/team`, EMPLOYEE→`/clock`
Contains: 2 fields, submit button, error area, link to `/activate` (text: "Activate your account" — see spec §8a)

#### SetInitialPasswordPage.tsx
State: `email`, `setupCode`, `newPassword`, `confirmPassword`, `error`, `isSubmitting`
Logic: submit → client-side password match check → `api/auth.ts` `setInitialPassword()` → redirect `/login` with success message
Contains: 4 fields, submit button, error area, link back to `/login`

#### Layout: Header.tsx / Footer.tsx
Every protected page (both roles) is wrapped by `Header` (logo "SwiftTrack" on the left, username + menu on the right — dropdown with role-specific links + logout) and `Footer` (empty placeholder, filled in Phase 2).

#### Shared-page pattern: ShiftHistoryPage / PayrollPage
Both pages follow the same pattern: an employee route with no param (`/shifts`, `/payroll` — always the same), an admin route with a `:userId` param (`/shifts/:userId`, `/payroll/:userId` — whichever employee they selected). Both routes load the same page component, which passes the correct `userId` (either `"me"` or the route param) to the same shared component (`ShiftList`, `PayrollBreakdown`). Admin-only actions inside these are shown conditionally based on `user.role`, with no separate component per role.

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
Response → frontend refetches Clock page summary
```

### Payroll Calculation

```
User opens Payroll page (own, or admin selects an employee)
        ↓
api/payroll.ts → GET /payroll/me?cycle=... or /payroll/:userId?cycle=...
        ↓
PayrollController → PayrollService
        ↓
Fetch TimeEntries where userId + cycle range + endTime != null
        ↓
Sum hours, apply hourlyRate (Stage A) → zones/overtime layered in later stages
        ↓
Return breakdown → PayrollBreakdown.tsx renders (shared employee/admin component)
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
POST /auth/login → AuthService validates bcrypt hash → JWT { userId, role }
        ↓
If user.password is null (not yet activated) → login fails with the exact
message "This account hasn't been activated yet. Please activate it first."
(never a generic invalid-credentials message)
        ↓
Frontend: AuthContext stores { user, token } in localStorage
        ↓
Every subsequent request: api/client.ts attaches Authorization: Bearer <token>
        ↓
Backend: JwtAuthGuard validates token on all protected routes
         RolesGuard + @Roles('ADMIN') restricts admin-only routes
```

---

## Database Schema (Prisma)

### `User`

| Column     | Type      | Notes                              |
| ---------- | --------- | ----------------------------------- |
| id                 | Int (PK)  |                                     |
| name               | String    |                                     |
| email              | String    | unique — the only identifier, no separate username |
| password           | String?   | nullable — bcrypt hashed once set; null until account is activated |
| role               | Enum      | ADMIN \| EMPLOYEE                   |
| hourlyRate         | Int?      | nullable — EMPLOYEE only, ISK (no decimals); admin never clocks in/out, so never needs a rate |
| isActive           | Boolean   | default true — "DELETE" deactivates rather than removes, preserving TimeEntry/payroll history |
| setupCode          | String?   | random 4-digit code, set on employee creation, cleared after activation |
| setupCodeExpiresAt | DateTime? | createdAt + 3 days; cleared after activation |
| createdAt          | DateTime  |                                     |
| updatedAt          | DateTime  |                                     |

### `TimeEntry`

> All timestamps are stored and computed in **UTC**. App is Iceland-only, which stays on UTC year-round (no DST) — no timezone conversion needed anywhere in the system.

| Column    | Type      | Notes                                          |
| --------- | --------- | ------------------------------------------------ |
| id        | Int (PK)  |                                                   |
| userId    | Int (FK)  |                                                   |
| startTime | DateTime  | UTC                                              |
| endTime   | DateTime? | null while shift is open (forgotten clock-out), UTC |
| notes     | String?   | optional                                         |
| createdAt | DateTime  |                                                   |
| updatedAt | DateTime  |                                                   |

### `AppSettings`

| Column        | Type     | Notes                        |
| ------------- | -------- | ----------------------------- |
| id            | Int (PK) | fixed, always `1`             |
| cycleStartDay | Int      | default 25                    |
| cycleEndDay   | Int      | default 24 (of the following month — cycle wraps across the month boundary, e.g. 25 Jun → 24 Jul) |

---

## Prisma Client Pattern

One shared, injectable `PrismaService` — never instantiate `PrismaClient` elsewhere.

```typescript
// backend/src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Every other module imports `PrismaModule` and injects `PrismaService` into its own service — controllers never touch Prisma directly.

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
    if (user.password) throw new ConflictException('This account has already been activated.');
    if (user.setupCode !== code) throw new UnauthorizedException('Invalid activation code.');
    if (new Date() > user.setupCodeExpiresAt!) throw new UnauthorizedException('This activation code has expired. Please contact your admin.');

    const hashed = await bcrypt.hash(newPassword, 10);
    return this.usersService.activateAccount(email, hashed);
  }
}
```

---

## Payroll Calculation Pattern (Stage A)

```typescript
// backend/src/payroll/payroll.service.ts
async getPayrollForCycle(userId: number, cycle: string) {
  const { start, end } = this.resolveCycleRange(cycle); // uses AppSettings — cycle wraps across month boundary
  const entries = await this.prisma.timeEntry.findMany({
    where: { userId, startTime: { gte: start, lt: end }, endTime: { not: null } },
  });
  const totalHours = entries.reduce(
    (sum, e) => sum + (e.endTime!.getTime() - e.startTime.getTime()) / 3_600_000,
    0,
  );
  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // ISK has no decimals — round the final pay amount to the nearest whole krona.
  const totalPay = Math.round(totalHours * (user.hourlyRate ?? 0));
  return {
    totalHours,
    totalPay,
    cycleStart: start, // backend is the single source of truth for cycle boundaries —
    cycleEnd: end,     // frontend never computes these itself, only displays them
  };
}
```

---

## Invariants

Rules the AI agent (Claude Code) must never violate:

- Controllers contain no business logic and no direct Prisma calls — only services touch Prisma.
- Every service function whose data is scoped to a specific user (time entries, personal payroll, own profile) takes `userId` explicitly as a parameter and uses it in the query's `where` clause — never an implicit or missing filter. This does **not** apply to functions that are inherently global by design (e.g. `getAllEmployees()`, `getSettings()`, `login()`) — those correctly have no `userId` param. The rule only guards against *accidentally* returning unfiltered data where a user-scope should exist.
- No `PrismaClient` is ever instantiated outside `PrismaService`.
- `AuthService` never queries Prisma directly for `User` data — it always goes through `UsersService` (e.g. `usersService.findByEmail()`), which is the single owner of all `User`-model queries. This also fixes the build order: `Users` module is built before `Auth` module, since `Auth` depends on it.
- `TimeEntry.endTime = null` entries are never included in payroll totals — only "closed" shifts count.
- Only `RolesGuard` + `@Roles('ADMIN')` may restrict a route — never inline role checks scattered in controllers.
- There is no public `/auth/register` route. The first admin is seeded directly into the DB via a seed script, never created through the API.
- `POST /users` never accepts a `password` in the request body — employees are always created with `password: null` plus a fresh `setupCode` and 3-day `setupCodeExpiresAt`.
- `setupCode` and `setupCodeExpiresAt` are always cleared to `null` together, immediately after a successful `set-initial-password` call — a setup code is never reusable, even before it expires.
- `POST /auth/login` never succeeds while `user.password` is `null` — it fails with the exact message "This account hasn't been activated yet. Please activate it first." (see spec §8a), never a silent bypass or a generic error that hides the real cause.
- `POST /auth/login` never succeeds while `user.isActive` is `false` — it fails with the exact message "This account is no longer active." (see spec §8a). This check is separate from, and in addition to, the `password !== null` check above.
- All user-facing text (page titles, buttons, badges, error/success messages) is in **English**, regardless of what language this document or the spec uses for internal notes. Exact copy for every user-facing string lives in spec §8a — the agent uses that wording verbatim (e.g. stored in a `frontend/src/lib/messages.ts` constants file) rather than paraphrasing it.
- Every controller endpoint that accepts a request body uses a DTO validated with `class-validator`, under a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`. Any field not declared on the DTO (e.g. a `password` sent to `POST /users`) is stripped/rejected by the framework itself — this is never enforced only by documentation or by the service layer choosing not to read the field.
- All `TimeEntry` timestamps are stored and compared in UTC. The app targets Iceland only (no DST, UTC year-round) — no timezone conversion logic is ever introduced.
- `hourlyRate` and every computed pay amount are Icelandic króna (ISK) and are always whole numbers (`Int`) — never `Decimal` or `Float`. Intermediate hour calculations may be fractional, but `totalPay` is rounded to the nearest whole krona as the final step of the payroll calculation, never left unrounded and never rounded earlier in the pipeline.
- `AppSettings.cycleStartDay`/`cycleEndDay` default to 25/24, meaning a cycle wraps across the month boundary (e.g. 25 Jun → 24 Jul) — a cycle never resolves to a same-month start/end range.
- The backend is the single source of truth for pay-cycle date boundaries. `resolveCycleRange()` lives only in `PayrollService` (or a shared backend util it calls); every response that involves a cycle (time-entries list, payroll breakdown) returns the resolved `cycleStart`/`cycleEnd` as ISO dates. The frontend never computes cycle boundaries itself (including the ◀▶ `CycleNavigator`) — it only reads and displays the dates the backend already gave it.
- `/time-entries/clock-in` and `/time-entries/clock-out` are EMPLOYEE-only — the admin never clocks in/out and has no Clock page/ClockButton in their UI. Admin lands on the Team page after login instead.
- `/time-entries/clock-in` fails (never silently creates a duplicate) if the user already has an open `TimeEntry` (`endTime = null`) — a user can have at most one open shift at a time.
- The Payroll page/component is a single shared component for both roles — the admin view is the same component with `userId` unlocked instead of pinned to `me`.
- Frontend components never call `fetch` directly — all HTTP calls go through `frontend/src/api/`.
- Passwords are never stored or logged in plaintext — always bcrypt hashed before persistence.
- `AppSettings` always operates on the single fixed row (`id = 1`) — never creates a second settings row.
- `DELETE /users/:id` sets `isActive = false` — it never hard-deletes a User row, since that would cascade/orphan their TimeEntry and payroll history. Deactivated users can no longer log in but their historical data remains intact.
