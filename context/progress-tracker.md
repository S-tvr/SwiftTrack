# Progress Tracker — SwiftTrack (Φάση 1)

Ενημερώνεται από τον agent μετά από **κάθε** ολοκληρωμένο βήμα του `build-plan.md`. Σκοπός: μια νέα session να καταλαβαίνει την τρέχουσα κατάσταση χωρίς να χρειάζεται να σαρώσει ξανά όλο τον κώδικα.

Πριν ξεκινήσεις οποιοδήποτε βήμα, έλεγξε αν υπάρχει ήδη εγγραφή γι' αυτό εδώ κάτω — αν λέει "⚠️ Partial" ή "❌ Blocked", διάβασε τις σημειώσεις πριν συνεχίσεις.

---

<!--
Πρότυπο εγγραφής ανά βήμα — αντέγραψέ το και συμπλήρωσέ το:

## Βήμα N — <τίτλος βήματος>
Status: ✅ Done | ⚠️ Partial | ❌ Blocked
Ημερομηνία: <date>
Αρχεία που προστέθηκαν/άλλαξαν: <λίστα>
Endpoints/Components: <λίστα>
Σημειώσεις: <οτιδήποτε το επόμενο session/βήμα πρέπει να ξέρει>
-->

## Step 0 — Static Mockups
Status: ✅ Done
Ημερομηνία: 2026-07-31
Αρχεία που προστέθηκαν/άλλαξαν:
- Tooling prep: Convert σε TypeScript (`src/main.tsx`, `src/App.tsx`, `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`), Tailwind CSS v4, shadcn/ui init (style: base-nova)
- Routing/scaffolding: `react-router-dom` εγκαταστάθηκε, routing στο `App.tsx` (`AppLayout` τυλίγει Header/Footer γύρω από κάθε route εκτός `/login`/`/activate`)
- `frontend/src/mocks/data.ts` — typed `MockUser`/`MockTimeEntry`/`MockSettings` + helpers (`getEmployeeById`, `getTimeEntriesForUser`, `getMockCycle`, `isWithinCycle`, `hoursBetween`)
- `frontend/src/lib/messages.ts` — αυτούσιο UI copy από spec §8a
- `components/layout/Header.tsx` + `Footer.tsx`
- shadcn components: dropdown-menu, input, label, card, dialog, table, badge, textarea
- Καθαρίστηκαν dead demo assets (`hero.png`, `react.svg`, `vite.svg`, `icons.svg`)· διορθώθηκε το lint issue στο shadcn-generated `button.tsx` (react-refresh rule off για `components/ui/**`)· `FormEvent` → `SubmitEvent` (deprecated στο React 19 types)
Endpoints/Components:
- `LoginPage.tsx`, `SetInitialPasswordPage.tsx` — inert forms, χωρίς backend call
- `ClockPage.tsx` + `ClockButton.tsx` (τοπικό toggle Clock In/Out) + `MonthSummary.tsx`
- `ShiftHistoryPage.tsx` + `ShiftList.tsx` + `ShiftForm.tsx` (dialog, add/edit) + `CycleNavigator.tsx` — shared component, `/shifts` + `/shifts/:userId`
- `PayrollPage.tsx` + `PayrollBreakdown.tsx` — shared, `/payroll` + `/payroll/:userId`
- `TeamPage.tsx` + `EmployeeList.tsx` + `EmployeeForm.tsx` — admin only, Active/Pending badges
- `PayrollOverviewPage.tsx` + `PayrollOverview.tsx` — admin only, total μηνιαίο κόστος, open-shift ένδειξη
- `SettingsPage.tsx` — cycleStartDay/cycleEndDay form, inert
Σημειώσεις:
- Αποφασίστηκε (μέσω /architect): TypeScript από την αρχή· React Router ενεργό ήδη από το Step 0· ένα κοινό mock data αρχείο για όλες τις σελίδες· mock role preview μέσω hardcoded `VIEW_AS_ADMIN` constant στο `mocks/data.ts` (αντί για πραγματικό AuthContext, που έρχεται στο Step 9) — flip + reload για εναλλαγή ρόλου, το `currentUser` διαβάζεται από όλα τα components.
- Δεν υπάρχει ακόμα `ProtectedRoute` — κάθε route είναι προσβάσιμο μέσω URL ανεξαρτήτως ρόλου· θα μπλοκαριστεί σωστά στο Step 9.
- Τοπική interactivity (χωρίς backend call) επιτρέπεται σε mockup όπου βοηθάει το demo — π.χ. το toggle του ClockButton, το add/edit/delete στο ShiftList/EmployeeForm πάνω σε in-memory αντίγραφο.
- `npx tsc -b` και `npm run lint` καθαρά.
- Προστέθηκε νέο βήμα **13a — Client-side validation polish** στο `build-plan.md` (μετά το 13, πριν το README, χωρίς αλλαγή αρίθμησης 0-14): Zod + react-hook-form + shadcn `Form` σε όλες τις φόρμες, σκόπιμα τελευταίο.
- **Επόμενο βήμα**: Step 1 — Backend infra (Docker + Prisma schema + migration + seed script για τον πρώτο admin).

