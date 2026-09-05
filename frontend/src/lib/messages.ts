// Every string a user reads lives here — labels, badges and error text alike,
// never written inline in JSX (architecture.md § Frontend invariants).
//
// UI copy below is verbatim from swifttrack-phase1-final.md §8a and is binding.
// Error text is the client's own: the backend's `message` is for tests, Swagger
// and logs, and no user ever reads it. What the two sides agree on is the `code`.

export const PAGE_TITLES = {
  loginActivation: "Login / Account Activation",
  clock: "Clock",
  shiftHistory: "Shift History",
  payrollBreakdown: "Payroll Breakdown",
  team: "Team",
  payrollOverview: "Payroll Overview",
  settings: "Settings",
  changePassword: "Change Password",
} as const

export const LABELS = {
  activateAccountLink: "Activate your account",
  badgeActive: "Active",
  badgePending: "Pending",
  clockIn: "Clock In",
  clockOut: "Clock Out",
  logOut: "Log out",
  retry: "Retry",
  /** Screen-reader text for a pending read. The visible placeholder is a shape
   *  rather than a sentence, so without this the wait is announced as nothing
   *  at all. Kept generic — steps 11-13 have loading states too. */
  loading: "Loading…",
  signIn: "Sign in",
  email: "Email",
  password: "Password",
  newPassword: "New password",
  setupCode: "Activation code",
  confirmPassword: "Confirm password",
  activateAccount: "Activate account",
  accountActivation: "Account Activation",
  backToLogin: "Back to sign in",

  // ── Change password (step 13-4) ──
  currentPassword: "Current password",
  /** The submit button. Deliberately not "Save": this signs other devices out,
   *  which is a heavier act than saving a form. */
  updatePassword: "Update password",

  // ── Shift history (step 11) ──
  addShift: "Add Shift",
  editShift: "Edit shift",
  deleteShift: "Delete shift",
  /** Column headers. Deliberately **no Hours column**: a split shift carries its
   *  full start and end in both cycles, so a duration printed here would count
   *  one shift twice. Hours live on the Payroll page, per zone, once. */
  columnNumber: "#",
  /** Start and End each carry the **whole instant** ("Thu 07-May 11:05"), which
   *  is why there is no separate Date column: an overnight shift ends on a
   *  different date than it starts, and one shared Date cell could only ever
   *  print one of the two. */
  columnStart: "Start",
  columnEnd: "End",
  columnNotes: "Notes",
  columnActions: "Actions",
  /** The red badge on a shift with no end — this list is the only screen where
   *  someone who forgot to clock out can find it. */
  badgeOpen: "Open",
  /** Marks a shift extending past this cycle, which is what explains the same
   *  row appearing in the neighbouring one. */
  badgeSplit: "Split",
  previousCycle: "Previous cycle",
  nextCycle: "Next cycle",
  addShiftTitle: "Add shift",
  editShiftTitle: "Edit shift",
  startTime: "Start time",
  endTime: "End time",
  notes: "Notes",
  save: "Save",
  cancel: "Cancel",
  delete: "Delete",

  // ── Payroll breakdown (step 12) ──
  /** Summary column headers — binding UI copy, spec §8a. */
  columnZone: "Zone",
  columnHours: "Hours",
  columnRate: "Rate",
  columnTotalPay: "Total Pay",
  /** The day table's Date column, and the label on both tables' bottom row.
   *  §8a gives the day table a `Total` column *and* a Total row; one word
   *  serves both. */
  columnDate: "Date",
  total: "Total",
  /** Icelandic króna. Appended to the Total Pay column only — the Rate column
   *  is ISK *per hour*, so the bare unit would misname it. */
  currency: "ISK",
  /** A zone with no hours on a date. A dash rather than "0.00" so the eye finds
   *  the cells that carry hours. */
  emptyCell: "—",

  // ── Payroll overview (step 13-1) ──
  /** §8a fixes no column headers for this page, so these two are the client's
   *  own. `columnHours` and `columnTotalPay` above are reused verbatim: they
   *  name the same two quantities the employee sees on their own breakdown, and
   *  two words for one figure across two screens is what messages.ts exists to
   *  prevent. */
  columnName: "Name",
  /** The column carrying the open-shift marker. The header is what gives the
   *  icon a meaning for a reader who never hovers it. */
  columnOpenShift: "Open Shift",
  /**
   * The card above the table — what the business pays for this cycle.
   *
   * ⚠️ Not "Total Monthly Cost", which is what the step 0 mockup said. A cycle
   * runs from the 25th to the 24th by default and its start day is configurable
   * (11–25), so it is **not** a calendar month: an admin reading "monthly" would
   * file this figure under July while it covers 25 Jul – 24 Aug. The
   * CycleNavigator directly above prints the real dates, so this title only has
   * to avoid naming the period wrongly.
   */
  totalCost: "Total Cost",

  // ── Settings (step 13-2) ──
  /** §8a fixes only the *page* title for this screen, so the three below are
   *  taken from the approved step-0 mockup, which is the visual specification
   *  the frontend steps rewire rather than redraw. */
  payCycle: "Pay Cycle",
  cycleStartDay: "Cycle Start Day",
  saveSettings: "Save Settings",
  /** The confirming action in the dialog. Names the consequence rather than
   *  saying "OK" — it is the button the admin is being asked to think about. */
  changeCycle: "Change cycle",

  // ── Team (step 13-3) ──

  /**
   * The **third** badge, and the one a two-state design gets wrong. Binding UI
   * copy, spec §8a.
   *
   * ⚠️ `isActive === false` decides this on its own, ahead of `hasActivated`: a
   * deactivated employee still has a password, so keying off `hasActivated`
   * would print "Active" beside someone who cannot sign in at all.
   */
  badgeDeactivated: "Deactivated",

  /**
   * The filter's label. Binding UI copy, spec §8a — **including the count**,
   * which is not decoration: without it the toggle is invisible, and an admin
   * whose seasonal employee returns creates a second account, hits
   * `409 EMAIL_ALREADY_EXISTS`, and has no way to see that the first one is
   * sitting right there, hidden.
   *
   * ⚠️ The first function in `LABELS`, which until now held only constants. It
   * belongs here rather than in `NOTICES` because §8a files it under
   * "Buttons / links / badges", not under client-owned prose — it is a control's
   * label that happens to interpolate.
   */
  showDeactivated: (count: number) => `Show deactivated (${count})`,

  /** Row actions. `Reactivate` **replaces** `Deactivate` on a deactivated row,
   *  rather than sitting beside it disabled — never an action guaranteed to
   *  fail. */
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  /** On pending rows only. Re-issues the code and its 3-day expiry. */
  newCode: "New code",
  /**
   * On **activated, active** rows only — the mirror of `newCode`, which covers
   * the pending ones. Both issue a code· this one also clears the password that
   * was in the way, which is why it confirms first and `New code` does not.
   *
   * Serves the row's aria-label and the confirmation's action button alike, as
   * `deactivate` already does — one control, one word, wherever it appears.
   */
  resetPassword: "Reset password",

  addEmployee: "Add Employee",
  /** Screen-reader names for the icon-only row buttons. */
  editEmployee: "Edit employee",
  addEmployeeTitle: "Add Employee",
  editEmployeeTitle: "Edit Employee",

  /** Column headers. `columnName` (13-1), `columnActions` (step 11) and `email`
   *  (step 9) are reused verbatim rather than redeclared — they name the same
   *  things, and two words for one column across two screens is what this file
   *  exists to prevent. */
  columnStatus: "Status",
  columnHourlyRate: "Hourly Rate",

  /** Form field labels. The rate carries its unit because the input is a bare
   *  number with no currency beside it, unlike the payroll tables. */
  name: "Name",
  hourlyRateField: "Hourly Rate (ISK)",

  /** Dismisses the setup-code dialog. Not "Cancel" — nothing is being cancelled,
   *  the employee already exists by the time it opens. */
  done: "Done",
} as const

