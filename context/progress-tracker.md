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
- Νέα deps: `prisma`/`@prisma/client`/`@prisma/adapter-pg` (v7.9.1), `dotenv`, `tsx`, `bcrypt`+`@types/bcrypt`, `class-validator`+`class-transformer`, `@nestjs/config` (v4.0.4)
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
- `npx tsc --noEmit` καθαρό, ESLint καθαρό.
- ⚠️ **Διορθώθηκε μετά από δεύτερο `/review`**: η εφαρμογή δεν φόρτωνε καθόλου το `.env` (ούτε `dotenv/config` στο `src/`, ούτε `@nestjs/config`) — άρα `DATABASE_URL`/`JWT_SECRET`/`FRONTEND_URL` ήταν `undefined` στο runtime και **κάθε DB query απέτυχε**. Δεν φάνηκε επειδή το `$connect()` της Prisma 7 με driver adapter είναι lazy (το pool δεν συνδέεται μέχρι το πρώτο πραγματικό query), οπότε το app λογάριζε κανονικό successful startup. Λύση: `ConfigModule.forRoot({ isGlobal: true })` (`@nestjs/config@4.0.4`) στο `AppModule`.
- **Μάθημα για τις επόμενες επαληθεύσεις**: "το app ξεκίνησε χωρίς error" ΔΕΝ αποδεικνύει σύνδεση στη DB σε αυτό το stack — μόνο πραγματικό query. Ομοίως, CORS test με `http://localhost:5173` δεν αποδεικνύει τίποτα όσο αυτή είναι και η hardcoded fallback τιμή στο `main.ts` — χρειάζεται διακριτό origin.
- Τελική επαλήθευση (πραγματική): query μέσα από το `AppModule` επιστρέφει 1 user (`admin@swifttrack.local/ADMIN`) + 1 `AppSettings` row· CORS με `FRONTEND_URL=http://cors-probe.test:9999` επιστρέφει `Access-Control-Allow-Origin: http://cors-probe.test:9999` (δηλαδή διαβάζει το env, όχι το fallback).
- **Επόμενο βήμα**: Step 2 — Users module (`GET/POST/PUT/DELETE /users`, `hasActivated` derived field, setupCode generation).

## Step 2 — Users Module
Status: ✅ Done
Ημερομηνία: 2026-08-01
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/users/users.module.ts` — imports `PrismaModule`, exports `UsersService`
- `backend/src/users/users.controller.ts` — `GET /users`, `GET /users/me`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id`
- `backend/src/users/users.service.ts` — `findAllEmployees`, `findMe`, `findById`, `findByEmail`, `createEmployee`, `updateEmployee`, `deactivate`, `activateAccount` (η τελευταία θα τη χρησιμοποιήσει το Auth module στο Step 3)
- `backend/src/users/dto/create-user.dto.ts`, `update-user.dto.ts`, `user-response.dto.ts` — `class-validator` + `@nestjs/swagger` `ApiProperty` decorators
- `backend/src/app.module.ts` — import `UsersModule`
- `backend/src/main.ts` — `DocumentBuilder`/`SwaggerModule.setup('api', ...)`, `addBearerAuth()` (bearer scheme registered τώρα, θα φανεί σε χρήση όταν μπουν τα guards στο Step 3)
- Νέα dependency: `@nestjs/swagger@11.4.6`
Endpoints/Components:
- `GET /users` — μόνο `role: 'EMPLOYEE'` (όχι ο admin)· περιλαμβάνει deactivated (`isActive: false`) employees, το frontend αποφασίζει πώς τους δείχνει
- `GET /users/me` — διαβάζει `req.user.userId`, μη λειτουργικό μέχρι να μπει το `JwtAuthGuard` στο Step 3
- `POST /users` — δημιουργεί employee, `password: null`, `setupCode` (4-digit) + `setupCodeExpiresAt` (+3 μέρες)· explicit `findByEmail()` πριν το create → `ConflictException` σε duplicate (όχι raw Postgres error)
- `PUT /users/:id` — μόνο `name`/`hourlyRate` στο DTO (όχι email/password/role/isActive — καθένα έχει το δικό του κανάλι ήδη)
- `DELETE /users/:id` — soft delete, `isActive = false`
- Swagger UI στο `http://localhost:3000/api`
Σημειώσεις:
- **`/architect` έτρεξε πριν το build** (αντί για πλήρη πρόγραμμα ερωτήσεων μαζί, μία-μία με τον χρήστη): αποφασίστηκαν explicit email-uniqueness check (όχι reliance στο DB P2002 error), `GET /users` επιστρέφει μόνο active+inactive EMPLOYEE (όχι admin), και το `PUT /users/:id` DTO περιορίζεται σε name+hourlyRate.
- **Guards ordering issue εντοπίστηκε πριν το build**: το build-plan χτίζει Users (Step 2) πριν το Auth (Step 3), αλλά το `JwtAuthGuard`/`RolesGuard` χτίζονται στο Auth. Αποφασίστηκε (με τον χρήστη): Users controller χωρίς guards τώρα· θα μπουν retroactively στο Step 3, μαζί με το `GET /users/me` που θα αρχίσει να διαβάζει πραγματικό `req.user.userId`. Σημείωση προστέθηκε στο `build-plan.md` §2. Άρα το "role restrictions work" criterion για το Users module **δεν** επαληθεύεται πλήρως εδώ — θα επαληθευτεί στο Step 3.
- **Version check πριν το build** (Third-Party Library Policy): επιβεβαιώθηκε NestJS 11.x, `class-validator` 0.15.1 (κανένα breaking change στα decorators που χρησιμοποιήθηκαν — `@IsEmail`/`@IsString`/`@IsInt`/`@IsOptional`/`@Min`/`@MinLength`), και βρέθηκε/εγκαταστάθηκε `@nestjs/swagger@11.4.6` (πρώτη φορά που μπαίνει Swagger — δεν υπήρχε πριν). Official docs (docs.nestjs.com/guards, openapi/introduction) επιβεβαίωσαν ότι το ήδη τεκμηριωμένο `RolesGuard` pattern στο architecture.md ταιριάζει με το τρέχον official recipe.
- `npm install @nestjs/swagger` έφερε 2 high-severity `npm audit` ευρήματα, και τα δύο από ένα transitive `js-yaml` dependency μέσα στο ίδιο το `@nestjs/swagger` (DoS σε malicious YAML parsing) — δεν διορθώθηκε με `--force` γιατί θα έκανε downgrade breaking change στο swagger· δεν είναι exploitable στη ροή μας (δεν περνάμε ποτέ untrusted YAML). Αν χρειαστεί, ελέγξτε αν το upstream `@nestjs/swagger` έχει βγάλει fix πριν το production deploy.
- Χειροκίνητη επαλήθευση (πραγματική DB, όχι mock): `POST /users` → 201 με σωστό `hasActivated:false`· duplicate email → 409 `ConflictException`· `password` field στο body → 400 (`ValidationPipe` whitelist rejection, "property password should not exist")· `PUT /users/:id` σε ανύπαρκτο id → 404· `DELETE` → `isActive:false`, παραμένει στο `GET /users`. Test-data (employee "Jane") καθαρίστηκε μετά (`prisma.user.deleteMany`) — η DB είναι πάλι στην αρχική seed κατάσταση (μόνο ο admin).
- Βρέθηκε και διορθώθηκε αμέσως (πρώτη προσπάθεια, χωρίς recovery loop): `UsersModule` δεν είχε `imports: [PrismaModule]` → `UnknownDependenciesException` στο runtime startup (το `tsc --noEmit`/lint δεν το πιάνουν, μόνο πραγματικό Nest bootstrap). Ίδιο μάθημα με το Step 1: compile-clean δεν αποδεικνύει τίποτα για DI/DB, μόνο πραγματικό request/bootstrap.
- `npx tsc --noEmit` καθαρό, `npm run lint` καθαρό.

