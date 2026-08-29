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
} as const

export const LABELS = {
  activateAccountLink: "Activate your account",
  badgeActive: "Active",
  badgePending: "Pending",
  clockIn: "Clock In",
  clockOut: "Clock Out",
  logOut: "Log out",
  retry: "Retry",
  signIn: "Sign in",
  email: "Email",
  password: "Password",
  newPassword: "New password",
  setupCode: "Activation code",
  confirmPassword: "Confirm password",
  activateAccount: "Activate account",
  accountActivation: "Account Activation",
  backToLogin: "Back to sign in",
} as const

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
} as const

/**
 * Text that belongs to no request — shown because of where the user is, not
 * because something failed. Recorded in spec §8a under "Client-owned copy".
 */
export const NOTICES = {
  /** Shown on /login after an auto-logout, so being thrown out reads as an
   *  explanation rather than a glitch. */
  sessionExpired: "Your session has expired. Please sign in again.",

  /** Replaces the activation form on success. Without it the form simply
   *  empties and it looks like nothing happened. */
  accountActivated: "Your account is ready. You can now sign in.",

  /** The timezone bar. A template, not a constant: the same device reads
   *  "3 hours ahead" in August and "2 hours ahead" in January, which is exactly
   *  why the trigger is the offset and not the country. `difference` arrives
   *  already formatted from lib/datetime.ts — offsets are not always whole
   *  hours (India +5:30, Nepal +5:45). */
  timezone: (zone: string, difference: string) =>
    `All times are in Iceland time (UTC). Your device (${zone}) is ${difference}.`,
} as const

// ── Error codes ──────────────────────────────────────────────────────────────

/**
 * The 17 codes the backend can send, copied from
 * `backend/src/common/error-codes.ts`. Hand-written rather than shared through
 * a package: the two projects have separate tsconfigs and dependency trees, and
 * a workspace refactor is a bigger change than a list of 17 strings (decision Ζ,
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
