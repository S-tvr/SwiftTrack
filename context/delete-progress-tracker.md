# delete-progress-tracker.md — session scratch notes

> Temporary file, NOT the official `progress-tracker.md` (that one hasn't been
> updated yet — user asked to hold off). Delete this once the real tracker is
> updated, or just use it as a memory jog for continuing tomorrow.

## What this session did (Step 0 — Static Mockups, continued)

Picked up Step 0 where it was ⚠️ Partial (tooling only) and built all 7
mockup pages + supporting scaffolding. No backend calls anywhere — all data
comes from `frontend/src/mocks/data.ts`.

### Scaffolding
- `react-router-dom` installed, routing wired in `App.tsx` (`AppLayout` wraps
  Header/Footer around all routes except `/login` and `/activate`)
- `frontend/src/mocks/data.ts` — typed mock User/TimeEntry/AppSettings +
  helpers (`getEmployeeById`, `getTimeEntriesForUser`, `getMockCycle`,
  `isWithinCycle`, `hoursBetween`)
- `frontend/src/lib/messages.ts` — verbatim spec §8a UI copy
- `components/layout/Header.tsx` + `Footer.tsx`
- Added shadcn components: dropdown-menu, input, label, card, dialog, table,
  badge, textarea
- Cleaned up dead demo assets (hero.png, react.svg, vite.svg, icons.svg) and
  fixed the shadcn `button.tsx` lint issue (react-refresh rule disabled for
  `components/ui/**`)
- Fixed `FormEvent` → `SubmitEvent` (React 19 types deprecated `FormEvent`)

### Pages built (all reviewed and approved by user)
1. `LoginPage.tsx` + `SetInitialPasswordPage.tsx` — inert forms, no backend
2. `ClockPage.tsx` + `ClockButton.tsx` (**toggles Clock In/Out on click —
   local UI state only, explicitly requested**) + `MonthSummary.tsx`
   (**note: "Current Cycle" title/date range was explicitly removed from
   this card per user request — don't re-add it**)
3. `ShiftHistoryPage.tsx` + `ShiftList.tsx` + `ShiftForm.tsx` (dialog,
   add/edit) + `CycleNavigator.tsx` — shared component, `/shifts` (employee)
   and `/shifts/:userId` (admin)
4. `PayrollPage.tsx` + `PayrollBreakdown.tsx` — shared, `/payroll` +
   `/payroll/:userId`, reuses `CycleNavigator` from `components/shifts/`
5. `TeamPage.tsx` + `EmployeeList.tsx` + `EmployeeForm.tsx` — admin only,
   Add/Edit employee, Active/Pending badges, setup code shown for Pending
6. `PayrollOverviewPage.tsx` + `PayrollOverview.tsx` — admin only, total
   monthly cost, open-shift indicator, click row → that employee's payroll
7. `SettingsPage.tsx` — cycleStartDay/cycleEndDay form, inert

### Key mock-data decisions
- `MOCK_VIEW_AS` / `VIEW_AS_ADMIN` constant in `mocks/data.ts` — **hardcoded**
  (`const VIEW_AS_ADMIN = false as boolean`), NOT interactive. Flip to `true`
  + save to preview the whole app as admin (Header links, `/` redirects to
  `/team` instead of `/clock`, etc.) — user was about to ask for this flip
  when the session ended, did not confirm yet.
- `currentUser` derives from that constant and is read by every page —
  changing it changes the experience everywhere at once.
- No `ProtectedRoute` yet (that's step 9) — every route is reachable by
  typing the URL directly regardless of role, e.g. admin can still open
  `/clock` and will just see empty/zeroed data.

### Verification
- `npx tsc -b` and `npm run lint` both clean as of end of session
- No browser automation was set up in the end (user preferred to eyeball
  `localhost:5173` themselves each time) — Playwright/Chromium were briefly
  installed to `%LOCALAPPDATA%\ms-playwright` but never actually used for a
  real check; harmless to leave or remove

## Still open / not started
- Admin-view flip to `true` (user was deciding on this)
- Aesthetic/finishing pass across all 7 pages (explicitly deferred by user
  to "later")
- Official `progress-tracker.md` update for Step 0 — **not done yet**,
  user asked to hold off
- Everything from Step 1 onward (backend: Docker, Prisma, Users/Auth/
  TimeEntries/Settings/Payroll modules, Swagger) — untouched