### `/review` στο τέλος του Step 2 — 10 ευρήματα, 6 διορθώθηκαν

Το βήμα είχε αρχικά δηλωθεί ✅ Done **λανθασμένα** — το review βρήκε ότι η κεντρική ροή onboarding (spec §5) ήταν αδύνατο να ολοκληρωθεί. Διορθώθηκε πριν το commit.

**🔴 Critical (διορθώθηκε):** Το `toResponseDto()` δεν επέστρεφε ποτέ το `setupCode`, οπότε ο admin δεν είχε **κανέναν** τρόπο να το δει και να το δώσει στον employee — η ενεργοποίηση λογαριασμού ήταν αδύνατη end-to-end. Επιβεβαιώθηκε ότι δεν ήταν θέμα ερμηνείας: ο εγκεκριμένος mockup του Step 0 (`EmployeeList.tsx:56-58`) ήδη κάνει render `Code: {employee.setupCode}` από τη λίστα του `GET /users`. Προστέθηκε `setupCode` στο `UserResponseDto` — μη-null μόνο για pending employees (καθαρίζεται στο `activateAccount`, ποτέ set για ADMIN).

**🟠 Important (διορθώθηκαν):**
1. `updateEmployee`/`deactivate` δεν φιλτράρανε ρόλο. Συνέπειες: `PUT` μπορούσε να δώσει `hourlyRate` σε ADMIN (παραβίαση spec §3), και `DELETE` στο id του admin τον απενεργοποιούσε — **μόνιμο lockout**, αφού το login ελέγχει `isActive`, δεν υπάρχει reactivation endpoint και δεν υπάρχει public register. Το `findByIdOrThrow` έσπασε σε δύο: `findUserByIdOrThrow` (κάθε ρόλος — για το `/users/me` που εξυπηρετεί και τους δύο) και `findEmployeeByIdOrThrow` (`findFirst` με `role:'EMPLOYEE'` — για update/deactivate).
2. Race condition: ο explicit `findByEmail()` έλεγχος είναι check-then-act· δύο ταυτόχρονα creates (π.χ. διπλό κλικ στο submit) περνούσαν και τα δύο και το δεύτερο έσκαγε στο DB unique index ως **unhandled Prisma error → 500** αντί για 409. Προστέθηκε `try/catch` που μεταφράζει το `P2002` στο ίδιο `ConflictException`. Ο explicit έλεγχος παρέμεινε, ώστε το happy path να μην εξαρτάται από Prisma error codes.
3. `generateSetupCode()` χρησιμοποιούσε `Math.random()` (μη-CSPRNG) για την τιμή που πυλωρεί την πρόσβαση σε λογαριασμό → `randomInt()` από το `node:crypto` (upper bound exclusive: `randomInt(1000, 10000)`).

**🟡 Minor (διορθώθηκε):** Το `findById()` είχε χτιστεί εκτός plan (το build-plan §2 δηλώνει μόνο `findByEmail()`/`activateAccount()` ως Auth-facing), δεν χρησιμοποιούνταν πουθενά, και επέστρεφε πλήρες `User` με `password`/`setupCode`. Αφαιρέθηκε — αν το `JwtStrategy` το χρειαστεί στο Step 3, μπαίνει τότε με σαφή σκοπό.

**Αποφασίστηκε να ΜΗΝ διορθωθούν τώρα:**
- `GET /users/me` πετάει `TypeError` → 500, γιατί το `req.user!.userId` είναι πάντα `undefined` χωρίς guard. **Λύνεται φυσικά στο Step 3** όταν το `JwtAuthGuard` γεμίσει το `req.user`. ⚠️ **Είναι το μόνο endpoint του Step 2 που δεν δοκιμάστηκε ποτέ — πρέπει να μπει ρητά στη λίστα επαλήθευσης του Step 3.**
- Swagger: τα `@ApiResponse` τεκμηριώνουν μόνο 200/201· τα 400/404/409 μένουν για αργότερα. Το `.addBearerAuth()` είναι καταχωρημένο στο `main.ts` αλλά κανένα route δεν έχει `@ApiBearerAuth()` — μπαίνει στο Step 3 μαζί με τα guards.
- Το `req.user!` non-null assertion είναι ad-hoc pattern· το Step 3 πρέπει να καθιερώσει `@CurrentUser()` decorator πριν αντιγραφεί σε 4+ controllers.

**⚠️ Απόφαση που πάρθηκε ΓΙΑ ΤΟ STEP 3 (δεν υλοποιήθηκε εδώ):** ο 4ψήφιος κωδικός δίνει 9.000 συνδυασμούς, τα emails είναι μαντεύσιμα, και το `POST /auth/set-initial-password` είναι μη-αυθεντικοποιημένο — δηλαδή brute-forceable account takeover όπως έχει σχεδιαστεί στο spec. **Το Step 3 πρέπει να προσθέσει rate limiting (`@nestjs/throttler`) σε `set-initial-password` και `login`.** Επιλέχθηκε αντί για μεγαλύτερο κωδικό, ώστε να μην αλλάξει το domain model (spec §3 + architecture.md + mockup).