/**
 * Short zone names for the **day table's column headers**, keyed by the stable
 * `zone` rather than by the label.
 *
 * ⚠️ Why a local map exists at all, given that the server sends a name: §8a
 * fixes **two** different sets of words, and both are binding. The summary
 * prints `zones[].label` verbatim ("Evening +33%") because the surcharge is
 * checkable there against the Rate and Total Pay beside it. The day table
 * carries no money at all, so a percentage in its headers is unverifiable
 * noise across six columns — §8a names those headers `Date / Day / Evening /
 * Night / Weekend / Total`, and this map is where they live.
 *
 * What is **not** copied is the part that could misstate a wage: the percentage
 * is never written here, only the word. And the columns themselves are still
 * generated from `zones[]` — count, order and key all come from the response —
 * so a fifth zone appears with no frontend change, wearing its full label.
 *
 * ⚠️ Keyed by plain `string`, deliberately, and **not** `satisfies
 * Record<PayZone, string>`. Importing `PayZone` from `api/payroll` closed a
 * cycle — `messages` → `api/payroll` → `api/client` → `messages` — which today
 * is erased by `verbatimModuleSyntax` but becomes a real runtime cycle the
 * moment anyone turns that `import type` into a value import, with a load order
 * that can differ between dev and the production bundle. `lib/` is the base
 * layer and points at nothing above it.
 *
 * The exhaustiveness check that costs is worth less than it looks: it guarded
 * "a zone was added to `PayZone` without a short label", which is exactly the
 * case the fallback below is designed to absorb — that column renders with the
 * server's full label instead. Nothing is ever wrong about a wage.
 */
