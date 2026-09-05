# SwiftTrack

Time tracking and payroll for a single company. Employees clock in and out and see what they have earned; an admin manages the team, corrects shifts and reviews the payroll cost for each pay cycle.

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

---

## Features

**Employee**

- Clock in and out with a single button, with the open shift shown underneath
- Shift history per pay cycle, with arrows to move between cycles
- Add a forgotten shift, edit or delete an existing one
- Payroll breakdown: hours and pay per rate zone, plus a day-by-day table of hours

**Admin**

- Team management — create an employee, set their hourly rate, deactivate and reactivate. A changed rate applies from the next pay cycle
- Onboarding by 4-digit setup code: the employee activates the account and chooses their own password
- Reset a forgotten password: the account goes back through activation with a fresh code, and every device it was signed in on is signed out
- Payroll overview for a cycle — hours, pay and total cost across the team, with a warning for anyone still clocked in
- Drill down into any employee's shift history or payroll breakdown
- Settings — the day the pay cycle starts and ends

**Both roles**

- Change your own password. Every other signed-in device is signed out; the one making the change stays in
- Forgotten it instead? The sign-in page says to ask an admin, who resets it and hands over a new activation code — there is no email, so the code travels out of band

**Pay calculation** happens on the server and is recomputed from the raw shifts on every request. Hours are split across four rate zones, and a shift crossing a boundary is divided between them. Each cycle is priced at the hourly rate in force when it started, so a raise applies from the next cycle and leaves past ones untouched.

| Zone | When | Rate |
| --- | --- | --- |
| Day | Mon–Fri 08:00–17:00 | base |
| Evening | Mon–Fri 17:00–24:00 | +33% |
| Night | Mon–Fri 00:00–08:00 | +45% |
| Weekend | All day Sat and Sun | +45% |

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | NestJS 11, TypeScript |
| ORM | Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| Database | PostgreSQL 16 |
| Frontend | React 19, Vite 8, React Router 7 |
| Styling | Tailwind CSS v4 (CSS-first, no config file), shadcn/ui on Base UI |
| Auth | JWT bearer tokens (`@nestjs/jwt` + Passport), 12-hour expiry, revoked on password change |
| Validation | `class-validator` DTOs behind a global `ValidationPipe` |
| API docs | Swagger |
| Tests | Jest (backend), Vitest (frontend) |

---

## Quick start