### Επαλήθευση μετά τις διορθώσεις (πραγματική DB, όχι mock)
- `POST /users` → `setupCode` στο response· `GET /users` → `setupCode` στη λίστα (ακριβώς ό,τι διαβάζει το `EmployeeList.tsx`)
- `PUT`/`DELETE` σε ADMIN id → 404· επιβεβαιώθηκε στη βάση ότι ο admin παρέμεινε `isActive=t` με `hourlyRate` κενό
- **6 ταυτόχρονα** `POST` με το ίδιο νέο email → 1×201 + 5×409, **μηδέν 500**· καμία unhandled exception στο log (αν το `Prisma.PrismaClientKnownRequestError` import ήταν λάθος, το `instanceof` θα έσκαγε και θα φαινόταν)
- 5 διαδοχικά `setupCode` — όλα ακριβώς 4ψήφια
- **DTO refactor επαληθεύτηκε** (είχε γίνει merge χωρίς runtime test): `PUT` με `email` στο body → 400 "property email should not exist" (`OmitType` δουλεύει)· `PUT` μόνο με `name` → 200 (`PartialType` όντως κάνει optional)· `PUT` με `hourlyRate:"not-a-number"` → 400 με τα σωστά μηνύματα (οι validators επιβίωσαν του mapped type)
- `password` στο `POST` → 400· duplicate email → 409
- Test data καθαρίστηκαν: 0 employees, 1 user (ο admin) — αρχική seed κατάσταση

**Επόμενο βήμα**: Step 3 — Auth module (`POST /auth/login`, `POST /auth/set-initial-password`, `JwtStrategy`, `JwtAuthGuard`, `RolesGuard`+`@Roles('ADMIN')`), retrofit των guards στον Users controller, `@CurrentUser()` decorator, rate limiting, και ρητή δοκιμή του `GET /users/me`.

## Step 3 — Auth Module
Status: ✅ Done
Ημερομηνία: 2026-08-02
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/auth/auth.module.ts` — `JwtModule.registerAsync` (μέσω `ConfigService`, `expiresIn: '14d'`), `PassportModule`
- `backend/src/auth/auth.controller.ts` — `POST /auth/login`, `POST /auth/set-initial-password`, και τα δύο πίσω από `@UseGuards(ThrottlerGuard)`· Swagger τεκμηριώνει και 429
- `backend/src/auth/auth.service.ts` — `login()` (bcrypt compare, σειρά ελέγχων: user exists → `isActive` → `password !== null` → password match), `setInitialPassword()` (user exists → `isActive` → ήδη ενεργοποιημένος → κωδικός → λήξη) — μόνο μέσω `UsersService`, ποτέ Prisma απευθείας
- `backend/src/auth/jwt.strategy.ts` — `validate()` επιστρέφει ρητά `{ userId, role }`. ⚠️ Χτίστηκε ως trust-payload-only, **αλλά αναθεωρήθηκε στην ίδια session** — κάνει πλέον DB lookup ανά request· βλ. «Η απόφαση trust-payload-only ΑΝΑΘΕΩΡΗΘΗΚΕ» παρακάτω
- `backend/src/auth/jwt-auth.guard.ts`, `roles.guard.ts`, `roles.decorator.ts` — ακριβώς το pattern του architecture.md
- `backend/src/auth/current-user.decorator.ts` — αντικαθιστά το ad-hoc `req.user!` του Step 2
- `backend/src/auth/jwt-payload.interface.ts` — `{ userId, role }`, με `Role` από το Prisma
- `backend/src/auth/dto/login.dto.ts`, `set-initial-password.dto.ts` (`newPassword` `@MinLength(8)` — δεν οριζόταν στο spec, δική μου παραδοχή), `login-response.dto.ts` (`{ accessToken, user }`)
- `backend/src/users/dto/user-profile.dto.ts` — **νέο**· η «δική μου εικόνα του εαυτού μου», χωρίς `setupCode`. Δηλωμένο standalone, ΟΧΙ παράγωγο του `UserResponseDto` (βλ. review παρακάτω)
- `backend/src/users/users.service.ts` — `toProfileDto()` δίπλα στο υπάρχον `toResponseDto()`· το `findMe()` επιστρέφει πλέον `UserProfileDto`
- `backend/src/users/users.controller.ts` — retrofit: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')` σε GET/POST/PUT/DELETE `/users`· `GET /users/me` μόνο `JwtAuthGuard`, διαβάζει `@CurrentUser()` αντί για `req.user!`· `@ApiBearerAuth()` σε όλο το controller
- `backend/src/app.module.ts` — import `AuthModule` + `ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 5 }])`
- `backend/.env` — πραγματική τυχαία τιμή για `JWT_SECRET` (ήταν ακόμα placeholder από το Step 1)
- `context/swifttrack-phase1-final.md` — χαλάρωσε η σημείωση του §8a (βλ. review)
- `context/architecture.md` — (α) χαλάρωσε το αντίστοιχο invariant· (β) **το δείγμα κώδικα του § Account Activation Pattern δεν είχε έλεγχο `isActive` — δηλαδή δίδασκε ακριβώς το bug του Ευρήματος 1· διορθώθηκε**· (γ) 5 νέα invariants (trust boundary DTOs, login response, 14-day JWT + trust-payload-only και οι συνέπειές του, rate limiting + γιατί το `forRoot` ζει στο `AppModule`, `Role` πάντα από Prisma)· (δ) ενημερώθηκε το folder structure με τα νέα αρχεία του `auth/` και τα `dto/` και των δύο modules· (ε) το § Auth Flow δείχνει πλέον τη σειρά ελέγχων και το `{ accessToken, user }`· (στ) stack table με `@nestjs/passport` + `@nestjs/throttler`
- Νέα deps: `@nestjs/jwt@11.0.2`, `@nestjs/passport@11.0.5`, `passport@0.7.0`, `passport-jwt@4.0.1`, `@nestjs/throttler@6.5.0`, `@types/passport-jwt@4.0.1`
Endpoints/Components:
- `POST /auth/login` — 200 `{ accessToken, user }`, JWT ζει 14 μέρες, χωρίς refresh mechanism
- `POST /auth/set-initial-password` — 200 στο happy path
- `GET/POST/PUT/DELETE /users` — τώρα πραγματικά ADMIN-only (403 σε EMPLOYEE token)
- `GET /users/me` — και οι δύο ρόλοι, επιστρέφει `UserProfileDto`· δοκιμάστηκε πραγματικά **για πρώτη φορά** (ποτέ δεν είχε δοκιμαστεί στο Step 2)
Σημειώσεις:
- **`/architect` έτρεξε πριν το build**, μία απόφαση τη φορά: (1) JWT expiry **14 μέρες**, ένα ενιαίο token, **χωρίς refresh token** — ρητά out of scope για το Phase 1 (θα απαιτούσε αλλαγή domain model, νέο endpoint, frontend interceptor logic· ασυνεπές με την επόμενη απόφαση). (2) `JwtStrategy.validate()` **trust-payload-only** — καμία DB lookup ανά request· συνέπεια: αν ο admin κάνει `DELETE` σε έναν employee, το ήδη εκδομένο token του παραμένει έγκυρο μέχρι να λήξει φυσικά (14 μέρες), όχι στιγμιαία ανάκληση. **⚠️ ΑΝΑΘΕΩΡΗΘΗΚΕ αργότερα στην ίδια session — δεν ισχύει πια· βλ. τη σχετική ενότητα στο τέλος του Step 3.** (3) Rate limiting **5 προσπάθειες/60s ανά IP**, σε `login` **και** `set-initial-password` ξεχωριστά (διαφορετικά throttle buckets ανά route, επιβεβαιώθηκε). (4) Σειρά ελέγχων στο login (δική μου κλήση, όχι ερώτηση στον χρήστη): `isActive` πρώτα, μετά `password === null` — ώστε ένας ταυτόχρονα deactivated+unactivated χρήστης να παίρνει πάντα "no longer active", ποτέ το παραπλανητικό μήνυμα ενεργοποίησης.
- **Version check πριν το build**: επιβεβαιώθηκαν μέσω `npm view` + official NestJS docs/search οι τελευταίες συμβατές εκδόσεις με NestJS 11 (`@nestjs/common@^11.0.1` peer dep όλων). Το `@nestjs/throttler` API είναι array-based στο v6 (`ThrottlerModule.forRoot([{ ttl, limit }])`, `ttl` σε ms, helper `seconds()`) — διαφορετικό από παλιότερες εκδόσεις, επιβεβαιώθηκε πριν γραφτεί κώδικας.
- `npm audit`: ίδια 2 high-severity ευρήματα με το Step 2 (`js-yaml` transitive μέσω `@nestjs/swagger`, όχι νέο, όχι exploitable στη ροή μας) — τίποτα νέο από τα auth packages.
- Βρέθηκε στο πρώτο `tsc --noEmit`: το `JwtPayload` ως τύπος σε decorated param (`@CurrentUser() user: JwtPayload`) χρειαζόταν `import type` (`isolatedModules` + `emitDecoratorMetadata`) — διορθώθηκε αμέσως, μία γραμμή.
- Βρέθηκε στο πρώτο `npm run start:dev`: port 3000 ήταν ήδη κατειλημμένο από stale Node process (ξεκινημένη πριν το τρέχον session) — τερματίστηκε, ξανατρέξαμε καθαρά.
- **Χειροκίνητη επαλήθευση σε πραγματική DB** (όχι mock): login λάθος password → 401 generic· login σωστό → 200· `GET /users/me` με admin token → 200 (πρώτη φορά που δουλεύει)· χωρίς token → 401· `POST /users` δημιουργεί employee με `setupCode`· login πριν activation → σωστό μήνυμα "not activated yet"· `set-initial-password` λάθος code → "Invalid activation code."· σωστό code → 200· ξανά μετά activation → 409 "already activated"· login με νέο password → 200· employee token σε `GET/POST /users` → 403· `DELETE` employee → `isActive:false`· login deactivated employee → "no longer active"· `DELETE` στο admin id (1) → 404 (παραμένει απροστάτευτο)· 6 διαδοχικά login attempts στο ίδιο λεπτό → 429 μετά το όριο (bucket ήδη είχε προηγούμενα attempts από τα tests, επιβεβαίωσε ότι μετράει σωρευτικά σωστά)· `set-initial-password` αμέσως μετά το 429 του login → δεν επηρεάστηκε (ξεχωριστό bucket ανά route, επιβεβαιώθηκε)· expired setupCode (χειροκίνητο `UPDATE` στη DB) → "expired. Please contact your admin.". Test data (`test.employee@`, `expiry.test@`) καθαρίστηκαν μετά — η DB είναι πάλι στην αρχική seed κατάσταση (μόνο ο admin).
- `npx tsc --noEmit` καθαρό, `npm run lint` καθαρό (μόνο prettier formatting fixes, καμία λογική αλλαγή).
- Ο dev server (`npm run start:dev`) έμεινε **σκόπιμα ανοιχτός** στο τέλος αυτού του session, για να μπορεί ο χρήστης να εξερευνήσει το Swagger UI (`http://localhost:3000/api`) με τα νέα Bearer-protected endpoints.