const SHORT_ZONE_LABELS: Record<string, string> = {
  DAY: "Day",
  EVENING: "Evening",
  NIGHT: "Night",
  WEEKEND: "Weekend",
}

/**
 * The day table's header for one zone. Falls back to the label the server sent,
 * which is what keeps an unknown fifth zone renderable.
 *
 * `Object.hasOwn` rather than `in`, for the same reason as `toErrorCode` below:
 * `in` would accept `"toString"` as a zone.
 */
export function zoneShortLabel(zone: string, fullLabel: string): string {
  return Object.hasOwn(SHORT_ZONE_LABELS, zone)
    ? SHORT_ZONE_LABELS[zone]
    : fullLabel
}

/**
 * Field-level messages, shown by zod **before** any request is sent. Distinct
 * from ERRORS below, which answers a request that already failed.
 */
export const VALIDATION = {
  email: "Enter a valid email address.",
  password: "Enter your password.",
  /** The backend's DTO enforces the same rule with @MinLength(8). */
  newPassword: "Use at least 8 characters.",
  /** Matches the backend's @Matches(/^\d{4}$/). */
  setupCode: "The activation code is 4 digits.",
  /** Client-side only — the API takes no confirmation field. */
  passwordsDoNotMatch: "Passwords do not match.",
  /** Mirrors @MinLength(1) on ChangePasswordDto.currentPassword. There is no
   *  length rule to state: the real check is whether it matches, and only the
   *  server can answer that. */
  currentPasswordRequired: "Enter your current password.",

  // ── ShiftForm (step 11) ──
  startTimeRequired: "Enter a start time.",
  /** End Time is **required**: the manual form only ever writes a *closed*
   *  shift, which is what keeps "at most one open shift" enforced in the single
   *  place that can create one — clock-in. */
  endTimeRequired: "Enter an end time.",
  /** Mirrors the backend's @IsNotBefore. Equal is allowed — a zero-length entry
   *  is harmless and can carry notes. */
  endBeforeStart: "End time cannot be before start time.",
  /** Mirrors @IsNotInTheFuture on both fields. Caught here so the 400 that does
   *  come back from a save is almost always a real overlap. */
  timeInFuture: "Times cannot be in the future.",

  // ── EmployeeForm (step 13-3) ──

  /** Mirrors @IsString() @MinLength(1) on CreateUserDto. */
  nameRequired: "Enter a name.",

  /**
   * The **empty** rate field, not an invalid one.
   *
   * ⚠️ This message exists because of how the value is read: `hourlyRate` is a
   * native `<input type="number">` bound with `valueAsNumber`, and an empty one
   * yields **`NaN`**, not `undefined`. Left to itself, `z.number()` reports
   * "Expected number, received nan" — a type error shown to an admin who simply
   * has not typed anything yet.
   */
  hourlyRateRequired: "Enter an hourly rate.",

  /** Mirrors @IsInt() @Min(1). Zero is excluded by the backend too: an employee
   *  paid nothing per hour is a data-entry slip, not a wage. */
  hourlyRateMin: "The hourly rate must be a whole number of at least 1 ISK.",
} as const

/**
 * Text that belongs to no request — shown because of where the user is, not
 * because something failed. Recorded in spec §8a under "Client-owned copy".
 */
