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
│   │   │   ├── time-entries.controller.ts → clock-in, clock-out, CRUD
│   │   │   └── time-entries.service.ts
│   │   ├── payroll/
│   │   │   ├── payroll.module.ts
│   │   │   ├── payroll.controller.ts      → GET /payroll/me, /payroll/:userId
│   │   │   └── payroll.service.ts         → flat-rate calc (Stage A), zones/OT later
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
Fetch TimeEntries where userId + endTime != null + OVERLAPPING the cycle
(not "starting inside it" — a shift crossing the boundary belongs to both cycles)
        ↓
Clip each entry to the cycle, sum the clipped hours, apply hourlyRate (Stage A)
→ zones/overtime layered in later stages
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
Frontend: AuthContext stores { user, token } in localStorage
        ↓
Every subsequent request: api/client.ts attaches Authorization: Bearer <token>
        ↓
Backend: JwtAuthGuard validates token on all protected routes
         JwtStrategy.validate() re-reads the user via UsersService.findActiveById()
         and rejects if they were deactivated or deleted after the token was issued
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
| cycleStartDay | Int      | default 25· allowed **11–25**. The only field the cycle arithmetic reads |
| cycleEndDay   | Int      | default 24 (of the following month — cycle wraps across the month boundary, e.g. 25 Jun → 24 Jul). Always exactly `cycleStartDay - 1`, allowed **10–24**. Stored and validated, but derived — never used to compute a boundary |

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

## Payroll Calculation Pattern (Stage A)