### `/review` στο τέλος του Step 3 — 9 ευρήματα

**⚠️ Πρώτα το μάθημα διαδικασίας (Ευρήματα 4 + 9):** η αρχική εγγραφή αυτού του βήματος **δήλωνε επαληθεύσεις που δεν είχαν τρέξει**. Έγραφε *«`exp - iat` επιβεβαιώθηκε = 1.209.600s»* ενώ κανένα token δεν είχε αποκωδικοποιηθεί, και *«21 σενάρια»* μετρώντας labels που περιλάμβαναν setup βήματα. Ο αριθμός αποδείχθηκε τελικά σωστός όταν όντως μετρήθηκε στο review, αλλά τη στιγμή που γράφτηκε ήταν ισχυρισμός. **Αυτό το αρχείο υπάρχει για να το εμπιστεύεται μια επόμενη session χωρίς να ξαναελέγχει — άρα ό,τι γράφεται εδώ πρέπει να έχει πραγματικά εκτελεστεί.** Επίσης, το κριτήριο "role restrictions work" είχε δοκιμαστεί μόνο σε `GET`/`POST /users`, όχι σε `PUT`/`DELETE` — καλύφθηκε στο review (και τα δύο 403).

**Διορθώθηκαν:**
1. **`set-initial-password` δεν έλεγχε `isActive`.** Απενεργοποιημένος employee με έγκυρο setupCode περνούσε (HTTP 200), γραφόταν password, και το badge στο Team page γύριζε από "Pending" σε "Active" για κάποιον που ο admin μόλις είχε απενεργοποιήσει. Δεν ήταν breach (το login τον έκοβε ούτως ή άλλως), αλλά unauthenticated endpoint έγραφε σε απενεργοποιημένο λογαριασμό. Προστέθηκε ο έλεγχος στην ίδια σειρά με το `login`. Επαληθεύτηκε: 401 «This account is no longer active.», και **ο setupCode δεν καταναλώνεται** στο blocked attempt.
2. **`POST /auth/login` επέστρεφε μόνο `{ accessToken }`.** Το JWT έχει `{userId, role}` — όχι `name`, που το χρειάζεται το `Header.tsx` σε κάθε σελίδα. Επιστρέφει πλέον και `user`. **Κρίσιμη λεπτομέρεια:** το `user` ΔΕΝ είναι το `UserResponseDto` — αυτό σχεδιάστηκε για admin που βλέπει άλλους και κουβαλάει `setupCode`, το μυστικό που ξεκλειδώνει μη-ενεργοποιημένο λογαριασμό. Δημιουργήθηκε ξεχωριστό `UserProfileDto` (`id, name, email, role, hourlyRate`). **Δηλώθηκε standalone και όχι με `OmitType`**, επειδή το `OmitType` είναι αφαιρετική σύζευξη: νέο πεδίο στο `UserResponseDto` θα περνούσε αυτόματα στο auth response. Διόρθωσε και το `GET /users/me`, που επέστρεφε κι αυτό `setupCode` χωρίς λόγο.
3. **`Role` αντί για χειρόγραφο `'ADMIN' | 'EMPLOYEE'`** σε 4 σημεία + 2 `@ApiProperty`. Το Prisma το παράγει ήδη στο `src/generated/prisma/enums.ts` και το ξανα-εξάγει το `client.ts`, οπότε το import path είναι το ίδιο που ήδη χρησιμοποιεί το `users.service.ts`. Grep επιβεβαιώνει μηδέν χειρόγραφα unions.
4. **`JwtStrategy.validate()`** επέστρεφε το payload ως έχει, δηλαδή `req.user` είχε και `iat`/`exp` ενώ ο τύπος υπόσχεται 2 πεδία. Ανακατασκευάζεται ρητά. ⚠️ Το ίδιο το `req.user` **δεν επιθεωρήθηκε άμεσα** — δεν υπάρχει endpoint που να το εκθέτει· επαληθεύτηκε έμμεσα ότι τα guards δουλεύουν.
5. **`ThrottlerModule.forRoot()` μετακινήθηκε** από το `AuthModule` στο `AppModule`. Ανακαλύφθηκε στην πορεία ότι το `ThrottlerModule` είναι **`@Global()`** (επαληθεύτηκε στο `node_modules/@nestjs/throttler/dist/throttler.module.js:61`) — άρα ήταν ήδη διαθέσιμο παντού και το αρχικό μου επιχείρημα («θα χρειαστεί δεύτερο forRoot στο Step 4») **ήταν λάθος**. Η μετακίνηση είναι καθαρά θέμα αναγνωσιμότητας: καθολική ρύθμιση δηλωμένη μέσα σε feature module παραπλανά. Καμία λειτουργική αλλαγή — επαληθεύτηκε μετά: 5 επιτρεπτά → 429, και 8 συνεχόμενα authenticated requests → όλα 200.
6. **Swagger: προστέθηκε `@ApiResponse({ status: 429 })`** και στα δύο auth routes.

