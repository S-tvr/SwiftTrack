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
