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