**Αποφασίστηκε να ΜΗΝ αλλάξουν:**
- **Ο κανόνας του §8a χαλάρωσε αντί να «διορθωθεί» ο κώδικας.** Τα `"Invalid email or password."` και `"User not found."` δεν υπήρχαν στον πίνακα του §8a. Αντί να προστεθούν γραμμές, προστέθηκε μία πρόταση σε architecture.md + spec: το §8a **δεν είναι εξαντλητικό**· για περίπτωση που δεν καλύπτει, γράφεται λογικό μήνυμα inline χωρίς νέα γραμμή. Απόφαση του χρήστη, με σκεπτικό ότι ο παλιός κανόνας ήταν πολύ σφιχτός και στην πράξη παρακαμπτόταν σιωπηλά. **Συνέπεια που έγινε αποδεκτή:** 3 strings παραμένουν κυριολεκτικά διπλογραμμένα (`'A user with this email already exists.'` ×2, `'Invalid email or password.'` ×2, `'This account is no longer active.'` ×2). Συζητήθηκε και **απορρίφθηκε** κεντρικό `backend/src/common/messages.ts`.
- **User enumeration στο `set-initial-password`** (άγνωστο email → 404, υπαρκτό με λάθος κωδικό → 401) μένει ως έχει, **σκόπιμα**. Σκεπτικό: enumeration protection προστατεύει τη μυστικότητα του ποιος έχει λογαριασμό — σε internal εργαλείο μιας εταιρείας όπου ο admin δημιουργεί κάθε λογαριασμό και όλοι είναι συνάδελφοι, η πληροφορία δεν έχει αξία. Επιπλέον το ξεχωριστό 404 βοηθά το support («έγραψες λάθος email»). ⚠️ **Θα πρέπει να ξαναδοθεί αν η εφαρμογή γίνει ποτέ multi-tenant** — τότε διαρρέει πληροφορία μεταξύ εταιρειών.
- **Το μήνυμα του 429** μένει το default του framework (`"ThrottlerException: Too many requests"`). Δοκιμάστηκε να μπει ανθρώπινο κείμενο μέσω της option `errorMessage` του `ThrottlerModule` (υποστηρίζεται native, δεν χρειάζεται custom guard), αλλά **αναιρέθηκε**: το frontend θα χαρτογραφεί ούτως ή άλλως status codes σε δικά του μηνύματα (πρέπει, αφού τα μηνύματα του `ValidationPipe` δεν δείχνονται ποτέ σε χρήστη). Απόφαση κειμένου → Step 9.

### ⚠️ Ανοιχτό για το Step 14 (README/deploy) — Prisma 7 + `postinstall`

Ο φάκελος `backend/src/generated/` είναι gitignored, άρα **σε καθαρό clone τίποτα δεν μεταγλωττίζεται μέχρι να τρέξει `npx prisma generate`** (ισχύει από το Step 1, δεν το εισήγαγε αυτό το βήμα). Η επίσημη λύση των Prisma docs είναι `"postinstall": "prisma generate"`.

**Δεν μπορεί να μπει ως έχει:** το Prisma 7 έχει ανοιχτό regression όπου το `prisma generate` αποτυγχάνει χωρίς `DATABASE_URL`, επειδή ο helper `env()` στο `prisma.config.ts` πετάει σφάλμα κατά το φόρτωμα του config — και το δικό μας `prisma.config.ts` χρησιμοποιεί ακριβώς `env('DATABASE_URL')`. Σε καθαρό clone δεν υπάρχει `.env` (μόνο `.env.example`), άρα ένα αφελές `postinstall` θα έκανε το `npm install` να **αποτυγχάνει**.