## Step 1 — Backend Infra
Status: ✅ Done
Ημερομηνία: 2026-08-01
Αρχεία που προστέθηκαν/άλλαξαν:
- `docker-compose.yml` — Postgres 16, DB only (spec §10)
- `backend/prisma/schema.prisma` — `User`, `TimeEntry` (με `@@index([userId, startTime])`), `AppSettings`
- `backend/prisma.config.ts` — Prisma 7 config (schema path, migrations, seed command)
- `backend/prisma/migrations/` — `init` + `add_time_entry_user_start_index` + `appsettings_singleton_check` (hand-written `CHECK ("id" = 1)` — enforces the singleton row at the DB level too, not just application code)
- `backend/prisma/seed.ts` — δημιουργεί τον πρώτο ADMIN (bcrypt-hashed password) + εξασφαλίζει το singleton `AppSettings` row (id=1)· idempotent
- `backend/src/prisma/prisma.service.ts` + `prisma.module.ts` — injectable, χρησιμοποιεί `@prisma/adapter-pg`· wired στο `AppModule`
- `backend/src/main.ts` — global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` + CORS (`FRONTEND_URL` env, fallback `http://localhost:5173`)
- `backend/.env.example` — `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `ADMIN_NAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` (seed-only)
- Νέα deps: `prisma`/`@prisma/client`/`@prisma/adapter-pg` (v7.9.1), `dotenv`, `tsx`, `bcrypt`+`@types/bcrypt`, `class-validator`+`class-transformer`
- `context/architecture.md` — ενημερώθηκε με το πραγματικό Prisma 7 pattern (generator/config/driver adapter — διαφέρει σημαντικά από το αρχικό v5/v6-style παράδειγμα)
Endpoints/Components: (κανένα ακόμα — infra only, δεν υπάρχουν controllers πέρα από το default `AppController`)
Σημειώσεις:
- **Prisma version**: επιλέχθηκε Prisma 7 (τελευταία) αντί για 6, μετά από επιβεβαίωση με τον χρήστη (βλ. Third-Party Library & Version Policy στο architecture.md). Αυτό σημαίνει: explicit `output` path για το generated client (`backend/src/generated/prisma`, gitignored), υποχρεωτικό `prisma.config.ts`, `prisma migrate dev`/`db seed` δεν τρέχουν αυτόματα το ένα το άλλο πια, και υποχρεωτικός driver adapter (`@prisma/adapter-pg`) στον `PrismaClient` constructor για PostgreSQL.
- **Postgres port conflict**: βρέθηκε ήδη native Windows service `postgresql-x64-17` να ακούει στο port 5432, μπλόκαρε το Docker container. Ο χρήστης το σταμάτησε + απενεργοποίησε μόνιμα (χρειάστηκε PowerShell as Administrator). Αν κάποιος άλλος developer δει auth errors στο migrate/seed, αυτό είναι το πρώτο πράγμα να ελέγξει (`Get-NetTCPConnection -LocalPort 5432`).
- Admin credentials (local μόνο, στο μη-committed `backend/.env`): email `admin@swifttrack.local`, password τυχαίο (ζητήθηκε από τον χρήστη, δεν είναι γραμμένο εδώ).
- **`/review` έτρεξε στο τέλος του Step 1**, βρήκε 3 ζητήματα (1 Important, 2 Minor), και τα 3 διορθώθηκαν πριν το commit:
  1. Το invariant "no PrismaClient outside PrismaService" δεν ανέφερε την εξαίρεση του `seed.ts` (standalone script, χωρίς Nest DI) — προστέθηκε ρητά στο architecture.md.
  2. `AppSettings` singleton row δεν είχε DB-level εγγύηση — προστέθηκε migration με hand-written `CHECK ("id" = 1)` (Prisma schema δεν έχει native check-constraint syntax, γι' αυτό raw SQL). Δοκιμάστηκε: insert με `id=2` απορρίπτεται σωστά.
  3. `bootstrap();` στο `main.ts` ήταν floating promise (ESLint warning) — έγινε `void bootstrap();`.
- `JWT_SECRET` στο local `.env` είναι ακόμα το placeholder — θα χρειαστεί πραγματική τυχαία τιμή πριν το Auth module (Step 3).
- Prisma Studio δοκιμάστηκε (`npx prisma studio`, localhost:5555) — δουλεύει κανονικά με το adapter setup.
- `npx tsc --noEmit` καθαρό. `nest start` δοκιμάστηκε live: `PrismaModule` connects, `ValidationPipe` + CORS επιβεβαιωμένα με πραγματικό curl request (`Access-Control-Allow-Origin` σωστό).
- **Επόμενο βήμα**: Step 2 — Users module (`GET/POST/PUT/DELETE /users`, `hasActivated` derived field, setupCode generation).
