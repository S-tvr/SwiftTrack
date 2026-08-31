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
- Προστέθηκε νέο βήμα **13a — Client-side validation polish** στο `build-plan.md` (μετά το 13, πριν το README, χωρίς αλλαγή αρίθμησης 0-14): Zod + react-hook-form + shadcn `Form` σε όλες τις φόρμες, σκόπιμα τελευταίο. → ⚠️ **Το 13a ΚΑΤΑΡΓΗΘΗΚΕ στις 2026-08-26** και δεν υπάρχει πλέον στο `build-plan.md`· το περιεχόμενό του έγινε κανόνας που ισχύει από το Step 9. Βλ. τη σχετική εγγραφή παρακάτω για το σκεπτικό.
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

Ο χρήστης πρότεινε (σωστά) να περιορίζει η φόρμα τις επιλογές ώστε να μη μπορεί να σταλεί άκυρο ζευγάρι. Αυτό **έκλεισε** τη συζήτηση υπέρ του «δύο πεδία στο DTO»: αφού το UI δεν παράγει ποτέ άκυρο ζευγάρι, το API κρατάει το συμβόλαιο του spec §6 αναλλοίωτο και το 400 αφορά μόνο χειροποίητα requests. **Ο backend έλεγχος παρέμεινε** για τέσσερις λόγους που συζητήθηκαν ρητά: το Swagger UI είναι ανοιχτό στο `/api` και είναι κυριολεκτικά φόρμα για χειροποίητα requests· το frontend έρχεται στο Step 13, άρα τα Steps 5-12 αναπτύσσονται χωρίς δίχτυ· το Step 13a ξαναγράφει κάθε φόρμα με zod *(→ το 13a καταργήθηκε στις 2026-08-26· το επιχείρημα δεν αλλάζει, απλώς η zod επικύρωση μπαίνει πλέον από το Step 9 και όχι σε ξεχωριστό βήμα στο τέλος)*· και η βάση δεν έχει constraint γι' αυτό. Ίδιο μοτίβο με το `findByEmail()` + `P2002` του Step 2.

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

### Απόφαση μετά το Step 4 — το 8a μεγάλωσε

Παρατηρήθηκε (ερώτηση του χρήστη) ότι Users/Auth **δεν έχουν κανένα test** — το plan τα κάλυπτε μόνο με χειροκίνητο έλεγχο στο Step 8. Αυτό είναι στιγμιότυπο, όχι δίχτυ: το Step 3 άλλαξε το `JwtStrategy` ώστε να χτυπάει τη βάση σε **κάθε** authenticated request, και τίποτα αυτοματοποιημένο δεν θα έπιανε αν είχε σπάσει το login. Το `AuthService` ειδικά έχει ήδη βρεθεί λάθος μία φορά (λείπων `isActive` έλεγχος στο `set-initial-password`, το βρήκε το `/review`, όχι test).

Το **§8a του build-plan επεκτάθηκε** σε «cycle, payroll, Auth & Users» (+ TimeEntries), με το μοτίβο stubbed-Prisma του `settings.service.spec.ts` — χωρίς βάση.

**Και προστέθηκε νέο §8b — full-stack tests με πραγματική test DB.** Αρχικά είχα προτείνει να μην γίνει e2e στη Phase 1· ο χρήστης ρώτησε αν καλύπτεται πουθενά «guards + DB + όλα μαζί, αυτοματοποιημένα» και η απάντηση ήταν όχι: το §8 έχει ακριβώς αυτό το εύρος αλλά **χειροκίνητα**, και το §8a είναι ρητά χωρίς βάση. Το κόστος που είχα επικαλεστεί ήταν υπερεκτιμημένο — δεύτερη βάση στο ίδιο container που ήδη τρέχει, και η λίστα του τι ελέγχεται **υπάρχει ήδη γραμμένη** στο §8. Τέσσερα πράγματα δεν καλύπτονται από τίποτα άλλο: ότι τα guards όντως **εκτελούνται** ανά route, ότι το Prisma query είναι σωστό SQL (κρίσιμο στο payroll — mock θα γύριζε ό,τι του πεις), τα DB constraints, και ότι τα migrations εφαρμόζονται από το μηδέν.

**Επόμενο βήμα**: Step 5 — Time Entries module. *(Ολοκληρώθηκε — βλ. την επόμενη ενότητα.)*

## Step 5 — Time Entries Module
Status: ✅ Done
Ημερομηνία: 2026-08-06 (ξεκίνησε 2026-08-05)
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/time-entries/time-entries.service.ts` — clock-in/out, `findOpen`, CRUD, cycle lists· δύο ιδιωτικοί φύλακες (`assertOwnerHasNoOpenShift`, `assertNoOverlap`) + `findOwnedOrThrow` (owner-or-ADMIN μέσα στο Prisma `where`) + `resolveTargetUserId`
- `backend/src/time-entries/time-entries.controller.ts` — 8 routes, πλήρη Swagger decorators (200/201/204/400/401/403/404)
- `backend/src/time-entries/time-entries.module.ts` — imports `PrismaModule`, `SettingsModule`, `UsersModule`
- `backend/src/time-entries/dto/` — `create-time-entry`, `update-time-entry`, `time-entry-response` (+ `CycleTimeEntryDto`), `cycle-entries-response`, `open-shift-response`, `shift-time.validator` (`IsNotInTheFuture`, `IsNotBefore`)
- `backend/src/time-entries/time-entries.service.spec.ts` (35 tests) + `dto/shift-time.validator.spec.ts` (14 tests)
- `backend/prisma/migrations/20260806003155_time_entry_single_open_shift/` — **partial unique index** (μπήκε στο `/review`, βλ. παρακάτω)· καμία αλλαγή στο `schema.prisma`
- `backend/src/users/users.service.ts` — **νέα** `assertEmployeeExists()` (βλ. σημείωση για τα narrow readers)
- `backend/src/app.module.ts` — import `TimeEntriesModule`
- `context/build-plan.md` — §5 ξαναγραμμένο (οι 4 write rules, ο κανόνας `userId`, το `PUT`, tests στο βήμα, `{ openShift }`), §8a
- `context/architecture.md` — **6 νέα invariants**, διόρθωση του δείγματος Payroll (καλούσε `prisma.user` απευθείας), folder structure
- `context/swifttrack-phase1-final.md` — §6, **νέα §7a** (Time-Entry Write Rules), 6 νέες γραμμές στο §8a
- **Καμία αλλαγή στο domain model** — ο `TimeEntry` υπάρχει από το Step 1· το μόνο migration είναι το index παραπάνω, που δεν αγγίζει στήλες
Endpoints/Components:
- `POST /time-entries/clock-in` (EMPLOYEE) — 201· 400 αν υπάρχει ήδη ανοιχτή
- `PATCH /time-entries/clock-out` (EMPLOYEE) — χωρίς `:id`, κλείνει τη δική του
- `GET /time-entries/open` (EMPLOYEE) — `{ openShift: … | null }`
- `POST /time-entries` (Owner ή ADMIN) — χειροκίνητη προσθήκη κλειστής βάρδιας
- `GET /time-entries/me` (EMPLOYEE) + `GET /time-entries?userId=&cycle=` (ADMIN) — **ίδιο σχήμα**
- `PUT /time-entries/:id`, `DELETE /time-entries/:id` (Owner ή ADMIN, 204 στο delete)
Σημειώσεις:

### Οι 4 αποφάσεις που ξεμπλόκαραν το βήμα (μέσω `/architect`, μία-μία)

Οι τρεις που ήταν παρκαρισμένες, **συν μία τέταρτη** που βρέθηκε διαβάζοντας τους mockups. Πλήρως γραμμένες ως κανόνες στο spec **§7a** — εδώ μόνο το σκεπτικό:

1. **`endTime` υποχρεωτικό σε `POST` και `PUT`** (ο χρήστης επέλεξε το συμμετρικό αντί για το ασύμμετρο που πρότεινα). Ο κανόνας σε μία πρόταση: *η φόρμα είναι το εργαλείο για κλειστές βάρδιες, το clock in/out για ζωντανές.* Αποδεκτό τίμημα: mid-shift διόρθωση απαιτεί πρώτα clock-out. Όφελος: η ξεχασμένη έξοδος διορθώνεται **μόνο** μέσω `PUT` με πραγματικό `endTime`.
2. **400 μόνο αν `endTime < startTime`** — η μηδενική βάρδια (`start == end`) επιτρέπεται σκόπιμα (0 ώρες, μπορεί να κουβαλά notes). Το `Math.max(0, …)` του `hoursWithinCycle` είναι δίχτυ για τα μαθηματικά, **όχι** επικύρωση: χωρίς αυτόν τον έλεγχο η ανάποδη βάρδια φαίνεται κανονικά στη λίστα και πληρώνει 0 χωρίς κανένα μήνυμα.
3. **Καμία επικάλυψη → 400**, με την ανοιχτή βάρδια να μετράει ως `[start, ∞)`.
4. **`userId` στο `CreateTimeEntryDto`** — υποχρεωτικό για ADMIN, απορριπτέο για EMPLOYEE. Χωρίς αυτό, το κουμπί "Add Shift" που ο εγκεκριμένος `ShiftList` κάνει render **και** στο admin route `/shifts/:userId` έγραφε τη βάρδια **στον λογαριασμό του admin**: χωρίς `hourlyRate`, εκτός `GET /users`, ποτέ ορατή, ποτέ πληρωμένη. Ίδια οικογένεια με το `setupCode` του Step 2 και το `?cycle=` του Step 4.

### Ο κανόνας που ο χρήστης απλοποίησε — και γιατί σημαίνει λιγότερο κώδικα

Είχα προτείνει interval math πάνω στο ανοιχτό διάστημα. Ο χρήστης πρότεινε αντ' αυτού: **όσο υπάρχει ανοιχτή βάρδια, η φόρμα δεν δέχεται τίποτα.** Ίδια εγγύηση, ένα boolean αντί για αριθμητική — και αυτό είναι που κάνει τη σύγκρουση από **clock-out** αδύνατη *εκ κατασκευής*: αν τίποτα δεν γράφτηκε όσο η βάρδια ήταν ανοιχτή, το κλείσιμό της δεν μπορεί να καταπιεί τίποτα.

Χρειάστηκε **μία εξαίρεση**, αλλιώς κλειδώνει: το `PUT` είναι το μοναδικό εργαλείο του admin (το clock-out είναι EMPLOYEE-only και κλείνει *τη δική του* βάρδια). Χωρίς αυτήν, ανοιχτή βάρδια **απενεργοποιημένου** υπαλλήλου —που δεν μπορεί καν να κάνει login— μένει ανοιχτή για πάντα. Τελική μορφή: EMPLOYEE μπλοκάρεται ολικά (ξεμπλοκάρει με clock-out), ADMIN υπόκειται μόνο στον έλεγχο σύγκρουσης.

Ο χρήστης πρότεινε επίσης **«τίποτα στο μέλλον»**, που αποδείχθηκε ισχυρότερο απ' όσο φαινόταν: ακυρώνει τον έλεγχο που ήθελα να προσθέσω στο `clock-in`. Ο χρόνος πάει μόνο μπροστά, άρα αν καμία κλειστή βάρδια δεν φτάνει ποτέ το `now`, το clock-in στο `now` δεν μπορεί να πέσει μέσα σε καμία. **Validation στο DTO αντί για extra query.**

### Το εύρημα που βγήκε μόνο επειδή τρέξαμε τον κώδικα

`GET /time-entries/open` χωρίς ανοιχτή βάρδια επέστρεφε **200 με άδειο σώμα**, όχι `null`: ο Nest κάνει `res.send()` για nil result (`RouterResponseController`). Το `api/client.ts` του Step 9 θα κάνει `res.json()` σε κάθε response — δηλαδή θα έσκαγε ακριβώς στο endpoint του οποίου η **φυσιολογική** απάντηση είναι «τίποτα». Λύση: wrapper `{ openShift: … | null }`. Δεν το έπιασε κανένα unit test — το έπιασε το `curl`.

### Πού μπήκε το `assertEmployeeExists` και γιατί όχι public το υπάρχον

Ο χρήστης ρώτησε αν το να κάνω public το `findEmployeeByIdOrThrow` δημιουργεί κενό ασφαλείας. `public` σε provider δεν ανοίγει HTTP route — αλλά η μέθοδος επιστρέφει **ολόκληρη** τη γραμμή `User`, με `password` και `setupCode`. Αυτό το project έχει ήδη φάει δύο φορές αυτό ακριβώς (το `findById()` που αφαιρέθηκε στο Step 2, το DTO reuse του Step 3). Νέο invariant: **cross-service readers στενοί και σκοπο-ονομασμένοι, με ρητό `select`** — όπως ήδη έκανε το `findActiveById()`. Το `findEmployeeByIdOrThrow` έμεινε `private`. Το Step 6 θα πάρει το δικό του `findEmployeeRate`.

### Επαλήθευση (πραγματικά εκτελεσμένη)

**89 unit tests, όλα περνάνε** (`npm test`): 40 από το Step 4 + **49 νέα** (35 στο `time-entries.service.spec.ts`, 14 στο `shift-time.validator.spec.ts`· τα 2 τελευταία μπήκαν στο `/review`). Οι κανόνες 1/2/4 ζουν στα DTOs και δοκιμάζονται μέσα από τις **πραγματικές** κλάσεις DTO (ένας validator κολλημένος σε λάθος property θα περνούσε αν δοκιμαζόταν απομονωμένος)· ο κανόνας 3 και η ασυμμετρία ρόλου στο service με stubbed Prisma.

**63 HTTP checks σε ζωντανό server + πραγματική DB, όλα PASS** — guards ανά route (401/403), το μπλόκο του employee, ο admin που κλείνει την ανοιχτή βάρδια, και οι 4 write rules με τα μηνύματα ελεγμένα αυτούσια. Κρίσιμο πέρασμα: **βάρδια που ξεκινά ακριβώς όταν τελειώνει η προηγούμενη → 201**, δηλαδή το query είναι όντως `gt`/`lt` και όχι `gte`/`lte`. Και το splitting σε πραγματικές γραμμές: η ίδια βάρδια 24 Jul 20:00 → 25 Jul 03:00 δίνει **4h στο 2026-06 και 3h στο 2026-07**, άθροισμα 7h. Μετά τη διόρθωση του wrapper ξανατρέχτηκε το `/open` (κενό → `{"openShift":null}`, με ανοιχτή → το entry).

Test data καθαρίστηκαν — η DB επιβεβαιώθηκε με `psql` στην αρχική seed κατάσταση (1 admin, 0 `TimeEntry`, `AppSettings` 25/24). `npx tsc --noEmit` καθαρό, `npm run lint` καθαρό.

⚠️ **Τι ΔΕΝ απέδειξαν τα tests, σκόπιμα:** με stubbed Prisma το mock επιστρέφει ό,τι του πεις, άρα το boundary case ελέγχεται μόνο ως **σχήμα** του `where`. Ότι τα guards όντως *εκτελούνται* ανά route και ότι το SQL είναι σωστό ανήκουν στο **8b** — γι' αυτό υπάρχει.

### `/review` στο τέλος του Step 5 — 7 ευρήματα, 3 διορθώθηκαν

0 Critical, 3 Important (διορθώθηκαν), 4 Minor (μένουν, βλ. «Ανοιχτά» παρακάτω).

**1. 🟠 Διπλό clock-in μπορούσε να φτιάξει δύο ανοιχτές βάρδιες.** Ο έλεγχος του `clockIn()` ήταν check-then-act: δύο requests κοντά στον χρόνο διάβαζαν και τα δύο «καμία ανοιχτή» πριν γράψει οποιοδήποτε. Δεν είναι θεωρητικό — το Clock In είναι το μεγαλύτερο control της σελίδας σε κινητό και το διπλό πάτημα είναι η πιο κοινή χειρονομία που υπάρχει. Οι συνέπειες δεν ήταν καλλωπιστικές: το `clock-out` κλείνει **μία** (`findFirst`), η δεύτερη έμενε ανοιχτή για πάντα, και ο κανόνας του μπλόκου κλείδωνε τον υπάλληλο έξω από **κάθε** εγγραφή μέχρι να παρέμβει ο admin.

  Λύση σε **δύο στρώματα**, ίδιο μοτίβο με το `findByEmail()` + `P2002` του Step 2: νέο migration `20260806003155_time_entry_single_open_shift` με **partial unique index** (`ON "TimeEntry" ("userId") WHERE "endTime" IS NULL` — χειρόγραφο SQL, το Prisma DSL δεν έχει `WHERE` στο `@@unique`, όπως και το `CHECK` του `AppSettings`), και `P2002` catch στο `clockIn()` που μεταφράζεται στο **ίδιο** §8a μήνυμα ώστε ο καλών να μη μαθαίνει ποιο στρώμα τον σταμάτησε.

**2. 🟠 `GET /time-entries/me` δεν ήταν EMPLOYEE-only** — είχε μόνο `JwtAuthGuard`, ενώ το spec §6 λέει EMPLOYEE και το αδελφό `/open` είχε ήδη `@Roles(Role.EMPLOYEE)`. Δεν διέρρεε τίποτα (ο admin έπαιρνε τη δική του κενή λίστα) αλλά ήταν απόκλιση συμβολαίου + ασυνέπεια μέσα στο ίδιο αρχείο. **Δεν το κάλυπτε κανένα check** — το `/me` είχε δοκιμαστεί μόνο με employee token.

**3. 🟠 Το spec δεν ήξερε για το `{ openShift }` wrapper** — είχα ενημερώσει `build-plan.md` και tracker αλλά όχι το §6, που είναι ακριβώς το αρχείο που θα διαβάσει το Step 10.

**Επαλήθευση των διορθώσεων (πραγματικά εκτελεσμένη):**
- **Απευθείας SQL**: το index υπάρχει και είναι όντως partial· δεύτερο `INSERT` ανοιχτής βάρδιας για τον ίδιο χρήστη **απορρίπτεται από τη βάση**· κλειστή βάρδια δίπλα του περνάει κανονικά.
- **8 ταυτόχρονα clock-in**: **1×201 + 7×400** με το αυτούσιο §8a μήνυμα, και **ακριβώς μία** ανοιχτή βάρδια στη βάση.
- `/me`: admin → **403**, employee → 200, χωρίς token → 401.
- Regression στα endpoints που ακουμπήθηκαν: όλα πράσινα. DB πίσω σε seed κατάσταση.
- **89 unit tests** (87 + 2 νέα: η μετάφραση του `P2002` και ότι **δεν** καταπίνονται άσχετα DB errors).

⚠️ **Μάθημα μέτρησης:** η πρώτη εκτέλεση του race test έδειξε «0×201, 2×400» και το ανέφερα ως FAIL. Ήταν **σφάλμα του harness**, όχι του κώδικα: 8 παράλληλες διεργασίες έκαναν `>>` στο ίδιο αρχείο και χάθηκαν γραμμές. Με ξεχωριστό αρχείο ανά request βγήκε το σωστό. Το γράφω γιατί το ίδιο λάθος θα ξαναγίνει στο **8b**, όπου τα concurrency tests είναι ρητά στο scope.

### Ανοιχτά που δημιουργεί αυτό το βήμα

- **4 Minor από το `/review`, συνειδητά αδιόρθωτα:** (α) race στο `update`/`delete` — `findOwnedOrThrow` και μετά ενέργεια με `id`· αν η γραμμή σβηστεί ενδιάμεσα, το `P2025` βγαίνει ως **500 αντί για 404**· (β) `PUT` χωρίς `notes` **σβήνει** τα υπάρχοντα (full-replacement· ο `ShiftForm` στέλνει πάντα και τα τρία, αλλά το Swagger/curl όχι)· (γ) το `DELETE` **δεν** μπλοκάρεται από ανοιχτή βάρδια, άρα ο υπάλληλος μπορεί να τη σβήσει αντί να κάνει clock out — ασφαλές αλλά αδήλωτο, και πετάει την εγγραφή του clock-in· (δ) το `userId` του `CreateTimeEntryDto` φαίνεται προαιρετικό στο Swagger ενώ είναι υποχρεωτικό για ADMIN (το εξηγεί το description).
- **Αποδεκτό κενό:** ο έλεγχος σύγκρουσης είναι check-then-act· δύο ταυτόχρονα submit μπορούν να περάσουν και τα δύο. Χωρίς DB-level exclusion constraint στη Phase 1 (θα ήθελε `btree_gist` + `tstzrange` + χειρισμό του `NULL endTime`), και **χωρίς φθηνό `P2002`-style catch** να το ζευγαρώσει, σε αντίθεση με το email του Step 2. Blast radius: μία διπλή γραμμή που ο admin σβήνει.
- **Step 11**: το End Time γίνεται `required` στον `ShiftForm`· το `max` του input μπορεί να μαλακώσει το ρίσκο να πάει το ρολόι του browser μπροστά από του server (τότε βάρδια που τελειώνει «τώρα» παίρνει 400).
- **Step 10**: ο `ClockButton` διαβάζει `{ openShift }`, όχι σκέτο entry.
- **Step 6**: χρειάζεται `findEmployeeRate` στο `UsersService` (ήδη τεκμηριωμένο στο δείγμα του architecture.md).

**Επόμενο βήμα**: Step 6 — Payroll module. *(Ολοκληρώθηκε — βλ. την επόμενη ενότητα. Το βήμα δεν έμεινε «Stage A / flat rate»: ο χρήστης έδωσε τον πραγματικό υπολογισμό με ζώνες χρέωσης πριν γραφτεί κώδικας.)*

## Step 6 — Payroll Module (rate zones)
Status: ✅ Done
Ημερομηνία: 2026-08-06
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/payroll/rate-zones.util.ts` — **όλη** η αριθμητική ζωνών, pure, χωρίς DB/DI: `PayZone`, `PAY_ZONES`, `resolveZone`, `splitShiftIntoDayZoneSegments`, `buildDayZoneHours`, `sumZoneCentiHours`, `zoneRateCentiIsk`, `zonePayIsk`, `centiToNumber`
- `backend/src/payroll/payroll.service.ts` — `getPayrollForCycle()` + `getOverview()`, με κοινό ιδιωτικό `summarise()` ώστε οι δύο σελίδες να μη μπορούν να διαφωνήσουν· `requireHourlyRate()` (loud 500)
- `backend/src/payroll/payroll.controller.ts` — 3 routes, πλήρη Swagger decorators (200/400/401/403/404)
- `backend/src/payroll/payroll.module.ts` — imports `PrismaModule`, `SettingsModule`, `UsersModule`
- `backend/src/payroll/dto/payroll-response.dto.ts` (`DayZoneHoursDto`, `PayrollDayDto`, `PayrollZoneDto`, `PayrollResponseDto`) + `payroll-overview-response.dto.ts`
- `backend/src/payroll/rate-zones.util.spec.ts` (40 tests) + `payroll.service.spec.ts` (19 tests)
- `backend/src/users/users.service.ts` — **δύο νέοι narrow readers**: `findEmployeeRate()` και `findAllEmployeeRates()` (batch)
- **Στο `/review` άλλαξαν επίσης** (βλ. ενότητα review παρακάτω): `backend/src/time-entries/dto/time-entry-response.dto.ts` + `time-entries.service.ts` (αφαιρέθηκε το `hoursInCycle`), `backend/src/settings/cycle.util.ts` + `cycle.util.spec.ts` (διαγράφηκε το `hoursWithinCycle`), `backend/package.json` (`start:prod`)
- `backend/src/app.module.ts` — import `PayrollModule`
- `context/swifttrack-phase1-final.md` — §4 (**νέες αποφάσεις 5c/5d/5e** + αναθεώρηση της 6), §6 (νέο endpoint + σχήματα), **§7 ξαναγραμμένο** (πίνακας ζωνών, τα 3 σημεία στρογγυλοποίησης, worked example), §8 (σελίδες 4 & 6), §8a (4 νέες γραμμές UI copy), **νέα §13 — Deferred to a Later Phase**
- `context/architecture.md` — folder structure, § Data Flow (Payroll), **§ Payroll Calculation Pattern ξαναγραμμένο** (το παλιό δείγμα ήταν flat-rate), **9 νέα/αναθεωρημένα invariants**
- `context/build-plan.md` — §6 πλήρως ξαναγραμμένο, §8 (5 νέοι έλεγχοι), §8a, §8b, §10 (ανοιχτή απόφαση), §12 (ο mockup αντικαθίσταται), §13
- **Καμία αλλαγή στο domain model, κανένα migration** — οι συντελεστές είναι σταθερές στον κώδικα
Endpoints/Components:
- `GET /payroll/me?cycle=` (EMPLOYEE)
- `GET /payroll/:userId?cycle=` (ADMIN) — **ίδιο σχήμα**, επιβεβαιώθηκε byte-identical σε ζωντανό server
- `GET /payroll/overview?cycle=` (ADMIN) — όλη η ομάδα σε μία κλήση
Σημειώσεις:

### Το βήμα άλλαξε φύση πριν γραφτεί κώδικας

Το build-plan έλεγε «Stage A (flat rate), zones/OT later». Κατά το `/architect` ο χρήστης έδωσε τον **πραγματικό** υπολογισμό και δήλωσε ότι ο εγκεκριμένος `PayrollBreakdown` mockup ήταν **προσχέδιο**. Αποφασίστηκε να μπουν οι ζώνες **τώρα** και όχι «μελλοντικά», γιατί αλλάζουν το **σχήμα της απάντησης**, όχι μόνο τα νούμερα — και αν χτιζόταν το flat, τα Steps 12/13 θα χτίζονταν πάνω σε συμβόλαιο που ήδη ξέραμε λάθος, ακριβώς το σενάριο που το gate του 8b υπάρχει για να αποτρέψει.

Ο πίνακας του χρήστη αποδείχθηκε **πλήρης και χωρίς κενά**: Δευ–Παρ 00:00–08:00 (+45%) / 08:00–17:00 (βάση) / 17:00–24:00 (+33%), Σάβ+Κυρ όλο το 24ωρο (+45%). Κάθε ώρα της εβδομάδας ανήκει σε **ακριβώς μία** ζώνη — άρα το ερώτημα της στοίβαξης εξαφανίστηκε από μόνο του, και οι δύο ραφές (Παρ→Σάβ, Κυρ→Δευ) ορίστηκαν ρητά.

### Οι αποφάσεις που πάρθηκαν μέσω `/architect`, μία-μία

1. **`GET /payroll/overview` μπαίνει τώρα.** Χωρίς αυτό το Step 13 θα έκανε N κλήσεις και θα άθροιζε το κόστος **στον browser**, και το `hasOpenShift` τρίτου προσώπου ήταν **αδύνατο** (το `/time-entries/open` είναι EMPLOYEE-only). Το `architecture.md` το προϋπέθετε ήδη σε invariant χωρίς να έχει προδιαγραφεί ποτέ — ίδια οικογένεια με το `setupCode` του Step 2, το `?cycle=` του Step 4, το `userId` του Step 5.
2. **Αργίες: εκτός Phase 1, και ΔΕΝ καταγράφονται πουθενά** (ρητή εντολή του χρήστη). Θα τις προσθέσει ο ίδιος αργότερα ως προγραμματιστής.
3. **Οι συντελεστές είναι hardcoded σταθερές**, όχι `AppSettings`. Ο αποφασιστικός λόγος δεν ήταν το κόστος υλοποίησης αλλά η **αναδρομικότητα**: η μισθοδοσία υπολογίζεται on-the-fly, οπότε ένα πεδίο «Evening %» σε φόρμα θα ξαναέγραφε σιωπηλά κάθε περασμένο κύκλο. Ο χρήστης το έκλεισε καθαρά: *«εγώ δεν είμαι ο admin, είμαι ο προγραμματιστής»*.
4. **Τέσσερις ζώνες στην απάντηση**, παρότι NIGHT και WEEKEND μοιράζονται συντελεστή. Το frontend μπορεί πάντα να ενώσει δύο γραμμές, ποτέ να χωρίσει μία — και η pure function **υποχρεούται ούτως ή άλλως** να τις ξεχωρίζει για να υπολογίσει σωστά, οπότε η ένωση θα ήταν επιπλέον βήμα που πετάει πληροφορία. **Όρος υπό τον οποίο πάρθηκε**: το frontend κάνει render το `zones[]` ως λίστα, ποτέ hardcoded στήλες (μπήκε ως invariant).
5. **Γραμμή = ημέρα, όχι βάρδια.** Βγαίνει δωρεάν: οι ζώνες ορίζονται πάνω στο ημερολόγιο, άρα ο υπολογισμός κόβει ήδη στα μεσάνυχτα για να ξέρει αν είναι Σάββατο.
6. **`hasOpenShift`** — προτάθηκε από μένα και έγινε δεκτό: η ανοιχτή βάρδια δεν πληρώνεται, άρα **η μέρα λείπει ολόκληρη** από τον πίνακα και ο υπάλληλος βλέπει τρύπα χωρίς εξήγηση. **Διόρθωσα ταυτόχρονα και το Overview**: το είχα ορίσει «τώρα, ανεξαρτήτως κύκλου», έγινε **κύκλο-εξαρτώμενο και στα δύο** ώστε να σημαίνει παντού το ίδιο («εδώ λείπουν ώρες που δεν πληρώνονται») αντί για άσχετο συναγερμό σε κύκλο τριών μηνών πριν.

### Η στρογγυλοποίηση — η μεγαλύτερη συζήτηση, και πού κατέληξε

Ξεκίνησε από την παγίδα του mockup: `Math.round(hours × rate)` **ανά γραμμή** ενώ το σύνολο ήταν `Math.round(totalHours × rate)` — άρα `Σ round(...) ≠ round(Σ ...)` και η στήλη Pay δεν άθροιζε στο Total Pay. Ίδια οικογένεια με το splitting του Step 4.

Η πορεία της απόφασης, με τη σειρά που έγινε:
- Πρότεινα **καθόλου χρήματα ανά γραμμή** (ένα μόνο στρογγυλεμένο νούμερο σε όλο το σύστημα). Ο χρήστης επιβεβαίωσε αρχικά «μία στρογγυλοποίηση, τελικό βήμα».
- Ο χρήστης πρόσθεσε **2 δεκαδικά στις ώρες**, και κρίσιμα: *«ακόμα και πριν γίνει ο υπολογισμός του οποιουδήποτε πολλαπλασιασμού, θα γίνεται πρώτα η στρογγυλοποίηση»*. Δηλαδή το `8.74` είναι **η αλήθεια**, όχι μορφοποίηση.
- Μετά ζήτησε **στήλη Pay ανά ζώνη**, που αναγκαστικά ορίζει το `totalPay` ως **άθροισμα** των γραμμών (αλλιώς η απάντηση περιέχει νούμερα που διαφωνούν). Έδειξα με νούμερα ότι η διαφορά είναι έως **2 ISK**.
- Ζήτησε και **στήλη Rate**, στρογγυλεμένη. Εδώ έδειξα ότι αυτό είναι το **πιο ύπουλο** σημείο: με rate 3.259 αντί 3.258,50, η ίδια η γραμμή αυτοδιαψεύδεται κατά 3 ISK, και το σφάλμα είναι **0,5 ISK ανά ώρα με προσαύξηση** — δηλαδή μεγαλώνει με τις ώρες (~50 ISK/μήνα) και είναι **συστηματικό**, πάντα προς την ίδια κατεύθυνση για δεδομένο ωρομίσθιο.
- Ο χρήστης ρώτησε αν βοηθά να έχει το `hourlyRate` 2 δεκαδικά. **Ο μοχλός ήταν αντίστροφος**: 2.450,75 × 1,33 = 3.259,4975 — *τέσσερα* δεκαδικά. Η σωστή κίνηση ήταν το ανάποδο, και είναι **αριθμητικό γεγονός**: ακέραιος × 1,33 ή × 1,45 προσγειώνεται **πάντα ακριβώς σε εκατοστά**, ποτέ τρίτο δεκαδικό. Άρα το rate της ζώνης δεν χρειάζεται καμία στρογγυλοποίηση — είναι ήδη ακριβές.

**Τελικός κανόνας — τρία σημεία, κανένα άλλο:** (1) ώρες → 2 δεκαδικά **ανά κελί** (ημέρα × ζώνη), (2) rate ζώνης → **ποτέ**, (3) pay ζώνης → ακέραιο ISK. Ό,τι είναι πάνω από στρογγυλεμένη τιμή είναι **ακριβές άθροισμα** στρογγυλεμένων τιμών. Το σφάλμα έπεσε από ~50 ISK/μήνα συστηματικό σε **έως 2 ISK συνολικά**, ανεξαρτήτως ωρών. Και ο κανόνας του χρήστη «καμία δεκαδική κορώνα» παραμένει ακέραιος: το rate είναι ISK **ανά ώρα**, δεν πληρώνεται ποτέ σε κανέναν.

### Ακέραια εκατοστά, όχι floats

Όλη η αριθμητική γίνεται σε **centihours** και **centi-ISK**. Ο λόγος είναι συγκεκριμένος: `2450 * 1.33` σε IEEE doubles **δεν** είναι ακριβώς `3258.5`, και μισθός δεν επιτρέπεται να εξαρτάται από το προς τα πού πέφτει. Και η ίδια η στρογγυλοποίηση γίνεται με ακεραίους (`Math.floor((product + 5000) / 10000)`), όχι με `Math.round` πάνω σε float. Μετατροπή σε δεκαδικό μία φορά, στην έξοδο.

### Επαλήθευση (πραγματικά εκτελεσμένη)

**146 unit tests, όλα περνάνε** (`npm test`): 89 από πριν + **57 νέα** (38 στο `rate-zones.util.spec.ts`, 19 στο `payroll.service.spec.ts`). `npx tsc --noEmit` καθαρό, `npm run lint` καθαρό.

**Σε ζωντανό server + πραγματική DB** (probe employee με ωρομίσθιο 2.450, 6 βάρδιες = το worked example):
- `GET /payroll/me` χωρίς `?cycle=` → cycle `2026-07`, **42.62 h / 129.060 ISK** — ακριβώς ο συμφωνημένος πίνακας. Ζώνες: 18.87@2450→46.232, 5.25@3258.5→17.107, 6.00@3552.5→21.315, 12.50@3552.5→44.406. `Σ zones.pay === totalPay` ✅, `Σ days.totalHours === totalHours` ✅, 8 γραμμές ημερών.
- `GET /payroll/:userId` ως admin → **byte-identical** με το `/me`.
- `GET /payroll/overview` → `totalCost === Σ rows.totalPay` ✅, και η γραμμή του υπαλλήλου **ταυτίζεται** με τη δική του σελίδα (ώρες και ποσό).
- **Guards ανά route**: `/me` χωρίς token → 401, ως ADMIN → **403**· `/overview` ως EMPLOYEE → **403**, χωρίς token → 401· `/:userId` ως EMPLOYEE → **403**· `/payroll/1` (id του admin) → **404**· `/payroll/999999` → 404· `/payroll/abc` → 400.
- **`hasOpenShift` κύκλο-εξαρτώμενο**: μετά από clock-in, `2026-07` → `true` (και σε `/me` και σε `/overview`), **ίδια στιγμή** `2026-06` → `false`. Το `totalPay` έμεινε αμετάβλητο — η ανοιχτή βάρδια δεν πληρώνεται.
- **Splitting σε κύκλο ΚΑΙ ζώνη ταυτόχρονα**: βάρδια Παρ 24 Ιουλ 20:00 → Σάβ 25 Ιουλ 03:00 δίνει **4h EVENING στο 2026-06** (13.034 ISK) και **3h WEEKEND στο 2026-07** — άθροισμα 7h, και το κελί του Σαββάτου πήγε 6.50 → 9.50.
- **Ποιος εμφανίζεται στο Overview**: ενεργός με 0 ώρες → **εμφανίζεται** με 0· απενεργοποιημένος **με** ώρες στον κύκλο → **παραμένει** και μετράει στο `totalCost`· απενεργοποιημένος **χωρίς** ώρες → **φεύγει**· `/payroll/:userId` απενεργοποιημένου → δουλεύει κανονικά.

Test data καθαρίστηκαν — η DB επιβεβαιώθηκε με `psql` στην αρχική seed κατάσταση (1 admin, 0 `TimeEntry`, `AppSettings` 25/24).

⚠️ **Τι ΔΕΝ αποδείχθηκε, σκόπιμα:** με stubbed Prisma το mock επιστρέφει ό,τι του πεις, άρα το overlap query ελέγχεται μόνο ως **σχήμα** του `where` (`gt`/`lt`, ποτέ `gte`/`lte`). Ότι τα guards όντως *εκτελούνται* ανά route και ότι το SQL είναι σωστό ανήκουν στο **8b** — παρότι και τα δύο επαληθεύτηκαν εδώ χειροκίνητα, το 8b είναι αυτό που τα κάνει μόνιμα.

### `/review` στο τέλος του Step 6 — 7 ευρήματα, όλα διορθώθηκαν