- [prisma/prisma#28590](https://github.com/prisma/prisma/issues/28590) — ανοιχτό, `bug/1-unconfirmed`
- [prisma/prisma#28869](https://github.com/prisma/prisma/issues/28869) — κλειστό ως duplicate· regression από 6.15· workaround που αναφέρεται: `DATABASE_URL=none prisma generate`

Τρεις επιλογές για το Step 14: (α) postinstall + README που επιβάλλει σειρά «αντίγραψε `.env` πριν το `npm install`», (β) `process.env.DATABASE_URL ?? 'placeholder'` στο config αντί για `env()` και μετά postinstall, (γ) χωρίς postinstall, ρητό `npm run setup` + οδηγίες. Η πρόταση ήταν **(β)**, δεν αποφασίστηκε.

### ⚠️ Τα Steps 4 και 5 ΑΝΤΑΛΛΑΞΑΝ θέση (απόφαση στο τέλος αυτής της session)

**Το Step 4 είναι πλέον το Settings, το Step 5 το Time Entries.** Τα 6+ δεν άλλαξαν. Η ανταλλαγή έγινε τώρα επειδή κανένα ολοκληρωμένο βήμα (0-3) δεν αναφέρεται σε αυτούς τους αριθμούς — σε δύο βήματα δεν θα ήταν δωρεάν.

**Λόγος:** το Settings δεν εξαρτάται από τίποτα πέρα από Prisma + guards, ενώ **και** το Time Entries (`?cycle=` filter) **και** το Payroll χρειάζονται όρια κύκλου. Με την αρχική σειρά, το Time Entries θα αυτοσχεδίαζε υπολογισμό κύκλου που το Payroll θα ξανάγραφε — δηλαδή δύο υλοποιήσεις της ίδιας ημερομηνιακής λογικής, ακριβώς ό,τι απαγορεύει το invariant «single source of truth for cycle boundaries».

Ενημερώθηκαν αντίστοιχα: `build-plan.md` §4/§5/§8a, spec §6 (νέο endpoint) + §11 (σειρά), `architecture.md` (invariant + δείγμα κώδικα Payroll + νέο invariant για owner-or-ADMIN).

**Τρεις αποφάσεις που πάρθηκαν για το Time Entries πριν γραφτεί κώδικας** (μέσω review του build-plan, όπως έγινε και με τη σειρά των guards στο Step 2):

1. **Προστίθεται `POST /time-entries`** (Owner ή ADMIN) για χειροκίνητη προσθήκη ξεχασμένης βάρδιας. Έλειπε από spec **και** build-plan, ενώ ο εγκεκριμένος mockup `ShiftForm.tsx` έχει ήδη κατάσταση "Add Shift" με κείμενο «Add a forgotten or missing shift», και το build-plan §11 λέει `ShiftForm (add/edit/delete)`. Ίδια κατηγορία με το critical εύρημα του Step 2 (`setupCode` που το `EmployeeList.tsx` έκανε render χωρίς να το επιστρέφει το API). Το `clock-in` δεν καλύπτει την ανάγκη — γράφει πάντα `startTime = now, endTime = null`. Συζητήθηκε ρητά ότι αυτό σημαίνει πως ο υπάλληλος γράφει μόνος τις ώρες του· έγινε αποδεκτό γιατί το spec **ήδη** του δίνει `PUT`/`DELETE` στις δικές του εγγραφές, άρα η δυνατότητα υπήρχε ούτως ή άλλως. Ροή έγκρισης θα ήταν αλλαγή domain model (`source`, `status`, `approvedById`, `approvedAt` + αλλαγή στον υπολογισμό μισθοδοσίας) — **εκτός Phase 1**.
2. **Το «Owner or ADMIN» επιβάλλεται στο service**, με το φίλτρο ιδιοκτησίας μέσα στο Prisma `where` → **404** όταν η εγγραφή ανήκει σε άλλον. Ο `RolesGuard` δεν μπορεί να το εκφράσει (συγκρίνει έναν ρόλο), και guard θα χρειαζόταν πρόσβαση σε Prisma. Ίδιο μοτίβο με το `findEmployeeByIdOrThrow` του Step 2.
3. **Το cycle filter μπαίνει από την αρχή** στο Time Entries, αφού πλέον το Settings προηγείται.

### ⚠️ Η απόφαση «trust-payload-only» του Step 3 ΑΝΑΘΕΩΡΗΘΗΚΕ (ίδια session)

Το ερώτημα που προέκυψε εξετάζοντας το Step 5: απενεργοποιημένος employee με token εκδομένο **πριν** την απενεργοποίηση συνέχιζε να δουλεύει κανονικά. **Δεν χρειαζόταν καμία κακή πρόθεση** — το token ζει στο localStorage, δεν ζητείται νέο login, ο χρήστης ανοίγει το ίδιο tab και πατάει το ίδιο κουμπί. Παράθυρο: έως 14 μέρες.

Εξετάστηκαν τρεις επιλογές: (α) αποδοχή, (β) έλεγχος `isActive` μόνο στα endpoints που γράφουν, (γ) έλεγχος στο `JwtStrategy.validate()` για κάθε request.

**Επιλέχθηκε το (γ).** Το (β) απορρίφθηκε γιατί δημιουργεί κανόνα που πρέπει να θυμάται κανείς σε **κάθε μελλοντικό write endpoint** — και η ίδια η σημερινή session βρήκε **τρία** ακριβώς τέτοια ξεχασμένα («να το κάνεις και εδώ»): το `setupCode` που διέρρευσε από επαναχρησιμοποίηση DTO, το `isActive` που έλειπε από το `set-initial-password` ενώ υπήρχε στο `login`, και τα `PUT`/`DELETE` που δεν δοκιμάστηκαν ποτέ με employee token. Το (γ) ζει σε ένα σημείο και δεν μπορεί να παρακαμφθεί.

Το κόστος (ένα indexed PK lookup ανά request) είναι πρακτικά μηδενικό σε αυτή την κλίμακα. Η αρχική απόφαση **δεν ήταν λάθος τότε** — πάρθηκε όταν όλα τα endpoints ήταν read-only· το Time Entries είναι το πρώτο που γράφει δεδομένα τα οποία γίνονται χρήματα.

**Αλλαγές:** `users.service.ts` → νέα `findActiveById()` (με `select` μόνο `id`/`role`, ώστε να μη φορτώνονται `password`/`setupCode` σε κάθε request — αυτή είναι η μέθοδος που το review του Step 2 είχε προβλέψει ότι «θα μπει όταν τη χρειαστεί το JwtStrategy»). `jwt.strategy.ts` → async `validate()` που την καλεί, 401 αν ο χρήστης λείπει ή είναι ανενεργός, και το `role` διαβάζεται πλέον από τη γραμμή αντί από το token. `auth.module.ts` αμετάβλητο (ήδη έκανε import το `UsersModule`).

**Επαληθεύτηκε:** ίδιο token → `GET /users/me` **200 πριν** την απενεργοποίηση, **401 μετά**· ο admin ανεπηρέαστος. `tsc`/lint καθαρά.

**Πλευρικό όφελος:** δεν αφορούσε μόνο το clock-in. Ο απενεργοποιημένος έβλεπε payroll, βάρδιες, τα πάντα, για 14 μέρες. Η τρύπα ήταν πάντα ευρύτερη από το σημείο που ξεκίνησε η συζήτηση.

- **Επόμενο βήμα**: Step 4 — **Settings module** (`GET /settings`, `PUT /settings`, `resolveCycleRange()` ως pure function).

## Step 4 — Settings Module
Status: ✅ Done
Ημερομηνία: 2026-08-03
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/settings/cycle.util.ts` — **όλη** η ημερομηνιακή λογική κύκλου, καθαρές συναρτήσεις χωρίς DB/DI: `parseCycleKey`, `formatCycleKey`, `computeCycleRange`, `shiftCycleKey`, `resolveCurrentCycleKey`, `hoursWithinCycle`, `isSplitAcrossCycle`, `toCycleRangeDto`
- `backend/src/settings/settings.service.ts` — `getSettings`, `updateSettings`, `resolveCycleRange(cycle?)`· private `getSettingsRow()` + `assertUsableCycleStartDay()`
- `backend/src/settings/settings.controller.ts` — `GET /settings` (και οι δύο ρόλοι), `PUT /settings` (ADMIN)· Swagger 200/400/401/403
- `backend/src/settings/settings.module.ts` — imports `PrismaModule`, exports `SettingsService` (θα το κάνουν inject τα Steps 5/6)
- `backend/src/settings/dto/` — `settings-response.dto.ts`, `update-settings.dto.ts`, `cycle-range.dto.ts` (το κοινό cycle payload), `is-day-before.validator.ts` (custom `class-validator` decorator)
- `backend/src/settings/cycle.util.spec.ts` (30 tests) + `settings.service.spec.ts` (10 tests, stubbed Prisma)
- `backend/src/app.module.ts` — import `SettingsModule`
- `backend/package.json` — **jest `moduleNameMapper`** (βλ. σημείωση παρακάτω· δεν είναι cosmetic, χωρίς αυτό δεν τρέχει κανένα service test)
- `context/swifttrack-phase1-final.md` — §3 (AppSettings notes), §4 (νέες αποφάσεις **5a** & **5b**), §6 (PUT /settings constraints), §7 (ξαναγράφτηκε ο υπολογισμός με splitting + cycle payload + default cycle)
- `context/architecture.md` — folder structure, AppSettings schema notes, § Data Flow (Payroll), § Payroll Calculation Pattern (overlap query + clipping), **4 νέα/ξαναγραμμένα invariants** (day range 11-25, exclusive boundary, shift splitting, default `?cycle=`)
- `context/build-plan.md` — §4 (πλήρως ξαναγραμμένο), §5, §6, §8, §8a, §13
Endpoints/Components:
- `GET /settings` — 200 `{ cycleStartDay, cycleEndDay }`, και οι δύο ρόλοι (ο employee χρειάζεται τις μέρες για να διαβάσει τις δικές του σελίδες)
- `PUT /settings` — 200, μόνο ADMIN· 400 σε οτιδήποτε εκτός 11..25 / μη-συνεχόμενο ζευγάρι
- `SettingsService.resolveCycleRange(cycle?)` — **δεν έχει HTTP επιφάνεια σε αυτό το βήμα**· είναι το API που καταναλώνουν τα Steps 5/6

### Οι 5 αποφάσεις που πάρθηκαν μέσω `/architect` πριν τον κώδικα

1. **Splitting βάρδιας στο όριο (νέο, αλλάζει το spec §7).** Βάρδια 24 Aug 20:00 → 25 Aug 03:00 δίνει 4h στον έναν κύκλο και 3h στον επόμενο, αντί για 7h ολόκληρες στον κύκλο του `startTime`. Το άθροισμα όλων των κύκλων ισούται πάντα με τις πραγματικές ώρες — καμία ώρα δεν χάνεται, καμία δεν πληρώνεται δύο φορές. **Καμία αλλαγή στο domain model, καμία migration.**
2. **Exclusive όριο εσωτερικά, inclusive στο API.** Το splitting απαιτεί **μία** στιγμή τομής· τα μεσάνυχτα είναι ταυτόχρονα `endExclusive` του ενός κύκλου και `start` του επόμενου (υπάρχει test γι' αυτή την ταυτότητα). Κάθε Prisma filter γράφει `lt`, ποτέ `lte`. Το `cycleEnd` του DTO (`23:59:59.999`) είναι **μόνο** για εμφάνιση και δεν μπαίνει ποτέ σε query.
3. **`cycleStartDay` ∈ 11..25, `cycleEndDay` = start − 1** (απόφαση του χρήστη). Δύο συνέπειες: οι διαδοχικοί κύκλοι κουμπώνουν (καμία βάρδια σε κενό ή σε δύο κύκλους), και **το clamping για 28/29/30/31 εξαφανίστηκε** — κάθε επιτρεπτή μέρα υπάρχει σε κάθε μήνα. Το `cycleEndDay` αποθηκεύεται και επικυρώνεται αλλά **δεν μπαίνει στα μαθηματικά** (μία πηγή αλήθειας ανά όριο).
4. **Το cycle payload κουβαλάει `cycle`/`prevCycle`/`nextCycle`** μαζί με `cycleStart`/`cycleEnd`. Το ◀▶ ξαναστέλνει key — ούτε καν month rollover δεν υλοποιείται δεύτερη φορά στο frontend.
5. **Η βάρδια εμφανίζεται σε κάθε κύκλο που ακουμπάει, με κομμένες ώρες + `isSplit`.** Το κριτήριο ήταν συγκεκριμένο: η στήλη Hours του `PayrollBreakdown` πρέπει να αθροίζει σε αυτό που πληρώνεται, αλλιώς ο υπάλληλος βλέπει 23h στη στήλη και 20h στο σύνολο χωρίς εξήγηση.

### Πού μπαίνει ο έλεγχος 11..25 — δύο στρώματα, όχι διπλός

Ο χρήστης πρότεινε (σωστά) να περιορίζει η φόρμα τις επιλογές ώστε να μη μπορεί να σταλεί άκυρο ζευγάρι. Αυτό **έκλεισε** τη συζήτηση υπέρ του «δύο πεδία στο DTO»: αφού το UI δεν παράγει ποτέ άκυρο ζευγάρι, το API κρατάει το συμβόλαιο του spec §6 αναλλοίωτο και το 400 αφορά μόνο χειροποίητα requests. **Ο backend έλεγχος παρέμεινε** για τέσσερις λόγους που συζητήθηκαν ρητά: το Swagger UI είναι ανοιχτό στο `/api` και είναι κυριολεκτικά φόρμα για χειροποίητα requests· το frontend έρχεται στο Step 13, άρα τα Steps 5-12 αναπτύσσονται χωρίς δίχτυ· το Step 13a ξαναγράφει κάθε φόρμα με zod· και η βάση δεν έχει constraint γι' αυτό. Ίδιο μοτίβο με το `findByEmail()` + `P2002` του Step 2.

### Δύο σκόπιμες ασυμμετρίες στο `SettingsService`

- **Λείπει το `AppSettings` row → 500** «Settings not initialised. Run `npx prisma db seed`.», ποτέ σιωπηλό `upsert` στα defaults. Ένα σιωπηλό fallback θα μετακινούσε το όριο μισθοδοσίας έως δύο εβδομάδες χωρίς κανένα σημάδι. Το αντεπιχείρημα «να δουλεύει χωρίς seed» δεν στέκει: το ίδιο seed φτιάχνει και τον πρώτο admin, άρα δεν υπάρχει κατάσταση όπου χρησιμοποιείς την εφαρμογή έχοντας παραλείψει το seed.
- **`assertUsableCycleStartDay()` τρέχει μόνο στο `resolveCycleRange`, όχι στο GET/PUT.** Μια γραμμή αλλαγμένη με το χέρι στη βάση (π.χ. 31) θα έκανε το `Date.UTC` να κυλήσει σιωπηλά στον επόμενο μήνα — λάθος όριο, όχι error. Ο έλεγχος μπαίνει στο μονοπάτι που υπολογίζει· το `GET` πρέπει να δείχνει τη γραμμή όπως είναι και το `PUT` είναι ο τρόπος να διορθωθεί, αλλιώς ο admin κλειδώνεται έξω από την επιδιόρθωση.

### Επαλήθευση (πραγματικά εκτελεσμένη — βλ. το μάθημα διαδικασίας του Step 3)

**40 unit tests, όλα περνάνε** (`npm test`): 30 στο `cycle.util.spec.ts` + 10 στο `settings.service.spec.ts`. Καλύπτουν: όρια κύκλου, rollover Δεκεμβρίου/Ιανουαρίου, Φεβρουάριος + δίσεκτο, η ταυτότητα `julyEndExclusive === augustStart`, το split 4h/3h με άθροισμα 7h, βάρδια που τελειώνει/ξεκινάει ακριβώς στο όριο, ανοιχτή βάρδια = 0h, βάρδια που καταπίνει όλο τον κύκλο, `cycleEnd < endExclusive`, το default `?cycle=` με fake timers, και τα δύο 500 μονοπάτια (λείπει row / out-of-range day) που **δεν φτάνονται μέσω HTTP** χωρίς να χαλάσεις τη βάση επίτηδες.

**17 HTTP checks σε ζωντανό server + πραγματική DB, όλα PASS:** `GET` χωρίς token → 401· `GET` admin/employee → 200· `PUT` employee → **403**· `PUT` χωρίς token → 401· `PUT {11,10}` → 200 και **επιβεβαιώθηκε ότι έγραψε** με δεύτερο `GET`· `PUT {25,20}`/`{10,9}`/`{26,25}`/`{25,26}`/`{25}` μόνο/strings/fractional/extra key → όλα 400· επαναφορά σε `{25,24}`. Τα μηνύματα ελέγχθηκαν αυτούσια: `"cycleEndDay must be exactly cycleStartDay - 1."` (custom validator), `"cycleStartDay must not be greater than 25"`, `"property nope should not exist"` (whitelist).

Test data καθαρίστηκαν — η DB είναι πάλι στην αρχική seed κατάσταση (1 admin, `AppSettings` 25/24, επιβεβαιώθηκε με `psql`). `npx tsc --noEmit` καθαρό, `npm run lint` καθαρό.

### ⚠️ Αλλαγή στο jest config που **πρέπει** να ξέρει το Step 8a

Το `settings.service.spec.ts` **δεν έτρεχε καθόλου** αρχικά: ο resolver του jest δεν λύνει τα explicit `.js` specifiers που παράγει ο Prisma 7 client (`import * as $Class from "./internal/class.js"`). Κάθε spec που αγγίζει `PrismaService` — δηλαδή **όλα** τα service tests του 8a — έσκαγε με `Cannot find module './internal/class.js'`. Λύση: `moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" }` στο jest config του `package.json`. Δεν είναι workaround του δικού μας κώδικα, είναι το τεκμηριωμένο mapping για TS πηγές με explicit extensions.

Ίδια ρίζα είχαν και δύο αποτυχημένες προσπάθειες να τρέξει throwaway verification script μέσα από το Nest DI: το `tsx` (esbuild) **δεν παράγει decorator metadata**, άρα το DI σπάει (`ConfigService` undefined στο `JwtStrategy`)· το `ts-node` σκόνταψε στο ίδιο `.js` resolution. Μετά τη δεύτερη αποτυχία σταμάτησα αυτή τη διαδρομή (Recovery Protocol) και ο έλεγχος έγινε ως **μόνιμο** spec με stubbed Prisma — καλύτερο αποτέλεσμα, αφού μένει στο repo. **Για μελλοντικά scripts που χρειάζονται Nest DI: ούτε `tsx` ούτε `ts-node` — jest ή compiled `dist/`.**

### Ανοιχτά που δημιουργεί αυτό το βήμα

- **Step 5/6**: το `hoursWithinCycle()`/`isSplitAcrossCycle()` υπάρχουν ήδη και είναι δοκιμασμένα — δεν ξαναγράφονται. Το query είναι **overlap**, όχι containment: `{ endTime: { not: null, gt: start }, startTime: { lt: endExclusive } }`.
- **Step 6/12**: το `PayrollBreakdown` του mockup στρογγυλοποιεί ISK **ανά γραμμή**· `Σ round(...) ≠ round(Σ ...)`. Ίδια οικογένεια «η στήλη δεν αθροίζει» με το splitting, αλλά δεν λύθηκε εδώ.
- **Step 13**: το `SettingsPage.tsx` έχει δύο ελεύθερα number inputs 1-31 — γίνεται ένα `<select>` 11..25 με το end day ως παράγωγο κείμενο. Στέλνει και τα δύο πεδία.

**Επόμενο βήμα**: Step 5 — Time Entries module (clock-in/out, χειροκίνητη προσθήκη βάρδιας, CRUD, owner-or-ADMIN στο service, cycle filter με splitting).