The only prerequisite is [Docker](https://docs.docker.com/get-docker/) with Compose v2.

```bash
git clone https://github.com/S-tvr/SwiftTrack.git
cd SwiftTrack
docker compose up
```

The first run builds both images, applies the migrations, creates the admin account and loads demo data. When the logs settle, open:

| | |
| --- | --- |
| **App** | http://localhost:5173 |
| **API docs (Swagger)** | http://localhost:3000/api |

### Sign in

| Account | Email | Password | Notes |
| --- | --- | --- | --- |
| **Admin** | `admin@swifttrack.local` | `admin1234` | Lands on Team |
| Employee | `anna@demo.local` | `demo1234` | |
| Employee | `bjorn@demo.local` | `demo1234` | |
| Employee | `elin@demo.local` | `demo1234` | Part-time, and currently clocked in |
| Employee | `kristjan@demo.local` | — | Deactivated — cannot log in, still appears in payroll |
| Employee | `sigridur@demo.local` | — | Pending — activate it with the setup code printed in the backend logs |

The demo roster covers every state the UI has to render, including the two accounts that cannot log in. To watch the activation flow, find the setup code in the startup logs (`docker compose logs backend | grep "setup code"`) and use **Activate your account** on the login page.

The roster also shows why the row actions differ: **Reset password** appears only on the three accounts that have one, while Sigríður offers **New code** instead and Kristján offers **Reactivate** — a code issued to a deactivated account cannot work until they are active again. Resetting Anna's password turns her row into a pending one, code and all, which is the same state Sigríður is already in.

To start with an empty roster instead — just the admin, no demo employees — put `SEED_DEMO=false` in a root `.env` (copy `.env.example`), or set it inline:

```bash
SEED_DEMO=false docker compose up          # bash / zsh
$env:SEED_DEMO="false"; docker compose up  # PowerShell
```

The demo seed only runs when there are no employees yet, so restarting will never overwrite data you created.

### Stopping and resetting

```bash
docker compose down       # stop, keep the database
docker compose down -v    # stop and delete the database, so the next up re-seeds from scratch
```

---

## Local development

Run the database in Docker and the two applications natively. Needs **Node.js 22+**.

```bash
docker compose up db      # Postgres only, on localhost:5432
```

**Backend** — in a second terminal:

```bash
cd backend
cp .env.example .env      # then set JWT_SECRET and ADMIN_PASSWORD
npm install               # postinstall runs `prisma generate`
npx prisma migrate deploy
npx prisma db seed        # creates the first admin and the settings row
npm run start:dev         # http://localhost:3000
```

**Frontend** — in a third terminal:

```bash
cd frontend
cp .env.example .env      # VITE_API_URL is required and has no fallback
npm run dev               # http://localhost:5173
```

> **Copy both `.env` files before the `npm` commands.** The backend refuses to boot without `JWT_SECRET`, and the frontend throws at startup when `VITE_API_URL` is missing rather than guessing a default.

Optional — load the demo roster into your development database:

```bash
cd backend && npm run seed:demo
```

> This **deletes every employee and their time entries** before rebuilding them. The admin account is left alone, and the script refuses to run against a database whose name ends in `_test`.

---

## Environment variables

**Backend** (`backend/.env`, template in `backend/.env.example`):

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET` | yes | — | Signs the tokens. The app refuses to start without it |
| `FRONTEND_URL` | no | `http://localhost:5173` | The single origin allowed by CORS |
| `PORT` | no | `3000` | Port the API listens on |
| `ADMIN_NAME` | seed only | — | The first admin, created by `prisma db seed` |
| `ADMIN_EMAIL` | seed only | — | |
| `ADMIN_PASSWORD` | seed only | — | |

**Frontend** (`frontend/.env`, template in `frontend/.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | yes | Base URL of the backend. No fallback — a missing value throws at startup |

> Vite inlines `VITE_API_URL` at **build** time, not at runtime. A production bundle carries whatever the value was when `npm run build` ran, so set it before building, never after.

**Docker Compose** reads an optional root `.env` (template in `.env.example`) to override `JWT_SECRET`, the `ADMIN_*` values, `SEED_DEMO`, `FRONTEND_URL` and `VITE_API_URL`. It is optional: every one of them has a development default inside `docker-compose.yml`, which is why a clean clone runs with no configuration.

> The committed defaults are placeholders for local use. Generate a real secret (`openssl rand -base64 48`) before deploying this anywhere that matters.

---

## Testing

**Backend** — 218 unit tests and 117 full-stack tests against a real database:

```bash
cd backend
npm test                  # unit tests, no database needed
```

The end-to-end suite needs Postgres running and its own database:

```bash
cp .env.test.example .env.test
npm run test:e2e
```

`swifttrack_test` is created automatically the first time the `db` container initialises. The suite refuses to run against any database whose name does not end in `_test`, because it truncates tables between tests.

**Frontend** — 228 component and unit tests:

```bash
cd frontend
npm test
```

The backend unit tests also run inside the container, with nothing installed locally:

```bash
docker compose exec backend npm test
```

---

## API

Swagger UI is at **http://localhost:3000/api** with every endpoint, DTO and error response documented. Paste a token from `POST /auth/login` into **Authorize** to try the protected routes.

> `/api` is the documentation UI, not a route prefix. The endpoints themselves live at the root: `/auth/login`, `/users`, `/time-entries`, `/payroll`, `/settings`.

---

## Project structure

```
.
├── docker-compose.yml       Postgres + API + web app
├── docker/postgres/         DB init script (creates the test database)
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh migrations → seed → demo seed → server
│   ├── prisma/              schema, migrations, seed and demo-seed scripts
│   ├── src/
│   │   ├── auth/            login, activation, password change, JWT strategy
│   │   ├── users/           team management
│   │   ├── time-entries/    clock in/out, shift CRUD, overlap rules
│   │   ├── payroll/         rate zones and pay calculation
│   │   ├── settings/        pay-cycle configuration
│   │   └── main.ts          bootstrap, CORS, Swagger, global ValidationPipe
│   └── test/                end-to-end suite
└── frontend/
    ├── Dockerfile
    ├── nginx.conf           static serving with SPA history fallback
    └── src/
        ├── api/             the only place that calls fetch
        ├── components/      pages and UI, shadcn/ui in components/ui
        ├── context/         auth state
        ├── hooks/           data fetching
        └── lib/             user-facing copy, formatting, cycle helpers
```

---

## Scope and known limitations

Deliberate boundaries of this version, not oversights:

- **Payroll is never frozen.** Pay is recomputed from raw shifts on every request. Hourly rates are historised, so a raise does not reach past cycles — but editing a shift in a past cycle still changes that cycle's total. A snapshot per closed cycle would fix the rest.
- **A new rate takes effect at the next cycle, and cannot be corrected afterwards.** Until that cycle starts the rate stays editable; once it is in force, changing it means editing the database.
- **No audit log and no approval flow.** Employees write the hours they are paid for, and an edit leaves no history behind.
- **Overlapping shifts are checked, not constrained.** Two simultaneous submissions can both pass the check; the result is one duplicate row an admin can delete. A database-level exclusion constraint would close it.
- **Single tenant, single admin.** There is no public registration — the first admin comes from the seed script, and every employee is created by that admin.
- **Password recovery runs through the admin, and stops there.** An employee who forgets their password asks the admin, who resets it and reads out a new activation code; there is no email, so the code travels out of band by design. The admin has no such route of their own — no email reset and no second admin — so recovering *that* password means editing the database or re-running the seed.
- **An open shift is only visible in the cycle it started in**, which is intentional: a shift running right now must not raise an alarm on a cycle from three months ago.

---

## Troubleshooting

**Port 5432 already in use.** A native PostgreSQL service is the usual cause, and the symptom is an authentication error during migrations rather than a connection refusal, because something *does* answer on that port. On Windows, check with `Get-NetTCPConnection -LocalPort 5432` and stop the service; on Linux/macOS, `lsof -i :5432`.

**Ports 3000 or 5173 already in use.** Stop whatever holds them, or change the left-hand side of the `ports:` mappings in `docker-compose.yml`. If you change 5173, set `FRONTEND_URL` to match or CORS will reject every request.

**The app loads but every request fails.** The browser origin and `FRONTEND_URL` disagree. CORS allows exactly one origin, including the port.

**Serving it somewhere other than localhost.** The ports bind to `127.0.0.1` by default, so the app is reachable only from the machine running it — the right default while the JWT secret and admin password are the committed placeholders. To expose it deliberately, put all three in a root `.env` and run `docker compose up --build`:

```bash
BIND_HOST=0.0.0.0
VITE_API_URL=http://192.168.1.10:3000
FRONTEND_URL=http://192.168.1.10:5173
```

All three are needed together: `BIND_HOST` opens the ports, `VITE_API_URL` is baked into the bundle at build time (hence `--build`), and `FRONTEND_URL` is the single origin CORS allows.

**Starting over.** `docker compose down -v` deletes the database volume; the next `up` re-runs the migrations and the seeds from scratch.

---

## License

UNLICENSED — built as a portfolio and coursework project.