0 Critical, 3 Important, 4 Minor. **Το ένα (Νο7) δεν το βρήκε το review** — προέκυψε κατά την επαλήθευση.

**1. 🟠 Το spec αντίφασκε με τον εαυτό του.** Το §7 είχε ξαναγραφτεί με ζώνες, αλλά το §11 («Development Order») και το §12 («Prompt-starter») έλεγαν ακόμα *flat rate*. Το §12 είναι το χειρότερο, γιατί είναι **εκτελέσιμη οδηγία**: υπάρχει για copy-paste σε καθαρό session και θα ξεκινούσε κάποιον με ρητή εντολή να χτίσει flat-rate μισθοδοσία. Διορθώθηκαν και τα δύο (μαζί με τη σειρά Settings/TimeEntries στο §12, που είχε μείνει πίσω από την ανταλλαγή των Steps 4/5).

**2. 🟠 `/time-entries` και `/payroll` έλεγαν διαφορετικές ώρες για την ίδια βάρδια** — και η λύση κατέληξε αλλού απ' όπου ξεκίνησε.

Το εύρημα: βάρδια 8h07m έδινε `8.116666666666667` στο `/time-entries` και `8.12` στο payroll. Αιτία: το `hoursWithinCycle()` γράφτηκε στο Step 4 για flat rate, όταν οι κλασματικές ώρες ήταν σωστές· το docstring του το έλεγε ακόμα ρητά (*«ISK rounding happens once, at the end»*), πρόταση που είχε πάψει να ισχύει στο Step 6.

Πρώτη διόρθωση: στρογγυλοποίηση 2 δεκαδικών και στα δύο, με **μία** κοινή υλοποίηση (`msToCentiHours` μετακινήθηκε στο `cycle.util.ts`). Έμενε όμως υπόλοιπο έως 0.01 h, επειδή το ένα στρογγυλοποιεί ανά **βάρδια** και το άλλο ανά **κελί**. Μετρήθηκε: διαφορά στο **25%** των βαρδιών που κόβονται στα δύο. Και βρέθηκε **δεύτερη** πηγή που δεν είχε φανεί: δύο βάρδιες την ίδια μέρα στην ίδια ζώνη διαφωνούσαν **χωρίς καμία ζώνη να κόβεται**.

**Ο χρήστης πρότεινε τη ρίζα αντί για το μπάλωμα: να μη δείχνει καθόλου ώρες το Shift History.** Και είχε δίκιο για λόγο που το επιβεβαίωνε γραπτώς: η **ίδια η δικαιολογία** του πεδίου στο build-plan §5 ήταν *«ώστε η στήλη Hours να αθροίζει σε αυτό που πληρώνεται»* — δικαιολογία που **πέθανε** μόλις η μισθοδοσία έγινε ζωνική, αφού μια βάρδια 12:00–20:15 δεν πληρώνεται με έναν συντελεστή. Το `hoursInCycle` δεν ήταν απλώς περιττό, ήταν **παραπλανητικό**: καλούσε τον υπάλληλο να πολλαπλασιάσει έναν αριθμό που δεν είναι ο μισθός του.

Αποτέλεσμα: το `hoursInCycle` αφαιρέθηκε από το `CycleTimeEntryDto`, το `hoursWithinCycle()` έμεινε χωρίς καλούντες και **διαγράφηκε** μαζί με τα 8 tests του (2 από αυτά μεταφέρθηκαν ως ισοδύναμα στο `rate-zones.util.spec.ts`), και τα πρωτογενή στρογγυλοποίησης **γύρισαν** στο `rate-zones.util.ts`. Το `isSplit` **μένει** και έγινε πιο σημαντικό: είναι πλέον το μόνο πράγμα που εξηγεί γιατί η ίδια βάρδια εμφανίζεται σε δύο κύκλους. Νέα απόφαση **5f** στο spec· καθαρό αποτέλεσμα **λιγότερος κώδικας** από πριν αρχίσει το review.

**3. 🟡 Κανένα payroll route δεν δήλωνε 400** ενώ και τα τρία το επιστρέφουν (άκυρο `?cycle=`, και `ParseIntPipe` στο `:userId` — το είχαμε δει ζωντανά ως 400 και δεν το είχαμε γράψει). Το αδελφό `time-entries` το δηλώνει ήδη. Έχει σημασία επειδή ο χειροκίνητος έλεγχος του **Step 8** γίνεται από το Swagger UI: ό,τι δεν είναι γραμμένο εκεί, δεν δοκιμάζεται.

**4. 🟡 `zoneDefinition` ήταν `export` με μόνο εσωτερικό καλούντα** → έγινε module-private. Ίδιο μοτίβο με το `findById()` του Step 2.

**5. 🟡 Η περιγραφή «Exact sum of the four cells» καλούσε το Step 12 σε παγίδα.** Αληθεύει για τους ακέραιους από πίσω, όχι για τους δεκαδικούς που στέλνονται: μετρήθηκε ότι **στο 36%** των γραμμών το άθροισμα σε JS διαφωνεί με το σύνολο του server (`1.99 + 22.35 + 2.92 = 27.259999999999998`). Ξαναγράφτηκε ως ρητή απαγόρευση, + κανόνας στο build-plan §12.

**6. 🟡 Ξεχασμένη ανοιχτή βάρδια απενεργοποιημένου δεν φαίνεται στον τρέχοντα κύκλο.** Καμία αλλαγή συμπεριφοράς — το κύκλο-εξαρτώμενο `hasOpenShift` είναι σωστό. Το λάθος ήταν **σχόλιο δικό μου** που υποσχόταν περισσότερα («this row is where they find out it exists»): ισχύει μόνο για τον κύκλο όπου ξεκίνησε η βάρδια. Διορθώθηκε το σχόλιο + καταγράφηκε ως γνωστό κενό στο spec §13.

**7. 🟠 `npm run start:prod` έδειχνε σε αρχείο που δεν υπάρχει.** `"node dist/main"` (default του Nest CLI) ενώ το πραγματικό entry είναι `dist/src/main.js`. Αιτία: το Step 1 πρόσθεσε `prisma.config.ts` και `prisma/seed.ts` **έξω** από το `src/`, το `tsconfig.build.json` δεν τα εξαιρεί, οπότε η κοινή ρίζα έγινε ο φάκελος `backend/` και **όλο το output κατέβηκε ένα επίπεδο**. Regression του Step 1 που έζησε 5 βήματα, επειδή η ανάπτυξη τρέχει με `start:dev` που βρίσκει μόνο του το entry point. Επιλέχθηκε η διόρθωση του script (μία λέξη) αντί για αλλαγή του tsconfig, ώστε να μην μπλεχτεί με το ήδη παρκαρισμένο πρόβλημα build/Prisma του Step 14. **Επαληθεύτηκε πραγματικά**: `npm run start:prod` σηκώνεται και εξυπηρετεί.

### ⚠️ Μάθημα μέτρησης — η πρώτη επαλήθευση του Νο2 έβγαλε ΛΑΘΟΣ αποτέλεσμα

Ο ζωντανός server επέστρεφε ακόμα `hoursInCycle` ενώ ο κώδικας και τα tests έλεγαν ότι είχε φύγει. **Δεν έφταιγε ο κώδικας:** το `npm run start:dev` είχε πεθάνει (ο watcher του Nest προσπάθησε να σκοτώσει ένα ανύπαρκτο process) αφήνοντας ορφανό παιδί που εξυπηρετούσε **παλιό κώδικα από τη μνήμη**. Αποδείχθηκε με χρονοσφραγίδες: το χτισμένο αρχείο είχε 0 εμφανίσεις του `hoursInCycle` και ημερομηνία 23:17:10, ενώ το process είχε ξεκινήσει 22:25:08 — 52 λεπτά νωρίτερα.

**Κανόνας για το 8b και για κάθε μελλοντική χειροκίνητη επαλήθευση: φρέσκο `npm run build` και καθαρό process πριν από κάθε μέτρηση, ποτέ μέτρηση πάνω σε server που τρέχει από πριν.** Είναι το δεύτερο λάθος μέτρησης του project — το πρώτο ήταν το race test του Step 5 που έγραφε παράλληλα στο ίδιο αρχείο.

### Κατάσταση μετά τις διορθώσεις

**143 unit tests** (ήταν 146· −8 του διαγραμμένου `hoursWithinCycle`, +2 ισοδύναμα στο `rate-zones.util.spec.ts`, +3 στο `time-entries.service.spec.ts` όπου ένα ελέγχει ρητά ότι **δεν** υπάρχει `hoursInCycle`). `npx tsc --noEmit` καθαρό, `npm run lint` καθαρό.

**Επαλήθευση σε φρέσκο build + πραγματική DB:** `/time-entries/me` επιστρέφει `endTime, id, isSplit, notes, startTime, userId` — **χωρίς** `hoursInCycle`· βάρδια που κόβεται στο όριο κύκλου σημαδεύεται `isSplit: true` **και στους δύο** κύκλους· `/payroll/me` δίνει 11.12 h → 33.075 ISK με `Σ zones.pay === totalPay`. Test data καθαρίστηκαν, DB πίσω σε seed κατάσταση (1 admin, 0 `TimeEntry`, 25/24).

### Ανοιχτά που δημιουργεί/κληροδοτεί αυτό το βήμα

- **Step 14**: το `start:prod` διορθώθηκε αλλά **πρέπει να δοκιμαστεί σε πραγματικό deploy** εκεί — μαζί με το ήδη παρκαρισμένο θέμα `postinstall`/`prisma generate`. Δύο ανεξάρτητα πράγματα που σπάνε στην ίδια στιγμή. Αν κάποτε θελήσουμε καθαρή διάταξη (`dist/main.js`), γίνεται εκεί με `"include": ["src/**/*"]` στο `tsconfig.build.json` — προσοχή ότι τότε τα `prisma.config.ts`/`seed.ts` παύουν να μεταγλωττίζονται στο `dist`.
- **Step 11**: ο `ShiftList` **χάνει τη στήλη Hours**. Αν χρειαστεί αριθμός εκεί, είναι **Duration** (`end − start`), ρητά ονομασμένη — ποτέ «Hours», που είναι λέξη μισθοδοσίας.
- **Step 10 — ανοιχτή απόφαση**: αν η σελίδα Clock κρατήσει το `MonthSummary` ή γίνει «μόνο το κουμπί». Γράφτηκε στο build-plan §10. Δεν επηρεάζει καθόλου το backend· το υπέρ του «μόνο κουμπί» είναι ότι η σελίδα γίνεται **ανεξάρτητη από το Payroll module**.
- **Step 12**: ο mockup αντικαθίσταται από δύο components· το `zones[]` γίνεται render **ως λίστα**· η ημερομηνία μορφοποιείται **σε UTC**· τα mock helpers (`hoursBetween`, `isWithinCycle`, `getMockCycle`) πεθαίνουν.
- **Νέα §13 στο spec — Deferred to a Later Phase**: 5 γνωστά κενά, με πρώτο ότι **η μισθοδοσία δεν παγώνει ποτέ** (αύξηση ωρομισθίου ξαναγράφει σιωπηλά κάθε περασμένο κύκλο). Η λύση —snapshot ανά κλεισμένο κύκλο— λύνει **και** την απόδοση αν ποτέ μεγαλώσει το headcount. Καταγράφηκε ρητά μετά από αίτημα του χρήστη, μαζί με audit log, approval flow, το check-then-act του overlap και το user enumeration.

**Επόμενο βήμα**: Step 7 — Swagger sweep. Στην πράξη τα decorators γράφονται μέσα σε κάθε βήμα από το Step 2, άρα το 7 είναι έλεγχος πληρότητας (λείπουν 400/404/409 σε παλιότερα modules — βλ. σημείωση Step 2) και όχι νέα δουλειά. *(Ολοκληρώθηκε — βλ. την επόμενη ενότητα.)*

## Step 7 — Swagger sweep
Status: ✅ Done
Ημερομηνία: 2026-08-07
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/users/users.controller.ts` — class-level 401· 403 στα 4 admin routes· 400/409 στο `POST`· 400/404 σε `PUT`/`DELETE`· πλούσια `@ApiOperation` descriptions
- `backend/src/auth/auth.controller.ts` — 400 και στα δύο routes· εμπλουτισμένες περιγραφές 200/401
- `backend/src/settings/settings.controller.ts`, `time-entries.controller.ts`, `payroll.controller.ts` — 13 method-level 401 → 3 class-level· 400 στο `DELETE /time-entries/:id`· περιγραφή στο `DELETE` για το ότι **δεν** μπλοκάρεται από ανοιχτή βάρδια
- `backend/src/main.ts` — `swaggerOptions: { persistAuthorization: true }`
- `context/architecture.md` — **2 νέα invariants** (class-level 401 / 403 ανά route· «τεκμηριώνεται μόνο ό,τι όντως επιστρέφεται, ποτέ 500»)
- `context/build-plan.md` — §7 ξαναγραμμένο
- **Καμία αλλαγή σε endpoint, DTO, service ή domain model. Κανένα migration.** Το βήμα είναι doc-only εξ ορισμού (απόφαση Α)
Endpoints/Components: κανένα νέο — **18 status codes προστέθηκαν σε 20 υπάρχοντα operations, 0 αφαιρέθηκαν**
Σημειώσεις:

### Οι 4 αποφάσεις που πάρθηκαν μέσω `/architect` πριν τον κώδικα

**Α. Τεκμηριώνω, δεν αλλάζω.** Κάθε απόκλιση doc↔συμπεριφορά καταγράφεται αντί να «διορθωθεί» — 5 επαληθευμένα βήματα και 143 tests στηρίζονται στην τρέχουσα συμπεριφορά. *(Στην πράξη δεν βρέθηκε καμία απόκλιση.)*

**Β. 401 class-level ανά controller· 403/400/404/409 method-level.** Το `@ApiResponse` είναι `MethodDecorator & ClassDecorator` στο 11.4.6 και ο explorer κάνει `{...class, ...method}` — native, χωρίς `applyDecorators` και χωρίς νέο αρχείο. Το **401 είναι ομοιόμορφο** (κάθε route των 4 controllers θέλει token)· το **403 δεν είναι**: 5 routes δεν μπορούν να το βγάλουν καθόλου, και είναι **δύο διαφορετικές κατηγορίες** — τα *both-roles* (`GET /users/me`, `GET /settings`, χωρίς περιορισμό ρόλου) και τα *owner-or-ADMIN* (`POST`/`PUT`/`DELETE /time-entries`, όπου η ιδιοκτησία κρίνεται στο service και η ξένη γραμμή δίνει **404, ποτέ 403**). Class-level 403 θα ήταν ψέμα και στις δύο. Ο `AuthController` εξαιρείται: τα routes του είναι unauthenticated και το 401 του σημαίνει «λάθος credentials».

Απορρίφθηκε ρητά το **επίσημο `@Auth()` recipe των NestJS docs** (`applyDecorators(SetMetadata('roles'), UseGuards(...), ApiBearerAuth(), ApiUnauthorizedResponse())`): κρύβει το guard wiring ανά route, ενώ το **§8b υπάρχει ακριβώς για να αποδείξει ότι τα guards εκτελούνται ανά route**. Επιπλέον θα ήταν αλλαγή συμπεριφοράς (guards), όχι τεκμηρίωσης — δηλαδή θα παραβίαζε την απόφαση Α.

**Γ. Οι περιγραφές γράφονται στην κρίση του agent, χωρίς υποχρέωση στο §8a** (απόφαση του χρήστη). Τα runtime strings και το invariant του §8a **δεν** αγγίχτηκαν. ⚠️ Ο χρήστης ζήτησε αρχικά να **αφαιρεθεί** το invariant «§8a ακολουθείται πιστά» και να ξαναγραφτούν τα μηνύματα· αφού του παρουσιάστηκαν τα νούμερα (**14 test assertions**, 18 σημεία στον κώδικα, 30 αναφορές στα context files, 32 γραμμές `frontend/src/lib/messages.ts` από το Step 0) επέλεξε **«τώρα μόνο τα docs»**. Βλ. «Παρκαρισμένο» παρακάτω.

**Δ. Κανένα 500 στο Swagger.** ⚠️ **Αυτή η απόφαση ΑΝΤΙΣΤΡΑΦΗΚΕ μέσα στη συζήτηση — βλ. ξεχωριστή ενότητα παρακάτω.**

### ⚠️ Η απόφαση Δ ήταν λάθος μου και ο χρήστης το έπιασε

Είχα προτείνει να δηλωθεί το `500 «Settings not initialised. Run npx prisma db seed.»` σε 7 routes, με σκεπτικό ότι ο ελεγκτής του Step 8 δουλεύει από το Swagger UI και ένα αδήλωτο σκόπιμο 500 μοιάζει με bug. Ο χρήστης ρώτησε **«δεν υπάρχει κάποιος άλλος τρόπος να καθοδηγήσουμε τον χρήστη;»** και **«πόσο συχνό είναι όντως να τεκμηριώνεται 500;»**. Και τα δύο σκόνταψαν σε πραγματικό λάθος:

1. **Είχα μπερδέψει δύο κοινά.** Ο καταναλωτής του API (frontend, Steps 9-13) δεν χρειάζεται ποτέ αυτή την πληροφορία· ο άνθρωπος που στήνει τη χρειάζεται, αλλά **όχι από το συμβόλαιο του API**. Τεκμηρίωνα **ops προϋπόθεση** σε λάθος αρχείο. Και το ίδιο το μήνυμα **ονομάζει ήδη τη διόρθωση**, τη στιγμή ακριβώς που χρειάζεται.
2. **Η πρακτική του κλάδου λέει το αντίθετο απ' ό,τι πρότεινα:** τεκμηριώνονται 2xx, τα client-actionable 4xx, και **το πολύ ένα γενικό** server error (`default`/`5XX`) — ποτέ απαρίθμηση συγκεκριμένων σεναρίων 500.
3. **Ανακαλύφθηκε native λύση που δεν είχα δει:** ο `DocumentBuilder` του 11.4.6 έχει **`addGlobalResponse()`** (και υπάρχει `GlobalResponsesStorage` στον explorer). Αν ποτέ θελήσουμε γενικό 500, **αυτό** είναι το εργαλείο — μία δήλωση στο `main.ts`, όχι ανά route. Δεν μπήκε: σε 20 routes θα πρόσθετε μια γραμμή «κάτι μπορεί να πάει στραβά» χωρίς πληροφορία.

**Τελικό: κανένα 500 πουθενά.** Το «τρέξε το seed» ανήκει στο README του Step 14. Μάθημα: *το Swagger είναι το συμβόλαιο του API, όχι εγχειρίδιο εγκατάστασης.*

### Το εργαλείο που φτιάχτηκε — και γιατί έχει αξία πέρα από αυτό το βήμα

Το αρχικό σχέδιο ήταν «σήκωσε server, `curl /api-json`». Ο server **δεν σήκωνε** μέσα στο sandbox (ο process ζούσε αλλά δεν άκουγε ποτέ στο 3000, με άδειο stdout). Αντί να επιμείνω, άλλαξα διαδρομή: το `SwaggerModule.createDocument()` **δεν χρειάζεται `app.listen()`**. Γράφτηκε script (στο scratchpad, εκτός repo) που φορτώνει το compiled `dist/src/app.module` μέσω `createRequire` και γράφει το OpenAPI σε JSON — σύμφωνο με το μάθημα του Step 4 (*«για Nest DI: ούτε tsx ούτε ts-node — jest ή compiled dist/»*).

Αυτό είναι που έκανε το βήμα **αποδείξιμο**: baseline πριν, final μετά, μηχανικό diff. Χωρίς αυτό η δήλωση «το refactor δεν έχασε τίποτα» θα ήταν ισχυρισμός.

### Επαλήθευση (πραγματικά εκτελεσμένη)

**Το spike πρώτα, πριν γραφτεί οτιδήποτε άλλο.** Αφαιρέθηκαν τα 2 method-level 401 του `settings` και μπήκε 1 class-level· φρέσκο build· ξανα-παραγωγή· **πλήρες diff του OpenAPI → byte για byte πανομοιότυπο**. Μόνο τότε εφαρμόστηκε το ίδιο στους υπόλοιπους. Είχα διαβάσει τον πηγαίο κώδικα του `@nestjs/swagger` και **δεν τον είχα τρέξει** — το spike υπήρχε ακριβώς γι' αυτό.

**Μηχανικό diff baseline → final: `αφαιρέθηκαν=0, προστέθηκαν=18`.** Οι γραμμές των `settings`/`time-entries`/`payroll` **δεν άλλαξαν καθόλου** — αυτό αποδεικνύει ότι η μετακίνηση των 13 401 σε class-level δεν έχασε τίποτα. Σύγκριση και σε επίπεδο **περιγραφών**: `removed=0, changed=4`, και οι 4 σκόπιμες βελτιώσεις.

**Σε ζωντανό server + πραγματικό HTTP** (φρέσκο build, καθαρό process — το μάθημα του Step 6):
- σερβιρισμένο `/api-json` **ταυτόσημο** με το παραγόμενο `final.json`
- `"persistAuthorization": true` επιβεβαιωμένο στο `/api/swagger-ui-init.js` (όχι στο HTML — εκεί δεν ζει)
- `GET /users`, `GET /users/me`, `DELETE /users/1` χωρίς token → **401**· `DELETE /time-entries/abc` χωρίς token → **401** (το guard προηγείται του `ParseIntPipe`)
- `POST /auth/login` άδειο body → **400**· με άγνωστη ιδιότητα (whitelist) → **400**· άγνωστο email με έγκυρο σχήμα → **401** με `"Invalid email or password."`
- `POST /auth/set-initial-password` με 3ψήφιο code → **400**· άγνωστο email με 4ψήφιο → **404**

**143 unit tests** (ίδιος αριθμός με το Step 6 — κανένα test δεν αγγίζει Swagger, άρα οποιαδήποτε αλλαγή θα ήταν κόκκινη σημαία). `npx tsc --noEmit` καθαρό, `npm run lint` καθαρό. Η DB δεν πειράχτηκε καθόλου (δεν γράφτηκε ούτε μία γραμμή — όλα τα probes ήταν αποτυχίες auth/validation).

⚠️ **Δεύτερο μάθημα μέτρησης του project, από εμένα ξανά:** η πρώτη παρτίδα probes έδειξε `login άγνωστο email → 400` αντί για 401 και το ανέφερα ως τέτοιο. Ήταν **σφάλμα του probe**: είχα κάνει over-escape (`\"`) μέσα σε bash single quotes, οπότε έστελνα άκυρο JSON. Ο κώδικας ήταν σωστός. Είναι το τρίτο λάθος μέτρησης στο project (Step 5: παράλληλη εγγραφή στο ίδιο αρχείο· Step 6: stale process) και **και τα τρία ήταν του harness, ποτέ του κώδικα** — αξίζει να είναι η πρώτη υποψία στο 8b.

### Τι βρέθηκε διαβάζοντας τα services

- **`GET /users/me` μπορεί να πετάξει 404** στο `findUserByIdOrThrow`, αλλά είναι **απρόσιτο**: το `JwtStrategy` έχει ήδη απαντήσει 401 αν ο χρήστης λείπει, και το `DELETE` είναι soft (invariant — καμία γραμμή δεν σβήνεται ποτέ). **Δεν δηλώθηκε.**
- **`POST /auth/login` δεν βγάζει ποτέ 404** — άγνωστο email → 401 `"Invalid email or password."`. Σκόπιμο· σε αντίθεση με το `set-initial-password`, όπου το user enumeration έχει γίνει δεκτό ρητά (Step 3).
- Επαληθεύτηκαν πριν γραφτούν στις περιγραφές: `@MinLength(8)` στο `newPassword`, `@Matches(/^\d{4}$/)` στο `setupCode`, και ότι το `remove()` **δεν** έχει open-shift block (το ίδιο το service έχει σχόλιο που το λέει).

### `/review` στο τέλος του Step 7 — 4 ευρήματα, όλα διορθώθηκαν

0 Critical, 2 Important, 2 Minor. **Τα δύο Important ήταν λάθη στην ίδια την τεκμηρίωση** — δηλαδή στο παραδοτέο του βήματος.

**1. 🟠 Λάθος στο invariant που είχα μόλις γράψει στο `architecture.md`.** Είχα γράψει *«the **owner-or-ADMIN routes** (`POST`/`PUT`/`DELETE /time-entries`, `GET /users/me`, `GET /settings`)»* — αλλά τα `GET /users/me` και `GET /settings` **δεν** είναι owner-or-ADMIN, είναι απλώς *both-roles*. Το `owner-or-ADMIN` είναι συγκεκριμένο μοτίβο με **δικό του invariant** στο ίδιο αρχείο (ιδιοκτησία στο service, ξένη γραμμή → **404 ποτέ 403**). Το συμπέρασμα («δεν βγάζουν 403») ήταν σωστό· ο χαρακτηρισμός λάθος. Επικίνδυνο επειδή το `architecture.md` είναι το αρχείο που μια επόμενη session εμπιστεύεται **χωρίς έλεγχο** — θα απέδιδε στο `GET /settings` σημασιολογία ιδιοκτησίας που δεν έχει. Ξαναγράφτηκε ως **δύο ρητά διακριτές κατηγορίες**, με παραπομπή στο υπάρχον invariant. Διορθώθηκε και η αντίστοιχη (αμφίσημη) πρόταση εδώ στον tracker.

**2. 🟠 17 από τα 20 success responses είχαν ΚΕΝΗ `description`.** Το OpenAPI spec ορίζει το `description` του Response Object ως **REQUIRED**· το κενό string περνάει τον τύπο αλλά το Swagger UI αποδίδει **άδειο κελί** — και είναι η γραμμή **200/201**, αυτή που κοιτάζει πρώτη ο ελεγκτής. Προϋπήρχε, αλλά αυτό ήταν το βήμα που υπήρχε για να το πιάσει και το είχε πάει μόλις **18 → 17**. Συμπληρώθηκαν και τα 17, με πληροφορία που δεν βγαίνει από το schema (π.χ. ότι το `/time-entries/open` επιστρέφει **πάντα** αντικείμενο· ότι το `PUT /time-entries/:id` είναι full replacement και το κενό `notes` **σβήνει**· ότι το `zones[]` γίνεται render ως λίστα). **Τώρα: 0 κενές.**

**3. 🟡 Το επεξηγηματικό σχόλιο 5 γραμμών ήταν αυτούσιο σε 4 controllers** — δηλαδή αφαίρεσα 13 γραμμές `@ApiResponse` και πρόσθεσα 20 γραμμές σχολίου, σε αλλαγή που υπήρχε για να αφαιρέσει επανάληψη. Έγινε **μία γραμμή** που παραπέμπει στο invariant (20 → 4).

**4. 🟡 Τα νέα codes του `users` δεν είχαν δοκιμαστεί ζωντανά σε αυτό το βήμα** (μόνο διάβασμα service + εγγραφές Steps 2/3). **Δοκιμάστηκαν τώρα, end-to-end σε πραγματική DB:** `POST /users` 201 → διπλό email **409** → `password` στο body **400** → `PUT`/`DELETE` στο id του admin **404/404** → `PUT /users/abc` **400**· μετά ενεργοποίηση του probe employee, login, και τα **4 × 403** με employee token (`GET`/`POST`/`PUT`/`DELETE`), ενώ το `GET /users/me` έδωσε **200** (both-roles, σωστά χωρίς 403). Ο admin επιβεβαιώθηκε ανέπαφος. **Test data καθαρίστηκαν** — DB πίσω σε seed κατάσταση (1 admin, 0 `TimeEntry`, `AppSettings` 25/24, επιβεβαιωμένο με `psql`).

**Μετά τις διορθώσεις:** `tsc --noEmit` καθαρό, lint καθαρό, **143/143 tests**, **0 κενές descriptions**, και τα status codes **αμετάβλητα** σε σχέση με πριν το review (diff καθαρό — μόνο κείμενο άλλαξε).

### ⚠️ Τρίτο λάθος μέτρησης του project — και το `TaskStop` δεν σκοτώνει τον server

Ο πρώτος γύρος των probes έτρεξε σε **stale process**: το `TaskStop` ανέφερε επιτυχία αλλά ο παλιός server κρατούσε ακόμα το port 3000, οπότε ο νέος έσκασε με `EADDRINUSE` και τα probes χτύπησαν το **προηγούμενο build**. Τα αποτελέσματα τύχαινε να ισχύουν (μηδέν αλλαγές συμπεριφοράς σε όλο το βήμα), αλλά η μέθοδος ήταν λάθος και ξανατρέχτηκαν όλα σε φρέσκο process.

**Κανόνας για το 8b:** τερματισμός **μέσω port** (`Get-NetTCPConnection -LocalPort 3000 | Stop-Process`), όχι μέσω task manager του harness· και **απόδειξη** ότι ο server σερβίρει τον τρέχοντα κώδικα πριν από κάθε μέτρηση — εδώ έγινε ζητώντας από το `/api-json` μια περιγραφή που υπήρχε μόνο στο νέο build. Είναι το **τρίτο** λάθος μέτρησης του project (Step 5: παράλληλη εγγραφή στο ίδιο αρχείο· Step 6: stale process· εδώ: stale process ξανά) και **και τα τρία ήταν του harness, ποτέ του κώδικα**.

### Ανοιχτά / παρκαρισμένα που κληροδοτεί αυτό το βήμα

- **✅ ΛΥΘΗΚΕ στις 2026-08-11 — βλ. την ενότητα «Η χαλάρωση του §8a» αμέσως μετά το Step 7. Το κείμενο που ακολουθεί μένει ως ιστορικό.** ⏸️ *Παρκαρισμένο (ήταν):* Ο χρήστης θέλει τα μηνύματα σφάλματος να πάψουν να είναι δεσμευτικά (βάσιμο: το Step 3 αποφάσισε ότι *«το frontend θα χαρτογραφεί ούτως ή άλλως status codes σε δικά του μηνύματα»*, άρα ο χρήστης δεν βλέπει ποτέ το backend string). Επέλεξε να **μη** γίνει τώρα. Όταν γίνει, αγγίζει: 14 test assertions, 18 σημεία στον κώδικα, build-plan §5/§8/§8a, και το invariant του architecture.md. **Πρόταση: να χαλαρώσει μόνο το μισό των μηνυμάτων· το UI copy (titles/buttons/badges/`zones[].label`) είναι το μοναδικό συμβόλαιο copy των Steps 9-13 που δεν έχουν χτιστεί.**
- **Step 8**: το `persistAuthorization` σημαίνει ότι το token επιβιώνει refresh. Ο κατάλογος σφαλμάτων είναι πλήρης — **ό,τι είναι δηλωμένο, δοκιμάζεται**· ειδικά τα 5 νέα του `users` (409 σε duplicate email, 404 σε admin id στα `PUT`/`DELETE`, 400 στο `password` του `POST`) δεν είχαν ποτέ ορατότητα στο UI.
- **Step 14**: το «Settings not initialised → τρέξε `npx prisma db seed`» **πρέπει να μπει στο README** — αυτή είναι η απόφαση που πάρθηκε αντί για δήλωση 500. Μαζί με τα ήδη παρκαρισμένα `postinstall`/`prisma generate` και `start:prod`.
- **Νέα σύμβαση, να μη σπάσει από εδώ και πέρα:** κάθε `@ApiResponse` — success ή error — έχει μη-κενή `description`. Το OpenAPI το ορίζει REQUIRED και το Swagger UI αποδίδει άδειο κελί χωρίς αυτή. Ήταν 18 κενές πριν το Step 7· τώρα **0**.

## Η χαλάρωση του §8a — έγινε (2026-08-11, ανάμεσα στα Steps 7 και 8)
Status: ✅ Done · **doc-only, 0 γραμμές κώδικα, 0 tests άλλαξαν**

Δεν είναι βήμα του build-plan — είναι η εκκρεμότητα που το Step 7 είχε παρκάρει ρητά. Έγινε **πριν** το 8a/8b επειδή το 8b γράφει ~20-25 tests πάνω σε αυτά ακριβώς τα strings: αν χαλάρωναν μετά, θα ξαναγράφονταν.

**Η απόφαση, σε μία πρόταση:** το §8a κόπηκε στα δύο — το **UI copy μένει δεσμευτικό**, τα **error messages όχι**.

Ο χρήστης ζήτησε αρχικά να χαλαρώσει το §8a συνολικά, κρατώντας τα υπάρχοντα strings ως έχουν. Παρουσιάστηκε η διάκριση των δύο μισών και επιλέχθηκε το ασύμμετρο.

**Γιατί χαλαρώνουν τα μηνύματα:** κανένας χρήστης δεν διαβάζει ποτέ backend string. Το `api/client.ts` χαρτογραφεί status codes σε δικά του κείμενα (απόφαση Step 3) και τα μηνύματα του `ValidationPipe` δεν εμφανίζονται ποτέ. Ένας πίνακας που δεσμεύει κείμενο το οποίο κανείς δεν βλέπει, παρακαμπτόταν ήδη σιωπηλά — 9 strings είχαν γραφτεί inline χωρίς ποτέ να μπουν στο §8a.