export const NOTICES = {
  /** Shown on /login after an auto-logout, so being thrown out reads as an
   *  explanation rather than a glitch. */
  sessionExpired: "Your session has expired. Please sign in again.",

  /**
   * The employee's half of the password reset (step 13-5), on /login only.
   *
   * ⚠️ **Always visible, never attached to a failed sign-in.** `login` answers
   * `INVALID_CREDENTIALS` for an unknown email and a wrong password alike — one
   * code on purpose, so neither can be enumerated — so a hint that appeared only
   * after a failure could not know which case it was answering. It is also not an
   * error, so it has no place in `SCREEN_ERRORS`, which is keyed by code: this
   * is text the page shows because of *where* the user is, like every other
   * entry in this object.
   *
   * ⚠️ It names the **activation code**, not just "ask your admin". Without that
   * word, the four digits the admin later reads out and the "Activate your
   * account" link directly below this sentence are three unrelated things· with
   * it they are one path. Nothing about that path is automated — no email, no
   * redirect — so the sentence is all the employee gets to go on.
   */
  forgotPassword:
    "Forgot your password? Ask your admin to reset it — they'll give you a new activation code.",

  /** Replaces the activation form on success. Without it the form simply
   *  empties and it looks like nothing happened. */
  accountActivated: "Your account is ready. You can now sign in.",

  /**
   * Shown after a successful password change (step 13-4).
   *
   * ⚠️ The second sentence is not decoration. The change revokes every token
   * this user holds, so anyone signed in on another device is dropped on their
   * next action — and to them that looks like a bug unless someone said it would
   * happen. This line is the only place the app says it.
   */
  passwordChanged:
    "Your password has been changed. Any other devices signed in as you have been signed out.",

  /** The timezone bar. A template, not a constant: the same device reads
   *  "3 hours ahead" in August and "2 hours ahead" in January, which is exactly
   *  why the trigger is the offset and not the country. `difference` arrives
   *  already formatted from lib/datetime.ts — offsets are not always whole
   *  hours (India +5:30, Nepal +5:45). */
  timezone: (zone: string, difference: string) =>
    `All times are in Iceland time (UTC). Your device (${zone}) is ${difference}.`,

  /**
   * Under the Clock button, only while a shift is open. `startedAt` arrives
   * already formatted from lib/datetime.ts, as `difference` above does.
   *
   * ⚠️ It carries the **date**, not just the time, and that is the point: a
   * button reading "Clock Out" cannot tell "I am on shift" apart from "I forgot
   * to clock out the day before yesterday". This line can. It also makes a
   * successful clock-in visible without a toast — it appears where there was
   * nothing, and stays for the whole shift rather than for four seconds.
   */
  clockedInSince: (startedAt: string) => `Clocked in since ${startedAt}.`,

  // ── Shift history (step 11) ──

  /** Beside the time fields in ShiftForm. Verbatim from spec §8a — this guards
   *  the only path where a user's own clock can reach the data. */
  shiftTimesAreUtc: "Enter times in Iceland time (UTC), not your local time.",

  /** Empty cycle. An empty state, never a blank table. */
  noShiftsInCycle: "No shifts in this cycle.",

  /** Why Edit and Delete are disabled on a row. One flag governs both buttons,
   *  so this one sentence explains both. */
  rowLocked:
    "This pay cycle is closed. Ask your admin to change a shift this old.",

  /** Why Add Shift is disabled. Read from `canWrite`, never worked out from the
   *  dates on screen — that would mean resolving cycle boundaries client-side. */
  cycleLocked: "This pay cycle is closed, so no shift can be added to it.",

  /** Tooltip on the split marker, explaining the duplicate before it reads as a
   *  bug. */
  splitShift: "This shift continues into the neighbouring cycle.",

  // Toasts. `sonner` exists for exactly this: ShiftForm is a dialog that closes
  // on success, so it cannot show its own confirmation.
  shiftSaved: "Shift saved.",

  /**
   * The case the toast was adopted for: a shift saved into a cycle other than
   * the one on screen leaves the list **identical**, so the dialog closing looks
   * like nothing happened.
   *
   * ⚠️ No "view that cycle" action, and that is deliberate rather than lazy.
   * Naming the destination would mean deciding which cycle the shift landed in,
   * and the client may not resolve cycle boundaries. Whether it is visible is
   * answered without arithmetic — the row is absent from the refetched list —
   * but *where* it went is not, and a button that moved one cycle and still
   * failed to show it would be worse than no button.
   */
  shiftSavedOtherCycle:
    "Shift saved. It falls outside the cycle you're viewing, so it isn't in this list.",

  shiftDeleted: "Shift deleted.",

  // ── Payroll breakdown (step 12) ──

  /** A cycle with no closed shifts. An empty state, never two tables of zeros. */
  noHoursInCycle: "No hours in this cycle.",

  /**
   * The `hasOpenShift` warning, in two versions.
   *
   * ⚠️ Same fact, two audiences — the third time this pattern appears, after
   * `ACCOUNT_ALREADY_ACTIVATED` (step 9) and `OPEN_SHIFT_EXISTS` (step 11). Not
   * in `SCREEN_ERRORS`, which is keyed by error code and this is not an error:
   * the page picks by route, which it always knows.
   *
   * Deliberately says "hasn't been clocked out" rather than "is clocked in
   * now": the flag is matched on `startTime` within this cycle, so it covers
   * both the live shift and the one somebody forgot three weeks ago — and the
   * second is the case that needs explaining.
   *
   * ⚠️ `openShiftOther` says "these figures", not "this breakdown", because it
   * serves **two** pages: the breakdown's warning line and the overview's row
   * marker (step 13-1). "Breakdown" is the name of one specific page, so on the
   * overview it pointed somewhere the reader was not. A third variant was
   * rejected — the split above exists because the *audience* changes, and here
   * it does not: it is an admin about someone else on both screens.
   */
  openShiftOwn:
    "You have a shift in this cycle that hasn't been clocked out. Its hours are missing from this breakdown until you close it.",
  openShiftOther:
    "This employee has a shift in this cycle that hasn't been clocked out. Its hours are missing from these figures until it's closed.",

  // ── Payroll overview (step 13-1) ──

  /**
   * The only empty state this page has.
   *
   * ⚠️ An empty `rows[]` means there are **no employees at all** — every active
   * employee is listed even with zero hours, so "nobody worked this cycle" is a
   * table of zeros and not this sentence. `NOTICES.noHoursInCycle` from step 12
   * would therefore be wrong here, which is why this is a second string rather
   * than a reuse.
   */
  noEmployees: "No employees yet.",

  /** The delete confirmation. Permanent — there is no soft delete and no restore
   *  for a time entry, unlike an employee, who is only deactivated. */
  deleteShiftTitle: "Delete this shift?",
  deleteShiftBody: (shift: string) =>
    `${shift} will be permanently deleted. This cannot be undone.`,

  // ── Settings (step 13-2) ──

  /**
   * Beside the select, where the end day used to be a second input. It is
   * **derived**, always exactly the day before the start, so offering it as a
   * field could only ever let an admin produce a pair the API rejects.
   *
   * `endDay` arrives already formatted from `lib/format.ts`, exactly as
   * `difference` and `startedAt` above arrive from `lib/datetime.ts`: the
   * template holds the sentence, the door holds the number.
   */
  cycleEndDerived: (endDay: string) =>
    `Cycle ends on the ${endDay} of the following month.`,

  /**
   * Under the select, permanently — the one thing on this screen an admin
   * cannot discover by using it.
   *
   * Payroll is recomputed on every request and never frozen (architecture.md
   * § Invariants), so moving this boundary re-slices **past** cycles too. That
   * is the same property which makes the rate-zone percentages a forbidden
   * field on `AppSettings`; here the field is deliberately editable, so the
   * answer is to say what it does rather than to lock it.
   */
  cycleBoundaryWarning:
    "Changing this day moves the boundary of every pay cycle, including ones already paid. Their totals are recalculated, not frozen.",

  /**
   * The counterpart to `cycleBoundaryWarning`, on the other field that changes
   * what people are paid — and it says the opposite thing, which is why it has
   * to be said at all. A rate is historised: it applies from the next cycle and
   * leaves settled ones alone. Without this line an admin who raises somebody
   * mid-cycle sees the Team list update, opens payroll, finds the old figure,
   * and reasonably concludes the save failed.
   *
   * A permanent line rather than a toast, for the same reason the cycle warning
   * is one: a toast is gone in four seconds and cannot be re-read by the person
   * deciding what number to type. Shown only when editing — on create there is
   * no "before" for the rate to be effective *from*.
   */
  rateEffectiveNextCycle:
    "A new rate applies from the next pay cycle. Past and current cycles keep the rate they were already paid at.",

  /**
   * The confirmation, shown on submit. The static line above explains the
   * setting; this one arrives at the moment the change is actually made, and
   * spells out both halves — what moves, and what does not.
   */
  changeCycleTitle: "Change the pay cycle?",
  changeCycleBody: (startDay: string, endDay: string) =>
    `Cycles will run from the ${startDay} to the ${endDay} of the following month. Cycles that have already been paid are re-cut at the new boundary, so their totals can change. No shift is altered — only which cycle its hours fall into.`,

  /**
   * The toast, and the case that fixes the rule for step 13-3: a successful
   * save leaves the **same page with the same values**, so without it the only
   * evidence of the write is the Save button going quiet.
   */
  settingsSaved: "Settings saved.",

  // ── Team (step 13-3) ──

  // The roster being empty because **nobody is employed** is already said by
  // `noEmployees` (step 13-1), which is reused verbatim. This page needs a
  // second sentence because it has a second way to show an empty table:

  /**
   * Every employee is deactivated and the filter is closed, so the table is
   * empty while the roster is not.
   *
   * ⚠️ Not an edge case that can be folded into "No employees yet." — that
   * sentence would be **false**, and it points an admin at "create one" when the
   * people they are looking for are one toggle away. The toggle and its count
   * are on screen directly above, which is what makes this recoverable rather
   * than a dead end.
   */
  allEmployeesDeactivated:
    "Every employee is deactivated. Turn on “Show deactivated” to see them.",

  /**
   * The setup-code dialog, opened after a create, after a re-issue, **and**
   * after a password reset (step 13-5) — one component, three call sites,
   * because all three moments have the same problem: the code must leave the
   * app in the admin's head or on paper, and a screen that merely refreshes
   * hides that there is a second step at all.
   *
   * The title differs between them so the admin can tell which one they are
   * looking at, and — after a re-issue or a reset — that the previous code is
   * now dead.
   */
  setupCodeTitle: "Activation code",
  newCodeTitle: "New activation code",
  /** ⚠️ Says "password was reset" rather than repeating "activation code": the
   *  admin arrived here from a *different* action than the other two, and the
   *  title is the only confirmation that the reset itself succeeded. */
  passwordResetCodeTitle: "Password reset — new activation code",
  /**
   * ⚠️ One body for all three call sites, so the wording has to fit a person
   * signing in for the **first** time and one signing in **again** after a
   * reset. It originally said only "for the first time", which step 13-5 made
   * false for the third caller: that employee has been signing in for months.
   */
  setupCodeBody: (name: string) =>
    `Give this code to ${name}. It is the only way they can sign in for the first time, or again after a password reset.`,

  /**
   * ⚠️ A **date**, not a duration. "Expires in 3 days" is arithmetic the reader
   * has to do against a calendar they may not be looking at; a date can be
   * written down beside the code. `validUntil` arrives already formatted from
   * `lib/datetime.ts`.
   */
  setupCodeValidUntil: (validUntil: string) => `Valid until ${validUntil}.`,

  /**
   * The deactivation confirmation.
   *
   * ⚠️ **The build-plan's draft wording said "it cannot be undone from the app",
   * and that is false** — `PATCH /users/:id/reactivate` was added in step 8c
   * precisely so that it can be, and `Reactivate` is offered on the very row
   * this dialog is about to create. The line was written before that endpoint
   * existed and §13-3 marks the wording open. Saying it would scare an admin out
   * of a reversible action, and the first person to test Reactivate would find
   * the dialog lying to them.
   *
   * What the sentence does have to carry is the part that is **not** obvious:
   * the row disappears (it is filtered, not deleted) and the payroll history
   * survives. Both are the questions "deactivate" actually raises.
   */
  deactivateEmployeeTitle: "Deactivate this employee?",
  deactivateEmployeeBody: (name: string) =>
    `${name} will no longer be able to sign in, and their row moves behind “Show deactivated”. Their shifts and payroll history are kept, and you can reactivate them here at any time.`,

  /**
   * The password-reset confirmation (step 13-5).
   *
   * ⚠️ Both sentences carry a fact the admin cannot see anywhere else, which is
   * the same test `deactivateEmployeeBody` is written against. **The password
   * stops working immediately** — this is not a "send them a reset link" flow,
   * and an admin who assumes it is would leave someone locked out believing they
   * had helped. **Every device is signed out** — the backend revokes their
   * tokens, so a colleague mid-shift on a phone is dropped on their next tap.
   * `passwordChanged` (13-4) says that second thing to the person doing it to
   * themselves· this says it to someone doing it to another person.
   *
   * It also names what happens *next*, because unlike deactivation this action
   * leaves a job unfinished: the code has to reach the employee out of band.
   */
  resetPasswordTitle: "Reset this employee's password?",
  resetPasswordBody: (name: string) =>
    `${name} will not be able to sign in until they set a new password, and any device they are signed in on will be signed out. You'll get a new activation code to give them.`,

  /**
   * The one toast on this page, and the reason the rule from step 13-2 was
   * worth fixing there: with the filter closed — the default — a successful
   * deactivation makes the row **vanish**, which is exactly what a hard delete
   * would look like. The toast names who it was and says the row still exists.
   *
   * The other six writes take none. Create and **reset password** each open the
   * code dialog, which is louder than any toast· edit, reactivate and re-issue
   * each leave their change visible in the refetched list, which is the rule's
   * own condition.
   */
  employeeDeactivated: (name: string) =>
    `${name} has been deactivated. Their row is under “Show deactivated”.`,
} as const