```typescript
// backend/src/payroll/payroll.service.ts
async getPayrollForCycle(userId: number, cycle?: string) {
  // Cycle boundaries come from SettingsService, which owns AppSettings — this
  // service never computes them itself. The cycle wraps across the month boundary,
  // and `cycle` being undefined means "the cycle containing now".
  const { range, cycleDto } = await this.settingsService.resolveCycleRange(cycle);

  // Overlap, not containment: a shift that starts before the cycle and ends
  // inside it (or vice versa) is relevant to this cycle for the part that falls
  // within it. `lt`/`gt` (never `lte`/`gte`) against the exclusive boundary is
  // what makes adjacent cycles fit together with no gap and no double count.
  const entries = await this.prisma.timeEntry.findMany({
    where: {
      userId,
      endTime: { not: null, gt: range.start },
      startTime: { lt: range.endExclusive },
    },
  });

  // Each entry contributes only the hours that fall inside this cycle.
  const totalHours = entries.reduce(
    (sum, e) => sum + hoursWithinCycle(e.startTime, e.endTime, range),
    0,
  );
  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // ISK has no decimals — round the final pay amount to the nearest whole krona.
  const totalPay = Math.round(totalHours * (user.hourlyRate ?? 0));
  return {
    totalHours,
    totalPay,
    ...cycleDto, // cycle/prevCycle/nextCycle/cycleStart/cycleEnd — the backend is
  };            // the single source of truth; the frontend only displays these
}
```

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
- `POST /auth/login` never succeeds while `user.password` is `null` — it fails with the exact message "This account hasn't been activated yet. Please activate it first." (see spec §8a), never a silent bypass or a generic error that hides the real cause.
- `POST /auth/login` never succeeds while `user.isActive` is `false` — it fails with the exact message "This account is no longer active." (see spec §8a). This check is separate from, and in addition to, the `password !== null` check above.
- All user-facing text (page titles, buttons, badges, error/success messages) is in **English**, regardless of what language this document or the spec uses for internal notes. Exact copy for every user-facing string lives in spec §8a — the agent uses that wording verbatim (e.g. stored in a `frontend/src/lib/messages.ts` constants file) rather than paraphrasing it. §8a is not exhaustive: for a case it doesn't cover, the agent writes a sensible message inline and does not need to add a row to §8a.
- Every controller endpoint that accepts a request body uses a DTO validated with `class-validator`, under a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`. Any field not declared on the DTO (e.g. a `password` sent to `POST /users`) is stripped/rejected by the framework itself — this is never enforced only by documentation or by the service layer choosing not to read the field.
- All `TimeEntry` timestamps are stored and compared in UTC. The app targets Iceland only (no DST, UTC year-round) — no timezone conversion logic is ever introduced.
- `hourlyRate` and every computed pay amount are Icelandic króna (ISK) and are always whole numbers (`Int`) — never `Decimal` or `Float`. Intermediate hour calculations may be fractional, but `totalPay` is rounded to the nearest whole krona as the final step of the payroll calculation, never left unrounded and never rounded earlier in the pipeline.
- `AppSettings.cycleStartDay`/`cycleEndDay` default to 25/24, meaning a cycle wraps across the month boundary (e.g. 25 Jun → 24 Jul) — a cycle never resolves to a same-month start/end range.
- `cycleStartDay` is restricted to **11–25** and `cycleEndDay` must be exactly `cycleStartDay - 1` (10–24). Enforced by `class-validator` on `UpdateSettingsDto`, so it holds for any caller — a restricted `<select>` in the admin UI (Step 13) makes the mistake impossible *by accident*, the DTO makes it impossible *at all*, and the two are layers rather than duplicates (the same reasoning as `findByEmail()` + `P2002` in `createEmployee`). Two properties follow and are the reason for the range: consecutive cycles are **contiguous**, so no shift falls into a gap between cycles or into two of them at once· and every allowed day exists in every month, so day-of-month **clamping is never needed** for 28/29/30/31-day months. Because the range is fully determined by `cycleStartDay`, the arithmetic reads only that field — `cycleEndDay` is stored and validated but never computed with, so the two can never disagree about where a boundary is.
- **The cycle's end boundary is exclusive everywhere inside the backend, and inclusive only on the way out.** `computeCycleRange()` returns `{ start, endExclusive }`, and every Prisma filter compares against `endExclusive` with `lt` — never `lte`. `endExclusive` is midnight, which is simultaneously the next cycle's `start`, so adjacent cycles fit together with no gap and no overlap: that single instant is what makes shift splitting exact. Only the response DTO carries `cycleEnd = endExclusive - 1ms` (e.g. `23:59:59.999`), which exists purely so the UI can print "25 Jul – 24 Aug" without doing date arithmetic. `cycleEnd` never appears in a query and `endExclusive` never appears in a DTO — the names are what keep them apart.
- **A shift that crosses a cycle boundary is split, never assigned wholesale to one cycle.** Its hours are apportioned to each cycle it overlaps (`hoursWithinCycle()` — the intersection of the shift with the cycle), so the sum across all cycles always equals the hours actually worked: no hour is lost at a boundary and none is paid twice. This applies identically to the payroll total and to the per-entry hours shown in the shift list, so the Hours column always adds up to the total the employee is paid. Consequently, cycle queries select entries that **overlap** the range (`startTime < endExclusive AND endTime > start`), not entries whose `startTime` falls inside it, and the same entry legitimately appears in two cycles with different `hoursInCycle` values. Open shifts (`endTime = null`) cannot be split — they contribute 0 hours and are listed under the cycle containing their `startTime`.
- The backend is the single source of truth for pay-cycle date boundaries. `resolveCycleRange()` lives only in `SettingsService`, which owns the `AppSettings` row it derives from; `TimeEntriesService` and `PayrollService` inject `SettingsService` rather than resolving cycles themselves, the same way `AuthService` goes through `UsersService` for every `User` query. The date arithmetic itself lives in `cycle.util.ts` as pure functions (`cycle`, `cycleStartDay` → `{ start, endExclusive }`) with no DB and no Nest, so it can be unit-tested standalone. Every response that involves a cycle (time-entries list, payroll breakdown) returns the same block: `cycle`, `prevCycle`, `nextCycle`, `cycleStart`, `cycleEnd`. The frontend never computes cycle boundaries itself — the ◀▶ `CycleNavigator` sends back the `prevCycle`/`nextCycle` key it was handed rather than doing month arithmetic, so not even a month rollover is implemented twice.
- **`?cycle=` is optional on every cycle-aware endpoint· omitting it means "the cycle containing now", and that default is resolved in `SettingsService`, never by a caller.** The rule is `now.getUTCDate() >= cycleStartDay ? this month : the previous month` — which is *not* the current calendar month: on 3 August with a 25th boundary the current cycle is `2026-07`, and the obvious `now.toISOString().slice(0, 7)` would return `2026-08`, a cycle that has not started yet, showing the employee an empty page for work they have done. Three call sites need this default (time entries, personal payroll, the admin payroll overview), each of which would otherwise need its own copy of both the settings read and the comparison. Because the resolved `cycle` key is echoed back in the response, the client always knows which cycle it was actually given.
- `/time-entries/clock-in` and `/time-entries/clock-out` are EMPLOYEE-only — the admin never clocks in/out and has no Clock page/ClockButton in their UI. Admin lands on the Team page after login instead.
- `/time-entries/clock-in` fails (never silently creates a duplicate) if the user already has an open `TimeEntry` (`endTime = null`) — a user can have at most one open shift at a time.
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
- Every user-facing response that carries an unactivated employee includes their `setupCode`. The admin has no other channel to obtain it, and spec §5 requires them to hand it to the employee out of band — so omitting it from `GET /users`/`POST /users` breaks account activation entirely. It is naturally `null` for activated employees (cleared on activation) and for admins (never issued).
- `setupCode` is generated with a CSPRNG (`randomInt` from `node:crypto`), never `Math.random()` — it is the only secret gating access to an unactivated account.
- Uniqueness of `User.email` is enforced at **both** layers: the service checks `findByEmail()` first so the common case returns a clean 409 without depending on driver error codes, and the surrounding `create()` catches Prisma `P2002` so a concurrent double-submit races into the same 409 instead of an unhandled 500. Neither layer alone is sufficient — the check has a TOCTOU window, and the catch alone would put the happy path at the mercy of Prisma-specific error codes.
