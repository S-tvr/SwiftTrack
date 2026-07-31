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

## Step 0 — Static Mockups (frontend tooling prep)
Status: ⚠️ Partial
Ημερομηνία: 2026-07-31
Αρχεία που προστέθηκαν/άλλαξαν:
- Convert σε TypeScript: `src/main.tsx`, `src/App.tsx` (placeholder, demo content αφαιρέθηκε), `tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json`, `vite.config.ts`, `eslint.config.js`
- Tailwind CSS v4: `@tailwindcss/vite` plugin, `src/index.css` (`@import "tailwindcss"`)
- shadcn/ui init (style: base-nova): `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, theme variables στο `index.css`
Endpoints/Components: Κανένα ακόμα — μόνο tooling/config, καμία mockup σελίδα δεν έχει χτιστεί.
Σημειώσεις:
- Αποφασίστηκε (μέσω /architect): TypeScript από την αρχή· React Router ενεργό ήδη από το Step 0 (πλοήγηση μεταξύ mockup σελίδων επιτρέπεται, "no functionality" σημαίνει μόνο "no backend calls")· ένα κοινό mock data αρχείο `frontend/src/mocks/data.ts` για όλες τις σελίδες.
- **Πρόβλημα που λύθηκε**: το `npx shadcn init` (v4.16.0 και v4.15.0) απέτυχε με "Could not load the workspace config" γιατί το root `tsconfig.json` (project-references pattern, χωρίς δικό του `compilerOptions.paths`) δεν ήταν αναγνώσιμο από το CLI. Fix: προστέθηκε `compilerOptions.paths` (`"@/*": ["./src/*"]`) και στο root `tsconfig.json`, με comment που εξηγεί γιατί πρέπει να μείνει συγχρονισμένο με το `tsconfig.app.json` — επιβεβαιώθηκε ότι η αφαίρεσή του σπάει σιωπηλά (όχι με error) το resolve των mελλοντικών `shadcn add`/`info`.
- `tsconfig.app.json` χρειάστηκε `"types": ["vite/client"]` για να δουλέψει το CSS side-effect import.
- `npx tsc -b` καθαρό, `npm run dev` τρέχει κανονικά (http://localhost:5173/).
- **Ανοιχτά/minor issues από review** (δεν διορθώθηκαν ακόμα, χαμηλή προτεραιότητα): `npm run lint` αποτυγχάνει πάνω στο shadcn-generated `button.tsx` (`react-refresh/only-export-components`)· dead demo assets (`src/assets/hero.png`, `react.svg`, `vite.svg`, `public/icons.svg`) δεν έχουν καθαριστεί ακόμα.
- Backend είναι ακόμα το bare NestJS scaffold — δεν έχει αγγιχτεί, όπως προβλέπει το AGENTS.md (backend δεν ξεκινά πριν ολοκληρωθεί το Step 0).
- **Επόμενο βήμα**: React Router setup, `frontend/src/mocks/data.ts` (typed fake User/TimeEntry/AppSettings), `Header.tsx`/`Footer.tsx`, μετά οι 7 mockup σελίδες μία-μία (Login/Activation, Clock, Shift History, Payroll, Team, Payroll Overview, Settings) — English UI copy ακριβώς από spec §8a.