// ── Error codes ──────────────────────────────────────────────────────────────

/**
 * The 19 codes the backend can send, copied from
 * `backend/src/common/error-codes.ts`. Hand-written rather than shared through
 * a package: the two projects have separate tsconfigs and dependency trees, and
 * a workspace refactor is a bigger change than a list of 19 strings (decision Ζ,
 * step 8c).
 *
 * If this list and the backend's drift, the compiler cannot see it — but
 * `toErrorCode()` below degrades an unrecognised code to UNKNOWN_ERROR rather
 * than rendering `undefined`.
 */
export type ServerErrorCode =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_DEACTIVATED"
  | "ACCOUNT_NOT_ACTIVATED"
  | "ACCOUNT_ALREADY_ACTIVATED"
  | "INVALID_SETUP_CODE"
  | "SETUP_CODE_EXPIRED"
  | "INVALID_CURRENT_PASSWORD"
  | "NEW_PASSWORD_SAME_AS_CURRENT"
  | "USER_NOT_FOUND"
  | "EMPLOYEE_NOT_FOUND"
  | "EMAIL_ALREADY_EXISTS"
  | "OPEN_SHIFT_EXISTS"
  | "NO_OPEN_SHIFT"
  | "USER_ID_NOT_ALLOWED"
  | "USER_ID_REQUIRED"
  | "TIME_ENTRY_NOT_FOUND"
  | "SHIFT_OVERLAP"
  | "CYCLE_LOCKED"
  | "INVALID_CYCLE"

