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

### Ο περιορισμός που καθόρισε το πώς γράφτηκαν

Ο χρήστης δήλωσε ότι **κάθε οθόνη/βήμα θα χτιστεί από καινούργιο agent**, χωρίς ιστορικό της προηγούμενης συνεδρίας. Αυτό ανέβασε τον πήχη: τα §9-13 δεν είναι πλέον λίστες με κουκκίδες αλλά **πλήρεις προδιαγραφές ανά σελίδα** — ποιο endpoint, ποια πεδία, ποιες καταστάσεις, ποια κείμενα, τι **δεν** επιτρέπεται, και πότε το βήμα θεωρείται τελειωμένο. Και ρητή εντολή: **όπου ο παλιός κώδικας ή τα παλιά έγγραφα αντιφάσκουν με τις αποφάσεις αυτής της συνεδρίας, γράφεται το σωστό, όχι το παλιό.**

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

Και η γενικότερη παθογένεια, που ταιριάζει ακριβώς στο «νέος agent ανά οθόνη»: *«ασυνέπεια μεταξύ ανεξάρτητα παραγόμενων αρχείων — σαν να δούλεψαν 10 developers χωρίς να μιλήσουν»*, με το «convention mismatch» ως κύρια αιτία χαμηλής εμπιστοσύνης (DORA 2025: 39%). Αντίμετρα: οι **τέσσερις πόρτες** (`api/`, `useApiQuery`, `datetime.ts`, `messages.ts`), οι **αρνητικοί κανόνες**, και το `ui-registry.md` μέσω του skill `imprint`.

### Το frontend αλλάζει, δεν ξαναχτίζεται

Ερώτημα του χρήστη. Απάντηση: **αλλάζει** — και η έρευνα το ενισχύει. Οι οκτώ οθόνες του Step 0 **ήδη συμφωνούν μεταξύ τους**· αν σβηστούν, οκτώ ανεξάρτητοι agents παράγουν οκτώ διαλέκτους χωρίς τίποτα να τις κρίνει. Η ταξινόμηση ανά αρχείο (άθικτα / rewire / ξαναγράψιμο εσωτερικών / αντικατάσταση / διαγραφή) μπήκε στο build-plan.

⚠️ Καταγράφηκε ρητά ότι το **`mocks/data.ts` το εισάγουν 13 αρχεία** — μετρημένο. Είναι το μεγαλύτερο κομμάτι δουλειάς των 9-13 και δεν ήταν γραμμένο πουθενά.

### Σκόπιμα ανοιχτά — να μη θεωρηθούν παραλείψεις

Μορφή/κείμενο των διαλόγων επιβεβαίωσης· χρώμα/εικονίδιο/ακριβής θέση μηνυμάτων· **toast: μία καταγεγραμμένη επανεξέταση στο Step 11** (ο `ShiftForm` είναι dialog που κλείνει, και βάρδια εκτός του προβαλλόμενου κύκλου δεν παράγει **καμία** ορατή αλλαγή)· **`MonthSummary`: επανεξέταση μετά το 13** με την εφαρμογή σε χρήση· ζωντανή ένδειξη διάρκειας μέσα στον `ShiftForm`.

### Παρκαρισμένο εργαλείο

**`.mcp.json`** με **shadcn MCP** (τα βήματα 9-13 χρειάζονται `form`/`select`/`alert-dialog`/`switch`, κανένα εγκατεστημένο) και **Playwright MCP** (ο agent βλέπει τη σελίδα που έφτιαξε αντί να την υποθέτει). Τοπικά `npx`, χωρίς λογαριασμό. Γράφτηκε στο §14· **δεν στήθηκε**.

**Επόμενο βήμα**: **Step 8c** — backend. Μετά, Step 9.

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