**Γιατί ΔΕΝ χαλαρώνει το UI copy** (η διάκριση που πρόσθεσα, και ο χρήστης δέχτηκε): έχει τεχνική συνέπεια, όχι αισθητική.
- Τα `zones[].label` (`Day` / `Evening +33%` / `Night +45%` / `Weekend +45%`) τα παράγει ο **backend** ([rate-zones.util.ts:55-60](backend/src/payroll/rate-zones.util.ts#L55-L60)) δίπλα στο `rateFactorHundredths` και το frontend τα τυπώνει αυτούσια. Label που ξεκολλάει από τον συντελεστή του = σελίδα που λέει λάθος μισθό.
- Οι επικεφαλίδες στηλών του Payroll (`Zone/Hours/Rate/Total Pay`, `Date/Day/Evening/Night/Weekend/Total`) υπάρχουν **μόνο στο spec** — είναι το μοναδικό συμβόλαιο κειμένου που έχουν οι σελίδες των Steps 12-13, που δεν έχουν χτιστεί.
- Τα υπόλοιπα (7 titles + 5 labels) είναι ήδη γραμμένα στο [messages.ts](frontend/src/lib/messages.ts) από το Step 0 — μηδενικό κόστος να μείνουν δεσμευτικά.

**Τι παραμένει δεσμευτικό στα μηνύματα: η συμπεριφορά, όχι η διατύπωση.** Η σειρά των ελέγχων σε `login()`/`setInitialPassword()`, το status code ανά περίπτωση, και ότι το login **ξεχωρίζει** το «μη ενεργοποιημένος» από το «απενεργοποιημένος» από το «λάθος password» αντί για ένα γενικό μήνυμα. Αυτό είναι security property — το `set-initial-password` έχει ήδη βρεθεί λάθος μία φορά εκεί (λείπων `isActive`, Step 3).

Αρχεία που άλλαξαν:
- `context/swifttrack-phase1-final.md` §8a — ο τίτλος έπαψε να λέει «binding»· προστέθηκε intro με τα δύο μισά· οι 3 υπο-ενότητες σημάνθηκαν `— binding` / `— not binding`· η κλείνουσα σημείωση ξαναγράφτηκε από «source of truth for exact wording» σε «περιγράφει, δεν ορίζει»
- `context/architecture.md` § Invariants — τα δύο `login` invariants ξαναγράφτηκαν ώστε να δεσμεύουν τη **διακρισιμότητα** των περιπτώσεων αντί για το literal string· το invariant του §8a έγινε δύο ρητά bullets (UI copy verbatim / messages ελεύθερα)
- `context/build-plan.md` — 6 σημεία: §5 (test bullet + clock copy), §8 (checklist), §8a (assertions AuthService), §8b (scope), και ο κανόνας 5 του «Rule for every step»
- **Κανένα αρχείο κώδικα, κανένα spec file, καμία migration**

⚠️ **Συνέπεια για το 8a/8b — διευκρινίστηκε από τον χρήστη στις 2026-08-11, αφού είχα αρχικά γράψει το αντίθετο:** τα ~31 σημεία των spec files που αναφέρουν αυτά τα strings **δεν πειράχτηκαν**, και τα **νέα** tests ελέγχουν επίσης **αυτούσια** τα μηνύματα, όπως όλα τα υπόλοιπα. Είχα συμπεράνει λανθασμένα ότι η χαλάρωση σημαίνει «μη ελέγχεις literal strings». Ο χρήστης το διόρθωσε: η χαλάρωση αφορά **μόνο** το ότι τα context files παύουν να είναι η αυθεντία που πρέπει να ακολουθεί ο κώδικας — τα tests παραμένουν το δίχτυ. Αλλαγή μηνύματος = συνειδητή αλλαγή που κοκκινίζει test, όχι σιωπηλή μετατόπιση.

**Επόμενο βήμα** *(όπως φαινόταν τότε)*: Step 8. **Στην πράξη προηγήθηκε το 8b** — βλ. την επόμενη ενότητα.

## Step 8b — Full-stack tests (πραγματική DB)
Status: ✅ Done
Ημερομηνία: 2026-08-11
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/test/setup-e2e.ts` — jest `setupFiles`· φορτώνει `.env.test` πριν φορτωθεί το module graph
- `backend/test/global-setup.ts` — `prisma migrate deploy` + `prisma db seed` στην test βάση, μία φορά πριν τη σουίτα
- `backend/test/helpers/env.ts` — `loadTestEnv()` + **`assertTestDatabase()`** (ο φύλακας· βλ. παρακάτω)
- `backend/test/helpers/app.ts` — bootstrap του πραγματικού `AppModule` + **ρητός** global `ValidationPipe` και CORS· flag `throttling`
- `backend/test/helpers/db.ts` — `resetDatabase()`: σβήνει `TimeEntry` + `EMPLOYEE`, **κρατάει τον seeded admin**, επαναφέρει `AppSettings` σε 25/24
- `backend/test/helpers/fixtures.ts` — `loginAsAdmin`, `createPendingEmployee`, `createActivatedEmployee`, `addShift`, `uniqueEmail`
- `backend/test/helpers/types.ts` — τα response shapes, **χειρόγραφα και όχι import από τα `src/**/dto`**: test που ξαναχρησιμοποιεί το production DTO δεν μπορεί να δει μετονομασία πεδίου, γιατί κινούνται μαζί
- **7 spec files**: `auth` (harness proof), `users`, `activation`, `time-entries`, `payroll`, `settings`, `throttling`
- `backend/test/jest-e2e.json` — ξαναγράφτηκε (βλ. τα δύο ευρήματα)
- `backend/package.json` — μόνο το `test:e2e` script
- `backend/.env.test.example` (committed) + `backend/.env.test` (gitignored)· `.gitignore` — νέα γραμμή `.env.test`
- `context/build-plan.md` — §8b (αλλαγή σειράς, δύο περάσματα, 4 νέα ⚠️ bullets) + **διόρθωση λάθους ισχυρισμού** στο σημείο 2
- **ΚΑΝΕΝΑ αρχείο στο `src/`. Κανένα migration. Καμία αλλαγή συμπεριφοράς.** Το `git status` το επιβεβαιώνει
Endpoints/Components: κανένα νέο — **70 e2e tests σε 7 suites**
Σημειώσεις:

### Γιατί έτρεξε ΠΡΙΝ τα Steps 8 και 8a (απόφαση του χρήστη)

Ο δεσμός «το 8b γράφεται από τη λίστα του 8» διαβάζεται ισχυρότερος απ' ό,τι είναι: η λίστα είναι **γραμμένη** στο §8, δεν χρειάζεται να έχει **εκτελεστεί**. Το να περάσεις 25 ελέγχους στο χέρι και μετά να κωδικοποιήσεις τους ίδιους 25 είναι η ίδια δουλειά δύο φορές, με το χειροκίνητο μισό να λήγει. Το 8b είναι επίσης το gate του frontend, άρα κουβαλάει το μεγαλύτερο ρίσκο. Το §8 συρρικνώνεται σε ό,τι λέει η δική του τελευταία πρόταση: άνθρωπος στο Swagger UI, που δοκιμάζει ό,τι δεν σκέφτηκε κανείς να γράψει σε λίστα.

### Δύο περάσματα, και γιατί δεν ήταν υπερβολή

**8b-1** έχτισε το harness και το απέδειξε με 4 smoke tests (πραγματικό login, `JwtAuthGuard`, `RolesGuard`, `ValidationPipe`). **8b-2** πρόσθεσε τα υπόλοιπα 66. Το σκεπτικό: το project έχει **τρία** καταγεγραμμένα λάθη μέτρησης (Steps 5, 6, 7) και **και τα τρία ήταν του harness, ποτέ του κώδικα**. Με 25 tests πάνω σε ολοκαίνουργιο harness, ένα κόκκινο θα ήταν διφορούμενο.

Δικαιώθηκε αμέσως: το πρώτο τρέξιμο απέτυχε σε **πραγματικό** πρόβλημα υποδομής (παρακάτω), όχι σε λάθος test.

### Τα δύο ευρήματα του harness — και τα δύο θα χτυπούσαν οποιονδήποτε

1. **Ο Prisma 7 δεν τρέχει μέσα σε jest χωρίς `--experimental-vm-modules`.** Ο client engine φορτώνει τον WASM query compiler με dynamic `import()`, που το CJS runtime του jest αρνείται (*«A dynamic import callback was invoked without --experimental-vm-modules»*). **Δεν είχε φανεί ποτέ σε 143 unit tests επειδή όλα κάνουν stub τον Prisma** — το 8b είναι η πρώτη φορά που τρέχει αληθινός `PrismaClient` υπό jest. Λύση χωρίς νέα εξάρτηση: `node --experimental-vm-modules node_modules/jest/bin/jest.js …` στο script (portable· το `NODE_OPTIONS=` inline δεν είναι, θα ήθελε `cross-env`).
2. **Το `jest-e2e.json` scaffold δεν είχε `moduleNameMapper`.** Ίδιο ακριβώς πρόβλημα που έλυσε το Step 4 για τα unit tests — ο resolver του jest δεν λύνει τα explicit `.js` specifiers του Prisma 7. Χωρίς αυτό **κανένα** spec που αγγίζει `PrismaService` δεν τρέχει.

### Ο φύλακας που δεν ήταν στο αρχικό πλάνο

Η ασφάλεια της dev βάσης στηρίζεται σε **σειρά φόρτωσης**: το `setup-e2e.ts` γράφει το `.env.test` στο `process.env` πριν το `AppModule` καλέσει `ConfigModule.forRoot()`, και το dotenv **δεν** αντικαθιστά υπάρχον key — άρα κερδίζει το `.env.test`. Αυτό είναι λεπτό και ανώνυμο: αν σπάσει (μετονομασία αρχείου, αναδιάταξη config), η σουίτα δείχνει στη **dev** βάση, την κάνει truncate, και **όλα τα tests περνάνε κανονικά**. Καμία ένδειξη.

Γι' αυτό μπήκε `assertTestDatabase()`: αρνείται κάθε `DATABASE_URL` του οποίου το **όνομα βάσης** δεν τελειώνει σε `_test`, πριν από το πρώτο query, και στα δύο σημεία εισόδου. Συγκρίνει μόνο το `pathname` — password που περιέχει `_test` δεν το ξεγελάει.

### Η απόφαση για το rate limiting

5 requests/60s ανά IP σε `login` και `set-initial-password`, και **όλη η σουίτα έρχεται από μία IP**. Με 20+ tests που χρειάζονται token, θα μαζεύαμε 429 σε tests που ελέγχουν κάτι εντελώς άλλο — ακριβώς το ψεύτικο κόκκινο που το 8b-1 υπήρξε για να αποκλείσει.

Λύση: το `createTestApp()` κάνει **override τον `ThrottlerGuard` by default**, και **ένα** `throttling.e2e-spec.ts` τον αφήνει ενεργό. Ελέγχεται μία φορά, σκόπιμα, αντί για είκοσι φορές τυχαία. Κάθε spec παίρνει δικό του app instance, άρα δική του in-memory throttler storage — δεν μολύνονται μεταξύ τους.

### Δύο spikes — τα tests αποδείχθηκαν μη κενά

Η πειθαρχία του Step 7: test που περνάει πάντα δεν φυλάει τίποτα.

1. **Αφαιρέθηκε ο `ValidationPipe`** από το `helpers/app.ts` → κοκκίνισε **ακριβώς ένα** test, το σχετικό· τα άλλα τρία έμειναν πράσινα. Επαναφέρθηκε.
2. **Μπήκε `gte` αντί για `gt`** στο overlap query του `assertNoOverlap` → κοκκίνισε το adjacency test. Επαναφέρθηκε.

### ⚠️ Ο ισχυρισμός που αποδείχθηκε ΛΑΘΟΣ — και ήταν γραμμένος στο build-plan

Το spike Νο2 δεν βγήκε όπως το περίμενα. Το §8b σημείο 2 έλεγε ότι ένα `gte` *«passes every 8a test»*, και το είχα επαναλάβει στο σχόλιο του test. **Είναι λάθος:** το `time-entries.service.spec.ts` κάνει `toHaveBeenNthCalledWith` πάνω στο **ακριβές** αντικείμενο `where`, οπότε η αλλαγή τελεστή το κοκκινίζει — **5 unit tests έπεσαν** μαζί με το e2e.

Το πραγματικό κενό είναι στενότερο και εξακολουθεί να αξίζει: το unit test **επαναδιατυπώνει την υλοποίηση**, οπότε ένα refactor που αλλάζει query και αναμενόμενο αντικείμενο μαζί περνάει ενώ η σημασιολογία μετακινείται· και κανένα assertion πάνω σε αντικείμενο δεν δείχνει ότι η **Postgres** όντως δέχεται back-to-back βάρδιες. Το e2e ελέγχει το **αποτέλεσμα** (υπάρχουν δύο γραμμές), όχι το σχήμα του query.

Διορθώθηκαν και τα δύο σημεία. Το γράφω με έμφαση γιατί είναι η τρίτη φορά που τα context files περιείχαν ισχυρισμό που κανείς δεν είχε μετρήσει.

### Η μία διόρθωση σε test, όχι σε κώδικα

Το CORS test για «άγνωστο origin» περίμενε **απουσία** header. Λάθος: με στατικό `origin` string το `cors` στέλνει τον configured origin **πάντα** και δεν συγκρίνει — η επιβολή γίνεται στον browser. Ξαναγράφτηκε σε αυτό που πραγματικά προστατεύει: ο header **ποτέ δεν είναι το origin του καλούντος**. Αν κάποιος χαλάρωνε το `origin` σε `true` ή σε reflecting function, αυτό το test θα το έπιανε.

### Επαλήθευση (πραγματικά εκτελεσμένη)

- **70/70 e2e** σε 7 suites· **143/143 unit** αμετάβλητα· `tsc --noEmit` καθαρό· `lint` καθαρό
- **Τα 4 σημεία του §8b, όλα καλυμμένα**: guards που *εκτελούνται* ανά route (401/403 σε `/users` ×4, `/settings`, `/payroll` ×3, `/time-entries`)· πραγματικό SQL (adjacency, splitting, overlap)· DB constraints (`CHECK ("id"=1)`, unique email πίσω από το 409, partial unique index με **8 ταυτόχρονα clock-in → 1×201 + 7×400, μηδέν 500**)· και **migrations από άδεια βάση + seed**, που έτρεξαν πραγματικά την πρώτη φορά σε ολοκαίνουργια `swifttrack_test`
- **Splitting σε πραγματικές γραμμές**: Παρ 24 Ιουλ 20:00 → Σάβ 25 Ιουλ 03:00 δίνει **4h EVENING @3258.5 = 13.034 ISK** στο 2026-06 και **3h WEEKEND** στο 2026-07 — άθροισμα 7h. Zone split: Τρ 4 Αυγ 22:00 → Τετ 5 Αυγ 06:00 → 2h EVENING + 6h NIGHT σε **δύο** γραμμές ημερών
- **Οι στήλες αθροίζουν**: `Σ zones.pay === totalPay`, `Σ days.totalHours === totalHours`, `Σ rows.totalPay === totalCost`, και κάθε ζώνη ικανοποιεί `round(hours × rate) === pay`
- **`/payroll/:userId` ως admin επιστρέφει `toEqual` το `/payroll/me`** του υπαλλήλου
- **Η dev βάση επιβεβαιωμένα ανέπαφη** μετά από όλα (1 admin, 0 `TimeEntry`, 25/24, με `psql`)

### Ανοιχτά / κληροδοτούμενα

- **Step 8** συρρικνώθηκε — δεν έγινε ακόμα. **Step 8a** (unit tests για `AuthService`/`UsersService`) δεν έγινε· παραμένουν τα μόνα services χωρίς κανένα test
- **Το «migrations από άδεια βάση» αποδεικνύεται μόνο σε καθαρή βάση.** Στα επόμενα τρεξίματα το `migrate deploy` λέει «No pending migrations». Για να ξανααποδειχθεί: `DROP DATABASE swifttrack_test` και ξανά. Δεν μπήκε `migrate reset` σε κάθε τρέξιμο σκόπιμα — θα πρόσθετε δευτερόλεπτα σε κάθε run για έλεγχο που αλλάζει μόνο όταν αλλάζουν τα migrations
- **Step 14**: το `.env.test.example` χρειάζεται αναφορά στο README, μαζί με τα ήδη παρκαρισμένα (`postinstall`/`prisma generate`, `start:prod`, «Settings not initialised → τρέξε seed»)
- Η test βάση δημιουργήθηκε **χειροκίνητα** (`CREATE DATABASE swifttrack_test`). Δεν το κάνει το `global-setup` — θα χρειαζόταν σύνδεση στη `postgres` βάση με δικαιώματα δημιουργίας. Πρέπει να μπει στο README

## Demo seed για τη dev βάση (2026-08-11, ανάμεσα στο 8b και το 8a)
Status: ✅ Done · **δεν είναι βήμα του build-plan**

Ζητήθηκε από τον χρήστη πριν ξεκινήσει το frontend, και είναι πραγματική ανάγκη όχι καλλωπισμός: η dev βάση είχε **1 admin και τίποτα άλλο**. Τα Steps 9-13 δεν χτίζονται πάνω σε άδεια βάση — `ShiftList` χωρίς βάρδιες, `PayrollBreakdown` με τέσσερα μηδενικά, `CycleNavigator` χωρίς δεύτερο κύκλο να πάει, badge "Pending" χωρίς κανέναν pending.

Αρχεία: `backend/prisma/seed-demo.ts` (νέο), `backend/package.json` (`seed:demo` script), `context/build-plan.md` §14.

**Τρεις αποφάσεις:**

1. **Ξεχωριστό script, ΟΧΙ επέκταση του `prisma/seed.ts`.** Το `seed.ts` είναι το ελάχιστο για να λειτουργήσει μια εγκατάσταση και τρέχει **και σε production deploy και μέσα στο `global-setup.ts` της e2e σουίτας**. Ψεύτικοι υπάλληλοι εκεί θα πήγαιναν στην παραγωγή και θα έσπαγαν tests που μετράνε ακριβώς ποιος υπάρχει.
2. **Δεν είναι migration.** Ο χρήστης το διατύπωσε ως «migrations για το mock»· η διάκριση έχει σημασία: τα migrations αλλάζουν *σχήμα* και τρέχουν παντού, το seed γράφει *δεδομένα* και μόνο όταν το ζητήσεις.
3. **Στη dev βάση, ποτέ στην test.** Ό,τι μπει στην test πεθαίνει στο πρώτο `resetDatabase`. Μπήκε `assertNotTestDatabase()` — ο **ίδιος φύλακας ανάποδα** από αυτόν του 8b: εκείνος αρνείται ό,τι δεν τελειώνει σε `_test`, αυτός αρνείται ό,τι τελειώνει.

**Ημερομηνίες σχετικές με το «τώρα», όχι hardcoded.** Οι κύκλοι υπολογίζονται με `resolveCurrentCycleKey()` + `shiftCycleKey()` από το `cycle.util.ts` — καμία δεύτερη υλοποίηση ημερομηνιακής λογικής (invariant: single source of truth for cycle boundaries). Άρα το script μένει χρήσιμο όποτε ξανατρέξει, αντί να δείχνει άδειο τρέχοντα κύκλο σε έναν μήνα.

**Idempotent με rebuild**: σβήνει πρώτα τις εγγραφές των EMPLOYEE, μετά τους ίδιους, κρατάει τον admin, ξαναχτίζει. ⚠️ Σβήνει και ό,τι έχει φτιαχτεί χειροκίνητα.

⚠️ **Η αρχική έκδοση ΔΕΝ ήταν idempotent και η πρόταση παραπάνω έλεγε ψέματα** — βλ. την ενότητα `/review` παρακάτω. Διορθώθηκε και επαληθεύτηκε με **τρία διαδοχικά τρεξίματα**.

**Τι περιέχει** — 5 υπάλληλοι, ο καθένας για μια διαφορετική κατάσταση UI: κανονικό ωράριο (ζώνη DAY), βάρδιες με νύχτες+Σαββατοκύριακα (γεμίζει και τις 4 ζώνες, αλλιώς 2 στήλες είναι μόνιμα μηδέν), part-time **με ανοιχτή βάρδια τώρα**, **pending** με ορατό setupCode, και **απενεργοποιημένος με ώρες** στον τρέχοντα κύκλο. Συν 2 βάρδιες που κόβονται στα όρια κύκλου (παράγονται **από** το `cycleStart`, όχι hardcoded).

**Επαλήθευση (πραγματικά εκτελεσμένη, φρέσκο build + καθαρή διεργασία):**
- **153 εγγραφές** σε 3 κύκλους (2026-05/06/07)
- **SQL invariants**: 0 στο μέλλον, 0 ανάποδες, **0 επικαλυπτόμενα ζεύγη**, ακριβώς **1** ανοιχτή. Το script γράφει μέσω Prisma και παρακάμπτει τα DTO validators, οπότε αυτό δεν ήταν δεδομένο — δεδομένα που το ίδιο το API θα απέρριπτε θα έσκαγαν με 400 στην πρώτη επεξεργασία βάρδιας από το UI
- **Payroll**: Björn 104h → 393.596 ISK με **και τις 4 ζώνες γεμάτες** (15/29/12/48 h) και `Σ zones.pay === totalPay`
- **Overview**: 5 γραμμές, `totalCost` 766.154 = άθροισμα γραμμών· ο απενεργοποιημένος **μετράει** (28h), ο pending στο 0, ο ανοιχτός σημαδεμένος
- **`isSplit`**: ο κύκλος 2026-06 δείχνει **2** split (μία εισερχόμενη από το προηγούμενο όριο, μία εξερχόμενη), ο 2026-07 δείχνει **1** — ακριβώς η σχεδιασμένη συμπεριφορά
- `tsc --noEmit` καθαρό, lint καθαρό

⚠️ **Παρατήρηση, δεν αλλάχθηκε:** το lint glob είναι `{src,apps,libs,test}` — ο φάκελος `prisma/` δεν περνάει από ESLint, άρα ούτε το `seed.ts` ούτε το `seed-demo.ts`. Το `tsc` τα καλύπτει (type errors πιάνονται), λείπουν μόνο οι style/safety κανόνες. Προϋπάρχον από το Step 1.

⚠️ **Τέταρτο λάθος μέτρησης του project, ξανά δικό μου probe:** το login του admin στα probes απέτυχε με 401 και το είδα αρχικά ως πρόβλημα. Ήταν το probe: οι τιμές στο `backend/.env` **δεν** έχουν εισαγωγικά (σε αντίθεση με το `.env.example`), οπότε το `cut -d'"' -f2` επέστρεφε ολόκληρη τη γραμμή ως password. Τέσσερα στα τέσσερα λάθη μέτρησης ήταν του harness, ποτέ του κώδικα.

## Step 8a — Unit tests: Auth & Users
Status: ✅ Done
Ημερομηνία: 2026-08-11
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/auth/auth.service.spec.ts` — **νέο**, 16 tests
- `backend/src/users/users.service.spec.ts` — **νέο**, 16 tests
- `backend/test/activation.e2e-spec.ts` + `context/*` — διόρθωση της παρανόησης για τα strings (βλ. παρακάτω)
- **Κανένα αρχείο υλοποίησης.** Τα cycle/payroll/time-entries specs υπήρχαν ήδη από τα Steps 4/5/6 — δεν ξαναγράφτηκαν, όπως λέει το plan
Endpoints/Components: κανένα — **175 unit tests συνολικά** (143 → 175)
Σημειώσεις:

### Γιατί υπήρχε το βήμα

`AuthService` και `UsersService` ήταν τα **μόνα services χωρίς κανένα test**. Το `AuthService` ειδικά είναι το ένα σημείο όπου λάθος **σειρά** ελέγχων είναι security bug και όχι display bug — και είχε ήδη βρεθεί λάθος μία φορά (λείπων `isActive` στο `set-initial-password`, το έπιασε το `/review` στο Step 3· κανένα test δεν υπήρχε να το πιάσει).

### ⚠️ Παρανόηση δική μου, την οποία διόρθωσε ο χρήστης

Είχα συμπεράνει από τη χαλάρωση του §8a ότι τα **tests** πρέπει να πάψουν να ελέγχουν literal strings και να ελέγχουν «ποια περίπτωση + ποιο status». Έγραψα έτσι το πρώτο draft του `auth.service.spec.ts`, χαλαρά regex στο `activation.e2e-spec.ts`, και αντίστοιχη καθοδήγηση σε **build-plan §5/§8/§8a/§8b + κανόνα 5**.

**Λάθος.** Ο χρήστης διευκρίνισε: η χαλάρωση αφορά **μόνο** ότι τα context files παύουν να είναι η αυθεντία που πρέπει να ακολουθεί ο κώδικας (μπορεί να υπάρξει ασυμφωνία εγγράφου↔κώδικα χωρίς αυτό να είναι bug). Τα **tests ελέγχουν τα μηνύματα αυτούσια**, όπως όλα τα υπόλοιπα 143. Αλλαγή μηνύματος = συνειδητή αλλαγή που κοκκινίζει test.

Διορθώθηκαν: και τα δύο νέα specs, το `activation.e2e-spec.ts` (2 regex → ακριβή strings), 4 σημεία στο `build-plan.md`, η σημείωση του §8a στο spec, και το invariant του `architecture.md` — όλα λένε πλέον ρητά «κανόνας για την τεκμηρίωση, όχι για τα tests».

### Τι καλύπτουν

**`AuthService`** — η σειρά των ελέγχων και στις δύο μεθόδους, με τα μηνύματα αυτούσια: ότι `isActive` προηγείται του `password === null` (χρήστης ταυτόχρονα απενεργοποιημένος **και** μη ενεργοποιημένος παίρνει «no longer active», ποτέ το αδιέξοδο μήνυμα ενεργοποίησης)· ότι άγνωστο email και λάθος password δίνουν **το ίδιο** string· ότι λάθος κωδικός και ληγμένος κωδικός δίνουν **διαφορετικά** (διαφορετική ενέργεια απαιτείται)· ότι το `bcrypt.compare` **δεν καλείται καν** για απενεργοποιημένο ή μη ενεργοποιημένο λογαριασμό (αποδεικνύει short-circuit, όχι απλή παρουσία)· ότι απουσία `setupCodeExpiresAt` θεωρείται **ληγμένο**, όχι «χωρίς προθεσμία»· και ότι **καμία** από τις 4 απορριπτικές διαδρομές δεν καταναλώνει τον setupCode.

**`UsersService`** — ADMIN rows απρόσιτα σε `updateEmployee`/`deactivate` (404, και το `update` δεν καλείται καθόλου)· το `activateAccount` καθαρίζει `setupCode` **και** `setupCodeExpiresAt` μαζί· το `toProfileDto` δεν κουβαλάει ποτέ `setupCode` ενώ το admin-facing DTO το κουβαλάει πάντα για pending· 409 **και** από τον explicit έλεγχο **και** από το `P2002`, ενώ άλλα DB errors **ξαναπετιούνται** (catch-all θα μετέτρεπε outage σε «email already exists»)· και ότι οι narrow readers έχουν όντως ρητό `select` — ειδικά το `findActiveById`, που τρέχει σε **κάθε** authenticated request και δεν επιτρέπεται να φορτώνει `password`/`setupCode`.

### Το εύρημα του harness

`jest.spyOn(bcrypt, 'compare')` σκάει με `TypeError: Cannot redefine property: compare` — τα exports του bcrypt v6 δεν είναι configurable. Λύση: module mock που αντικαθιστά **μόνο** το `compare` και κρατάει το `hash` πραγματικό, ώστε ο έλεγχος «δεν αποθηκεύεται plaintext» να γίνεται πάνω σε αληθινό bcrypt digest (`/^\$2[aby]\$\d{2}\$/`).

### Spike — τα tests αποδείχθηκαν μη κενά

**Αφαιρέθηκε ο έλεγχος `isActive` από το `setInitialPassword`**, δηλαδή αναπαράχθηκε ακριβώς το bug του Step 3. Αποτέλεσμα: **2 unit tests + 1 e2e test κόκκινα**. Επαναφέρθηκε· `git diff` στα δύο service files κενό.

Αυτό είναι το ουσιαστικό παραδοτέο του βήματος: το ίδιο bug το 2026-08-02 το βρήκε άνθρωπος διαβάζοντας κώδικα· τώρα το βρίσκει η σουίτα σε 7 δευτερόλεπτα.

### Επαλήθευση

**175/175 unit** (143 + 32), **70/70 e2e**, `tsc --noEmit` καθαρό, `lint` καθαρό. Δύο lint errors στο πρώτο πέρασμα (`no-unsafe-member-access` σε `mock.calls[0][0]`, `require-await` σε non-async test) διορθώθηκαν με τύπους, όχι με απενεργοποίηση κανόνων.

### `/review` μετά τα 8b / 8a / demo seed — 7 ευρήματα, όλα διορθώθηκαν

2 Critical, 2 Important, 3 Minor. **Κανένα δεν αφορούσε κώδικα παραγωγής ή τη σουίτα** — και τα δύο Critical ήταν στον demo seed, το μόνο κομμάτι που δεν είχε περάσει από spike.

**1. 🔴 Ο `seed-demo.ts` δεν ήταν idempotent — έσκαγε σε κάθε δεύτερο τρέξιμο.** `prisma.user.deleteMany({ role: 'EMPLOYEE' })` χωρίς να προηγηθεί διαγραφή των `TimeEntry`. Το `TimeEntry.user` δηλώνεται **χωρίς `onDelete: Cascade`**, άρα το Prisma κάνει `Restrict`: `Foreign key constraint violated on TimeEntry_userId_fkey`. Το πρώτο τρέξιμο πέτυχε **μόνο επειδή η βάση ήταν άδεια**.

  Τρία πράγματα το χειροτέρευαν: το σχόλιο από πάνω υποσχόταν idempotency, το μήνυμα έλεγε «and their time entries» (συμπεριφορά που δεν υπήρχε), και το `helpers/db.ts` **έκανε τη σωστή σειρά τρία αρχεία δίπλα**. Διόρθωση: `timeEntry.deleteMany({ where: { user: { role: 'EMPLOYEE' } } })` πρώτα — σκόπιμα scoped, όχι γυμνό `deleteMany()`, ώστε το script να μη σβήνει γραμμές που δεν έγραψε.

**2. 🔴 Ο ίδιος ο tracker δήλωνε τον ισχυρισμό ως επαληθευμένο.** Η φράση «Δύο τρεξίματα = ίδια βάση με ένα» βρισκόταν μέσα σε ενότητα με τίτλο «Επαλήθευση (πραγματικά εκτελεσμένη)», ενώ το script είχε τρέξει **μία** φορά. Ίδια οικογένεια με το εύρημα 4+9 του Step 3. Διορθώθηκε.

**3. 🟠 Θέσεις πίνακα αντί για ονόματα.** `const [anna, , elin] = await prisma.user.findMany(...)` έδενε το «ποιος έχει την ανοιχτή βάρδια» στη **σειρά** του πίνακα `PEOPLE`. Αναδιάταξη —εντελώς αθώα— θα έδινε σιωπηλά τις ειδικές βάρδιες σε λάθος άτομο, χωρίς κανένα test να το πιάσει. Έγιναν **flags πάνω στο ίδιο το άτομο** (`boundaryShifts`, `openShift`), οπότε η ανάθεση είναι τοπική στον ορισμό του και το επιπλέον query εξαφανίστηκε.

**4. 🟠 Εξάρτηση σειράς στο `throttling.e2e-spec.ts`.** Το δεύτερο test περίμενε 429 επειδή το **πρώτο** είχε εξαντλήσει το bucket. Τρέξιμο με `-t` (φυσιολογική κίνηση debugging) το κοκκίνιζε με μήνυμα που δεν έδειχνε πουθενά. Εξαντλεί πλέον το bucket μόνο του, idempotently. **Επαληθεύτηκε μεμονωμένα: 66 skipped, 1 passed.**

**5. 🟡 `prisma/` εκτός ESLint** — προστέθηκε στο glob· δοκιμάστηκε πρώτα ότι περνάει καθαρό.
**6. 🟡 `assertNotTestDatabase()` δεν είχε δοκιμαστεί ποτέ** (σε αντίθεση με τον δίδυμό του στο 8b). **Δοκιμάστηκε: `DATABASE_URL=…/swifttrack_test npm run seed:demo` → αρνείται, και η test βάση παρέμεινε 1 user / 0 entries.**
**7. 🟡 Non-null assertion στο `zone()` helper** και **hardcoded `/users/2`** στον πίνακα guards → το πρώτο πετάει πλέον καθαρό μήνυμα, το δεύτερο δείχνει σε υπαρκτή γραμμή (τα 4 `it.each` 403 έγιναν ένα με βρόχο, εξ ου 70 → 67 e2e tests).

**Επαλήθευση μετά τις διορθώσεις:** **3 διαδοχικά `seed:demo`** → σταθερά «Removed 5 … and 155 time entries / Seeded 155». 1 ανοιχτή βάρδια (της Elín), 2 βάρδιες ορίου (της Anna), 0 στο μέλλον, 0 επικαλύψεις. **175/175 unit, 67/67 e2e**, tsc καθαρό, lint καθαρό.

⚠️ **Πέμπτο λάθος μέτρησης, μέσα στο ίδιο το review:** το query ελέγχου έδειξε την pending υπάλληλο με «0 shifts, 1 open». Ήταν artifact του `LEFT JOIN` — για χρήστη χωρίς εγγραφές παράγεται φάντασμα γραμμή που ικανοποιεί το `endTime IS NULL`. Με `JOIN` αντί για `LEFT JOIN` φάνηκε το σωστό. Πέντε στα πέντε λάθη μέτρησης ήταν του harness/probe, **ποτέ του κώδικα**.

### Δεύτερο `/review` — 3 ευρήματα κάλυψης, όλα διορθώθηκαν (67 → 81 e2e tests)

Κανένα δεν αφορούσε κώδικα παραγωγής. Και τα τρία ήταν **κενά κάλυψης**: πράγματα που η σουίτα δεν αποδείκνυε ενώ θεωρούσαμε ότι τα αποδεικνύει.

**1. 🟠 Δύο δεσμεύσεις που δεν τηρήθηκαν.** Πριν το 8b-2 είχα δηλώσει ρητά ότι θα κωδικοποιήσω δύο από τα 4 Minor του Step 5 **ως αναμενόμενη συμπεριφορά**, και ο χρήστης συμφώνησε. Καμία από τις δύο δεν γράφτηκε ποτέ. Έχει σημασία επειδή **τεκμηριώθηκαν στο Swagger στο Step 7**, άρα είναι συμβόλαιο:
   - `PUT` χωρίς `notes` **σβήνει** τα υπάρχοντα (full replacement, όχι patch). Παγίδα για το Step 11: αν κάποιος «βελτιστοποιήσει» τον `ShiftForm` να στέλνει μόνο τα αλλαγμένα πεδία, σβήνει σιωπηλά σημειώσεις.
   - `DELETE` **δεν** μπλοκάρεται από ανοιχτή βάρδια, σε αντίθεση με `POST`/`PUT` — ο υπάλληλος μπορεί να σβήσει την ανοιχτή αντί να κάνει clock out.

**2. 🟠 Τρύπα guards στο module με τα περισσότερα routes.** Το `time-entries.e2e-spec.ts` είχε **μηδέν** ελέγχους 401 σε 8 routes, και τα `clock-in`/`clock-out`/`open` — 3 από τα 4 EMPLOYEE-only — κανέναν έλεγχο 403. Είναι **ακριβώς η κατηγορία bug που βρήκε το `/review` του Step 5** (το `GET /time-entries/me` είχε ξεχαστεί με μόνο `JwtAuthGuard`), δηλαδή το module όπου έχει ήδη συμβεί ήταν και το ακάλυπτο. Προστέθηκαν 8×401 + 4×403.

**3. 🟡 Το test «every column adds up» περνούσε και με μηδενική μισθοδοσία.** Και οι τέσσερις ισχυρισμοί του συγκρίνουν ένα άθροισμα με ένα άλλο, και το `0 === 0` τους ικανοποιεί όλους — άρα payroll που επέστρεφε σιωπηλά τίποτα περνούσε το test που **ονομάζεται** έλεγχος ακεραιότητας των αθροισμάτων. Προστέθηκαν 4 ισχυρισμοί μη-μηδενικότητας.

**⭐ Το spike που δικαιολογεί ολόκληρο το 8b.** Αφαιρέθηκε το `@Roles(Role.EMPLOYEE)` από το `clock-in`:
- **e2e: 1 failed** — το νέο guard test το έπιασε
- **unit: 175/175 PASSED** — δεν το είδαν καθόλου

Αυτό είναι, μετρημένο, το κενό που το §8b υπάρχει για να καλύψει: *«instantiating a controller directly runs no guard»*. Ένα unit test θα περνούσε ακόμα κι αν είχε διαγραφεί κάθε `@Roles` του project.

**Κατάσταση**: **175/175 unit, 81/81 e2e**, tsc καθαρό, lint καθαρό, `git diff` στο `src/` κενό.

## Αναθεώρηση των context αρχείων πριν το frontend — ✅ ΕΓΙΝΕ (2026-08-26)

**Η εγγραφή που ακολουθούσε ήταν το «τι πρέπει να γίνει». Έγινε.** Το τι αποφασίστηκε είναι στην επόμενη ενότητα· αυτό εδώ μένει ως καταγραφή του γιατί ξεκίνησε.

Πρόθεση: να περάσουμε **μαζί** τα context αρχεία ώστε να **δέσει το frontend πάνω στο πραγματικό backend**. Τα Steps 9-13 του `build-plan.md` γράφτηκαν όταν δεν υπήρχε ακόμα API — και το API άλλαξε ουσιωδώς στην πορεία (ζώνες χρέωσης στο Step 6, αφαίρεση των ωρών από τη λίστα βαρδιών, οι 4 write rules του Step 5). Δεν είναι refactor· είναι ευθυγράμμιση του σχεδίου με ό,τι όντως χτίστηκε.

**Σημείο αναφοράς**: commit `a851354`, tag **`backend-complete`**. Τα context αρχεία εκεί είναι όπως ήταν **πριν** αγγίξουμε οτιδήποτε για το frontend:

```bash
git show backend-complete:context/architecture.md   # ένα αρχείο όπως ήταν
git diff backend-complete -- context/               # τι αλλάξαμε από τότε
git checkout backend-complete -- context/           # επαναφορά όλων
```

### Τα σημεία που ήδη ξέρουμε ότι αποκλίνουν

Καταγεγραμμένα ήδη διάσπαρτα στα βήματα 4-7· συγκεντρωμένα εδώ ώστε να μη χρειαστεί να τα ξαναβρεί το επόμενο session:

1. **Step 12 — ο `PayrollBreakdown` του Step 0 είναι προσχέδιο και αντικαθίσταται**, όχι επεκτείνεται. Γίνεται **δύο** components: summary ανά ζώνη (label/hours/rate/pay) + πίνακας ανά ημερομηνία (μόνο ώρες). Καμία αριθμητική στο frontend — ούτε `Math.round`, ούτε άθροιση στηλών (το `Σ` σε JS διαφωνεί με τον server στο ~36% των γραμμών).
2. **Step 11 — ο `ShiftList` χάνει τη στήλη Hours.** Το API δεν επιστρέφει πια ώρες ανά βάρδια (απόφαση 5f). Αν χρειαστεί αριθμός, είναι **Duration** (`end − start`), ρητά ονομασμένη.
3. **Step 11 — ο `ShiftForm`**: το End Time γίνεται `required`, και πρέπει να στέλνει **πάντα και τα τρία πεδία** — το `PUT` είναι full replacement και το κενό `notes` σβήνει τα υπάρχοντα (υπάρχει e2e test γι' αυτό).
4. **Step 13 — το `SettingsPage`** γίνεται ένα `<select>` 11-25 με το end day ως παράγωγο κείμενο, αντί για δύο ελεύθερα number inputs 1-31.
5. **Step 10 — ανοιχτή απόφαση**: μένει το `MonthSummary` ή γίνεται η σελίδα «μόνο το κουμπί»; Το δεύτερο κάνει τη σελίδα ανεξάρτητη από το Payroll module. Δεν επηρεάζει καθόλου το backend.
6. **Invariant που δεν πρέπει να σπάσει**: το `zones[]` γίνεται render **ως λίστα**, ποτέ hardcoded στήλες — ήταν ο όρος υπό τον οποίο πάρθηκε η απόφαση των τεσσάρων ζωνών.

### Και τα δύο εκκρεμή του backend

- **Step 8** (χειροκίνητο πέρασμα από Swagger UI) — δεν έγινε, είναι δουλειά ανθρώπου, **δεν** μπλοκάρει το Step 9.
- **Step 14** — τα τέσσερα θέματα packaging (`prisma generate` σε καθαρό clone, `start:prod` σε πραγματικό deploy, χειροκίνητη δημιουργία της test βάσης, `npm audit`). Όλα γραμμένα στο `build-plan.md` §14.

## Ευθυγράμμιση context files για το frontend
Status: ✅ Done
Ημερομηνία: 2026-08-26
Αρχεία που άλλαξαν: `context/build-plan.md`, `context/architecture.md`, `context/swifttrack-phase1-final.md`, `context/progress-tracker.md`
**Κανένα αρχείο κώδικα δεν αγγίχθηκε.** Καμία εντολή build/test δεν έτρεξε — δεν υπήρχε τίποτα να τρέξει, η συνεδρία ήταν αποκλειστικά τεκμηρίωση.

### Πώς γράφτηκαν τα §9-13

Τα §9-13 δεν είναι λίστες με κουκκίδες αλλά **πλήρεις προδιαγραφές ανά σελίδα** — ποιο endpoint, ποια πεδία, ποιες καταστάσεις, ποια κείμενα, τι **δεν** επιτρέπεται, και πότε το βήμα θεωρείται τελειωμένο. Και ρητή εντολή: **όπου ο παλιός κώδικας ή τα παλιά έγγραφα αντιφάσκουν με τις αποφάσεις αυτής της συνεδρίας, γράφεται το σωστό, όχι το παλιό.**

### Οι 12 αποφάσεις (μέσω `/architect`, μία-μία)

1. **Σκέτο `fetch` + ένας κοινός `useApiQuery`.** Όχι TanStack Query — το κύριο κέρδος του είναι κοινό cache ανάμεσα σε components που ζητούν τα ίδια δεδομένα, και **καμία σελίδα εδώ δεν μοιράζεται endpoint με άλλη**· ελέγχθηκε. Δεύτερος λόγος: μεγάλη επιφάνεια (`placeholderData`, optimistic updates) που σε νούμερα μισθοδοσίας είναι ενεργά επικίνδυνη. Αναγνωρίστηκαν ρητά τα δύο πράγματα που χάνουμε: `invalidateQueries` (→ 8 χειροκίνητα `refetch()`) και `refetchOnWindowFocus`.
2. **Και όχι axios** (ξεχωριστός άξονας, τον έθεσε ο χρήστης — σωστά, δεν ήταν στην αρχική λίστα). Όλη η αξία του συγκεντρώνεται στον έναν `client.ts` που γράφεται έτσι κι αλλιώς· οι interceptors λύνουν κυρίως το σιωπηλό refresh token, που το project **δεν έχει** εξ ορισμού.
3. **Επαλήθευση στο boot.** Μόνο το token στο localStorage· ο χρήστης από `GET /users/me` σε κάθε άνοιγμα tab. Ο αποφασιστικός λόγος δεν ήταν ασφάλεια (ο server κρατάει· 403 παντού) αλλά **μία πηγή αλήθειας**: ο αποθηκευμένος `role` είναι χειροκίνητα επεξεργάσιμος και ζωγραφίζει admin σελίδες. Κόστος: **ένα request ανά tab, όχι ανά πλοήγηση**.
4. **localStorage και όχι httpOnly cookie.** Μετρήθηκε το κόστος της αλλαγής (70 σημεία Bearer σε 8 e2e αρχεία, `jwt.strategy.ts`, CORS `credentials`, νέο `/auth/logout`, Swagger). Απόφαση χρήστη: εσωτερικό εργαλείο, λεπτή επιφάνεια XSS (μόνο τα `notes` είναι ελεύθερο κείμενο, το React κάνει escape, πουθενά `dangerouslySetInnerHTML`). Καταγράφηκε ότι το httpOnly **δεν** εξαλείφει τη ζημιά από XSS — εμποδίζει την **εξαγωγή** του token, όχι τη χρήση του.
5. **Κωδικοί σφάλματος** — βλ. Step 8c παρακάτω.
6. **Ρητό UTC** με `lib/datetime.ts` ως μοναδική πόρτα, `TimezoneNotice` υπό συνθήκη `offset !== 0`, inline υπόδειξη στον `ShiftForm`.
7. **`?cycle=` στο URL** με `replace`. Ο αποφασιστικός λόγος: το drill-down του admin από το Overview Ιουλίου προσγειωνόταν στον Αύγουστο.
8. **Clock page = μόνο το κουμπί.** Το `MonthSummary.tsx` **διαγράφεται** (ο χρήστης επέμεινε — και σωστά: δεν κρατάμε αχρησιμοποίητο κώδικα· επαληθεύτηκε ότι έχει **μία** αναφορά, στο `ClockPage.tsx`).
9. **Καμία στήλη αριθμού στη λίστα βαρδιών.** Το επιχείρημα που έκλεισε το θέμα: μια split βάρδια εμφανίζεται σε **δύο** κύκλους με τα πλήρη `startTime`/`endTime`, άρα μια στήλη Duration θα έδειχνε 7h δύο φορές για 7 ώρες δουλειάς.
10. **Δύο `datetime-local` με προσυμπλήρωση** ημερομηνίας τέλους. Η εναλλακτική (μία ημερομηνία + δύο ώρες) απαιτεί εικασία «+1 μέρα» για τις νυχτερινές, που κάνει τη βάρδια μηδενικής διάρκειας — **επιτρεπτή από το API** — αδύνατη να γραφτεί.
11. **Επιβεβαίωση σε καταστροφικές ενέργειες** + **κλείδωμα παλιών κύκλων** — βλ. 8c.
12. **Απενεργοποιημένοι κρυμμένοι πίσω από διακόπτη με αριθμό**, τρίτο badge, κουμπί → Reactivate. Ο χρήστης αμφισβήτησε τη δική μου αρχική πρόταση (να φαίνονται) και είχε δίκιο: **η λίστα μεγαλώνει μονότονα και δεν μικραίνει ποτέ**.
13. **`setupCode`: διάλογος στη δημιουργία + στη λίστα με ημερομηνία λήξης.**
14. **Tests**: Vitest μέσα στα βήματα (καθαρές συναρτήσεις) + **Step 13b** με ~30-35 Playwright tests.

### Step 8c — νέο backend βήμα (~1 μέρα)

Τέσσερις αποφάσεις απαιτούσαν αλλαγή στο API. Μπήκαν **τώρα** με το επιχείρημα που έβαλε και το 8b πριν το frontend: *κανένας καταναλωτής δεν υπάρχει ακόμα, άρα είναι μονόπλευρη αλλαγή σήμερα και διπλή αύριο.*

- **Κωδικοί σφάλματος** σε ~22 throws. Το status είναι πολύ χοντροκομμένο: το `400` σημαίνει ήδη **τέσσερα** πράγματα στο `POST /time-entries`. Επιβεβαιώθηκε από το [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) (το status είναι *advisory*, ο διαχωρισμός ανήκει στο σώμα) και ότι το NestJS δεν προσφέρει τίποτα γι' αυτό. **Μετρήθηκε ότι σπάει 0 tests**: τα e2e ελέγχουν `body.message`, όχι ολόκληρο το σώμα. Το `OPEN_SHIFT_EXISTS` είναι **ήδη** σταθερά από το Step 5 — το βήμα εκθέτει κάτι που υπάρχει.
- **`PATCH /users/:id/reactivate`** — σήμερα η απενεργοποίηση είναι **μη αναστρέψιμη**: το `PUT` δέχεται μόνο `name`/`hourlyRate`, νέο `POST` σκοντάφτει στο μοναδικό email. Εποχική εργασία → όχι εξωτικό σενάριο.
- **`POST /users/:id/reset-setup-code`** — **το σοβαρότερο εύρημα της συνεδρίας.** Ο κωδικός ορίζεται σε **ένα** σημείο (`createEmployee`), ζει 3 μέρες, και **δεν υπάρχει καμία διαδρομή αναγέννησης**. Υπάλληλος που προσλαμβάνεται Παρασκευή και κάθεται Τρίτη είναι κλειδωμένος έξω μόνιμα. Και το μήνυμα λήξης λέει *«Please contact your admin»* — σε κάποιον που δεν έχει κανένα εργαλείο.
- **Κλείδωμα παλιών κύκλων** για EMPLOYEE (τρέχων + προηγούμενος), **ADMIN χωρίς όριο**. Η αρχική πρόταση του χρήστη αφορούσε μόνο `DELETE`· επισημάνθηκε ότι `PUT` και `POST` κάνουν ίδια ζημιά σε πληρωμένο κύκλο. Ο χρήστης ζήτησε αρχικά κλείδωμα **και** για τον admin· αναιρέθηκε όταν φάνηκε ότι ακυρώνει γραπτή απόφαση του §5 (η ανοιχτή βάρδια απενεργοποιημένου υπαλλήλου θα έμενε ανοιχτή για πάντα). Η λίστα αποκτά πεδίο «μπορεί ο **καλών** να το επεξεργαστεί» — το frontend δεν επιτρέπεται να υπολογίσει όρια κύκλου.
- ⚠️ **Αποδεκτή συνέπεια**: λάθος που εντοπίζεται μετά το παράθυρο είναι **μόνιμο** για τον υπάλληλο. Δεν υπάρχει μηχανισμός διορθωτικής εγγραφής.

### Το Step 13a καταργήθηκε

Σχεδιάστηκε στο **Step 0**, όταν δεν υπήρχε backend και οι κανόνες επικύρωσης ήταν άγνωστοι. Σήμερα είναι όλοι γνωστοί και δοκιμασμένοι — **η προϋπόθεση που δικαιολογούσε την αναβολή εξατμίστηκε**. Το κόστος της αναβολής ήταν μετρήσιμο: 5 φόρμες γραμμένες δύο φορές, κάθε βήμα να εφευρίσκει δική του πρόχειρη επικύρωση, και περιορισμός σειράς για το 13b (e2e γραμμένα πριν το 13a θα ξαναγράφονταν μετά). Το ερώτημα το έθεσε ο χρήστης· η αρχική μου θέση ήταν να μείνει.

Το περιεχόμενό του έγινε **κανόνας από το Step 9**: κάθε φόρμα με `react-hook-form` + `zod` + shadcn `Form`. Οι εξαρτήσεις μετακόμισαν στο Step 9.

### Το Step 13b

Playwright, ~30-35 tests, **μετά** το 13. Ονομάστηκε `13b` και **όχι 14**: το 14 είναι το README και ο tracker το αναφέρει **8 φορές** ως προορισμό παρκαρισμένων θεμάτων — μετονομασία θα έσπαγε και τις οκτώ.

Κανόνας που κρατάει την αξία ψηλά: **πλάτος σε οθόνες, όχι βάθος σε κανόνες.** Οι κανόνες είναι ήδη αποδεδειγμένοι από τα 81 backend e2e· ένα δεύτερο test επικάλυψης περνάει από τον ίδιο ακριβώς frontend κώδικα. Εξαίρεση οι ημερομηνίες, όπου διαφορετικές τιμές περνούν από γνήσια διαφορετική αριθμητική.

### Έρευνα πριν το γράψιμο (αίτημα του χρήστη) — τρία κόκκινα

Έξι αναζητήσεις σε επίσημη τεκμηρίωση. Τα ευρήματα **επαληθεύτηκαν στον κώδικα**, δεν ελήφθησαν στα λόγια, και μπήκαν στο `architecture.md` § Stack Traps:

1. 🔴 **Base UI, όχι Radix.** Το shadcn άλλαξε βάση τον Ιούλιο 2026. Επαληθεύτηκε: **μηδέν** πακέτα radix, `@base-ui/react/dialog`, `data-slot`. Ένας agent που γράφει «κανονικό shadcn» από μνήμη παράγει Radix — και τα `data-[state=...]` **σπάνε σιωπηλά**.
2. 🔴 **Tailwind v4 CSS-first.** Επαληθεύτηκε: `@import "tailwindcss"`, `@theme inline`, **κανένα `tailwind.config.js`**. Ένας agent που το δημιουργεί για να προσθέσει χρώμα δεν παίρνει σφάλμα — απλώς δεν εφαρμόζεται.
3. 🔴 **Η εξουσιοδότηση είναι η συστηματική αδυναμία του AI κώδικα.** Μελέτη 2026, 534 δείγματα: **1 στα 4** με επιβεβαιωμένη ευπάθεια· **4 στις 6** βάσεις κώδικα με IDOR. Ο backend αμύνεται ήδη (φίλτρο ιδιοκτησίας μέσα στο Prisma `where` → 404· throttler). Γι' αυτό ο **πίνακας route × ρόλος γράφτηκε ρητά** αντί να συμπεραίνεται.
4. 🟠 `@hookform/resolvers` **≥5.1** για zod v4, με γνωστό σφάλμα τύπων.
5. 🟠 **Στα Vitest: mock το `fetch`, όχι το `request()`** — αλλιώς δοκιμάζεις το mock σου. Και το jsdom δεν έχει layout.

Και η γενικότερη παθογένεια: *«ασυνέπεια μεταξύ ανεξάρτητα παραγόμενων αρχείων — σαν να δούλεψαν 10 developers χωρίς να μιλήσουν»*, με το «convention mismatch» ως κύρια αιτία χαμηλής εμπιστοσύνης (DORA 2025: 39%). Αντίμετρα: οι **τέσσερις πόρτες** (`api/`, `useApiQuery`, `datetime.ts`, `messages.ts`) και οι **αρνητικοί κανόνες**.

### Το frontend αλλάζει, δεν ξαναχτίζεται

Ερώτημα του χρήστη. Απάντηση: **αλλάζει** — και η έρευνα το ενισχύει. Οι οκτώ οθόνες του Step 0 **ήδη συμφωνούν μεταξύ τους**· αν σβηστούν, ξαναγράφονται μία-μία σε οκτώ χωριστά βήματα και παράγουν οκτώ διαλέκτους χωρίς τίποτα να τις κρίνει. Η ταξινόμηση ανά αρχείο (άθικτα / rewire / ξαναγράψιμο εσωτερικών / αντικατάσταση / διαγραφή) μπήκε στο build-plan.

⚠️ Καταγράφηκε ρητά ότι το **`mocks/data.ts` το εισάγουν 13 αρχεία** — μετρημένο. Είναι το μεγαλύτερο κομμάτι δουλειάς των 9-13 και δεν ήταν γραμμένο πουθενά.

### Σκόπιμα ανοιχτά — να μη θεωρηθούν παραλείψεις

Μορφή/κείμενο των διαλόγων επιβεβαίωσης· χρώμα/εικονίδιο/ακριβής θέση μηνυμάτων· **toast: μία καταγεγραμμένη επανεξέταση στο Step 11** (ο `ShiftForm` είναι dialog που κλείνει, και βάρδια εκτός του προβαλλόμενου κύκλου δεν παράγει **καμία** ορατή αλλαγή)· **`MonthSummary`: επανεξέταση μετά το 13** με την εφαρμογή σε χρήση· ζωντανή ένδειξη διάρκειας μέσα στον `ShiftForm`.

### Παρκαρισμένο εργαλείο

**`.mcp.json`** με **shadcn MCP** (τα βήματα 9-13 χρειάζονται `form`/`select`/`alert-dialog`/`switch`, κανένα εγκατεστημένο) και **Playwright MCP** (ο agent βλέπει τη σελίδα που έφτιαξε αντί να την υποθέτει). Τοπικά `npx`, χωρίς λογαριασμό. Γράφτηκε στο §14· **δεν στήθηκε**.

**Επόμενο βήμα**: **Step 8c** — backend. Μετά, Step 9.

## Step 8c — Error codes, δύο endpoints ανάκτησης, κλείδωμα κύκλων
Status: ✅ Done
Ημερομηνία: 2026-08-26
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/common/error-codes.ts` — **νέο**, 17 κωδικοί (const object + union, στο idiom του Prisma-generated `Role`)
- `backend/src/common/domain-errors.ts` — **νέο**, 4 factories (`badRequest`/`unauthorized`/`notFound`/`conflict`)
- 24 throw sites σε `auth.service.ts` (9), `users.service.ts` (5), `time-entries.service.ts` (8), `settings/cycle.util.ts` (1), `payroll.service.ts` (1)
- `users/dto/user-response.dto.ts` + `users.service.ts` — `setupCodeExpiresAt`, `reactivate()`, `resetSetupCode()`
- `users.controller.ts` — `PATCH /users/:id/reactivate`, `POST /users/:id/reset-setup-code`
- `settings.service.ts` — `resolveWritableCycleStart()`
- `time-entries.service.ts` — `assertWritableCycle()`, `canWriteInCycle()`, `canEdit` στο `toCycleEntryDto`, `findCycleEntries()` παίρνει πλέον `callerRole`
- `time-entries/dto/cycle-entries-response.dto.ts` (`canWrite`), `time-entry-response.dto.ts` (`canEdit`)
- Tests: `time-entries.service.spec.ts` (+11), `users.service.spec.ts` (+5), `settings.service.spec.ts` (+4), `users.e2e-spec.ts` (+6), `time-entries.e2e-spec.ts` (+7), `payroll.e2e-spec.ts` (1 διόρθωση), `test/helpers/fixtures.ts` (νέο `seedShift`), `test/helpers/types.ts`
Endpoints/Components:
- `PATCH /users/:id/reactivate` (ADMIN) — 200· σε ήδη ενεργό employee **no-op 200**, όχι 409
- `POST /users/:id/reset-setup-code` (ADMIN) — 200 με νέο κωδικό + νέα λήξη· 409 `ACCOUNT_ALREADY_ACTIVATED` σε ενεργοποιημένο
- `GET /time-entries/me` + `GET /time-entries` — νέα πεδία `canWrite` (response-level) και `canEdit` (ανά εγγραφή)
- **175 → 195 unit, 81 → 94 e2e**

### ⚠️ Δύο ισχυρισμοί του build-plan §8c αποδείχθηκαν λάθος

**1. Τα throw sites είναι 24, όχι 25 — και το `auth` έχει 9, όχι 10.** Μετρημένο: 29 `throw new` σε `src/` (χωρίς spec) = 1 σκέτο `Error` (`rate-zones.util.ts:93`, εσωτερικό invariant) + 28 HttpException = **24 domain** + 3 `InternalServerErrorException` + 1 guard-level 401 (`jwt.strategy.ts`). Το «28 στο src/» ήταν σωστό· το «25» δεν έβγαινε. Διορθώθηκε στο build-plan.

**2. «Additive throughout: … so the 175 unit and 81 e2e tests stay green» — ΨΕΥΔΕΣ για το κλείδωμα κύκλων.** Ίσχυσε για τους κωδικούς σφάλματος (επαληθεύτηκε: 175/175 + 80/81 πράσινα αμέσως μετά τη μετατροπή των 24 sites, με τη μία αποτυχία να είναι προϋπάρχουσα — βλ. παρακάτω). **Δεν ίσχυσε** για το rule 5: δύο e2e fixtures έγραφαν βάρδια στις `2026-07-24` με **employee** token, δηλαδή δύο κύκλους πίσω — θα έσκαγαν με `CYCLE_LOCKED` **από την πρώτη μέρα**. Ο ισχυρισμός είχε γραφτεί χωρίς να κοιταχτούν τα fixtures.

### 🕰️ Προϋπάρχουσα ωρολογιακή βόμβα στα e2e — και πώς αποδείχθηκε ότι δεν την προκάλεσε το βήμα

Η πρώτη εκτέλεση των e2e έβγαλε **1 failed / 81**: `payroll › scopes hasOpenShift to the cycle the shift started in`. Το test είχε γραμμένο `// "now" is inside the 2026-07 cycle` και ζητούσε `payrollFor('2026-07')`. Με boundary στις 25, ο κύκλος `2026-07` τρέχει [25 Ιουλ, 25 Αυγ) — **έληξε στις 25 Αυγούστου**, δηλαδή **την προηγούμενη μέρα**. Το test γράφτηκε στις 11 Αυγούστου και «έληγε» στο επόμενο όριο κύκλου.

**Δεν θεωρήθηκε δεδομένο ότι ήταν προϋπάρχον**: `git stash push -- src/` (τα test files έμειναν), ξανά-εκτέλεση → **ίδια αποτυχία στον καθαρό κώδικα**, `git stash pop`. Αυτό είναι το **έκτο** λάθος μέτρησης του project και το **πρώτο που δεν ήταν του harness** — ήταν του ίδιου του test.

**Διόρθωση**: το test ζητά πλέον `/payroll/me` **χωρίς** `?cycle=` και διαβάζει το `cycle`/`prevCycle` που επιστρέφει ο server. Κανένα literal cycle key εκεί που εννοείται «ο τρέχων κύκλος».

### Οι αποφάσεις που πάρθηκαν στο `/architect` και υλοποιήθηκαν

**Α. Ο `code` μπαίνει με 4 factories, όχι με νέα κλάση ούτε με exception filter.** Επαληθεύτηκε **στον πηγαίο κώδικα του `@nestjs/common@11.1.28`**, όχι από μνήμη:
- `HttpException.createBody()` επιστρέφει object response **αυτούσιο** — δηλαδή **δεν** προσθέτει `statusCode` μόνο του (το προσθέτει μόνο για string/array/number). Γι' αυτό το γράφουμε ρητά· χωρίς αυτό θα έλειπε πεδίο που το `ErrorBody` των e2e απαιτεί.
- `HttpException.initMessage()` διαβάζει `response.message` όταν το response είναι object → το `error.message` μένει το ίδιο string, άρα κάθε `rejects.toThrow('…')` παραμένει ουσιαστικό και όχι απλώς πράσινο.
- Οι κλάσεις (`BadRequestException` κ.λπ.) **διατηρήθηκαν** επειδή 3 specs ελέγχουν `toThrow(NotFoundException)` ονομαστικά και επειδή το όνομα κλάσης κάνει το stack trace αναγνώσιμο.
- Χάνεται μόνο το `error: 'Bad Request'` — ήδη optional στο `ErrorBody`, πλεονάζει δίπλα στο `statusCode`.

**Β. 24 sites → 17 κωδικοί. Η αντιστοίχιση ΔΕΝ είναι 1:1, και σε μία περίπτωση δεν επιτρέπεται να είναι.** Άγνωστο email και λάθος password μοιράζονται `INVALID_CREDENTIALS`: δύο κωδικοί εκεί θα ξανάνοιγαν το user enumeration που το κοινό μήνυμα κλείνει. Ομοίως `EMAIL_ALREADY_EXISTS` ×2 (explicit check + `P2002`) και `OPEN_SHIFT_EXISTS` ×3 — τα δύο στρώματα του ίδιου κανόνα.

**Γ. Το παράθυρο ελέγχεται σε διαφορετικά instants ανά verb.** `POST` → το νέο `startTime`. `DELETE` → το `startTime` της γραμμής. `PUT` → **και τα δύο**, γιατί οι τρύπες είναι δύο και κάθε έλεγχος πιάνει μία: με μόνο τη νέα τιμή ο υπάλληλος τραβάει πληρωμένη βάρδια Ιουνίου στον Αύγουστο· με μόνο την παλιά σπρώχνει τρέχουσα βάρδια πίσω στον Ιούνιο. Υπάρχει test για **καθεμία** κατεύθυνση, σε unit και σε e2e.

**Δ. Το `canEdit` σημαίνει μόνο «η γραμμή είναι μέσα στο παράθυρό σου».** Δεν ενσωματώνει το open-shift block, γιατί εκείνο είναι **παροδικό** (φεύγει με clock out), **δεν αφορά το `DELETE`** (καταγεγραμμένο στο 2ο review του 8b) και έχει ήδη δικό του actionable 400. Ένα boolean με δύο λόγους αφήνει το UI να μην μπορεί να πει ποιος ισχύει. Το `canWrite` έχει **δύο** όρια (όχι πριν το παράθυρο, όχι σε κύκλο που δεν έχει αρχίσει) — το δεύτερο επειδή το rule 4 απαγορεύει μελλοντικά timestamps.

**Ε. Ο έλεγχος rule 5 τρέχει ΠΡΙΝ το open-shift block στο `create`.** «Δεν μπορείς να γράψεις εδώ» είναι πιο θεμελιώδες από «δεν μπορείς να γράψεις τώρα», και είναι αυτό που ο υπάλληλος μπορεί να διορθώσει διαλέγοντας άλλη ημερομηνία. Υπάρχει test που παραβιάζει **και τους δύο** κανόνες και απαιτεί το μήνυμα του κλειδώματος.

**ΣΤ. `reactivate` σε ήδη ενεργό → 200 no-op· `reset-setup-code` σε ενεργοποιημένο → 409.** Δεν είναι ασυνέπεια: το πρώτο είναι πραγματικά no-op (το κουμπί εμφανίζεται μόνο σε απενεργοποιημένη γραμμή, άρα μόνο double-click φτάνει εκεί, και «είναι ενεργός» είναι το ζητούμενο). Το δεύτερο θα **έγραφε νέο μυστικό** σε λογαριασμό που δεν το χρειάζεται.

**Ζ. `ErrorCode` στο frontend = χειρόγραφο string-literal union** στο `messages.ts`, με `Record<ErrorCode, string>` για exhaustiveness. Όχι shared package (θα ήταν αλλαγή build tooling για δύο projects με χωριστά tsconfig/deps). **Δεν χτίστηκε εδώ — είναι Step 9.**

### 🔴 Εύρημα: το `setupCodeExpiresAt` δεν επέστρεφε πουθενά

Το `UserResponseDto` είχε `setupCode` αλλά **όχι** τη λήξη του, ενώ το build-plan §13 το κάνει render **δύο φορές**: «Valid until 29 August» στον διάλογο μετά τη δημιουργία, **και** σε κάθε pending γραμμή ώστε ο admin να δει κάποιον που λήγει. Ίδια οικογένεια με το critical του Step 2 (`setupCode` που ο mockup έκανε render χωρίς να το δίνει το API), με το `?cycle=` του Step 4 και το `userId` του Step 5. Προστέθηκε **μόνο** στο admin-facing DTO — ποτέ στο `UserProfileDto` (invariant: κανένα DTO πάνω από trust boundary), με test και για τις δύο πλευρές.

### Πώς λύθηκε το ότι το rule 5 έσπαγε τα e2e fixtures

Δύο εργαλεία, όχι ένα, επειδή τα fixtures είναι δύο ειδών:

1. **`seedShift(server, adminToken, userId, …)`** — νέος helper που γράφει **ως admin**. Για βάρδιες που είναι *δεδομένα* και όχι ισχυρισμός για το ποιος επιτρέπεται να τις γράψει. Ο admin δεν έχει όριο κύκλου **εξ ορισμού**, άρα το fixture γίνεται άτρωτο στο ημερολόγιο. Μεταφέρθηκαν και οι 9 κλήσεις του `payroll.e2e-spec.ts` (τα cycle keys εκεί είναι hardcoded στους ισχυρισμούς, άρα οι ημερομηνίες **πρέπει** να μείνουν σταθερές) και η split βάρδια του `time-entries.e2e-spec.ts`.
2. **Το `MON` του `time-entries.e2e-spec.ts` υπολογίζεται πλέον ανά run** — η μέρα **πριν** ανοίξει ο τρέχων κύκλος, διαβασμένη από το `cycleStart` της απάντησης του API. Είναι μέσα στον προηγούμενο κύκλο εξ ορισμού (οι κύκλοι είναι contiguous), άρα ταυτόχρονα writable **και** στο παρελθόν — τα δύο που απαιτούν τα rules 4 και 5 μαζί. Εκεί τα tests **αφορούν** τον employee write path, οπότε δεν γίνεται να γραφτούν ως admin.

⚠️ **Κανόνας που προκύπτει και ισχύει από εδώ και πέρα:** σε e2e, ένα literal cycle key ή μια literal ημερομηνία επιτρέπεται **μόνο** όταν είναι admin-written ή όταν ο ισχυρισμός αφορά εκείνη ακριβώς την ημερομηνία. Ό,τι εννοεί «τώρα» / «ο τρέχων κύκλος» / «κάτι που μπορώ να γράψω» **ρωτιέται από το API**.

### ⭐ Spike — τα νέα tests αποδείχθηκαν μη κενά

Αφαιρέθηκε ο έλεγχος `assertWritableCycle` **μόνο** από το `remove()`:
- **unit: 1 failed / 61** (`refuses an employee deleting from a closed cycle`)
- **e2e: 1 failed / 35** (`refuses an employee editing or deleting a row in a closed cycle`)

Επαναφέρθηκε· `grep SPIKE` → 0, 195/195 unit ξανά πράσινα.

### Τι ΔΕΝ έγινε, σκόπιμα

- **Οι κανόνες 2 και 4 (end-before-start, μελλοντικό timestamp) παραμένουν στο `ValidationPipe` και ΔΕΝ αποκτούν κωδικό.** Συνέπεια που πρέπει να ξέρει το Step 9: από τις «τέσσερις σημασίες του 400 στο `POST /time-entries`» που επικαλείται το §8c ως αιτιολόγηση, οι **δύο** δεν είναι προσβάσιμες μέσω `code`. Δεν ανατρέπει την απόφαση — τα `OPEN_SHIFT_EXISTS` και `SHIFT_OVERLAP` είναι service-thrown και είναι ακριβώς αυτά που έπρεπε να ξεχωρίσουν, ενώ το frontend πιάνει τα άλλα δύο με zod πριν φύγει request — αλλά η πρόταση στο build-plan υπερέβαλλε και διορθώθηκε.
- Καμία αλλαγή σε υπάρχον status code, μήνυμα ή πεδίο απάντησης.
- Το Swagger τεκμηριώνει τους κωδικούς **στο κείμενο** του `@ApiResponse` ανά operation, όχι ως shared schema — «η ουσία του RFC 9457 χωρίς την τελετουργία του».

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npx tsc --noEmit` καθαρό, `npm run lint` καθαρό, **195/195 unit**, **94/94 e2e** σε πραγματική `swifttrack_test`. Ο spike τρέχτηκε και επαναφέρθηκε.

### `/review` στο τέλος του 8c — 6 ευρήματα (2 Important, 4 Minor)

Κανένα δεν ήταν bug στη συμπεριφορά που παραδόθηκε.

**Κλείστηκε:** 🟠 **το `canWrite` είχε δεύτερο όριο που δεν προβλεπόταν στο πλάνο και δεν το άγγιζε κανένα test.** Πέρα από «όχι πριν το παράθυρο», επιστρέφει `false` και για κύκλο **που δεν έχει αρχίσει** — γιατί το rule 4 απαγορεύει μελλοντικά timestamps, άρα το ▶ οδηγεί σε κύκλο όπου κάθε τιμή της φόρμας θα απορριφθεί από `ValidationPipe` 400 **χωρίς κωδικό** να το εξηγήσει. Το υπάρχον test μετακινούσε το κατώφλι, οπότε δοκίμαζε **δύο φορές το κάτω όριο και ποτέ το πάνω**. Προστέθηκαν: unit (fake timers στην 1η Ιουλίου, όπου μόνο το πάνω όριο μπορεί να αποφασίσει) + assertion στο e2e μέσω `nextCycle`. **Spike**: αφαίρεση του ορίου → **1 unit + 1 e2e κόκκινα**· επαναφορά, `grep SPIKE` → 0.

**Κλείστηκαν αργότερα στην ίδια session:** 🟠 **οι κωδικοί τεκμηριώθηκαν σε 11 operations** (όχι 8 — το review είχε μετρήσει λάθος και είχε παραλείψει τα 404 των `POST`/`PUT`/`DELETE /time-entries`). Γράφτηκε audit που διαβάζει το `ErrorCode` από την πηγή και ελέγχει το **παραγόμενο** `/api-json`: **17/17 κωδικοί προσβάσιμοι**. Το audit βρήκε και δικό μου λάθος που κανένα grep στον κώδικα δεν θα έδειχνε — το `PUT /time-entries/{id}` δήλωνε `USER_ID_REQUIRED`/`USER_ID_NOT_ALLOWED`, που **δεν μπορεί να επιστρέψει** (το `userId` δεν υπάρχει στο update DTO)· είχε μπει από ένα `replace_all`. Νέο invariant στο architecture.md. 🟡 **Η διπλή ανάγνωση του `AppSettings` έφυγε**: το `resolveCycleRange` επιστρέφει πλέον και `writableFrom` από την **ίδια** ανάγνωση — δεν είναι μόνο query, δύο αναγνώσεις μπορούν να **διαφωνήσουν** αν πέσει `PUT /settings` ανάμεσά τους. 🟡 **Το `Date.now()` έφυγε από το `TimeEntriesService`**: το `resolveCycleRange` επιστρέφει `hasStarted`, και το `computeWritableFrom` παίρνει `now` ως όρισμα — μία ανάγνωση ρολογιού ανά επίλυση κύκλου, ώστε τα τρία παράγωγα να μη μπορούν να διαφωνήσουν. Τα tests της αριθμητικής μετακόμισαν στο `settings.service.spec.ts` όπου ζει πλέον η λογική· spike και στα δύο.

### ⏸️ Εύρημα 4 — παρκαρίστηκε ΣΤΟ STEP 11, όχι «για μετά»

**Το εύρημα είναι μεγαλύτερο απ' ό,τι το έγραψε το review**: **και τα δύο** flags αγνοούν το open-shift block, όχι μόνο το `canEdit`. Δηλαδή ο clocked-in υπάλληλος βλέπει **και** το «Add Shift» ενεργό και παίρνει `OPEN_SHIFT_EXISTS` — ακριβώς η αποτυχία που το `canWrite` επινοήθηκε να αποτρέψει, για άλλον λόγο.

Δεν διορθώνεται με flag: το `DELETE` είναι **σκόπιμα εξαιρεμένο** από το block, και κανένα per-row boolean δεν λέει «Edit όχι, Delete ναι». Η διόρθωση είναι **προϊοντική απόφαση** — να γίνει ο κανόνας ενιαίος («ανοιχτή βάρδια = δεν αλλάζεις τίποτα»), που κλείνει την εξαίρεση του `DELETE`.

Επαληθεύτηκε ότι **δεν δημιουργεί αδιέξοδο**: το clock-out δεν μπλοκάρεται ποτέ, και ανοιχτή βάρδια παλαιότερη του παραθύρου είναι ήδη κλειδωμένη από το rule 5 έτσι κι αλλιώς. Το πλήρες σκεπτικό και οι δύο επιλογές γράφτηκαν στο **build-plan §11**, εκεί που χτίζεται ο `ShiftList` — αν αποφασιστεί τότε, παραμένει **μονόπλευρη** αλλαγή, γιατί το component γράφεται εκείνη τη στιγμή ούτως ή άλλως.

### Εύρημα 5 — έκλεισε ως απόφαση, χωρίς αλλαγή backend

Το `ACCOUNT_ALREADY_ACTIVATED` πετιέται σε **δύο διαφορετικά κοινά** με το ίδιο κείμενο λέξη προς λέξη: στον υπάλληλο για τον **εαυτό του** (`set-initial-password` → σωστή αντίδραση: πήγαινέ τον στο `/login`) και στον admin για **τρίτον** (`reset-setup-code` → σωστή αντίδραση: η λίστα του είναι μπαγιάτικη, ανανέωσέ την).

**Ο backend δεν κάνει λάθος** — το γεγονός είναι όντως το ίδιο, και ο κανόνας του `error-codes.ts` λέει σωστά να μοιράζονται κωδικό. Αυτό που αλλάζει είναι το **κοινό**, όχι το γεγονός, άρα είναι θέμα του client.

**Ο πραγματικός κίνδυνος δεν είναι αδέξιο μήνυμα**: είναι ότι το Step 13, μη βρίσκοντας πού να βάλει τη διατύπωση του admin, θα γράψει inline string στο JSX και θα σπάσει το invariant «κάθε κείμενο από το `messages.ts`». Γι' αυτό καταγράφηκε στο **build-plan §9**, εκεί που γράφεται το `messages.ts`, με ρητή απαίτηση να προβλεφθεί per-screen override ή διάσπαση του κωδικού — **τότε**, όχι στο §13. Και στο invariant του `architecture.md`, ώστε να μη διαβαστεί το `Record<ErrorCode, string>` ως εντολή για αυστηρά επίπεδο χάρτη.

Καταγράφηκε επίσης η γενική αρχή, γιατί επανέρχεται: **η σελίδα ξέρει πάντα ποιο request έστειλε.** Ο κωδικός χρειάζεται για να ξεχωρίσεις αποτυχίες **μιας** κλήσης, ποτέ για να ξεχωρίσεις **ποια** κλήση απέτυχε — το ίδιο ισχύει για τα `OPEN_SHIFT_EXISTS`/`NO_OPEN_SHIFT` του Clock page.

**Παραμένει ανοιχτό (1):** μόνο το Εύρημα 4, παρκαρισμένο στο §11 (παραπάνω).

### ✅ Το χειροκίνητο πέρασμα ΕΓΙΝΕ — 41 έλεγχοι σε dev server + dev βάση

Δεν είναι τα e2e: εκείνα τρέχουν σε Nest testing harness και στη `swifttrack_test`. Εδώ μίλησα με HTTP στον **ίδιο dev server που θα χρησιμοποιούσε άνθρωπος** και στην **dev βάση**.

Επαληθεύτηκαν, όλα πράσινα: `setupCodeExpiresAt` σε `POST`/`GET /users` και **η απουσία του** από το `/users/me`· ο reissued κωδικός **σκοτώνει τον παλιό** και όντως ενεργοποιεί τον λογαριασμό, 409 μετά, 404 σε ADMIN· μετά το `DELETE` πεθαίνει **και το ήδη εκδομένο token**, και το `reactivate` το επαναφέρει· `CYCLE_LOCKED` και στις τρεις γραφές **και στις δύο κατευθύνσεις του `PUT`**, με τον ADMIN να περνά· `canWrite` false σε κλειστό **και** σε μη-αρχισμένο κύκλο· το payroll response χωρίς `canWrite`. Το σώμα σφάλματος επιβεβαιώθηκε ζωντανά: `{"statusCode":400,"code":"CYCLE_LOCKED","message":"That pay cycle is closed…"}`.

**Καθαρισμός επαληθευμένος** (όχι δηλωμένος): 6 χρήστες — admin + οι 5 του demo seed —, **0 εγγραφές δημιουργημένες σήμερα**, `max(TimeEntry.id)` = 644 ενώ η δική μου ήταν 645.

⚠️ **Έβδομο σφάλμα μέτρησης του project, έβδομο στα επτά που ήταν του probe και όχι του κώδικα.** Ο έλεγχος έφτιαχνε βάρδια την **παραμονή** του τρέχοντος κύκλου (για να είναι σίγουρα στο παρελθόν) και μετά την έψαχνε **στον τρέχοντα** κύκλο — όπου εξ ορισμού δεν μπορούσε να είναι. Αντέφασκε με το ίδιο του το setup· στον σωστό κύκλο εμφανιζόταν κανονικά με `canEdit=true`.

### Τελική κατάσταση

`tsc` καθαρό, `lint` καθαρό, **196/196 unit**, **94/94 e2e**, 41/41 χειροκίνητοι έλεγχοι σε πραγματικό server.

**Επόμενο βήμα**: **Step 9** — Auth & Layout (frontend). Το backend είναι κλειστό.

## Προετοιμασία εξαρτήσεων για το Step 9
Status: ✅ Done · **δεν είναι βήμα του build-plan** — προεργασία, κανένας κώδικας εφαρμογής δεν γράφτηκε
Ημερομηνία: 2026-08-28
Αρχεία που προστέθηκαν/άλλαξαν:
- `frontend/package.json` + lockfile — `zod@^4.5.1`, `react-hook-form@^7.86.0`, `@hookform/resolvers@^5.9.1` (dependencies), `vitest@^4.1.11` (dev)
- `frontend/src/components/ui/` — **5 νέα**: `field.tsx`, `select.tsx`, `switch.tsx`, `separator.tsx`, `alert-dialog.tsx`
- `context/architecture.md` — Stack Trap #1 (το `Form` που δεν υπάρχει), Stack Trap #3 (ξαναγράφτηκε με μετρήσεις), «Four» → «Five»
- `context/build-plan.md` — §9 (`Form` → `Field` + απαγόρευση `z.coerce`), § frontend preamble (τι εγκαταστάθηκε, απόφαση MCP), §14 (το `.mcp.json` έκλεισε ως απόφαση)

### Επαλήθευση εκδόσεων πριν την εγκατάσταση

Όλες από το **npm registry**, όχι από blog posts — και σωστά, γιατί ένα αποτέλεσμα αναζήτησης ισχυριζόταν *«react-hook-form v8 με @hookform/resolvers v4+»*, που **δεν υπάρχει**. Peer checks: rhf → `react ^19` ✅ (έχουμε 19.2.7)· resolvers → `zod ^4.0` + `rhf ^7.55` ✅· vitest → `vite ^6||^7||^8` ✅ (Vite 8.1.1), `node ^22` ✅ (22.14.0), `@types/node >=24` ✅ (^26.1.2).

**`npm audit`: 5 ευπάθειες πριν, 5 μετά.** Δεν εισήχθη καμία. Ίχνη: `shadcn` (μέσω `cosmiconfig`/`postcss`/`@modelcontextprotocol/sdk`/`@dotenvx/dotenvx`) και `eslint`. Η μόνη αμφίβολη (`fast-uri` μέσω `ajv`, που το `@hookform/resolvers` δηλώνει `peerOptional`) ελέγχθηκε με `git show HEAD:frontend/package-lock.json` — **και τα δύο προϋπήρχαν** στο committed lockfile.

### 🔴 Το `shadcn Form` ΔΕΝ υπάρχει στο `base-nova`

`base-nova/form.json` = `{ "$schema": …, "name": "form", "type": "registry:ui" }` — **0 αρχεία**. Τα Radix styles (`new-york`, `default`) το έχουν κανονικά, με `@radix-ui/react-label`, `@radix-ui/react-slot`, `zod`, `react-hook-form`. Δηλαδή `npx shadcn add form` = **σιωπηλό no-op** (exit 0, κανένα αρχείο), και όποιο tutorial προσφέρει `<FormField>` περιγράφει Radix — η αντιγραφή του θα έσερνε `@radix-ui/*` σε project με **μηδέν** Radix πακέτα.

Αντικαταστάτης: **`field`**, presentational μόνο. Το `FieldError` δέχεται `errors?: Array<{ message?: string }>` — ακριβώς το σχήμα του rhf, άρα `<FieldError errors={[errors.x]} />` δουλεύει άμεσα. **Το δέσιμο γράφεται στο χέρι στο Step 9 και το αντιγράφουν οι άλλες 4 φόρμες.**

Το `--dry-run` προηγήθηκε της εγγραφής: 5 create, `label`/`button` **skip (identical)** — μηδενικό overwrite. Χρησιμοποιήθηκε το **τοπικό** CLI 4.16.0 (αυτό που έγραψε τα υπάρχοντα 9), όχι το `@latest` 4.19.0.

### 🔬 Smoke test — βρήκε πραγματικό πρόβλημα και το έκλεισε

⚠️ Το `tsc -b`/`lint` μετά την εγκατάσταση ήταν πράσινα **αλλά δεν απεδείκνυαν τίποτα** — κανένα αρχείο στο `src/` δεν κάνει ακόμα import τα νέα πακέτα, άρα ο compiler δεν τα άγγιξε. Γράφτηκε προσωρινό αρχείο, τρέξαμε `tsc -b --force`, **και διαγράφηκε** (επαληθευμένο: `git status` καθαρό πλην των 5 νέων components).

Σε **TypeScript 6.0.3**: `z.object` + `useForm<z.infer<S>>` ✅ · `z.email()` (η μορφή του zod 4) ✅ · `.refine()` cross-field ✅ — δηλαδή το παλιό πρόβλημα «ZodEffects» **δεν** ισχύει πια. Έσπασε **μόνο** το `z.coerce.number()` → `TS2322`, γιατί το coercion κάνει το input type `unknown` ενώ το `z.infer` δίνει το output.

Δύο διορθώσεις, **και οι δύο επαληθεύτηκαν να μεταγλωττίζουν**: (Α) `useForm<z.input<S>, unknown, z.output<S>>`, (Β) *προτιμώμενη* — καθόλου coercion, `z.number()` + `register(..., { valueAsNumber: true })`. Αφορά `SettingsPage` και `EmployeeForm` του Step 13.

### Αποφάσεις

- **`jsdom` / `@testing-library/react` ΔΕΝ εγκαταστάθηκαν** (απόφαση χρήστη). Τα specs του Step 9 (`toIsoUtc`, formatters, `client.ts` με mocked `fetch`) είναι καθαρές συναρτήσεις. Η απόφαση αναβάλλεται για το πρώτο βήμα που θέλει πραγματικά DOM.
- **MCP: ΔΕΝ μπήκε** (απόφαση χρήστη, μετά από αντιπρόταση δική μου). Σκεπτικό στο build-plan· η ουσία είναι ότι το ωμό `form.json` έδειξε `files: 0`, κάτι που ένα φυσικής-γλώσσας στρώμα πιθανότατα θα εξομάλυνε σε «ναι, υπάρχει». Το Playwright MCP παραμένει ανοιχτό για το 13b.

### Τελική κατάσταση

`npx tsc -b` exit 0, `npm run lint` exit 0, `npx vitest --version` → `4.1.11 win32-x64 node-v22.14.0`. **Καμία γραμμή κώδικα εφαρμογής** — το Step 9 ξεκινά από καθαρό σημείο.

## Step 9 — Auth & Layout (frontend)
Status: ✅ Done
Ημερομηνία: 2026-08-29
Αρχεία που προστέθηκαν/άλλαξαν:
- `frontend/.env.example` + `frontend/.env` — **νέα**· `VITE_API_URL`. Το root `.gitignore:5` (`.env`, χωρίς slash → κάθε βάθος) το καλύπτει· επαληθεύτηκε με `git check-ignore -v`
- `frontend/src/vite-env.d.ts` — **νέο**· δηλώνει `VITE_API_URL: string | undefined` (χωρίς αυτό ήταν `any` μέσω του index signature του `vite/client`)
- `frontend/src/api/client.ts`, `api/auth.ts`, `api/users.ts` — **νέα**
- `frontend/src/context/AuthContext.tsx`, `hooks/useApiQuery.ts` — **νέα**
- `frontend/src/components/layout/ProtectedRoute.tsx` (+ `HomeRedirect`), `TimezoneNotice.tsx` — **νέα**
- `frontend/src/lib/datetime.ts` — **νέο**· `frontend/src/lib/messages.ts` — ξαναγράφτηκε
- `frontend/src/App.tsx`, `components/layout/Header.tsx`, `pages/LoginPage.tsx`, `pages/SetInitialPasswordPage.tsx` — ξαναγράφτηκαν
- `frontend/src/lib/datetime.spec.ts`, `api/client.spec.ts` — **νέα** (34 tests)
- `frontend/vite.config.ts` — `defineConfig` από `vitest/config` + `test` block· `frontend/package.json` — `test`/`test:watch` scripts
- `context/build-plan.md` §14 — σημείωση για το `frontend/.env` σε καθαρό clone
Endpoints/Components:
- `api/client.ts` — `request<T>()`, `ApiError{status, code}`, `configureApiClient()`
- `AuthContext` — `{ user, isBootstrapping, bootstrapError, retryBootstrap, sessionExpired, login, logout }`
- `useApiQuery(fetcher, deps)` → `{ data, error, isLoading, refetch }` — **χτίστηκε, δεν έχει ακόμα καταναλωτή** (έρχεται στο Step 10)
- `ProtectedRoute allow="ADMIN"|"EMPLOYEE"` + `HomeRedirect` — ο πίνακας ρόλων του build-plan, ενεργός
- `lib/datetime.ts` — `toIsoUtc`, `formatDate/Time/DateTime`, `getBrowserTimeZone`, `getUtcOffsetMinutes`, `formatUtcOffsetDifference`
- `lib/messages.ts` — `PAGE_TITLES`, `LABELS`, `VALIDATION`, `NOTICES`, `ERRORS`, `errorText(code, screen?)`, `toErrorCode()`

### Οι 3 αποφάσεις που πάρθηκαν μέσω `/architect` πριν τον κώδικα

**Α. `ERRORS` = βασικός χάρτης + per-screen override.** `ERRORS` εξαντλητικός πάνω σε `ErrorCode`, και ξεχωριστός `SCREEN_ERRORS` που συμβουλεύεται πρώτος· μία πόρτα `errorText(code, screen?)`. Λύνει αυτό που το build-plan §9 απαιτούσε να **αποφασιστεί εδώ**: το `ACCOUNT_ALREADY_ACTIVATED` λέγεται στον υπάλληλο για τον εαυτό του (`/activate` → «πήγαινε στο login») και στον admin για τρίτον (Team → «η λίστα σου είναι μπαγιάτικη»). Η μία καταχώρηση του `team` υπάρχει ήδη, καταναλώνεται στο Step 13.

**Β. Το auto-logout φεύγει με callback που δηλώνει το `AuthContext`,** όχι με `window.location`. Το `client.ts` δεν αγγίζει `window` ούτε `localStorage`. Το επιχείρημα που έκρινε: το `jsdom` δεν είναι εγκατεστημένο, άρα σε node-env spec ένα `window.location.assign` θα απαιτούσε `vi.stubGlobal` — και τότε το spec δοκιμάζει το σκηνικό όσο και τον κώδικα.

**Γ. `VITE_API_URL` υποχρεωτικό, χωρίς fallback** — σκάει στο load με μήνυμα που λέει τη διόρθωση. Σκεπτικό: το Vite εκθέτει μόνο `VITE_`-prefixed μεταβλητές, οπότε λάθος όνομα δίνει `undefined`, και fallback ίσο με την πραγματική dev τιμή θα το έκρυβε μέχρι το deploy — το μάθημα του Step 1 σε δεύτερο σημείο. Σημείωση για καθαρό clone γράφτηκε στο **build-plan §14**, δίπλα στο αντίστοιχο `prisma generate`.

### Τρεις αποκλίσεις από το πλάνο, όλες με λόγο

1. **Το `useApiQuery` ΠΑΡΑΓΕΙ το `isLoading`, δεν το αποθηκεύει.** Ο κανόνας `react-hooks/set-state-in-effect` (eslint-plugin-react-hooks 7) απέρριψε το `setIsLoading(true)` στο σώμα του effect: cascading render σε κάθε αλλαγή κύκλου. Τώρα κρατιέται ένα `settled = { key, data, error }` και το `isLoading` είναι `settled?.key !== key`, όπου `key = \`${attempt}|${JSON.stringify(deps)}\``. **Πλευρικό όφελος**: το effect εξαρτάται από ένα string αντί για spread array, οπότε έφυγε και το `exhaustive-deps` disable. Το state γράφεται ακριβώς μία φορά ανά request.
2. **Το `client.ts` διαβάζει το σώμα και μετά αποφασίζει,** αντί να ρωτά `content-length === "0"`. Δύο endpoints επιστρέφουν `Promise<void>` (`set-initial-password`, `DELETE /time-entries/:id`)· αν ο Nest διάλεγε chunked, το `res.json()` θα έσκαγε σε **επιτυχημένη** ενεργοποίηση και ο χρήστης θα έβλεπε «Something went wrong» ενώ ο λογαριασμός του μόλις είχε φτιαχτεί. ⚠️ Το πέρασμα έδειξε ότι ο Nest **όντως** στέλνει `Content-Length: 0` — άρα ο αρχικός έλεγχος θα δούλευε· η αλλαγή στέκει επειδή αφαιρεί την εξάρτηση, όχι επειδή διόρθωσε ζωντανό bug.
3. **`TZ: 'America/St_Johns'` στο vitest config.** ⚠️ Δεν είναι διακοσμητικό: σε μηχάνημα UTC τα datetime specs περνούν ό,τι κι αν κάνει η υλοποίηση — `new Date(v).toISOString()` και append `"Z"` συμφωνούν εκεί, και formatter χωρίς `timeZone:"UTC"` επίσης. Επιλέχθηκε **αρνητικό** (που κάνει το bare `YYYY-MM-DD` να τυπώνεται προηγούμενη μέρα) **και μη ακέραιο** (−3:30, η περίπτωση που το `offset / 60` χαλάει). Αποδείχθηκε ότι εφαρμόζεται: το spike αφαίρεσε το `timeZone:"UTC"` και το test κοκκίνισε.

### Το πρότυπο φόρμας γράφτηκε στο χέρι — και οι 4 επόμενες το αντιγράφουν

Δεν υπάρχει `<Form>`/`<FormField>` στο `base-nova` (Stack Trap #1). Το `LoginPage` είναι η κανονική αναφορά: `useForm` + `zodResolver` + `Field`/`FieldLabel`/`FieldError`, με `<FieldError errors={[errors.x]} />` που δέχεται απευθείας το σχήμα του rhf. Field-level σφάλματα κάτω από το πεδίο, request-level πάνω από το submit. Καθόλου `z.coerce`. Το `z.email(params?: string | $ZodEmailParams)` επιβεβαιώθηκε **στα types του εγκατεστημένου zod 4.5.1**, όχι από μνήμη — δέχεται σκέτο string ως μήνυμα.

### Το χειροκίνητο πέρασμα — 13 έλεγχοι HTTP σε πραγματικό dev server + dev βάση

Δεν είναι τα vitest: εκείνα έχουν mocked `fetch`. Εδώ μίλησα με `curl` στον ίδιο server που θα χρησιμοποιούσε άνθρωπος.

Επαληθεύτηκαν: **CORS** `Access-Control-Allow-Origin: http://localhost:5173` σε POST **και** σε authenticated GET· το σώμα σφάλματος κουβαλά `code` εκεί ακριβώς που το διαβάζει ο client (`{"statusCode":401,"code":"INVALID_CREDENTIALS",…}`)· `LoginResponse` = `{accessToken, user}` με το `user` **χωρίς** `setupCode`· `UserProfile` = `{id,name,email,role,hourlyRate}` ακριβώς· login ADMIN **και** EMPLOYEE· ενεργοποίηση end-to-end (**HTTP 200, σώμα 0 bytes, `Content-Length: 0` παρόν**)· `ACCOUNT_ALREADY_ACTIVATED` 409 σε επανάληψη.

⚠️ **Δύο ευρήματα για το σχήμα σφαλμάτων που πρέπει να ξέρουν τα επόμενα βήματα:**
- **Το 401 του guard δεν έχει `code`** (`{"message":"Unauthorized","statusCode":401}`). Δεν πειράζει: το auto-logout κρίνεται από «401 + στάλθηκε header», ποτέ από τον κωδικό — δηλαδή δουλεύει ακριβώς εκεί που κωδικός δεν υπάρχει.
- **Ούτε το 403 του `RolesGuard` έχει `code`** (`{"message":"Forbidden resource",…}`) → υποβαθμίζεται σε `UNKNOWN_ERROR` («Something went wrong»). **Δεν διορθώθηκε σκόπιμα**: το `ProtectedRoute` μπλοκάρει πριν φύγει τέτοιο request, άρα δεν φτάνει σε χρήστη. Αν κάποτε φτάσει, το μήνυμα θα είναι αόριστο.

**Καθαρισμός επαληθευμένος, όχι δηλωμένος**: δημιουργήθηκε πρόσκαιρος υπάλληλος (`step9.probe@`), ενεργοποιήθηκε, και η γραμμή σβήστηκε με `DELETE FROM "User"` (το `DELETE /users/:id` είναι soft — θα άφηνε υπόλειμμα). 7 → 6 γραμμές, `DELETE 1`. Τα demo δεδομένα άθικτα: η `sigridur@demo.local` παραμένει pending με κωδικό 2371, ο `kristjan@demo.local` απενεργοποιημένος.

### ⭐ Spike — τα tests αποδείχθηκαν μη κενά, δύο φορές

**Πρώτο πέρασμα** (3 σκόπιμες βλάβες μαζί): `toIsoUtc` → `new Date().toISOString()`, αφαίρεση του `timeZone:"UTC"` από τον date formatter, αφαίρεση της συνθήκης `sentAuthHeader` από τον κανόνα του 401 → **8 κόκκινα** στα σωστά tests. **Δεύτερο** (μετά το `/review`): αφαίρεση του διαχωρισμού transport/bug στο `catch` του `fetch` → **1 κόκκινο**. Και στις δύο περιπτώσεις επαναφορά, `grep SPIKE` → 0.

### `/review` στο τέλος του Step 9 — 9 ευρήματα (2 Important, 7 Minor)

**Διορθώθηκαν (6):**

1. 🟠 **Το `configureApiClient` στηριζόταν σε σειρά effects που δεν ισχύει.** Ο σχολιασμός έλεγε «effects run in declaration order» — αληθές **μέσα** στο component, ψευδές απέναντι στα **παιδιά**, των οποίων τα effects τρέχουν **πρώτα**. Ο `AuthProvider` είναι γονέας κάθε σελίδας, άρα η πρώτη σελίδα που θα έκανε fetch σε πρώτο commit θα έστελνε request **χωρίς `Authorization`** — και επειδή δεν στάλθηκε header, ούτε auto-logout. Δεν ήταν ζωντανό (στο πρώτο commit είτε δεν γίνεται render σελίδα, είτε είναι το `/login`, που δεν κάνει request), αλλά ήταν παγίδα για τα Steps 10-13. **Λύση**: η ρύθμιση έφυγε σε **module scope** του `AuthContext.tsx`· το token ζει σε module μεταβλητή (όχι ref) και ο handler του 401 **σβήνει το token μέσα στο module**, ώστε να συμβαίνει είτε υπάρχει mounted provider είτε όχι. Από τη React δηλώνεται μόνο το μισό που αφορά UI (το banner).
2. 🟠 **Αποτυχία boot που δεν ήταν 401 ούτε network αποτύγχανε σιωπηλά.** Το `catch` έθετε `bootstrapError` μόνο για `status === 0`· ένα 500 ή 403 στο `GET /users/me` προσγείωνε τον χρήστη στο `/login` **χωρίς μήνυμα**, με το token να μένει στο storage. Τώρα αναδεικνύεται οτιδήποτε δεν είναι 401.
3. 🟡 Η οθόνη σφάλματος boot **κλείδωνε έξω από το `/login`**: με stale token και backend εκτός, δεν υπήρχε ούτε αποσύνδεση ούτε πρόσβαση στη φόρμα. Προστέθηκε **Log out** δίπλα στο Retry, και το `logout()` καθαρίζει `bootstrapError`/`isBootstrapping`.
4. 🟡 Το `catch` γύρω από το `fetch` χαρακτήριζε **τα πάντα** `NETWORK_ERROR`. Τώρα μόνο `TypeError` και `TimeoutError`· οτιδήποτε άλλο ξαναπετιέται ως έχει (bug του client δεν πρέπει να έρχεται ντυμένο «check your connection»). Επιπλέον το `VITE_API_URL` ελέγχεται με `new URL()` στο load.
5. 🟡 `ERRORS` → `as const satisfies Record<ErrorCode, string>`: read-only, αφού είναι **και** η runtime πηγή αλήθειας του `toErrorCode` (μέσω `Object.hasOwn`, όχι `in` — ώστε `"toString"` να μη θεωρείται κωδικός).
6. 🟡 Νεκρή συνθήκη `sessionExpired && failure === null` στο `LoginPage` — το `login()` καθαρίζει ήδη το `sessionExpired` σε κάθε προσπάθεια.

**Έκλεισαν ως αποδεκτά (2), απόφαση του χρήστη:**
- Η **οθόνη επιτυχίας μετά την ενεργοποίηση** (`NOTICES.accountActivated` + κουμπί Sign in) χτίστηκε χωρίς να είναι στο πλάνο — το πλάνο δεν λέει τι γίνεται μετά από επιτυχές `set-initial-password`. Κρατήθηκε: χωρίς αυτήν η φόρμα απλώς αδειάζει και δεν φαίνεται ότι πέτυχε.
- Η **διαγραφή του `MESSAGES`** από το `messages.ts` (μηδέν importers, και το περιεχόμενό του το αντικαθιστά ο χάρτης κωδικών).

### Συνέπεια που εισήγαγε η διόρθωση Νο1 — να μην εκπλαγεί το Step που θα βάλει jsdom

Το `AuthContext.tsx` διαβάζει πλέον `localStorage` **στο import** (module scope). Στον browser είναι σωστό· σημαίνει όμως ότι το module **δεν μπορεί να γίνει import σε node-env test χωρίς stub**. Κανένα test δεν το κάνει σήμερα.

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npx tsc -b` καθαρό, `npm run lint` καθαρό, **34/34 vitest**, 13/13 χειροκίνητοι έλεγχοι HTTP, spike ×2 με επαναφορά.

⚠️ **`tsc` έπιασε δύο πράγματα που ούτε το vitest ούτε το lint είδαν** — τα spec files τυποελέγχονται κι αυτά (`include: ["src"]`): `ReturnType<typeof vi.fn>` δεν είναι καλέσιμο (χρειάστηκε `Mock<() => void>`), και το `erasableSyntaxOnly: true` απαγορεύει parameter properties, άρα η `ApiError` γράφει τα πεδία της ρητά.

### ⚠️ Ανοιχτά που κληροδοτεί το βήμα

1. **Καμία ροή browser δεν έχει επαληθευτεί.** Φόρμα login και redirect ανά ρόλο, refresh που κρατά τη συνεδρία, `ProtectedRoute`, banner μετά από auto-logout — όλα ανεπαλήθευτα. Δεν υπάρχει Playwright ούτε MCP· είναι δουλειά του **Step 13b**, ή χειροκίνητη.
2. **Ο dev server του frontend θέλει restart** αν έτρεχε πριν δημιουργηθεί το `frontend/.env` — αλλιώς λευκή σελίδα με `VITE_API_URL is not set…`. Αυτό είναι ο σχεδιασμός να δουλεύει, όχι bug.
3. **Το `useApiQuery` δεν έχει test ούτε καταναλωτή** — και τα δύο έρχονται στο Step 10.
4. Το **403 χωρίς `code`** (βλ. παραπάνω).

**Επόμενο βήμα**: **Step 10** — Clock Page (EMPLOYEE only). Ο πρώτος καταναλωτής του `useApiQuery`· διαγράφεται το `MonthSummary.tsx`. *(Ολοκληρώθηκε — βλ. την επόμενη ενότητα.)*

## Step 10 — Clock Page (frontend)
Status: ✅ Done
Ημερομηνία: 2026-08-29
Αρχεία που προστέθηκαν/άλλαξαν:
- `frontend/src/api/timeEntries.ts` — **νέο**· `getOpenShift`, `clockIn`, `clockOut` + τύποι `TimeEntry`/`OpenShiftResponse`. Σκόπιμα **μόνο** το clock: list/create/update/delete έρχονται στο Step 11
- `frontend/src/components/clock/ClockButton.tsx` — ξαναγράφτηκε (ήταν local toggle χωρίς backend)
- `frontend/src/pages/ClockPage.tsx` — αποσυνδέθηκε από `@/mocks/data`· έμεινε τίτλος + κουμπί
- `frontend/src/components/clock/MonthSummary.tsx` — **διαγράφηκε**
- `frontend/src/lib/messages.ts` — `NOTICES.clockedInSince` (template) + `LABELS.loading`
- `frontend/src/test/deferred.ts` — **νέο**· κοινός test helper (από το `/review`)
- `frontend/src/hooks/useApiQuery.spec.ts` (6 tests) + `frontend/src/components/clock/ClockButton.spec.tsx` (7 tests) — **νέα**, τα πρώτα DOM tests του project
- `frontend/vite.config.ts` — `fileParallelism: false` (βλ. «λάθος μέτρησης» παρακάτω)
- `frontend/package.json` — devDeps: `jsdom@29.1.1`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.1`
- `context/swifttrack-phase1-final.md` — §8 γραμμή 2 (Clock page) + §8a client-owned copy
- `context/build-plan.md` — §10 ξαναγράφτηκε, § preamble (οι deps δεν είναι πλέον «not installed»)
- `context/architecture.md` — invariant εξαρτήσεων + § Data Flow (Clock In/Out)
Endpoints/Components:
- `ClockButton` — τρεις καταστάσεις: placeholder όσο φορτώνει, σφάλμα+Retry σε αποτυχία, κουμπί όταν η κατάσταση είναι γνωστή
- `ClockPage` — EMPLOYEE only μέσω `ProtectedRoute` (από Step 9)
- Πρώτος καταναλωτής του `useApiQuery`, το οποίο μέχρι τώρα δεν είχε **ούτε test ούτε χρήστη**

### Οι 5 αποφάσεις που πάρθηκαν μέσω `/architect` πριν τον κώδικα

**Α. jsdom + Testing Library, tests και στα δύο επίπεδα.** Το `useApiQuery` το δικαιολογεί (κοινό primitive για τα Steps 11-13, και η out-of-order λογική του παράγει λάθος νούμερα που δείχνουν σωστά)· το `ClockButton` το δικαιολογεί λιγότερο — η αξία του είναι ότι **αποδεικνύει το harness** πάνω σε κάτι με δύο καταστάσεις, πριν το Step 11 το στρέψει σε dialog form. Το project έχει πέντε καταγεγραμμένα λάθη μέτρησης και όλα ήταν το harness· αυτό το επιχείρημα δικαιώθηκε αμέσως (βλ. παρακάτω).

**Β. Μία γραμμή με το `startTime` κάτω από το κουμπί**, μόνο όταν υπάρχει ανοιχτή βάρδια. ⚠️ Αυτό **τροποποιεί** το «η σελίδα είναι το κουμπί και τίποτε άλλο» του build-plan, και το όριο καταγράφηκε ρητά εκεί: η φράση γράφτηκε για να σκοτώσει το `MonthSummary`, δηλαδή τη **λάθος αριθμητική**, όχι για να απαγορεύσει την εκτύπωση πεδίου που ήδη υπάρχει στο payload. Ο κανόνας που επιβιώνει είναι *καθόλου ώρες, καθόλου χρήματα, καθόλου λίστα*. Δείχνει **ημερομηνία**: ένα «Clock Out» από μόνο του δεν ξεχωρίζει το «είμαι σε βάρδια» από το «ξέχασα να κλείσω προχθές».

**Γ. Όσο η κατάσταση είναι άγνωστη, δεν εμφανίζεται κουμπί.** Placeholder όσο φορτώνει, μήνυμα + Retry σε αποτυχία. Το επιχείρημα: ένα κουμπί **πρέπει** να τυπώσει ετικέτα, και το «Clock In» σε κάποιον ήδη μέσα είναι ακριβώς η αποτυχία που το `GET /time-entries/open` υπάρχει για να αποτρέψει — άρα αποσύρεται, δεν απενεργοποιείται.

**Δ. `refetch()` μετά από κάθε προσπάθεια, επιτυχία ή αποτυχία.** Ένας κανόνας αντί για λίστα κωδικών — ίδιο σκεπτικό με τον διαχωριστή του auto-logout στο `client.ts`. Καλύπτει δύο πράγματα: τα `OPEN_SHIFT_EXISTS`/`NO_OPEN_SHIFT` σημαίνουν μπαγιάτικη ετικέτα (δεύτερο tab, clock-in από κινητό) και χωρίς refetch ο χρήστης ξαναπατάει το ίδιο λάθος κουμπί επ' άπειρον· και μετά από **timeout** είναι ο μόνος τρόπος να μάθουμε αν το γράψιμο προσγειώθηκε.

**Ε. Καμία επιπλέον επιβεβαίωση — χωρίς toast.** Ο χρήστης ρώτησε ρητά αν χρειάζεται. Απάντηση: το clock-in αλλάζει **δύο πράγματα ταυτόχρονα** (κείμενο+χρώμα κουμπιού, και η γραμμή που εμφανίζεται εκεί που δεν υπήρχε τίποτα), άρα η επιβεβαίωση είναι δομική και **μόνιμη**, ενώ το toast ζει 4 δευτερόλεπτα. Η μία καταγεγραμμένη θυρίδα εξαίρεσης του κανόνα «no toast library» μένει για το `ShiftForm` του Step 11, όπου αποθήκευση σε γειτονικό κύκλο δεν αλλάζει **απολύτως τίποτα** στην οθόνη.

### ⚠️ Έκτο λάθος μέτρησης του project — και πάλι το harness

Στο **πρώτο** τρέξιμο μετά την εγκατάσταση, τα δύο νέα spec files **δεν ξεκίνησαν καν worker**: `[vitest-pool]: Failed to start forks worker … Timeout waiting for worker to respond`. Τα δύο παλιά πέρασαν κανονικά, οπότε η σύνοψη έγραφε «2 passed / 34 tests» — **πράσινο run που είχε σιωπηλά παραλείψει ό,τι μόλις είχε γραφτεί**. Ακριβώς το μοτίβο που το project έχει ξαναδεί πέντε φορές.

Αιτία: το jsdom κοστίζει ~9s environment setup ανά worker, και τέσσερις παράλληλοι forks χτυπούσαν το εσωτερικό όριο εκκίνησης (60s). Το Vitest **δεν εκθέτει** ρύθμιση γι' αυτή την αναμονή (επιβεβαιώθηκε στα επίσημα docs, δεν μαντεύτηκε), οπότε ο μοχλός είναι ο ίδιος ο ανταγωνισμός: `fileParallelism: false`. Είναι και **ταχύτερο** — 16s όλο το suite, έναντι 60s που έκαιγε το παράλληλο πριν αποτύχει. ⚠️ Καθώς το suite μεγαλώνει στα Steps 11-13 η σχέση μπορεί να αντιστραφεί· τότε ξανασυζητιέται.

### jsdom 29 και όχι 30 — από μέτρηση, όχι προτίμηση

Το jsdom 30 απαιτεί Node `^22.22.2 || ^24.15.0 || >=26`· το μηχάνημα τρέχει **22.14.0**. Το 29.1.1 ζητά `^22.13.0`. Ελέγχθηκε με `npm view … engines` πριν την εγκατάσταση, όπως επιβάλλει η Third-Party Library Policy. Επίσης: το DOM δηλώνεται **ανά αρχείο** (`// @vitest-environment jsdom`) ώστε τα υπάρχοντα node-env specs να μην αγγιχτούν, και το `globals: true` **δεν** ενεργοποιήθηκε (είναι αυτό από το οποίο εξαρτάται το auto-cleanup του RTL — κάθε DOM spec καλεί μόνο του `cleanup()`). Το `@testing-library/jest-dom` δεν μπήκε: οι matchers του (`toBeDisabled`, `toHaveTextContent`) είναι μία γραμμή σκέτου DOM ο καθένας.

`npm audit`: 5 ευρήματα (1 moderate, 4 high) — **όλα προϋπάρχοντα**, από `eslint`, `@hookform/resolvers` και το `shadcn` CLI. Καμία από τις τρεις νέες εξαρτήσεις δεν εισήγαγε κάτι· επαληθεύτηκε με `npm ls` ανά πακέτο.

### 🔴 Ένα δικό μου test δεν απεδείκνυε αυτό που ισχυριζόταν

Το «μένει disabled μέχρι να ησυχάσει το refetch» έλεγχε το `disabled` **όσο έτρεχε ακόμα το write** — όπου το κουμπί είναι disabled ούτως ή άλλως, άρα η απόφαση Γ/Δ δεν δοκιμαζόταν καθόλου. Ξαναγράφτηκε με **δύο ξεχωριστά ελεγχόμενα promises** (write και reload), ώστε να πιάνει το πραγματικό παράθυρο: write απαντημένο, refetch σε πτήση, κουμπί με **παλιά** ετικέτα και κλειδωμένο. Το spike το επιβεβαίωσε — με το αρχικό test η βλάβη περνούσε αθόρυβα.

Βρέθηκε **διαβάζοντας τι θα έσπαγε το spike**, όχι τρέχοντας το test. Μάθημα για τα επόμενα βήματα: το «περνάει» ενός test δεν λέει τίποτα για το αν δοκιμάζει τη σωστή στιγμή.

### ⭐ Spike — 4 σκόπιμες βλάβες, 4 κόκκινα στα σωστά tests

Έγιναν μαζί, με αντίγραφα ασφαλείας για ακριβή επαναφορά: (1) το ignore flag του `useApiQuery` δεν σηκώνεται ποτέ, (2) `isBusy` χωρίς το `|| isLoading`, (3) `refetch()` μόνο σε επιτυχία αντί για `finally`, (4) το placeholder branch απενεργοποιημένο. Αποτέλεσμα: **4 failed / 9 passed**, ένα κόκκινο ανά βλάβη, το καθένα στο test που το αφορούσε. Επαναφορά, `grep SPIKE` → 0, 47/47 ξανά.

### Το χειροκίνητο πέρασμα — 7 έλεγχοι σε πραγματικό backend + dev βάση

Με `curl`, όχι vitest (εκεί το api module είναι mocked). Χρήστες από το demo seed: `elin@demo.local` (έχει ανοιχτή βάρδια), `anna@demo.local` (δεν έχει).

Επαληθεύτηκαν: `{"openShift":{…}}` με **ακριβώς** τα πεδία που δηλώνει ο τύπος `TimeEntry`· `{"openShift":null}` με **`Content-Length: 18`** — δηλαδή το wrapper όντως αποτρέπει το άδειο σώμα, μετρημένο και όχι υποτιθέμενο· clock-in → 201· δεύτερο clock-in → 400 με `code: OPEN_SHIFT_EXISTS`· `open` το αναφέρει· clock-out → 200 με `endTime`· δεύτερο clock-out → 400 με `code: NO_OPEN_SHIFT`. Και οι δύο κωδικοί βρίσκονται στο top level του σώματος, εκεί ακριβώς που τους διαβάζει το `readErrorCode` του `client.ts`.

**Καθαρισμός επαληθευμένος, όχι δηλωμένος**: η γραμμή που δημιουργήθηκε (id 909) σβήστηκε με `DELETE /time-entries/909` → 204, και `SELECT count(*) … WHERE id=909` → **0**. Οι ανοιχτές βάρδιες στη βάση: **1** (της Elín, από το seed) — τα demo δεδομένα όπως τα βρήκα.

### `/review` στο τέλος του Step 10 — 6 ευρήματα (2 Important, 4 Minor), 5 διορθώθηκαν

**Διορθώθηκαν:**
1. 🟠 **Το `architecture.md` αντέφασκε με τον κώδικα.** Το invariant «No new frontend dependency without a decision» απαριθμεί τις εγκεκριμένες προσθήκες, και οι τρεις νέες dev deps **δεν ήταν εκεί** — είχα ενημερώσει build-plan και spec και το ξέχασα. Δηλαδή το αρχείο που ένα επόμενο session διαβάζει ως κανόνα έλεγε ότι απαγορεύονται. Προστέθηκαν μαζί με τις τρεις μετρήσεις (jsdom 29, per-file opt-in, όχι `globals`).
2. 🟡 § Data Flow έλεγε `Response → frontend refetches Clock page summary` — το summary διαγράφηκε **σε αυτό ακριβώς το βήμα**. Ξαναγράφτηκε ως refetch του `GET /time-entries/open` μετά από κάθε προσπάθεια.
3. 🟡 **Ασυνέπεια που αποδείχθηκε παραβίαση υπάρχουσας σύμβασης**: το σφάλμα φόρτωσης καλούσε `errorText(error)` χωρίς screen key. Το `LoginPage` περνάει `"login"` παρόλο που **δεν** υπάρχει `login` override — άρα ο κανόνας του project είναι *η σελίδα δηλώνει πάντα το κλειδί της*, ώστε ένα μελλοντικό override να φτάσει σε **όλα** τα call sites. Έγινε `errorText(error, "clock")`.
4. 🟡 Το placeholder ήταν `aria-hidden` χωρίς κείμενο — βουβό σε screen reader. Έγινε `role="status"` με sr-only `LABELS.loading` (σκόπιμα γενικό: τα Steps 11-13 έχουν κι αυτά loading states).
5. 🟡 Ο `deferred` helper ήταν γραμμένος δύο φορές → `src/test/deferred.ts`.

**Έκλεισε ως αποδεκτό (απόφαση του χρήστη):**
- ⚠️ **Επιτυχές γράψιμο με αποτυχημένο refetch διαβάζεται ως αποτυχία.** Οι αποφάσεις Γ και Δ αλληλεπιδρούν: αν το clock-in πετύχει αλλά το refetch από πίσω πέσει σε δίκτυο, το `useApiQuery` καθαρίζει το `data`, το κουμπί **εξαφανίζεται** και μένει κόκκινο «Could not reach the server» — ενώ η βάρδια καταγράφηκε κανονικά. Ο χρήστης μπορεί να ξαναπατήσει και να πάρει `OPEN_SHIFT_EXISTS`. Εξετάστηκε διόρθωση (boolean «το γράψιμο πέτυχε» + ξεχωριστό μήνυμα) και **απορρίφθηκε**: το Retry το λύνει μόλις επανέλθει το δίκτυο, και το σενάριο απαιτεί πτώση δικτύου μέσα στα λίγα εκατοστά του δευτερολέπτου ανάμεσα στα δύο requests. Αν εμφανιστεί σε πραγματική χρήση, η διόρθωση είναι μικρή και είναι γραμμένη εδώ.

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npx tsc -b` καθαρό, `npm run lint` καθαρό, `npm run build` περνάει, **47/47 vitest** (34 → 47), spike ×1 με 4 βλάβες και επαναφορά, 7/7 χειροκίνητοι έλεγχοι HTTP, μηδέν React `act()` warnings στο output των tests. Importers του `@/mocks/data`: **11 → 10** (έφυγε το `ClockPage`).

### ⚠️ Ανοιχτά που κληροδοτεί το βήμα

1. **Καμία ροή browser δεν έχει επαληθευτεί** — κληρονομιά του Step 9, αμετάβλητη. Τα curl αποδεικνύουν το συμβόλαιο του API, όχι ότι η σελίδα ζωγραφίζεται. Δουλειά του **Step 13b**.
2. **Το `fileParallelism: false` είναι καθολικό** και θα επιβραδύνει το suite όσο μεγαλώνει. Ξανασυζητιέται όταν πονέσει.
3. Το αποδεκτό εύρημα του `/review` παραπάνω.
4. Το **403 χωρίς `code`** (από Step 9) — παραμένει.

**Επόμενο βήμα**: **Step 11** — Shift History. Πρώτη χρήση του `?cycle=` στο URL (`useSearchParams`, `replace` όχι `push`), του `CycleNavigator`, και των flags `canWrite`/`canEdit` του Step 8c. ⚠️ Το build-plan §11 απαιτεί **απόφαση μέσα στο βήμα** για το κενό που δεν καλύπτει κανένα από τα δύο flags: με ανοιχτή βάρδια, Add/Edit εμφανίζονται ενεργά και απαντούν `400 OPEN_SHIFT_EXISTS`. *(Πριν από αυτό παρεμβλήθηκε το **Step 8d** — βλ. αμέσως παρακάτω.)*

## Step 8d — `userId` + `name` στο list response των time-entries
Status: ✅ Done
Ημερομηνία: 2026-08-29
Αρχεία που προστέθηκαν/άλλαξαν:
- `backend/src/users/users.service.ts` — **νέος reader** `findEmployeeNameOrThrow(id)` → `{ id, name }`, ρητό `select`, ίδιο 404 `EMPLOYEE_NOT_FOUND`
- `backend/src/time-entries/dto/cycle-entries-response.dto.ts` — δύο νέα πεδία `userId`/`name` με `@ApiProperty`, **αδέλφια** του `canWrite`/`entries`
- `backend/src/time-entries/time-entries.service.ts` — το `findCycleEntries()` επιλύει τον υπάλληλο· το `findCycleEntriesForEmployee()` **έχασε** το `assertEmployeeExists`
- `backend/src/users/users.service.spec.ts` (+3), `backend/src/time-entries/time-entries.service.spec.ts` (+3 και προσαρμογή 1 υπάρχοντος)
- `backend/test/helpers/types.ts` — `CycleEntriesBody` με τα δύο πεδία· `backend/test/time-entries.e2e-spec.ts` (+4)
- `context/swifttrack-phase1-final.md` §6 (και οι δύο γραμμές list), `context/build-plan.md` §5 (μπλοκ σχήματος) + §11 (από πού έρχεται το όνομα), `context/architecture.md` (νέο invariant δίπλα σε αυτό των `canWrite`/`canEdit`)
Endpoints/Components:
- `GET /time-entries/me` και `GET /time-entries?userId=` — νέα πεδία `userId` + `name`, response-level. Κανένα υπάρχον πεδίο, status code ή μήνυμα δεν άλλαξε
- **202 → 208 unit, 94 → 98 e2e**

### Γιατί υπήρχε το κενό — ασυμμετρία του API, όχι έλλειψη του πλάνου

Ο admin έχει **δύο δίδυμες σελίδες** για τον ίδιο τρίτο: `/shifts/:userId` και `/payroll/:userId`. Το payroll επιστρέφει `userId`+`name` **από το Step 6**, και μάλιστα από τη **μία** μέθοδο που εξυπηρετεί και το `/payroll/me`. Το list response δεν το έκανε — άρα ο ίδιος admin, για τον ίδιο άνθρωπο, έπαιρνε όνομα στη μία σελίδα και όχι στην άλλη.

Χωρίς αυτό, το Step 11 θα έκανε **δεύτερη κλήση σε `GET /users`** για να τυπώσει μία ετικέτα — κατεβάζοντας όλη την ομάδα, **μαζί με τα `setupCode` όλων των pending**. Ίδια οικογένεια με το `setupCode` του Step 2, το `?cycle=` του Step 4 και το `userId` του Step 5: κάτι που η σελίδα χρειάζεται και το API δεν έδινε.

Backend βήμα ξεχωριστό από το 11, ακριβώς όπως το 8c: το `AGENTS.md` δεν επιτρέπει backend δουλειά μέσα σε frontend βήμα.

### ⚠️ Η απόφαση για το `/me` — και το κόστος της, καταγεγραμμένο

**Το `name` επιστρέφεται και στο `GET /time-entries/me`**, με το όνομα του ίδιου του καλούντα, παρότι η σελίδα του υπαλλήλου δεν το τυπώνει. Ένα σχήμα για τις δύο διαδρομές (build-plan §5), ώστε ο κοινός `ShiftList` να καταναλώνει και τις δύο χωρίς branch — και ακριβώς ό,τι κάνει ήδη το payroll.

**Κόστος: ένα επιπλέον lookup σε primary key στη διαδρομή του υπαλλήλου, όπου σήμερα δεν υπήρχε κανένα.** Έγινε δεκτό συνειδητά. Στη διαδρομή του admin το κόστος είναι **μηδέν**: ο νέος reader **αντικατέστησε** το `assertEmployeeExists`, δεν προστέθηκε δίπλα του — «υπάρχει;» και «πώς λέγεται;» είναι εδώ ένα ερώτημα, άρα ένα query. Υπάρχει test ακριβώς γι' αυτό (`costs the admin route no extra query`).

### Τρεις αποφάσεις υλοποίησης που δεν ήταν προφανείς

**Α. Ο reader **πετάει**, δεν επιστρέφει `null`** (αντίθετα από το `findEmployeeRate`, που αφήνει τον `PayrollService` να πετάξει). Αυτό ακριβώς είναι που του επιτρέπει να αντικαταστήσει το `assertEmployeeExists` με ίδιο κωδικό και ίδιο μήνυμα, αντί να προστεθεί ως δεύτερη κλήση.

**Β. Επιλύεται ΠΡΙΝ τον κύκλο, σειριακά — όχι με `Promise.all`.** Σήμερα ο admin έπαιρνε 404 για άγνωστο id ακόμη κι όταν το `?cycle=` ήταν κακοσχηματισμένο, γιατί το `assertEmployeeExists` έτρεχε πρώτο. Παράλληλη εκτέλεση θα έκανε το «ποιο σφάλμα κερδίζει» **κούρσα**. Το κόστος είναι ένα σειριακό round trip στη διαδρομή `/me`· η ντετερμινιστική προτεραιότητα 404-πριν-400 το αξίζει. Υπάρχει assertion (`resolveCycleRange` δεν κλήθηκε καθόλου).

**Γ. Κανένα νέο `@ApiResponse 404` στο `GET /time-entries/me`.** Ο νέος reader **δεν μπορεί** να αποτύχει εκεί: ο `RolesGuard` και ο `JwtStrategy` (`findActiveById`) έχουν ήδη αποδείξει ότι ο καλών είναι υπαρκτός, ενεργός EMPLOYEE. Ίδιο ακριβώς σκεπτικό με το γιατί το `GET /users/me` δεν δηλώνει 404, ήδη γραμμένο στα invariants: **το Swagger δηλώνει μόνο ό,τι μπορεί πραγματικά να επιστραφεί**.

Το `assertEmployeeExists` **παραμένει** — το `create()` το καλεί ακόμη, και εκεί το ερώτημα όντως είναι μόνο «υπάρχει;». Δύο στενοί readers, ο καθένας για την ερώτησή του, όπως λέει το invariant.

### 🔢 Διόρθωση των test counts του tracker — μετρημένο, όχι εμπιστευμένο

Το prompt του βήματος ζητούσε να επιβεβαιωθεί το «195 unit / 94 e2e» του 8c. **Δεν ίσχυε**: το baseline σε **ανέγγιχτο** δέντρο μέτρησε **202 unit / 94 e2e**. Το 8c είχε γράψει «195» στην ενότητα των αρχείων και «196» στην τελική του κατάσταση, ενώ οι διορθώσεις του `/review` που ακολούθησαν ανέβασαν τον αριθμό χωρίς να ενημερωθεί καμία από τις δύο. Επαληθεύτηκε ότι δεν μεσολάβησε άλλο backend commit: `git log -- backend/src backend/test` σταματά στο 8c. **Το e2e 94 ήταν σωστό.**

### ⭐ Spike — 4 σκόπιμες βλάβες, 4 ομάδες κόκκινων στα σωστά tests

Έγιναν **μαζί**, με αντίγραφα ασφαλείας για ακριβή επαναφορά:

| Βλάβη | Αποτέλεσμα |
|---|---|
| A — αφαίρεση των `userId`/`name` από την απάντηση | 2 unit (`says whose list it is`, `names the employee being viewed`) + 3 e2e· **και `tsc` TS2739** — ο τύπος του DTO αποδείχθηκε φέρων |
| B — `isActive: true` στο `where` του reader | 2 unit (σχήμα query) + 1 e2e (απενεργοποιημένος υπάλληλος → 404 αντί 200) |
| C — επαναφορά του `assertEmployeeExists` στο wrapper | 1 unit (`costs the admin route no extra query`) |
| D — ο reader μετά το `resolveCycleRange` | 1 unit (`404s on the admin route before listing`) |

**6 failed / 208 unit** και **3 failed / 98 e2e**, μία ομάδα ανά βλάβη, καμία παράπλευρη. Επαναφορά, `grep SPIKE` → **0**.

### Τι ΔΕΝ άλλαξε

Κανένα υπάρχον πεδίο, status code, μήνυμα ή error code. Ούτε `canWrite` ούτε `canEdit`. Ούτε το `POST /time-entries` και ο έλεγχος `userId` του. Ούτε το `GET /time-entries/open`. **Τίποτα στο `frontend/`.** Καμία νέα εξάρτηση.

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npm run build` καθαρό, `npm run lint` καθαρό, **208/208 unit** (από 202), **98/98 e2e** σε πραγματική `swifttrack_test` (από 94). `npx tsc --noEmit` καθαρό. Spike ×1 με 4 βλάβες και επαναφορά.

**Επόμενο βήμα**: **Step 11** — Shift History, με το όνομα του υπαλλήλου πλέον διαθέσιμο μέσα στην ίδια απάντηση.

---

## Step 11 — Shift History (frontend)
Status: ✅ Done
Ημερομηνία: 2026-08-30
Αρχεία που προστέθηκαν/άλλαξαν:
- `frontend/src/components/ui/sonner.tsx` — **νέο, χειροποίητο** (το registry copy δεν μεταγλωττίζεται· βλ. παρακάτω)
- `frontend/src/components/shifts/DeleteShiftDialog.tsx` — **νέο**
- `frontend/src/pages/ShiftHistoryPage.tsx` — ξαναγράφτηκε· `useParams` + `useSearchParams` + `useApiQuery`
- `frontend/src/components/shifts/ShiftList.tsx` — ξαναγράφτηκε, έγινε **presentational**
- `frontend/src/components/shifts/ShiftForm.tsx` — ξαναγράφτηκε σε react-hook-form + zod + `Field`
- `frontend/src/components/shifts/CycleNavigator.tsx` — ξαναγράφτηκε· δέχεται και επιστρέφει κλειδιά, **υπολογίζει μηδέν**
- `frontend/src/api/timeEntries.ts` — +5 κλήσεις (`getMyEntries`, `getEntriesForUser`, `createEntry`, `updateEntry`, `deleteEntry`) και οι τύποι `CycleTimeEntry`/`CycleEntriesResponse`/`TimeEntryInput`
- `frontend/src/lib/datetime.ts` — `formatDayTime`, `toDatetimeLocal`, `nowIsoUtc`
- `frontend/src/lib/messages.ts` — labels/validation/notices του βήματος + **override του `OPEN_SHIFT_EXISTS`** στην οθόνη `shifts`
- `frontend/src/App.tsx` — `<Toaster />`
- **Νέα specs**: `ShiftList.spec.tsx` (11), `ShiftForm.spec.tsx` (10), `ShiftHistoryPage.spec.tsx` (13 — **το πρώτο page spec του project**)· επεκτάθηκε το `datetime.spec.ts`
- `frontend/package.json` — **`sonner@2.0.8`** (μοναδική νέα εξάρτηση, μηδέν runtime deps δικά της)
- `context/`: architecture.md (invariant sonner + στήλες), build-plan.md (§11 ξαναγράφτηκε, preamble), swifttrack-phase1-final.md (§8a client-owned copy)
Endpoints/Components:
- `/shifts` (EMPLOYEE, δικό του ιστορικό) και `/shifts/:userId` (ADMIN) — **ίδια components, ίδιο σχήμα απάντησης**, διαφέρει μόνο το endpoint και ο τίτλος
- `ShiftList` + `CycleNavigator` + `ShiftForm` (dialog, add/edit) + `DeleteShiftDialog`
- Importers του `@/mocks/data`: **10 → 7**
- Tests: **47 → 88**

### Οι αποφάσεις που πάρθηκαν μέσω `/architect` πριν τον κώδικα

**Α. Το κενό της ανοιχτής βάρδιας — το δεχόμαστε, διορθώνουμε μόνο το κείμενο.** Το build-plan §11 απαιτούσε απόφαση εδώ. Μετρήθηκε στον κώδικα ότι ο περιορισμός ισχύει **μόνο για τον EMPLOYEE** (`time-entries.service.ts:330` — ο ADMIN επιστρέφει νωρίς), άρα το κενό υπάρχει μόνο στο `/shifts`.

⚠️ Απορρίφθηκε η επιλογή Β του plan (ενιαίος κανόνας + `blockedByOpenShift`): **πλαταίνει** έναν περιορισμό που είναι ήδη υπερβολικά πλατύς. Το `POST` δεν μπορεί να δημιουργήσει ανοιχτή βάρδια (το `endTime` είναι υποχρεωτικό), οπότε το blanket μπλοκάρισμα δεν αγοράζει τίποτα εκεί — ο κανόνας 3 (επικάλυψη) κάνει ήδη τη δουλειά.

**Ανοιχτό, καταγεγραμμένο ως επιλογή Γ:** χαλάρωση του backend ώστε ο employee με ανοιχτή βάρδια να γράφει ό,τι δεν συγκρούεται με το `[startTime, ∞)`, μένοντας μόνο η απαγόρευση `PUT` στην ίδια την ανοιχτή γραμμή. ⚠️ **Δεν κοστίζει περισσότερο αργότερα** — σε αντίθεση με τα τέσσερα του 8c, είναι *χαλάρωση*: κανένας client δεν σπάει όταν ένα σφάλμα σταματά να συμβαίνει. Γι' αυτό δεν έγινε τώρα.

Το σενάριο που το δικαιολογεί, γραμμένο για να μη χρειαστεί να ξαναβρεθεί: υπάλληλος κάνει clock in Δευτέρα 08:00, στις 10:00 θυμάται ξεχασμένη βάρδια του Σαββάτου. Το Σάββατο **δεν** επικαλύπτεται, αλλά το blanket το κόβει — και το μήνυμα «κάνε clock out» τον σπρώχνει να τερματίσει πρόωρα πραγματική βάρδια, να προσθέσει, και να ξανακάνει clock in. Δηλαδή ο κανόνας σπρώχνει στο **ακριβώς χειρότερο** αποτέλεσμα από αυτό που προστατεύει.

**Β. `sonner` — ο κανόνας «no toast library» άρθηκε.** Η μία καταγεγραμμένη θυρίδα εξαίρεσης, και ασκήθηκε εδώ. Το σκεπτικό του Step 10 **δεν** ανατρέπεται: εκεί το clock-in αλλάζει δύο πράγματα ταυτόχρονα, άρα η επιβεβαίωση είναι δομική και μόνιμη· εδώ ο `ShiftForm` είναι dialog που κλείνει, και βάρδια σε γειτονικό κύκλο αφήνει τη λίστα **πανομοιότυπη**.

Πάρθηκε στο 11 και όχι στο 13 σκόπιμα: Team και Settings έχουν **τουλάχιστον πέντε ακόμα** γραφές με την ίδια ιδιότητα, και η εναλλακτική ήταν πέντε σελίδες να εφεύρουν πέντε επιβεβαιώσεις.

⚠️ **`npx shadcn add sonner` γράφει αρχείο που ΔΕΝ μεταγλωττίζεται** — κάνει import `next-themes` και `@/app/(create)/components/icon-placeholder`, διαδρομή Next.js. Σε αντίθεση με το κενό `form.json`, το item είναι υπαρκτό, άρα η αποτυχία εμφανίζεται ως σπασμένο build και όχι ως σιωπηλό no-op. Τρεις αποκλίσεις του δικού μας αρχείου, όλες μετρήσεις: **χωρίς `next-themes`** (τίποτα στην εφαρμογή δεν εφαρμόζει ποτέ την κλάση `.dark`, άρα είναι light-only, και το `theme="system"` του registry θα έκανε τα toasts να ακολουθούν το λειτουργικό ενώ η σελίδα μένει ανοιχτή)· **εικονίδια απευθείας από `lucide-react`**· **χωρίς την κλάση `cn-toast`**, που το `index.css` δεν ορίζει ποτέ.

**Γ. Το cross-cycle toast δεν έχει κουμπί δράσης.** Το «είναι ορατή;» απαντιέται **χωρίς αριθμητική** — η γραμμή λείπει από τη λίστα μετά το refetch. Το «σε ποιον κύκλο πήγε;» **δεν** απαντιέται χωρίς επίλυση ορίων κύκλου, που απαγορεύεται από invariant. Κουμπί που θα μετακινούσε έναν κύκλο και πάλι δεν θα την έδειχνε είναι χειρότερο από καθόλου κουμπί.

**Δ. Το `OPEN_SHIFT_EXISTS` διαβάζεται αλλιώς εδώ απ' ό,τι στο Clock.** Ίδιο γεγονός, δύο ακροατήρια: στο Clock ο χρήστης πάτησε Clock In, άρα το «clock out first» είναι κυριολεκτικά το επόμενο βήμα· εδώ προσθέτει **παλιά** βάρδια ενώ τρέχει ζωντανή, και η ίδια πρόταση τον σπρώχνει στο σενάριο της απόφασης Α. Πρώτη χρήση του `SCREEN_ERRORS` μηχανισμού που στήθηκε στο Step 9 για το `ACCOUNT_ALREADY_ACTIVATED`.

**Ε. Ο πίνακας ξαναχτίστηκε μετά από αίτημα του χρήστη** (μέσα στο βήμα): στήλες **`#` / Start / End / Notes / Actions**. Το `#` είναι **θέση στον κύκλο** (νεότερα πρώτα, από το 1), όχι το id. ⚠️ **Δεν υπάρχει κοινή στήλη Date**, και ο λόγος είναι ουσιαστικός: ολονύχτια βάρδια **τελειώνει άλλη μέρα από αυτή που αρχίζει**, άρα ένα κοινό κελί θα μπορούσε να τυπώσει μόνο τη μία. Η **ημέρα της εβδομάδας** είναι φέρουσα, όχι διακόσμηση — Σάββατο/Κυριακή πληρώνονται +45% όλη μέρα, άρα είναι αυτό που επιτρέπει έλεγχο της απόδειξης χωρίς μέτρημα ημερομηνιών. Χωρίς χρονιά, με ασφάλεια: ο κύκλος είναι ~30 μέρες.

### ⚠️ Έβδομο λάθος μέτρησης — και πάλι το harness

`npx vitest run <δύο αρχεία>` ανέφερε **«1 passed / 17 tests»** ενώ το νέο DOM spec **δεν ξεκίνησε καθόλου** (`Failed to start forks worker … Timeout waiting for worker to respond`) — πράσινο run που είχε σιωπηλά παραλείψει ό,τι μόλις γράφτηκε. Το `fileParallelism: false` **υπάρχει ήδη** από το Step 10 και δεν το απέτρεψε.

**Μάθημα, με πρακτική συνέπεια: η στοχευμένη εκτέλεση υποσυνόλου είναι αναξιόπιστη σε αυτό το project.** Το πλήρες `npm run test` τα τρέχει κανονικά. Μη δηλώσεις ποτέ αποτέλεσμα από `vitest run <file>` — τρέξε ολόκληρο το suite.

### ⭐ Δύο spikes — 7 σκόπιμες βλάβες, 7 κόκκινα στα σωστά tests

**Spike 1** (μετά τα specs των components), 4 βλάβες: `new Date(v).toISOString()` αντί για `toIsoUtc` στο submit· `notes` πάντα `null`· `errorText` χωρίς screen key· `Delete` αγνοεί το `canEdit`. → **4 failed / 65 passed**, μία ομάδα ανά βλάβη.

**Spike 2** (μετά τις διορθώσεις του `/review`), 3 βλάβες: ο admin δεν στέλνει `userId`· το toast πάντα «Shift saved»· η ορατή σημείωση κλειδώματος απενεργοποιημένη. → **3 failed / 85 passed**.

Και στα δύο: επαναφορά, `grep SPIKE` → **0**.

⚠️ **Καταγεγραμμένο ως διαδικαστικό λάθος:** τα αντίγραφα ασφαλείας του spike 2 μπήκαν στο `/tmp`, το οποίο **καθαρίστηκε** στο μεταξύ. Η επαναφορά είχε προλάβει να τρέξει, αλλά για λίγο δεν υπήρχε τρόπος να το επιβεβαιώσω — και ανέφερα λανθασμένα στον χρήστη ότι ο κώδικας ήταν χαλασμένος. **Τα spike backups πάνε σε git stash ή σε φάκελο του project, ποτέ στο `/tmp`.**

### Το χειροκίνητο πέρασμα — 13 έλεγχοι σε πραγματικό backend + dev βάση

Με `curl`. Επαληθεύτηκε ότι το συμβόλαιο ταιριάζει **ακριβώς** με τους τύπους του client: και τα 9 top-level πεδία και τα 7 της γραμμής, με αυτά τα ονόματα.

Τα ουσιώδη: ο admin στο `?userId=65` παίρνει **«Anna Jónsdóttir»**, όχι το δικό του όνομα (το 8d δουλεύει)· employee δύο κύκλους πίσω → `canWrite:false` και **και οι 23** γραμμές `canEdit:false`, ενώ ο **ADMIN στον ίδιο κύκλο** → όλα `true`· `?cycle=banana` → `400 INVALID_CYCLE`· `isSplit:true` **μόνο** στη βάρδια 24→25 Αυγ· `PUT` με `notes:null` δεκτό (αυτό ακριβώς στέλνει η φόρμα με άδειο πεδίο)· `DELETE` → **204 με 0 bytes** (ο δρόμος του άδειου σώματος στο `client.ts`)· employee `POST` με `userId` → `USER_ID_NOT_ALLOWED`· admin `POST` με `userId:65` προσγειώνεται **στην υπάλληλο**· admin `POST` χωρίς → `USER_ID_REQUIRED`.

**Καθαρισμός επαληθευμένος, όχι δηλωμένος**: οι γραμμές 910 και 911 σβήστηκαν και επιβεβαιώθηκε ότι η Anna ξαναέχει τις αρχικές 4 (830, 829, 828, 832).

### `/review` στο τέλος του Step 11 — 7 ευρήματα, 4 κλειστά

**Κλειστά:**
1. 🟡 **Απόκλιση τεκμηρίωσης που εισήγαγα ο ίδιος**: είχα ενημερώσει το spec §8a για τις στήλες αλλά **όχι** το build-plan §11 και το architecture.md. Ακριβώς η κατηγορία που έπιασε το `/review` του Step 10. Κλείστηκε μαζί με την αλλαγή του πίνακα — και τα τρία αρχεία πλέον συμφωνούν.
4. 🔴 **Μηδενική κάλυψη toast και σελίδας** → `ShiftHistoryPage.spec.tsx`, 13 tests. Το project δεν είχε **κανένα** page spec.
5. 🔴 **Η γραμμή `userId` του admin δεν είχε εκτελεστεί ποτέ.** ⚠️ Είχα ισχυριστεί ότι οι έλεγχοι 12/13 με curl την καλύπτουν — **λάθος**: έστειλα το σώμα με το χέρι, που αποδεικνύει ότι το *backend* το δέχεται, όχι ότι η *σελίδα* το κατασκευάζει. Καλύφθηκε με δύο tests, αποδεδειγμένα από το spike 2.
6. 🟠 **Η εξήγηση κλειδωμένης γραμμής ήταν αόρατη**: `title` σε **disabled** κουμπί είναι αναξιόπιστο μεταξύ browsers και δεν ανακοινώνεται σε πληκτρολόγιο/screen reader — ενώ το `canWrite` εξηγούνταν με ορατό κείμενο 20 pixels πιο πάνω. Έγινε ορατή γραμμή κάτω από τον πίνακα, **μία φορά** αντί για μία ανά γραμμή (κλειστός κύκλος κλειδώνει και τις 23), δεμένη με `aria-describedby`.

**Ανοιχτά (minor, απόφαση του χρήστη να μη γίνουν τώρα):**
2. 🟡 Η υπόδειξη UTC είναι στο `DialogDescription` και όχι «beside the time fields» όπως λέει το plan.
3. 🟡 `errorText(hasValidId && error !== null ? error : "EMPLOYEE_NOT_FOUND", "shifts")` — μία έκφραση που συγχέει δύο διαφορετικές αποτυχίες. Σωστή, δυσανάγνωστη.
7. 🟡 Το `<Split aria-label>` δεν έχει `role="img"`, και το `<title>` είναι το **τελευταίο** παιδί του `<svg>` αντί για το πρώτο — άρα ούτε το tooltip ούτε το accessible name είναι σίγουρα.

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npx tsc -b` καθαρό, `npm run lint` καθαρό, `npm run build` περνάει, **88/88 vitest** (47 → 88), δύο spikes με 7 βλάβες συνολικά και επαναφορά, 13/13 χειροκίνητοι έλεγχοι HTTP, καμία προειδοποίηση στο output των tests. Οι τέσσερις πόρτες ελέγχθηκαν **μηχανικά** και όχι από μνήμη: κανένα `new Date`/`toLocale*` εκτός `lib/datetime.ts`, κανένα `fetch` εκτός `api/`, καμία αριθμητική κύκλου, καμία αριθμητική μισθοδοσίας — όλα τα ευρήματα του grep είναι σε **ανέγγιχτα mockups** των Steps 12/13.

⚠️ Το warning `chunks larger than 500 kB` στο build είναι **προϋπάρχον**: το bundle είναι 597 kB και το sonner είναι μερικές δεκάδες — και χωρίς αυτό ξεπερνούσε το όριο.

### ⚠️ Ανοιχτά που κληροδοτεί το βήμα

1. **Καμία ροή browser δεν έχει επαληθευτεί αυτόματα** — κληρονομιά των Steps 9 και 10. Τα curl αποδεικνύουν το συμβόλαιο, τα vitest τη λογική σε jsdom· ότι η σελίδα ζωγραφίζεται είναι δουλειά του **Step 13b**.
2. **Η επιλογή Γ της απόφασης Α** (χαλάρωση του open-shift block) — με το σενάριο γραμμένο παραπάνω.
3. Τα τρία minor ευρήματα 2, 3, 7 του `/review`.
4. Το **403 χωρίς `code`** (από Step 9) — παραμένει.
5. **Τα spike backups δεν πάνε ποτέ στο `/tmp`** — βλ. παραπάνω.

**Επόμενο βήμα**: **Step 12** — Payroll Breakdown. Αντιγράφει το URL-cycle pattern που στήθηκε εδώ (`useSearchParams`, `replace`, `?cycle=` παραλείπεται στο πρώτο load). ⚠️ Ο `PayrollBreakdown` του Step 0 **αντικαθίσταται, δεν επεκτείνεται**: υπολογίζει `Math.round(hours * hourlyRate)` ανά γραμμή στον browser, που κάτω από τέσσερις ζώνες βγάζει άλλα νούμερα από τον server. Το `GET /payroll/:userId` επιστρέφει ήδη `name`, οπότε δεν χρειάζεται δεύτερη κλήση για τον τίτλο.

---

## Step 12 — Payroll Breakdown (frontend)
Status: ✅ Done
Ημερομηνία: 2026-08-31
Αρχεία που προστέθηκαν/άλλαξαν:
- `frontend/src/api/payroll.ts` — **νέο**· `getMyPayroll`, `getPayrollForUser` + τύποι `PayrollResponse`/`PayrollZone`/`PayrollDay`/`DayZoneHours`/`PayZone`
- `frontend/src/lib/format.ts` — **νέο, η πέμπτη πόρτα**· `formatHours`/`formatRate`/`formatIsk`, locale `en-GB` όπως στο `datetime.ts`
- `frontend/src/components/payroll/PayrollSummary.tsx` — **νέο**, presentational
- `frontend/src/components/payroll/PayrollDayTable.tsx` — **νέο**, presentational
- `frontend/src/components/payroll/PayrollBreakdown.tsx` — **διαγράφηκε** (προσχέδιο Step 0)
- `frontend/src/pages/PayrollPage.tsx` — ξαναγράφτηκε· `useParams` + `useSearchParams` + `useApiQuery`
- `frontend/src/lib/messages.ts` — στήλες των δύο πινάκων, `SHORT_ZONE_LABELS` + `zoneShortLabel`, empty state, οι **δύο** εκδοχές της προειδοποίησης ανοιχτής βάρδιας
- **Νέα specs**: `format.spec.ts` (13), `PayrollSummary.spec.tsx` (10), `PayrollDayTable.spec.tsx` (12), `PayrollPage.spec.tsx` (15)
- `context/`: architecture.md (folder structure, System Boundaries, **4 νέα invariants**, PayrollPage, data flow), build-plan.md (§12 αποφάσεις, ο αριθμός των mock importers), swifttrack-phase1-final.md (§8a client-owned copy)
Endpoints/Components:
- `/payroll` (EMPLOYEE, δικό του) και `/payroll/:userId` (ADMIN) — **ίδια components, ίδιο σχήμα**, διαφέρει μόνο ο fetcher και ο τίτλος
- `PayrollSummary` + `PayrollDayTable` + επαναχρησιμοποίηση του `CycleNavigator` του Step 11
- Importers του `@/mocks/data`: **7 → 5** (και οι 5 ανήκουν στο Step 13)
- Tests: **88 → 135**
- **Καμία νέα εξάρτηση.**

### Η προεργασία που ζήτησε ο χρήστης πριν τον κώδικα

Πριν αρχίσει το βήμα, ζητήθηκε αναζήτηση στα context files για ό,τι αφορά στρογγυλοποιήσεις. Βρέθηκαν τέσσερα, και **δύο άλλαξαν τον κώδικα**:

1. **Εύρημα Νο5 του `/review` του Step 6** — η περιγραφή «Exact sum of the four cells» *«καλούσε το Step 12 σε παγίδα»*, με μέτρηση ότι **στο 36% των γραμμών** το άθροισμα σε JS διαφωνεί με τον server. Δηλαδή η απαγόρευση της αριθμητικής ήταν ήδη γραμμένη **για αυτό ακριβώς το βήμα**.
2. **Η ιστορία της στήλης Rate** — με rate `3.259` αντί `3.258,50` η γραμμή αυτοδιαψεύδεται κατά 3 ISK, σφάλμα **0,5 ISK ανά ώρα με προσαύξηση**, συστηματικό, ~50 ISK/μήνα. → Η `formatRate` γράφτηκε με **2 σταθερά δεκαδικά** και τον λόγο μέσα στο docstring. Με `maximumFractionDigits: 0` ή `1` θα ξαναέφτιαχνα το bug που εκείνη η συζήτηση σκότωσε.
3. Το περιστατικό «8.116666666666667 vs 8.12» — η ρίζα του «ένας αριθμός ωρών, ένας ιδιοκτήτης».
4. «Η στρογγυλεμένη τιμή είναι η κανονική» → `formatHours(5)` → `"5.00"` είναι νόμιμο (ίδια τιμή, γεμισμένη)· το ανάποδο θα ήταν **τέταρτο** σημείο στρογγυλοποίησης.

### Οι αποφάσεις που πάρθηκαν μέσω `/architect`

**Α. Οι επικεφαλίδες του day table — τοπικός χάρτης ανά `zone`, με fallback στο `label`.** Το §8a καρφώνει **δύο διαφορετικά** σύνολα λέξεων και **και τα δύο** είναι binding: το summary τυπώνει `zones[].label` verbatim («Evening +33%») γιατί εκεί το ποσοστό διασταυρώνεται με Rate και Total Pay δίπλα του· ο day table δεν έχει **καθόλου** χρήμα, οπότε ποσοστό στις επικεφαλίδες είναι ανεπαλήθευτος θόρυβος σε 6 στήλες. Απορρίφθηκε το κόψιμο του «+NN%» με regex: ο client θα **συνέθετε** δικό του label, που το invariant απαγορεύει, και θα αποτύγχανε **σιωπηλά** αν άλλαζε η μορφή.

**Β. `lib/format.ts` — πέμπτη πόρτα, τώρα και όχι στο 13.** Ίδιο επιχείρημα με το `sonner` του Step 11: το Step 13 τυπώνει τα ίδια τρία είδη νούμερου σε τουλάχιστον **τέσσερα** ακόμα σημεία, και η εναλλακτική ήταν τέσσερις οθόνες να εφεύρουν τέσσερις μορφές. ⚠️ Το Shift History **δεν έδινε προηγούμενο** — δεν έχει ούτε έναν αριθμό από API (το `#` είναι `index + 1`), άρα αυτή είναι η πρώτη σελίδα που τυπώνει νούμερα.

**Γ. Καμία άμυνα στη `formatIsk`.** Τέθηκε ως ερώτημα («το `maximumFractionDigits: 0` στρογγυλοποιεί σιωπηλά έναν μη-ακέραιο») και **έκλεισε ως μη-θέμα**: κάθε ποσό είναι `Int` στο συμβόλαιο και υπολογίζεται σε ακέραια centi-ISK. Ο χρήστης το έκοψε σωστά — *«αφού το backend δεν στέλνει δεκαδικό ISK, γιατί να το κάνουμε;»*. ⚠️ Καταγράφεται επειδή το είχα παρουσιάσει βαρύτερο απ' ό,τι ήταν.

### ⭐ Spike — 5 σκόπιμες βλάβες, 10 κόκκινα, όλα στο σωστό test

`totalPay` → `reduce` · σύνολο στήλης → άθροισμα ημερών · `toLocaleDateString` στην ημερομηνία · πάντα το κείμενο του υπαλλήλου · `formatRate` σε 0 δεκαδικά. Καμία βλάβη δεν πέρασε σιωπηλά. Επαναφορά από αντίγραφα **μέσα στο project** (`.spike-backup/`, διαγράφηκε) — το μάθημα του Step 11 τηρήθηκε, τίποτα στο `/tmp`. `grep SPIKE` → 0.

### Το χειροκίνητο πέρασμα — και μια ταυτότητα που δεν είχε ελεγχθεί ποτέ

**⭐ `Σ ανά ημερομηνία των days[].hours[Ζ] === zones[Ζ].hours`.** Ο κατάλογος του Step 8 ελέγχει τις **γραμμές** (`Σ days.totalHours === totalHours`) και τα χρήματα (`Σ zones.pay === totalPay`) — τη **στήλη** δεν την ελέγχει κανένα test και κανένα πέρασμα. Μετρήθηκε σε **τρεις κύκλους**, και ξανά αφού προστέθηκαν βάρδιες με κλασματικές ώρες. Ισχύει. Αυτό είναι που κάνει τη Total γραμμή του day table διαβασμένη αντί για υπολογισμένη.

Επίσης ζωντανά: **`round(hours × rate) === pay` για κάθε ζώνη** (με rate 3.259 θα έβγαζε 10.298 αντί 10.297 — το εύρημα του Step 6 σε πραγματικά δεδομένα)· **`/payroll/me` === `/payroll/65` byte-for-byte**, που είναι ό,τι δικαιολογεί μία κοινή σελίδα· τα σχήματα ταιριάζουν **ακριβώς** με τους τύπους του client (13 top-level, 5 του zone, 3 του day, 4 κλειδιά ωρών)· labels ακριβώς όπως το §8a· `date` σκέτο `"2026-07-25"`· guards `/payroll/1`→404, `?cycle=banana`→400 `INVALID_CYCLE`, employee σε ξένο id→403, employee στο overview→403, admin στο `/me`→403. **Bonus**: βάρδια που αρχίζει τη στιγμή που τελειώνει η προηγούμενη έγινε δεκτή — η ιδιότητα `gt`/`lt` ζωντανά.

**Καθαρισμός επαληθευμένος**: οι δύο δοκιμαστικές βάρδιες σβήστηκαν, η Anna ξαναέχει τις αρχικές 4 (830, 829, 828, 832), το payroll πίσω σε 27 h / 69.458 ISK / 3 ημέρες.

### `/review` στο τέλος του Step 12 — 6 ευρήματα, 4 κλειστά

**Κλειστά:**
1. 🟠 **Κυκλική εξάρτηση που εισήγαγα εγώ**: `messages.ts` → `api/payroll.ts` → `api/client.ts` → `messages.ts`, από το `satisfies Record<PayZone, string>`. Ήταν ακίνδυνη **μόνο** επειδή το `verbatimModuleSyntax: true` σβήνει το `import type` — γίνεται πραγματικός κύκλος με το πρώτο value import, με σειρά φόρτωσης που μπορεί να διαφέρει dev/production, και **τίποτα στο toolchain δεν το πιάνει**. Λύθηκε με `Record<string, string>` + 3 tests. ⚠️ **Το σκέφτηκα την ώρα που το έγραφα και δεν το έθεσα στον χρήστη** — λάθος διαδικασίας, όχι μόνο κώδικα.
2. 🟡 `columnHoursPayroll` → `columnHours` (δεν υπήρχε σύγκρουση να αποφευχθεί).
3. 🟡 Περιττό `font-medium` σε 6 σημεία — το `TableFooter` το εφαρμόζει ήδη.
4. 🟡 Η ετικέτα «Total» έγινε **`<th scope="row">`**. Είναι το **πρώτο `<tfoot>` του project**, άρα το μοτίβο που θα αντιγράψει το Step 13 (Payroll Overview έχει γραμμή συνολικού κόστους). Τα specs καρφώνουν τη νέα δομή με `toHaveLength`, ώστε επαναφορά σε `<td>` να κοκκινίζει.

**Αφέθηκαν με απόφαση του χρήστη:**
5. 🟡 `—` στο κελί, `0.00` στη γραμμή συνόλων. **Κρατήθηκε σκόπιμα** και γράφτηκε σε σχόλιο: γραμμή συνόλων είναι γραμμή αριθμών, και παύλα εκεί διαβάζεται ως «δεν υπολογίστηκε».
6. 🟡 `/payroll/abc` → φεύγει `GET /payroll/NaN` → 400, πετιέται (η σελίδα έχει ήδη δείξει `EMPLOYEE_NOT_FOUND` από τον δικό της έλεγχο). **Αφέθηκε εν γνώσει**: το `ShiftHistoryPage` κάνει το ίδιο από το Step 11, και διόρθωση στη **μία** από τις δύο δίδυμες σελίδες είναι χειρότερη από το 400 που γλιτώνει. Αν φτιαχτεί, φτιάχνεται και στις δύο ή στο `useApiQuery` — που εισάγει τρίτη κατάσταση (`enabled`) και θέλει ξαναδιάβασμα και των τριών σελίδων που το χρησιμοποιούν.

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npx tsc -b` καθαρό, `npm run lint` καθαρό, `npm run build` περνάει, **135/135 vitest** (88 → 135), spike με 5 βλάβες και επαληθευμένη επαναφορά, χειροκίνητο πέρασμα σε πραγματικό backend + dev βάση με επαληθευμένο καθαρισμό. **Πέντε μηχανικοί έλεγχοι με grep**, όχι από μνήμη: κανένα `new Date`/`toLocale*` εκτός `lib/datetime.ts` · κανένα `fetch` εκτός `api/` · **μηδέν** `reduce`/`Math.round`/`toFixed` στα τέσσερα νέα αρχεία · κανένα import του `lib/` προς το `api/` · καμία inline συμβολοσειρά. Όλα τα ευρήματα του grep είναι σε **ανέγγιχτα mockups του Step 13**. ⚠️ Δεν αντιστοιχούν ένα-προς-ένα στις πέντε πόρτες: η `useApiQuery` δεν ελέγχθηκε με grep, ισχύει εκ κατασκευής (η σελίδα την καλεί), και ο έλεγχος `lib/`↛`api/` είναι το νέο invariant, όχι πόρτα.

Το warning `chunks larger than 500 kB` παραμένει **προϋπάρχον**.

### ⚠️ Ανοιχτά που κληροδοτεί το βήμα

1. **Καμία ροή browser δεν έχει επαληθευτεί αυτόματα** — κληρονομιά των Steps 9/10/11. Δουλειά του **Step 13b**.
2. Το εύρημα 6 παραπάνω (άκυρο `:userId`), σε **δύο** σελίδες πλέον.
3. **Δεν υπάρχει `eslint-plugin-import`**, άρα καμία μηχανική προστασία από κυκλικές εξαρτήσεις — μόνο ο κανόνας στο architecture.md. Αν προστεθεί ποτέ, είναι νέα εξάρτηση και θέλει απόφαση.
4. Η επιλογή Γ της απόφασης Α του Step 11 (χαλάρωση του open-shift block) — ακόμα ανοιχτή.
5. Το **403 χωρίς `code`** (από Step 9) — παραμένει.

**Επόμενο βήμα**: **Step 13**, το οποίο **σπάστηκε σε τρία** στις 2026-08-31 πριν γραφτεί γραμμή κώδικα — βλ. την αμέσως επόμενη εγγραφή. Πρώτο το **13-1** (Payroll Overview). Αντιγράφει τη `lib/format.ts` και το μοτίβο `<tfoot>` που στήθηκαν εδώ. ⚠️ Τρία badges, όχι δύο· ο toggle των απενεργοποιημένων θέλει **μετρητή**· το `SCREEN_ERRORS.team` για το `ACCOUNT_ALREADY_ACTIVATED` περιμένει από το Step 9 τον πρώτο του καταναλωτή — και τα τρία ανήκουν πλέον στο **13-3**.

---

## Απόφαση (2026-08-31) — το Step 13 σπάει σε 13-1 / 13-2 / 13-3

Status: 📋 Απόφαση σχεδιασμού, **όχι** χτισμένο βήμα
Ημερομηνία: 2026-08-31
Αρχεία που άλλαξαν: `context/build-plan.md` (§13 ξαναγραμμένο σε τρία υπο-βήματα + η σημείωση της κεφαλίδας + ο μετρητής των mock importers), `context/swifttrack-phase1-final.md` (§11 Development Order)
Κώδικας: **καμία αλλαγή**

**Γιατί.** Το Step 13 ήταν τρεις σελίδες, ~9 endpoints και ~6 components σε ένα βήμα — περίπου το **άθροισμα** των Steps 10, 11 και 12, που το καθένα ήταν *μία* σελίδα. Το επιχείρημα είναι το ίδιο που έσπασε το `8b` σε `8b-1`/`8b-2`: το βήμα κλείνει με χειροκίνητο πέρασμα, `/review` και spike, και το `/review` του Step 12 έβγαλε **6 ευρήματα σε δύο components**. Σε έξι ταυτόχρονα, ένα κόκκινο αποτέλεσμα γίνεται διφορούμενο — και το project έχει **πέντε καταγεγραμμένα σφάλματα μέτρησης, όλα στο harness και κανένα στον κώδικα**.

**Η ονομασία δεν είναι γούστο — δύο labels ήταν ήδη πιασμένα.** Ζητήθηκαν αρχικά γράμματα (13α/13β/13γ). Ο έλεγχος έδειξε ότι:
- **`13b` = Playwright**, με ~12 αναφορές και στα τέσσερα context files. Και είχε ονομαστεί `13b` **ακριβώς για να μη γίνει μετονομασία**: ο tracker (γρ. 904) λέει ότι δεν έγινε `14` επειδή το 14 αναφέρεται 8 φορές ως προορισμός παρκαρισμένων θεμάτων.
- **`13a` έχει καταργηθεί ρητά** — το spec γράφει «There is **no step 13a**». Επαναχρήση του label θα έδινε σε δύο πράγματα το ίδιο όνομα μέσα στο ίδιο αρχείο.

Το `-N` του `8b-1`/`8b-2` είναι το προηγούμενο **του ίδιου project** για ακριβώς αυτή την περίπτωση, και κοστίζει **μηδέν** μετονομασίες. Επιλέχθηκε από τον χρήστη έναντι της εναλλακτικής (13a/13b/13c + μετονομασία του Playwright σε 13d, ~12 σημεία).

**Η σειρά: Overview → Settings → Team** — όχι η σειρά που τις απαριθμεί το §8. Κάθε πέρασμα κερδίζει το επόμενο: το Overview είναι καθαρό read που **δεν εισάγει κανένα νέο μοτίβο** (αντιγράφει `CycleNavigator`, `lib/format.ts`, `<tfoot>`), άρα είναι η φθηνότερη απόδειξη ότι τα μοτίβα του Step 12 μεταφέρονται· το Settings είναι η πρώτη εγγραφή στη μικρότερη δυνατή επιφάνεια και εκεί **κλειδώνει ο κανόνας του toast**· το Team είναι τελευταίο επειδή είναι το μόνο πραγματικά μεγάλο, και τότε πια αντιγράφει αντί να αποφασίζει.

**Τι επιβεβαιώθηκε από τον κώδικα, όχι από τα docs**, καθώς γραφόταν το plan:
- `PayrollOverviewResponseDto` → cycle block + `totalCost` + **`rows[]`** (`userId`, `name`, `totalHours`, `totalPay`, `hasOpenShift`). ⚠️ Ο πίνακας λέγεται `rows`, όχι `employees`.
- `GET /users` ταξινομεί `name: 'asc'`, και **και τα τέσσερα writes** επιστρέφουν πλήρες `UserResponseDto` — άρα το `reset-setup-code` γυρίζει τον νέο κωδικό, δεν χρειάζεται δεύτερη ανάγνωση.
- **Το `api/settings.ts` δεν υπάρχει.** Το architecture.md το απαριθμεί στο folder structure από παλιά· το φτιάχνει το 13-2.
- Το `api/users.ts` έχει σήμερα **μόνο** `getMe()`.
- Οι importers του `@/mocks/data` είναι ακριβώς 5, κατανεμημένοι **1 / 1 / 3** στα τρία υπο-βήματα.

**Ανοιχτά που πάρκαραν σκόπιμα στο υπο-βήμα τους** (αντί να αποφασιστούν τρία βήματα νωρίτερα):
1. **13-2** — αν η αλλαγή του `cycleStartDay` προειδοποιεί. Δεν υπάρχει **σε κανένα** από τα τρία context files, και είναι το πιο αιχμηρό στην οθόνη: το payroll ξαναϋπολογίζεται σε κάθε request και δεν παγώνει ποτέ, άρα η μετακίνηση του ορίου **ξανακόβει κάθε περασμένο κύκλο** — η ίδια ιδιότητα που έκανε τα ποσοστά των ζωνών *απαγορευμένο* πεδίο του `AppSettings`.
2. **13-3** — πού εμφανίζεται ο νέος κωδικός του «New code», και ποια από τα 6 writes παίρνουν toast. Το δεύτερο δαγκώνει στο deactivate: η γραμμή **εξαφανίζεται** πίσω από το φίλτρο, που διαβάζεται ως οριστική διαγραφή ενώ το ιστορικό μισθοδοσίας κρατιέται.

---

## Step 13-1 — Admin: Payroll Overview (frontend)
Status: ✅ Done
Ημερομηνία: 2026-08-31
Αρχεία που προστέθηκαν/άλλαξαν:
- `frontend/src/api/payroll.ts` — `PayrollOverviewRow` + `PayrollOverviewResponse` + `getPayrollOverview()` (επαναχρήση της υπάρχουσας `cycleQuery()`)
- `frontend/src/lib/messages.ts` — `columnName`, `columnOpenShift`, `totalCost` σε `LABELS`· `noEmployees` σε `NOTICES`· και **αλλαγή** του `openShiftOther` (βλ. παρακάτω)
- `frontend/src/components/payroll/PayrollOverview.tsx` — ξαναγράφτηκε ως **presentational**
- `frontend/src/pages/PayrollOverviewPage.tsx` — ξαναγράφτηκε ως η «έξυπνη» σελίδα
- **Νέα specs**: `PayrollOverview.spec.tsx` (13), `PayrollOverviewPage.spec.tsx` (7)
- `context/`: build-plan.md §13-1 (**δύο** διορθώσεις), swifttrack-phase1-final.md §8a
Endpoints/Components:
- `/payroll-overview` (ADMIN) — **μία** κλήση `GET /payroll/overview?cycle=`, επαναχρήση `CycleNavigator` + `useApiQuery` + `lib/format.ts`
- Importers του `@/mocks/data`: **5 → 4** (μένουν `SettingsPage` → 13-2, και `EmployeeForm`/`EmployeeList`/`TeamPage` → 13-3)
- Tests: **135 → 155**
- **Καμία νέα εξάρτηση.**

### Οι τέσσερις αποφάσεις μέσω `/architect`

**Α. Card, όχι `<tfoot>`.** Είχα προτείνει `<tfoot>` επικαλούμενος «το μοτίβο του Step 12». Ο χρήστης αναδιατύπωσε τη σελίδα σωστά: δεν είναι *«πίνακας με σύνολο»* αλλά *«ένα νούμερο που ενδιαφέρει τον admin, με τον πίνακα από κάτω να εξηγεί από πού βγαίνει»*. Ένα `<tfoot>` υποβιβάζει το κύριο νούμερο σε υποσημείωση. ⚠️ Το επιχείρημά μου ήταν αδύναμο και το ομολόγησα: το 13-1 αντιγράφει **τέσσερα** μοτίβα από τα 11-12 και το `<tfoot>` είναι το ένα — το να χτίσω `<tfoot>` για να το έχω χτίσει είναι σχεδιασμός με λίστα ελέγχου.
- **Α.1** `formatIsk(data.totalCost)`, ποτέ `reduce`. ⚠️ **Το επιχείρημα του Step 12 δεν ισχύει αυτούσιο εδώ**: τα `totalPay` είναι ακέραια ISK, άρα ένα `reduce` θα έβγαζε **ταυτόσημο** νούμερο — δεν υπάρχει float πρόβλημα. Ο πραγματικός λόγος είναι ότι απαντούν σε **άλλη ερώτηση**: το `totalCost` είναι «τι κόστισε η επιχείρηση», το `reduce` είναι «τι αθροίζει αυτός ο πίνακας». Ταυτίζονται μέχρι το πρώτο φίλτρο — και το **13-3 χτίζει ακριβώς τέτοιο** («Show deactivated (3)»).
- **Α.2** Το Card εμφανίζεται **πάντα, και με 0** — απόφαση του χρήστη, **αντιστρέφει** το build-plan που έλεγε ότι δεν εμφανίζεται.
- **Α.3** Τίτλος **«Total Cost»**, όχι «Total Monthly Cost» του mockup: ο κύκλος πάει 25→24 και ρυθμίζεται 11-25, άρα **δεν είναι μήνας** — ο admin θα κατέγραφε το ποσό ως «Ιούλιο» ενώ καλύπτει 25 Ιουλ – 24 Αυγ.

**Β. Υβρίδιο: `<Link>` στο όνομα + `onClick` στη γραμμή.** Ο mockup είχε μόνο `onClick` σε `<tr>` — δηλαδή ψεύτικο διαδραστικό στοιχείο: χωρίς `href`, χωρίς focus, αόρατο σε screen reader. ⚠️ **Το «δύο τρόποι» δεν είναι επιλογή αλλά αποτέλεσμα**: αν θες κλικαρίσιμη γραμμή *και* πληκτρολόγιο, χρειάζεσαι anchor μέσα, άρα έχεις εξ ορισμού δύο δρόμους. Οι μόνες διέξοδοι είναι το **stretched link** (αναξιόπιστο μέσα σε `<table>` — positioning context σε `<tr>`/`<td>`) ή **custom ARIA grid** (πολύ βαρύ για 5-15 γραμμές).
- **Β.1** `stopPropagation` στον `<Link>` — αλλιώς ένα κλικ = **δύο** εγγραφές ιστορικού.
- **Β.2** **Χωρίς** `tabIndex`/`role` στη γραμμή: δεύτερο tab stop στον ίδιο προορισμό χειροτερεύει το πληκτρολόγιο.
- **Β.3** `?cycle={data.cycle}`, **όχι** `searchParams`. ⚠️ Ο αρχικός μου λόγος («αλλιώς φεύγει γυμνό και προσγειώνεται αλλού») ήταν **λάθος** — γυμνό link λύνει τον ίδιο default από τον ίδιο server. Οι δύο περιπτώσεις που όντως διαφέρουν: το παράθυρο φόρτωσης μετά το ◀ (το `useApiQuery` κρατάει σκόπιμα τα προηγούμενα δεδομένα), και **καρτέλα αφημένη ανοιχτή πάνω στην αλλαγή κύκλου**. Συν η σταθερότητα του URL προς αντιγραφή.
- ⚠️ Χωρίς υπογράμμιση στο όνομα: την είχα βάλει, και ήταν κατάλοιπο της *προ-υβριδικής* συλλογιστικής — με κλικαρίσιμη ολόκληρη τη γραμμή, υπογράμμιση σε ένα κελί λέει οπτικά «μόνο εδώ δουλεύει».

**Γ. Στήλες `Name / Hours / Total Pay / Open Shift`.** Το §8a **δεν** καρφώνει κείμενο γι' αυτή τη σελίδα, άρα το βήμα το ιδιοκτητεί — αλλά τα `columnHours`/`columnTotalPay` **επαναχρησιμοποιούνται αυτούσια** από το Step 12: ονομάζουν τα ίδια δύο μεγέθη, και δύο λέξεις για ένα νούμερο σε δύο οθόνες είναι ό,τι αποτρέπει το `messages.ts`.
- Η ένδειξη ανοιχτής βάρδιας είναι **εικονίδιο + SVG `<title>`**, το μοτίβο του split marker στο `ShiftList` — όχι `Badge`: το `badgeOpen: "Open"` περιγράφει **βάρδια**, και πάνω σε γραμμή **ανθρώπου** διαβάζεται στραβά.
- ⚠️ **Το `openShiftOther` άλλαξε** από *«missing from this **breakdown**»* σε *«missing from **these figures**»*. Επαναχρησιμοποιείται ως tooltip εδώ, όπου «breakdown» ονομάζει **άλλη σελίδα**. Τρίτη παραλλαγή απορρίφθηκε: η διχοτόμηση `Own`/`Other` υπάρχει επειδή αλλάζει το **ακροατήριο**, και εδώ δεν αλλάζει.

**Δ. Κανένα `useCycleParam()`.** Τρίτος καταναλωτής του ίδιου 3-γραμμου ιδιώματος, αλλά η εξαγωγή θα άγγιζε **δύο πράσινες σελίδες** μέσα σε βήμα που υπάρχει για να είναι η φθηνότερη απόδειξη μεταφοράς μοτίβων. ⚠️ Και δεν είναι τόσο φθηνή όσο φαίνεται: το `setSearchParams({cycle})` **αντικαθιστά όλο** το query string, οπότε ένας κοινός hook ή κωδικοποιεί «το cycle είναι η μόνη παράμετρος» ή θέλει λογική συγχώνευσης. **Τα 13-2 και 13-3 δεν έχουν κύκλους**, άρα τέταρτος καταναλωτής δεν έρχεται στη Φάση 1.

### Το χειροκίνητο πέρασμα — σε επίπεδο API

**Το σχήμα ταιριάζει ακριβώς με τους χειρόγραφους τύπους**: 7 top-level κλειδιά, 5 ανά γραμμή. `Σ rows[].totalPay === totalCost` σε **δύο** κύκλους. ⭐ **Το drill-down είναι πραγματικά η ίδια σελίδα**: `/payroll/65?cycle=2026-08` → 27 h / 69.458, byte-for-byte η γραμμή του overview. Guards: `?cycle=banana` → 400 `INVALID_CYCLE`, χωρίς token → 401.

⭐ **Ο κανόνας «ποιος εμφανίζεται» επαληθεύτηκε με πραγματικά δεδομένα**, και η dev βάση είχε και τις τρεις περιπτώσεις: **Sigríður** ενεργή με 0 ώρες → παρούσα και στους δύο κύκλους· **Kristján απενεργοποιημένος** → **παρών** στον 2026-08 (14 h) όπου έχει ώρες, **απών** στον 2026-07 όπου δεν έχει.

### `/review` — 3 ευρήματα, κανένα Critical

1. 🟠 **Retry που δεν μπορεί ποτέ να πετύχει.** `?cycle=banana` → 400 → μήνυμα **και κουμπί Retry**, που ξαναστέλνει το ίδιο άκυρο cycle. ⚠️ Το project έχει λύσει **ακριβώς αυτό** για το `:userId` (`PayrollPage.spec.tsx`: *«without offering a retry — retrying a malformed URL would fail identically every time»*) και δεν το εφάρμοσε στο `?cycle=`. **Κοινό και στις τρεις σελίδες** — διορθώνεται παντού ή πουθενά.
2. 🟠 **Το `aria-label` σκεπάζει το `<title>`.** Στον υπολογισμό accessible name υπερισχύει το `aria-label`, οπότε ο χρήστης screen reader ακούει *«Open Shift»* και **ποτέ** την εξήγηση, ενώ ο χρήστης ποντικιού την παίρνει με hover — δηλαδή αναιρείται ο σκοπός της απόφασης Γ για μια ομάδα χρηστών. **Προϋπάρχον**: ο `ShiftList` έχει την ίδια δομή στο split marker.
3. 🟡 **Απενεργοποιημένος υπάλληλος χωρίς σήμανση** — το `rows[]` δεν κουβαλάει `isActive`. ⚠️ Χειρότερο απ' ό,τι φαίνεται: με το ◀▶ ένα **όνομα εμφανίζεται και εξαφανίζεται** χωρίς τίποτα να το εξηγεί, και το πρώτο ερώτημα του admin θα είναι «χάθηκαν δεδομένα;». Διόρθωση = πεδίο στο `PayrollOverviewResponseDto`, δηλαδή **backend βήμα**.

⚠️ **Ένα τέταρτο εύρημα αποσύρθηκε.** Είχα χρεώσει ως παράβαση ορίων ότι το component καλεί `useNavigate` και φτιάχνει το URL. Λάθος: ο `ShiftList` **δεν είναι αντιπαράδειγμα** (δεν πλοηγεί πουθενά — έχει *ενέργειες*, που είναι φυσικά callbacks), το μόνο component που όντως πλοηγεί (`Header`) κάνει το ίδιο, τα routes ορίζονται ούτως ή άλλως στο `App.tsx`, και ο `<Link>` **απαιτεί** `href` — άρα callback δεν αρκεί. **Το 13-3 μπορεί να κάνει το ίδιο στο `EmployeeList`.**

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npx tsc -b` καθαρό · `npx eslint .` καθαρό · `vite build` περνάει (το chunk warning προϋπάρχει) · **155/155 vitest** · **grep, όχι από μνήμη**: μηδέν `reduce`/`Math.round`/`toFixed`/`toLocaleString` στα δύο αρχεία, κανένα `fetch(` εκτός `api/`, κανένα import `lib/`→`api/`, καμία inline συμβολοσειρά · χειροκίνητο πέρασμα σε πραγματικό backend + dev βάση.

⚠️ **Έκτο σφάλμα μέτρησης, ξανά στο harness.** Το πρώτο full run βγήκε κόκκινο επειδή ο worker του `ShiftHistoryPage.spec.tsx` **δεν ξεκίνησε** (timeout). Το αρχείο μόνο του: 13/13. Το πλήρες suite δεύτερη φορά: 155/155.

### ⚠️ Ανοιχτά που κληροδοτεί το βήμα

1. **Το tooltip δεν κεντράρεται κάτω από το εικονίδιο** — και **δεν γίνεται** με CSS: το SVG `<title>` παράγει το **native tooltip του browser**, που τοποθετείται στον κέρσορα και δεν στυλάρεται. Λύση = `npx shadcn add tooltip`. ⭐ Ελέγχθηκε στο registry: για το `base-nova` είναι **πραγματικό** (1 αρχείο, 0 npm εξαρτήσεις) — **όχι** κενό κέλυφος όπως το `form.json`. Κόστος: θέλει provider, και για συνέπεια θα έπρεπε να μεταφερθεί και το split marker του `ShiftList` — αλλιώς δύο μηχανισμοί για την ίδια δουλειά. Θα έλυνε **και** το εύρημα 2. **Παρκαρισμένο, όχι απορριφθέν.**
2. Τα τρία ευρήματα του `/review` παραπάνω.
3. **Τα dev warnings του React είναι καθαρά** — ολόκληρο το suite τρέχει σε jsdom με **μηδέν** `key`/`validateDOMNesting`/`act()` προειδοποιήσεις, και το `<a>` μέσα σε `<td>` και το `<title>` μέσα σε `<svg>` περνούν εκεί. Το **πραγματικό** console του browser μένει ανεπαλήθευτο (δεν υπάρχει browser μέχρι το 13b), αλλά τα δύο άκρα του δρόμου ελέγχθηκαν χωριστά: `vite build` περνάει και το API απαντά σωστά με curl.
4. Κληρονομιά: καμία ροή browser δεν έχει επαληθευτεί αυτόματα (Steps 9-12) → **13b**· κανένα `eslint-plugin-import`· το 403 χωρίς `code`.

**Επόμενο βήμα**: **13-2 — Settings**. Φτιάχνει το `api/settings.ts` (δεν υπάρχει), και εκεί **κλειδώνει ο κανόνας του toast** που θα αντιγράψει το 13-3. ⚠️ Ανοιχτό προς απόφαση εκεί: αν η αλλαγή του `cycleStartDay` προειδοποιεί — μετακινεί το όριο και **ξανακόβει κάθε περασμένο κύκλο**.

---

## Step 13-2 — Admin: Settings (frontend)
Status: ✅ Done
Ημερομηνία: 2026-08-31
Αρχεία που προστέθηκαν/άλλαξαν:
- `frontend/src/api/settings.ts` — **νέο**· `Settings`, `getSettings()`, `updateSettings()` και **`deriveCycleEndDay()`**
- `frontend/src/components/settings/ChangeCycleDialog.tsx` — **νέο**, καθρέφτης του `DeleteShiftDialog`
- `frontend/src/pages/SettingsPage.tsx` — ξαναγράφτηκε (η σελίδα κρατάει το write, το `PayCycleForm` τη φόρμα)
- `frontend/src/lib/format.ts` — **`formatOrdinalDay`**, η τέταρτη συνάρτηση της πέμπτης πόρτας
- `frontend/src/lib/messages.ts` — 4 `LABELS`, 5 `NOTICES` (derived text, προειδοποίηση, τίτλος+σώμα dialog, toast)
- **Νέα specs**: `SettingsPage.spec.tsx` (18)· `format.spec.ts` +3
- `context/`: build-plan §13-2 (**μία διόρθωση, μία λύση ανοιχτού**), architecture.md (`SettingsPage`, **2 νέα invariants**, `format.ts`), swifttrack-phase1-final.md §8a
Endpoints/Components:
- `/settings` (ADMIN) — `GET /settings`, `PUT /settings`
- Importers του `@/mocks/data`: **4 → 3** (μένουν `TeamPage`, `EmployeeList`, `EmployeeForm` — όλα στο 13-3, που **σβήνει το αρχείο**)
- Tests: **155 → 176**
- **Καμία νέα εξάρτηση.**

### Οι τέσσερις αποφάσεις μέσω `/architect`

**Α. Base UI `Select` + `Controller` — και το build-plan ήταν λάθος.** Το §13-2 όριζε `z.number()` + `register(..., { valueAsNumber: true })`. ⚠️ Αυτό είναι το ιδίωμα για **native** `<select>`, που δίνει string. Το `SelectRoot<Value>` του `@base-ui/react@1.6.0` είναι **generic ως προς την τιμή** (διαβάστηκε από το `select/root/SelectRoot.d.ts`, όχι από μνήμη), οπότε το πεδίο κρατάει `number` από άκρη σε άκρη και δεν υπάρχει τίποτα να μετατραπεί — ούτε `z.coerce`, ούτε `valueAsNumber`. ⚠️ Το `onValueChange` τυποποιείται `Value | null`, άρα το binding χειρίζεται ρητά το `null`.

**Β. Στατικό κείμενο + `AlertDialog`.** Το πρώτο λέει τι *είναι* η ρύθμιση πριν διαλέξει ο admin· το δεύτερο τι *κάνει στο παρελθόν* τη στιγμή που το κάνει. ⚠️ **Το επιχείρημά μου υπέρ ήταν λάθος** — υποστήριξα ότι «το μοτίβο χτίζεται εδώ για να το αντιγράψει το 13-3», ενώ το `DeleteShiftDialog` υπάρχει **από το Step 11**. Η απόφαση στέκει, η αιτιολόγηση όχι· βλ. εύρημα 4.

**Γ. Ο κανόνας του toast** — τώρα invariant: *ένα επιτυχημένο write επιβεβαιώνεται με toast όταν η οθόνη στην οποία μένει ο χρήστης δεν μπορεί να το δείξει*. Δεν εφευρίσκει τίποτα: **ονομάζει** ό,τι αποφάσισαν ήδη τα Steps 10 (clock-in: όχι toast, η αλλαγή είναι δομική και μόνιμη) και 11 (shift saved: toast, ο dialog κλείνει σε αμετάβλητη λίστα). Για το 13-3 απαντά τα δύο δύσκολα: **deactivate → toast** (η γραμμή εξαφανίζεται πίσω από το φίλτρο και διαβάζεται ως οριστική διαγραφή), **create → όχι** (ανοίγει ο dialog του κωδικού, δυνατότερος από κάθε toast).

**Δ. `formatOrdinalDay` στη `lib/format.ts`.** ⚠️ Με `Intl.PluralRules(…, {type:'ordinal'})` και όχι με κανόνα τελευταίου ψηφίου: ο αφελής κανόνας βγάζει «11st» και «12nd», και **και οι δύο μέρες είναι μέσα στο εύρος που χρησιμοποιεί το project** (τέλος κύκλου 10–24). Επαληθεύτηκε στο συγκεκριμένο Node πριν γραφτεί.

### Ό,τι μετρήθηκε αντί να υποτεθεί

- **`SelectItem.onClick` απορρίπτει κλικ που δεν ξεκίνησε πάνω στο item** (`allowMouseSelectionRef`), επειδή το `alignItemWithTrigger` μπορεί να φέρει item κάτω από τον κέρσορα. Γι' αυτό το `chooseDay()` του spec στέλνει `pointerdown` πριν το `click` — αλλιώς το option απλώς highlight-άρεται και **δεν επιλέγεται τίποτα**. Βρέθηκε διαβάζοντας τον κώδικα του Base UI, όχι με δοκιμή-και-λάθος.
- **Η `<label htmlFor>` όντως συνδέεται με το Base UI trigger** (button, labelable element): probe με `getByRole("combobox", { name: "Cycle Start Day" })` → 1. Ένα υποψήφιο εύρημα προσβασιμότητας **αποσύρθηκε λόγω μέτρησης**.
- Το `watch()` του `useForm` **απενεργοποιεί τον React Compiler για όλο το component** (`react-hooks/incompatible-library`). Αντικαταστάθηκε με `useWatch`. Ήταν το μοναδικό warning του project.

### `/review` — 9 ευρήματα, 7 κλειστά

**Κλειστά:**
1. 🔴 Τα context files δεν ήταν ενημερωμένα (το βήμα διακόπηκε στη μέση). Ενημερώθηκαν και τα τρία.
2. 🟠 Η λάθος προκείμενη της απόφασης Β — γραμμένη ρητά στο build-plan.
3. 🟠 ⭐ **Ο κανόνας `− 1` υπήρχε σε τρία σημεία**: η πρόταση κάτω από το select, το σώμα του `PUT`, το κείμενο του dialog. Είναι η **μοναδική αριθμητική της σελίδας** — αυτή που ο κώδικας ξοδεύει δέκα γραμμές σχολίου να δικαιολογήσει — και με τρία αντίγραφα μια αλλαγή στο ένα κάνει τη σελίδα να *λέει* μια μέρα και να *στέλνει* άλλη. Ένα `deriveCycleEndDay()` στο `api/settings.ts`. ⚠️ Το spec το κρατάει **πραγματικό** με `importOriginal` — mock της συνάρτησης θα απεδείκνυε το mock.
4. 🟠 **Δεύτερη ροή επιβεβαίωσης.** Το `DeleteShiftDialog` κρατάει σκόπιμα τον dialog **ανοιχτό** στην αποτυχία (*«a failed delete has to keep the dialog open to show why»*)· το πρώτο μου draft έκλεινε αμέσως — **η αντίθετη απόφαση, παρμένη χωρίς να ξέρω ότι υπήρχε η πρώτη**. Το `ChangeCycleDialog` τώρα το καθρεφτίζει ένα προς ένα.
5. 🟡 Το write ζούσε στο component· πήγε στη σελίδα, όπως στο `ShiftHistoryPage`.
6. 🔴 Δεν είχε γίνει χειροκίνητο πέρασμα — έγινε, βλ. παρακάτω.
9. 🟡 Δεν είχε γίνει spike — έγινε.

**Αφέθηκαν εν γνώσει:**
7. 🟡 **Αποτυχημένο refetch περνάει σιωπηλά.** Ο έλεγχος `error !== null && data === null` είναι **ίδιος σε τέσσερις σελίδες**· διόρθωση μόνο εδώ είναι το λάθος που κατέγραψε το εύρημα 6 του Step 12. Και δεν παραπληροφορεί: το save πέτυχε και ειπώθηκε με toast, και στην οθόνη είναι ό,τι μόλις σώθηκε. Αν φτιαχτεί, φτιάχνεται στο `useApiQuery` ή και στις τέσσερις.
8. 🟡 **Η φόρμα αγνοεί αλλαγμένο `settings` prop** (δεύτερος admin, δεύτερη καρτέλα). Δεν υπάρχει optimistic concurrency **πουθενά** στην εφαρμογή — το ίδιο ισχύει στο `PUT /users/:id`. Η φθηνή λύση (remount) θα πετούσε την ανοιχτή επιλογή του admin.

### ⭐ Spike — 5 σκόπιμες βλάβες, 9 κόκκινα, όλα στο σωστό test

Η μία παραγωγή του `− 1` αντεστραμμένη (**4 κόκκινα** — η ίδια η απόδειξη ότι είναι μία) · `PUT` που παύει να είναι πλήρης αντικατάσταση · dialog που κλείνει στην αποτυχία · **Cancel που γράφει** · φόρμα που δεν ξανασιωπά. Καμία δεν πέρασε σιωπηλά. Αντίγραφα **μέσα** στο project (`.spike-backup/`, διαγράφηκε), επαναφορά επαληθευμένη με `diff -q` και στα τρία αρχεία, `grep SPIKE` → 0.

### ⭐ Το χειροκίνητο πέρασμα — αυτό που κανένα test δεν μπορούσε να δει

Όλα τα specs κάνουν mock το `@/api/settings`, άρα **τίποτα δεν είχε επαληθεύσει αυτό ακριβώς για το οποίο υπάρχει η σελίδα**. Κόντρα σε πραγματικό backend + dev βάση:

| | `cycleStartDay = 25` | `= 20` |
|---|---|---|
| `cycleStart`/`cycleEnd` | 25 Αυγ – 24 Σεπ | **20 Αυγ – 19 Σεπ** |
| `totalHours` (user 65) | 27 | **55** |
| `totalPay` | 69.458 | **141.292** |

⭐ **Ο κύκλος ξανακόπηκε πραγματικά** — και το ίδιο όριο εμφανίστηκε ταυτόσημο και στο `GET /time-entries`, δεύτερο endpoint. Αυτό είναι η επαλήθευση της προειδοποίησης που γράφει η σελίδα, και δεν υπάρχει άλλος τρόπος να παρθεί.

Επίσης ζωντανά, **και τα τρία 400**: μη-συνεχόμενο ζεύγος `{20,18}` · εκτός εύρους `{26,25}` · **`PUT` χωρίς `cycleEndDay`** — που είναι η απόδειξη ότι ο client *υποχρεούται* να παράγει τη μέρα λήξης, δηλαδή ο λόγος ύπαρξης της `deriveCycleEndDay`.

**Καθαρισμός επαληθευμένος**: επαναφορά σε 25/24, και το payroll του 65 συγκρίθηκε προγραμματιστικά με το before state → **ταυτόσημο**.

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npx tsc -b` καθαρό · `npx eslint .` καθαρό, **μηδέν warnings** · `vite build` περνάει (το chunk warning προϋπάρχει) · **176/176 vitest** · **grep, όχι από μνήμη**: μηδέν `reduce`/`Math.round`/`toFixed`, κανένα `new Date`/`toLocale*`, κανένα `fetch(` εκτός `api/`, κανένα import `lib/`→`api/`, καμία inline συμβολοσειρά.

⚠️ **Όγδοο σφάλμα μέτρησης, ξανά στο harness.** Ένα full run έβγαλε **13 αρχεία / 158 tests / «1 error»** — ο worker του `SettingsPage.spec.tsx` δεν ξεκίνησε καθόλου. Δεύτερο run: 14/176. Ακριβώς το ίδιο συμβάν με το 13-1 (εκεί ήταν το `ShiftHistoryPage.spec.tsx`). **Μοτίβο πλέον, όχι περιστατικό: ένα κόκκινο ή ελλιπές full run επιβεβαιώνεται με δεύτερο run πριν χρεωθεί στον κώδικα.**

### ⚠️ Ανοιχτά που κληροδοτεί το βήμα

1. Τα ευρήματα 7 και 8 παραπάνω.
2. Καμία ροή browser δεν έχει επαληθευτεί αυτόματα (κληρονομιά Steps 9–13-1) → **13b**. Το πέρασμα εδώ ήταν σε επίπεδο API, όπως και στο 13-1.
3. Κληρονομιά: κανένα `eslint-plugin-import`· το 403 χωρίς `code`· το parked tooltip του 13-1.

**Επόμενο βήμα**: **13-3 — Team**, το μεγάλο: έξι endpoints, δύο dialogs, **τρία** badges, φίλτρο με μετρητή. **Σβήνει το `mocks/data.ts`** (3 → 0). Αντιγράφει αντί να αποφασίζει: ο κανόνας του toast (Γ παραπάνω) και το `ChangeCycleDialog`/`DeleteShiftDialog` ως το ένα μοτίβο επιβεβαίωσης. Το `SCREEN_ERRORS.team` περιμένει τον πρώτο του καταναλωτή από το Step 9.

---

## Step 13-3 — Admin: Team (frontend)
Status: ✅ Done
Ημερομηνία: 2026-08-31
Αρχεία που προστέθηκαν/άλλαξαν:
- `frontend/src/api/users.ts` — **`UserResponse` standalone**, `isPending()`, και οι **έξι** συναρτήσεις των endpoints
- `frontend/src/components/team/SetupCodeDialog.tsx` — **νέο**, ένα component / δύο call sites
- `frontend/src/components/team/DeactivateEmployeeDialog.tsx` — **νέο**, καθρέφτης του `DeleteShiftDialog`
- `frontend/src/components/team/EmployeeForm.tsx` — ξαναγράφτηκε (`useState` → rhf + zod, **χωρίς email σε edit**)
- `frontend/src/components/team/EmployeeList.tsx` — τρία badges, φίλτρο με μετρητή, `formatRate`
- `frontend/src/pages/TeamPage.tsx` — ξαναγράφτηκε· η σελίδα κατέχει και τα έξι writes
- `frontend/src/lib/messages.ts` — 15 `LABELS` (η **πρώτη συνάρτηση** στο `LABELS`), 3 `VALIDATION`, 8 `NOTICES`
- **Νέο spec**: `TeamPage.spec.tsx` (31, **→ 33** μετά το `/review`)
- 🔴 **`frontend/src/mocks/data.ts` ΔΙΑΓΡΑΦΗΚΕ** μαζί με τον φάκελο `src/mocks/`
- `context/`: build-plan §13-3 (**τρεις διορθώσεις, δύο λύσεις ανοιχτών**), architecture.md (`TeamPage`, **3 νέα invariants**), spec §8a (ενότητα Team)
Endpoints/Components:
- `/team` (ADMIN) — `GET /users`, `POST /users`, `PUT /:id`, `DELETE /:id`, `PATCH /:id/reactivate`, `POST /:id/reset-setup-code`
- Importers του `@/mocks/data`: **3 → 0**. Από 13 στο Step 9. **Το αρχείο δεν υπάρχει πια.**
- Tests: **176 → 209** (207 στο χτίσιμο, +2 από το `/review`)
- **Καμία νέα εξάρτηση.**

### ⭐ Το εύρημα του βήματος — η τέταρτη κατάσταση

Ο πίνακας badges του build-plan γράφει `isActive: false` + `hasActivated: **either**`. Αυτό το «either» έκρυβε απόφαση. **Μετρήθηκε ζωντανά, δεν συλλογίστηκε:**

| Τι ελέγχθηκε | Αποτέλεσμα |
|---|---|
| `DELETE /users/:id` καθαρίζει τον `setupCode`; | **Όχι** — ο κωδικός `8776` επιβίωσε ατόφιος |
| `set-initial-password` με αυτόν τον κωδικό | **401 `ACCOUNT_DEACTIVATED`** — ελέγχει το `isActive` *πριν* τον κωδικό |
| `reset-setup-code` σε **απενεργοποιημένο** | **200**, εξέδωσε νέο κωδικό `7863` — αρνείται μόνο τον ήδη ενεργοποιημένο |

Δηλαδή το backend εκδίδει ευχαρίστως κωδικό που **δεν μπορεί να δουλέψει**. Η γραμμή κρύβει κωδικό και κουμπί· ο έλεγχος είναι το **`isPending()`**, μία υλοποίηση. Το `!hasActivated` σκέτο είναι το bug, και το spike το αποδεικνύει (αντιστροφή → 2 κόκκινα).

### Οι τέσσερις αποφάσεις μέσω `/architect`

**Α. Η τέταρτη κατάσταση κρύβει κωδικό και «New code».** Ίδιος κανόνας που κάνει το `Reactivate` να αντικαθιστά το `Deactivate`: ποτέ ενέργεια εγγυημένα άχρηστη.
**Β. Inline κουμπιά**, το μοτίβο του `ShiftList` (Step 11) — όχι νέο dropdown, παρόλο που το `dropdown-menu.tsx` υπάρχει αχρησιμοποίητο.
**Γ. Toast μόνο στο deactivate.** Τα άλλα πέντε αφήνουν ορατή αλλαγή — η ίδια η συνθήκη του κανόνα του 13-2.
**Δ. Το «New code» ξανανοίγει τον ίδιο dialog** — η επανέκδοση έχει το ίδιο πρόβλημα με τη δημιουργία.

### Τρεις διορθώσεις στο build-plan

1. 🔴 **«it cannot be undone from the app» ήταν ψευδές.** Το `PATCH /reactivate` προστέθηκε στο **Step 8c** ακριβώς για να αναιρείται, και το `Reactivate` κάθεται στην ίδια γραμμή. Η φράση προηγείται του endpoint. Θα τρόμαζε τον admin από αναστρέψιμη ενέργεια.
2. 🟠 **«an input whose value the API silently ignores».** Δεν το αγνοεί: `PUT` με `email` → **400 `["property email should not exist"]`**. Άρα το disabled input του mockup δεν ήταν κακό affordance — αν η τιμή του υποβαλλόταν, **κάθε edit θα αποτύγχανε**.
3. 🟡 Ο πίνακας badges (η τέταρτη κατάσταση παραπάνω).

### Δύο πράγματα που το plan δεν προέβλεψε

- **`toast.error`, νέο μοτίβο.** Τα `Reactivate` και `New code` είναι τα **πρώτα writes χωρίς dialog και χωρίς form** — αποτυγχάνουν σιωπηλά χωρίς αυτό. Είναι επίσης ο **μοναδικός δρόμος** από τον οποίο φτάνει το `SCREEN_ERRORS.team`: το `ACCOUNT_ALREADY_ACTIVATED` γυρίζει από το `reset-setup-code` σε μπαγιάτικη λίστα. Χωρίς αυτό, το override του Step 9 θα έμενε άφταστο.
- **Η σελίδα έχει *δύο* empty states.** Το `noEmployees` για `[]`, και ένα δεύτερο για «όλοι απενεργοποιημένοι + φίλτρο κλειστό», όπου το πρώτο θα ήταν **ψευδές** και θα έστελνε τον admin να δημιουργήσει λογαριασμό ενώ οι άνθρωποι είναι ένα toggle μακριά.

### ⭐ Spike — 5 σκόπιμες βλάβες, 7 κόκκινα, όλα στο σωστό test

`isPending` χωρίς το `isActive` (**2 κόκκινα**) · `statusBadge` που ελέγχει `hasActivated` πρώτο (το ίδιο το δι-badge bug) · email σε edit mode · dialog που κλείνει στην αποτυχία · μετρητής που μετράει τους πάντες (**2 κόκκινα**). **Καμία δεν πέρασε σιωπηλά**, καμία δεν σκόρπισε κόκκινα σε άσχετα tests. Επαναφορά επαληθευμένη byte-για-byte και στα 4 αρχεία, `grep SPIKE` → 0, το harness (`spike.mjs`, `.spike-backup/`) διαγράφηκε.

### ⭐ Το χειροκίνητο πέρασμα — όλα τα specs κάνουν mock το `@/api/users`

Κόντρα σε πραγματικό backend + dev βάση: τα **9 κλειδιά** του `UserResponse` ταυτίστηκαν ένα προς ένα με τον standalone τύπο· `POST` → κωδικός + λήξη **3 ημερών**· `PUT` καθαρό 200· `PUT` με email **400**· `reset-setup-code` `8267 → 8776`· `DELETE` → `isActive:false` με τον κωδικό ζωντανό· `PATCH reactivate` → 200· `GET /users` περιλαμβάνει τους απενεργοποιημένους, **ταξινομημένους κατά όνομα** (επαληθεύτηκε προγραμματιστικά).

**Καθαρισμός επαληθευμένος**: η γραμμή που δημιουργήθηκε (id 72) επιθεωρήθηκε πρώτα (0 εξαρτημένα `TimeEntry`), σβήστηκε με στοχευμένο `DELETE ... WHERE email = …`, και το `GET /users` επέστρεψε στους **5** αρχικούς.

⚠️ **Ένατο σφάλμα μέτρησης, ξανά στο harness.** Το sweep script διάβαζε `access_token` ενώ το `POST /auth/login` επιστρέφει **`accessToken`** — login 200, κάθε επόμενη κλήση 401. Φάνηκε αμέσως ως «όλα 401 μετά από επιτυχές login», δεν χρεώθηκε ποτέ στον κώδικα, και τίποτα δεν γράφτηκε στη βάση σε εκείνο το πέρασμα. **Εννέα στα εννέα: το harness, ποτέ ο κώδικας.**

### Επαλήθευση (πραγματικά εκτελεσμένη)

`npx tsc -b` καθαρό · `npx eslint .` καθαρό, **μηδέν warnings** · `vite build` περνάει (chunk warning προϋπάρχει) · **209/209 vitest σε 15 αρχεία** (207 πριν το `/review`), πλήρες run χωρίς χαμένο worker · **grep, όχι από μνήμη**: κανένα `fetch(` εκτός `api/`, κανένα `new Date`/`toLocale*`, κανένα `toFixed`, κανένα import `lib/`→`api/`, καμία inline συμβολοσειρά στα team components, **μηδέν αναφορές σε `mocks`**.

### `/review` — δεύτερο, ανεξάρτητο πέρασμα: 2 ευρήματα, 1 διορθώθηκε, 1 απόφαση

Το πρώτο πέρασμα ήταν αυτοαξιολόγηση γραμμένη στη ροή του χτισίματος. Το δεύτερο βρήκε δύο πράγματα που εκείνο δεν είχε δει — και **διέψευσε με μέτρηση** δύο υποψίες (το `<label>` γύρω από το `Switch` **δεν** κάνει διπλό toggle· **μηδέν** React warnings σε όλο το spec).

**1. 🟠 ΔΙΟΡΘΩΘΗΚΕ — όνομα μόνο με κενά έφτανε άδειο στο API.**

Μετρήθηκε end-to-end μέσα από την πραγματική φόρμα: `createEmployee` κλήθηκε με `{"name":"","email":"x@y.local","hourlyRate":3500}`. Το `.min(1)` έβλεπε μήκος 3, και το `.trim()` ζούσε στο `submit()` — **μετά** το validation. Το backend το απέρριπτε με `@MinLength(1)` → `ValidationPipe` 400 **χωρίς `code`** → `UNKNOWN_ERROR` → ο admin διάβαζε *«Something went wrong. Please try again.»* πάνω από φόρμα με ορατά συμπληρωμένο όνομα.

⚠️ **Η σειρά είναι όλος ο κανόνας**, μετρημένη στο εγκατεστημένο zod 4.5.1:

| | |
|---|---|
| `z.string().trim().min(1)` σε `"   "` | **απορρίπτει** · και το `" ok "` γίνεται `"ok"` |
| `z.string().min(1).trim()` σε `"   "` | **περνάει, με `""`** — ακριβώς το bug |
| `z.email()` σε `" a@b.local "` | απορρίπτει ήδη· το `.trim()` τρέχει **μετά** τον έλεγχο μορφής, άρα εκεί δεν χρειάζεται τίποτα |

Η διόρθωση μετακίνησε το trim **μέσα** στο schema και το αφαίρεσε από το `submit()`: μία υλοποίηση, και ο `zodResolver` παραδίδει τις **parsed** τιμές. **+2 tests** (207 → 209), και το ένα από τα δύο υπάρχει ακριβώς για να αποδεικνύει αυτό το τελευταίο.

⭐ **Spike στη διόρθωση, 2 βλάβες:** λάθος σειρά (`.min(1).trim()`) → **1 κόκκινο**· καθόλου trim → **2 κόκκινα**. Η ασυμμετρία είναι το ζητούμενο: το `.min(1).trim()` εξακολουθεί να κόβει την *τελική* τιμή, οπότε μόνο το πρώτο test φυλάει τη σειρά, ενώ το δεύτερο φυλάει την ύπαρξη. Κανένα από τα δύο δεν είναι περιττό.

**2. ✅ ΑΠΟΦΑΣΗ, ΟΧΙ ΕΚΚΡΕΜΟΤΗΤΑ — ο κωδικός μένει `text-4xl font-mono tracking-widest`.**

Το review το σήμανε ως design drift, και το εύρημα ήταν σωστό ως **μέτρηση**: `text-4xl`, `font-mono` και `tracking-widest` δεν υπάρχουν πουθενά αλλού στο project, και το step 13-1 έχει ήδη μια απόδοση για «τον έναν μεγάλο αριθμό της οθόνης» — `text-2xl font-semibold tabular-nums` στην κάρτα `totalCost`. Ο κωδικός γίνεται έτσι το μεγαλύτερο κείμενο της εφαρμογής, πάνω κι από κάθε επικεφαλίδα σελίδας (`text-xl`).

**Κρατήθηκε συνειδητά (απόφαση χρήστη).** Τα δύο πράγματα δεν είναι ίδιος ρόλος: το `totalCost` **διαβάζεται**, ο setup code **αντιγράφεται σε χαρτί και υπαγορεύεται**. Το `font-mono` και το `tracking-widest` υπηρετούν τη μεταγραφή (τέσσερα ψηφία που δεν πρέπει να συγχέονται), και το μέγεθος υπηρετεί το ότι διαβάζεται από απόσταση. ⚠️ **Μην «διορθωθεί» σε `text-2xl` για ομοιομορφία** — δεν είναι παράλειψη, είναι η μία σκόπιμη εξαίρεση στην κλίμακα.

⚠️ **Δεν υπάρχει `ui-registry.md` στο project**, παρότι το skill `imprint` υπάρχει γι' αυτό. Αν υπήρχε, η εξαίρεση θα ήταν γραμμένη εκεί αντί μόνο εδώ.

### ⚠️ Ανοιχτά που κληροδοτεί το βήμα

1. **Το εύρημα 7 του 13-2 αφορά τώρα ΠΕΝΤΕ σελίδες**, όχι τέσσερις: ο έλεγχος `error !== null && data === null` είναι πανομοιότυπος σε `PayrollOverviewPage`, `PayrollPage`, `SettingsPage`, `ShiftHistoryPage`, `TeamPage` — ένα αποτυχημένο refetch περνάει σιωπηλά και στις πέντε. Αν φτιαχτεί, φτιάχνεται στο `useApiQuery` ή και στις πέντε μαζί.
2. 🟡 **Το `EmployeeForm` κρατάει το `email` στο schema και σε edit mode**, σπαρμένο από τον server, ενώ το πεδίο δεν renderάρεται. Σήμερα ακίνδυνο (το backend επιβάλλει `@IsEmail` στη δημιουργία, άρα περνάει πάντα), αλλά είναι αόρατο πεδίο που θα μπορούσε να μπλοκάρει submit χωρίς ορατό μήνυμα. Η φθηνή λύση θέλει δύο schemas.
3. 🟡 **Το σχήμα του body το αποφασίζει το form, το endpoint η σελίδα** — και τα δύο από το ίδιο `employee`/`editing`, οπότε συμφωνούν εκ κατασκευής· δύο παραγωγές ενός γεγονότος, όχι δύο αντίγραφα κανόνα.
4. Καμία ροή browser δεν έχει επαληθευτεί αυτόματα (κληρονομιά Steps 9–13-2) → **13b**. Το πέρασμα εδώ ήταν σε επίπεδο API, όπως στα 13-1 και 13-2.
5. Κληρονομιά: κανένα `eslint-plugin-import`· το 403 χωρίς `code`· το parked tooltip του 13-1· το εύρημα 8 του 13-2 (καμία optimistic concurrency πουθενά).

**Επόμενο βήμα**: **13b — Frontend E2E (Playwright)**. Όλες οι σελίδες υπάρχουν πλέον, άρα οι ροές που δεν μπορούσαν να γραφτούν νωρίτερα («ο admin αλλάζει το rate ενός υπαλλήλου») είναι γραπτές. ~30-35 tests, breadth όχι depth. ⚠️ **Πρώτα το harness με λίγα smoke tests** — εννέα σφάλματα μέτρησης, εννέα φορές το harness. Ανοιχτό προς απόφαση εκεί: το Playwright MCP.

---

# ✅ ΛΥΜΕΝΟ (2026-08-05) — οι τρεις αποφάσεις πάρθηκαν

**Δεν είναι πλέον blocker· μην ξαναρωτήσεις.** Απαντήθηκαν μέσω `/architect` πριν το Step 5, μαζί με μια τέταρτη που προέκυψε από τους mockups. Οι κανόνες ζουν πλέον στο spec **§7a**, στο `build-plan.md` §5 και στα invariants του `architecture.md`· το σκεπτικό στην εγγραφή του Step 5 παραπάνω. Το κείμενο που ακολουθεί μένει **ως ιστορικό** του τι ρωτήθηκε και γιατί.

Προέκυψαν από έλεγχο των context files στο τέλος του Step 4, διασταυρωμένο με τους εγκεκριμένους mockups. Το spec δίνει στον υπάλληλο `POST`/`PUT`/`DELETE` πάνω στις **δικές του** εγγραφές (spec §4, απόφαση 2 & 4) — δηλαδή γράφει μόνος τις ώρες που πληρώνεται. Αυτό ήταν συνειδητά αποδεκτό. Αυτό που **δεν** συζητήθηκε ποτέ είναι τι εμποδίζει μια εγγραφή να είναι *αδύνατη* ή *διπλομετρημένη*.

### Απόφαση Α — Πρέπει το `endTime` να είναι μετά το `startTime`;

Σήμερα τίποτα δεν το επιβάλλει. Αν κάποιος γράψει βάρδια που τελειώνει πριν αρχίσει, το `hoursWithinCycle()` επιστρέφει **0** (έχει `Math.max(0, ...)`) — άρα **δεν** βγαίνει αρνητικός μισθός· η βάρδια απλώς μετράει σαν ανύπαρκτη. Ο υπάλληλος τη βλέπει στη λίστα του, με κανονικές ώρες γραμμένες, και δεν πληρώνεται γι' αυτήν — **χωρίς κανένα μήνυμα λάθους πουθενά**.

- **Πρόταση: απόρριψη με 400** (και για ίσες ώρες — μηδενική βάρδια δεν έχει νόημα).
- Δευτερεύον ερώτημα αν πεις ναι: θέλουμε και **ανώτατο όριο διάρκειας**; Μια βάρδια 300 ωρών είναι σχεδόν σίγουρα λάθος ημερομηνίας, αλλά ένα 16ωρο είναι υπαρκτό. Δεν έχω πρόταση εδώ — εξαρτάται από το πώς δουλεύει η επιχείρηση.

### Απόφαση Β — Επιτρέπονται επικαλυπτόμενες βάρδιες;

Δύο εγγραφές 08:00-16:00 και 12:00-20:00 την ίδια μέρα δίνουν **16 ώρες για 12 δουλεμένες**. Δεν είναι σενάριο κακής πρόθεσης — προκύπτει από διπλή καταχώρηση ή από διόρθωση που ξεχάστηκε στη μέση.

Σημείωσε τη διαφορά από το «ο υπάλληλος γράφει τις ώρες του», που έχει ήδη γίνει δεκτό: εκεί δηλώνει τι δούλεψε· εδώ το σύστημα μετράει **δύο φορές τον ίδιο χρόνο**. Ένας άνθρωπος δεν μπορεί να είναι σε δύο βάρδιες ταυτόχρονα, άρα η επικάλυψη είναι πάντα σφάλμα, ποτέ έγκυρη περίπτωση.

- **Πρόταση: απόρριψη με 400.** Ο έλεγχος είναι ένα Prisma query με το ίδιο overlap predicate που ήδη χρησιμοποιούμε. Στο `PUT` πρέπει να εξαιρείται η ίδια η εγγραφή που επεξεργάζεσαι (`id: { not: id }`) — αλλιώς κάθε edit συγκρούεται με τον εαυτό του.
- Εναλλακτικά: επιτρέπεται και είναι ευθύνη του admin να το δει στο Payroll Overview.

### Απόφαση Γ — Μπορεί η χειροκίνητη προσθήκη να δημιουργήσει **ανοιχτή** βάρδια;

Ο εγκεκριμένος `ShiftForm.tsx` έχει το End Time **χωρίς** `required` ([ShiftForm.tsx:76-82](frontend/src/components/shifts/ShiftForm.tsx#L76-L82)), άρα η φόρμα *μπορεί* να στείλει `endTime: null`.

Αν επιτραπεί, ανοίγει τρύπα στον κανόνα «το πολύ μία ανοιχτή βάρδια», που το `clock-in` επιβάλλει αυστηρά: μέσω της φόρμας φτιάχνεις πέντε ανοιχτές βάρδιες ενώ το κουμπί αρνείται τη δεύτερη. Το ίδιο ισχύει και για το `PUT` — αν επιτρέπεται `endTime: null` εκεί, «ξανανοίγεις» κλεισμένη βάρδια και παρακάμπτεις τον κανόνα από την πίσω πόρτα.

- **Πρόταση: απόρριψη — `endTime` υποχρεωτικό στο `POST /time-entries` και στο `PUT`.** Η χειροκίνητη προσθήκη υπάρχει για *ξεχασμένη* βάρδια, που εξ ορισμού έχει ήδη τελειώσει· το «είμαι μέσα τώρα» είναι δουλειά του clock-in. Κόστος: το End Time γίνεται `required` στο Step 11 (μικρή αλλαγή στον mockup).
- Εναλλακτικά: επιτρέπεται, αλλά τότε **πρέπει** να επιβληθεί ο ίδιος έλεγχος «μία ανοιχτή βάρδια» και στα δύο endpoints, αλλιώς ο κανόνας του clock-in είναι διακοσμητικός.

---

### Τι ΔΕΝ χρειάζεται απόφαση — διορθώθηκε ήδη στα context files

Ο ίδιος έλεγχος βρήκε δύο αντιφάσεις που δεν ήταν θέμα γούστου αλλά λάθη, και κλείστηκαν:

1. **Οι ανοιχτές βάρδιες αποκλείονταν από το ίδιο τους το query.** Το architecture.md έλεγε «listed under the cycle containing their startTime», ενώ το query του plan είχε `endTime: { not: null }` που τις σβήνει. Ο εγκεκριμένος `ShiftList` κάνει render κόκκινο badge **"Open"** ακριβώς γι' αυτές — δηλαδή ο υπάλληλος που ξέχασε clock-out δεν θα είχε **καμία** οθόνη να τη βρει. Το build-plan §5 έχει πλέον το σωστό `OR` query, και το invariant στο architecture.md λέει ρητά ότι το query της λίστας **δεν** είναι το query του payroll.
2. **Το `GET /time-entries?userId=` δεν είχε `?cycle=`**, ενώ ο admin βλέπει το ιστορικό στο `/shifts/:userId` με το **ίδιο** `ShiftList` και το **ίδιο** `CycleNavigator`. Ίδια κατηγορία με το `setupCode` του Step 2: ο εγκεκριμένος mockup χρειαζόταν κάτι που το API δεν έδινε.

Προστέθηκαν επίσης: το κοινό σχήμα απάντησης των δύο list endpoints (`{ cycleBlock, entries: [...] }` με `hoursInCycle`/`isSplit` ανά εγγραφή), και το **`GET /time-entries/open`** — χωρίς αυτό ο `ClockButton` του Step 10 δεν ξέρει τι label να δείξει στο load, επειδή ανοιχτή βάρδια από **προηγούμενο** κύκλο δεν εμφανίζεται στη λίστα του τρέχοντος.

---

# ✅ ΛΥΜΕΝΟ (2026-08-06) — οι δύο αποφάσεις του Step 6 πάρθηκαν

**Δεν είναι πλέον blocker· μην ξαναρωτήσεις.** Απαντήθηκαν μέσω `/architect` πριν το Step 6, και η συζήτηση πήγε **πολύ πιο μακριά** από τα δύο αρχικά ερωτήματα: ο χρήστης έδωσε τον πραγματικό υπολογισμό με ζώνες χρέωσης και δήλωσε τον mockup προσχέδιο.

- **Απόφαση Α → ΝΑΙ**, το `GET /payroll/overview?cycle=` χτίστηκε στο Step 6.
- **Απόφαση Β → υπερκεράστηκε.** Το breakdown δεν είναι πια «γραμμή ανά βάρδια με ή χωρίς pay»: είναι **summary ανά ζώνη** (με `rate` και `pay` ανά γραμμή) **συν πίνακας ανά ημέρα** (μόνο ώρες). Οι κανόνες στρογγυλοποίησης ζουν στο spec **§4 απόφαση 5d** και στα invariants του `architecture.md`· το σκεπτικό στην εγγραφή του Step 6 παραπάνω.

Το κείμενο που ακολουθεί μένει **ως ιστορικό** του τι ρωτήθηκε και γιατί.

Προέκυψαν από έλεγχο των context files μετά το Step 5, διασταυρωμένο με τους εγκεκριμένους mockups. Είναι η **ίδια οικογένεια** με το `setupCode` του Step 2, το `?cycle=` του Step 4 και το `userId` του Step 5: ο εγκεκριμένος mockup χρειάζεται κάτι που το API δεν δίνει.

### Απόφαση Α — χρειάζεται endpoint για το Payroll Overview;

Το spec §6 έχει **μόνο** `GET /payroll/me` και `GET /payroll/:userId`. Ο εγκεκριμένος `PayrollOverview.tsx` (admin, spec §8 σελίδα 6) χρειάζεται όμως, **ανά υπάλληλο για έναν κύκλο**: όνομα, ώρες, πληρωμή, **ένδειξη ανοιχτής βάρδιας**, και το συνολικό κόστος της ομάδας.

Δύο πράγματα το κάνουν πραγματικό κενό, όχι θέμα γούστου:

1. Χωρίς endpoint, το Step 13 καλεί `/payroll/:userId` **μία φορά ανά υπάλληλο** από τον browser (N+1 από το δίκτυο), και μετά αθροίζει μόνο του το συνολικό κόστος — δηλαδή υπολογισμό μισθοδοσίας στο frontend, που παραβιάζει το «ο backend είναι η μοναδική πηγή αλήθειας».
2. Το `hasOpenShift` **δεν το δίνει κανένα endpoint** για τρίτο πρόσωπο. Το `/time-entries/open` είναι EMPLOYEE-only και επιστρέφει μόνο τη δική σου. Άρα η κόκκινη ένδειξη του mockup σήμερα είναι αδύνατη.

Επιπλέον το `architecture.md` **ήδη υποθέτει ότι υπάρχει**: στο invariant του default `?cycle=` απαριθμεί «the admin payroll overview» ως ένα από τα **τρία** call sites. Δηλαδή τα docs παραπέμπουν σε endpoint που δεν προδιαγράφηκε ποτέ.

- **Πρόταση: `GET /payroll/overview?cycle=` (ADMIN)** — μία κλήση, ένα cycle block, γραμμή ανά ενεργό υπάλληλο (`userId`, `name`, `totalHours`, `totalPay`, `hasOpenShift`) και `totalCost`. Χτίζεται στο Step 6 μαζί με τα άλλα δύο, γιατί μοιράζεται τον ίδιο υπολογισμό· αν πάει στο 13, το Step 13 θα το ζητήσει ούτως ή άλλως και τότε θα ανοίγουμε ξανά backend βήμα μέσα σε frontend βήμα.
- Εναλλακτικά: μένει εκτός, και το Payroll Overview γίνεται πιο απλή σελίδα (χωρίς την ένδειξη ανοιχτής βάρδιας) — αλλά τότε πρέπει να αλλάξει ο εγκεκριμένος mockup.

### Απόφαση Β — τι ακριβώς επιστρέφει το `GET /payroll`, και πώς στρογγυλοποιεί;

Το build-plan §6 λέει μόνο «`totalHours`, `totalPay`, cycle block». Ο εγκεκριμένος `PayrollBreakdown.tsx` όμως κάνει render **γραμμή ανά βάρδια** (Date / Hours / Pay), άρα το response χρειάζεται και τις γραμμές — αλλιώς η σελίδα δεν γίνεται.

Και υπάρχει παγίδα στη στρογγυλοποίηση. Ο mockup ([PayrollBreakdown.tsx:108](frontend/src/components/payroll/PayrollBreakdown.tsx#L108)) κάνει `Math.round(hours * rate)` **ανά γραμμή**, ενώ το σύνολο είναι `Math.round(totalHours * rate)`. Επειδή `Σ round(...) ≠ round(Σ ...)`, **η στήλη Pay δεν θα αθροίζει στο Total Pay** — ο υπάλληλος βλέπει τρεις αριθμούς που δεν βγάζουν τον τέταρτο. Είναι η **ίδια οικογένεια** με το splitting του Step 4 («η στήλη Hours πρέπει να αθροίζει σε αυτό που πληρώνεται»), και το invariant του architecture.md λέει ρητά ότι η στρογγυλοποίηση γίνεται **μία φορά, στο τέλος**.

- **Πρόταση:** το response επιστρέφει ανά γραμμή `hoursInCycle` (κλασματικές ώρες, όπως ήδη κάνει το `/time-entries`) και **καμία** στρογγυλοποιημένη `pay` ανά γραμμή· μόνο `totalHours` + `totalPay` στο σύνολο. Το Step 12 τότε είτε δεν δείχνει καθόλου στήλη Pay ανά γραμμή, είτε τη δείχνει ρητά ως ενδεικτική. Έτσι υπάρχει **ένα** στρογγυλεμένο νούμερο σε όλο το σύστημα και δεν μπορεί να διαφωνήσει με τον εαυτό του.
- Εναλλακτικά: το backend επιστρέφει και `pay` ανά γραμμή, αλλά τότε πρέπει να αποφασιστεί ρητά ποιο νούμερο είναι «αληθινό» όταν τα δύο δεν συμφωνούν — και αυτό είναι απόφαση μισθοδοσίας, όχι εμφάνισης.

---

### Τα μικρά που ΔΕΝ θέλουν απόφαση — απλώς να μη ξεχαστούν στο Step 6

1. **`UsersService.findEmployeeRate(userId)`** πρέπει να φτιαχτεί: narrow reader με ρητό `select` (`id`, `hourlyRate`), στο μοτίβο του `findActiveById()`/`assertEmployeeExists()`. Το δείγμα κώδικα στο `architecture.md` § Payroll Calculation Pattern **ήδη το καλεί** — ο `PayrollService` δεν επιτρέπεται να αγγίξει `prisma.user` απευθείας.
2. **Τα tests γράφονται ΜΕΣΑ στο Step 6**, όπως έγινε στο Step 5 (απόφαση του χρήστη). Το §8a αναφέρει ακόμα «Tests for `getPayrollForCycle()`» — αν το βήμα τα αφήσει εκεί, γράφονται δύο φορές ή καθόλου. Στο τέλος του βήματος ενημέρωσε το §8a σε «υπάρχουν ήδη από το Step 6 — επέκτεινε».
3. **`GET /payroll/:userId` με id που δεν είναι EMPLOYEE → 404**, μέσω `assertEmployeeExists()` που ήδη υπάρχει — ίδια συμπεριφορά με το `GET /time-entries?userId=`.
4. Το payroll query είναι **μόνο κλειστές** βάρδιες (`endTime: { not: null, gt: start }, startTime: { lt: endExclusive }`) — σκόπιμα **διαφορετικό** από της λίστας, που περιλαμβάνει και τις ανοιχτές. Μην τα ενοποιήσεις.