/**
 * Failures that never carry a backend code, normalised into one by
 * `api/client.ts` so that every caller has exactly one thing to look at.
 *
 * RATE_LIMITED: the throttler's 429 body says "ThrottlerException: Too many
 * requests" and carries no code — that sentence is never shown (spec §8a).
 * NETWORK_ERROR: no response at all. Deliberately not a 401, and never a logout.
 * UNKNOWN_ERROR: an unmapped failure — a ValidationPipe 400 (framework-generated,
 * codeless by design) or a code this client does not know.
 */
export type ClientErrorCode = "RATE_LIMITED" | "NETWORK_ERROR" | "UNKNOWN_ERROR"

export type ErrorCode = ServerErrorCode | ClientErrorCode

/**
 * One sentence per code. `satisfies` is what makes the compiler refuse a code
 * without text, while `as const` keeps the map read-only — it doubles as the
 * runtime source of truth for `toErrorCode` below, so it must not be mutable.
 */
export const ERRORS = {
  // auth
  INVALID_CREDENTIALS: "Invalid email or password.",
  ACCOUNT_DEACTIVATED: "This account is no longer active.",
  ACCOUNT_NOT_ACTIVATED:
    "This account hasn't been activated yet. Please activate it first.",
  ACCOUNT_ALREADY_ACTIVATED:
    "This account has already been activated. Please sign in instead.",
  INVALID_SETUP_CODE: "Invalid activation code.",
  SETUP_CODE_EXPIRED:
    "This activation code has expired. Please contact your admin.",
  /** ⚠️ Arrives on a **400**, not a 401 — see the note in `api/auth.ts`. If it
   *  ever came back as a 401 the client would log the user out mid-form and
   *  this sentence would never be seen. */
  INVALID_CURRENT_PASSWORD: "Your current password is incorrect.",
  NEW_PASSWORD_SAME_AS_CURRENT:
    "Your new password must be different from your current one.",

  // users
  USER_NOT_FOUND: "No account was found with that email address.",
  EMPLOYEE_NOT_FOUND: "We couldn't find that employee. Refresh the page.",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists.",

  // time entries
  OPEN_SHIFT_EXISTS: "You already have an open shift. Please clock out first.",
  NO_OPEN_SHIFT: "No open shift to clock out of.",
  USER_ID_NOT_ALLOWED: "This shift can only be saved to your own account.",
  USER_ID_REQUIRED: "Select an employee before saving this shift.",
  TIME_ENTRY_NOT_FOUND: "This shift no longer exists. Refresh the page.",
  SHIFT_OVERLAP: "This shift overlaps an existing shift.",
  CYCLE_LOCKED:
    "That pay cycle is closed. You can only change shifts in the current or previous cycle.",

  // settings / cycles
  INVALID_CYCLE: "That pay cycle isn't valid.",

  // client-side
  RATE_LIMITED: "Too many attempts. Please wait a minute and try again.",
  NETWORK_ERROR:
    "Could not reach the server. Check your connection and try again.",
  UNKNOWN_ERROR: "Something went wrong. Please try again.",
} as const satisfies Record<ErrorCode, string>

export type Screen =
  | "login"
  | "activate"
  | "clock"
  | "shifts"
  | "payroll"
  | "team"
  | "payrollOverview"
  | "settings"

/**
 * Where one code needs a different sentence because the *audience* changes
 * rather than the fact. Consulted before ERRORS; anything absent falls through.
 *
 * This exists for one known case and is deliberately not larger: most codes read
 * the same everywhere — EMPLOYEE_NOT_FOUND on all seven operations that return
 * it, INVALID_CYCLE on all five.
 *
 * ⚠️ Note the general principle, because it recurs: **the page always knows
 * which request it sent.** A code tells apart failures of *one* call, never
 * which call failed — so /activate needs no screen key to know it called
 * set-initial-password.
 */
const SCREEN_ERRORS: Partial<
  Record<Screen, Partial<Record<ErrorCode, string>>>
> = {
  // ACCOUNT_ALREADY_ACTIVATED reaches two audiences with the same fact: the
  // employee about themselves on /activate (right answer: send them to /login,
  // which the default sentence does), and the admin about someone else on Team
  // via reset-setup-code (right answer: their list is stale). The backend is not
  // wrong to use one code — the fact really is identical — so the split is the
  // client's job. Consumed in step 13.
  team: {
    ACCOUNT_ALREADY_ACTIVATED:
      "This employee has already activated their account. Refresh the list.",
  },

  // OPEN_SHIFT_EXISTS reaches two screens with the same fact and two different
  // right actions. On Clock the user pressed Clock In, so "clock out first" is
  // literally the next step. Here they are adding or editing a *past* shift
  // while a live one is running — and telling them to clock out would push them
  // to end a real shift early, add the row, and clock back in, splitting the
  // shift they were protecting. The rule itself is wider than it needs to be
  // (build-plan §11, option Γ, recorded open); this sentence is what stops the
  // wording from making it harmful.
  shifts: {
    OPEN_SHIFT_EXISTS:
      "You're currently clocked in. You can add or change past shifts once you clock out.",
  },
}

/**
 * The single door to error text. `screen` is optional and only worth passing
 * where an override exists.
 */
export function errorText(code: ErrorCode, screen?: Screen): string {
  if (screen) {
    const override = SCREEN_ERRORS[screen]?.[code]
    if (override) return override
  }
  return ERRORS[code]
}

/**
 * Narrows whatever came back in the response body to a code we have text for.
 * The ERRORS map is itself the runtime source of truth, so there is no second
 * list to keep in step with it.
 */
export function toErrorCode(value: unknown): ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERRORS, value)
    ? (value as ErrorCode)
    : "UNKNOWN_ERROR"
}
