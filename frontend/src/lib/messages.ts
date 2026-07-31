// Verbatim UI copy from swifttrack-phase1-final.md §8a. Source of truth for
// exact wording — do not paraphrase these strings elsewhere in the app.

export const MESSAGES = {
  loginNotActivated:
    "This account hasn't been activated yet. Please activate it first.",
  loginDeactivated: "This account is no longer active.",
  activationInvalidCode: "Invalid activation code.",
  activationExpiredCode:
    "This activation code has expired. Please contact your admin.",
  activationAlreadyActivated: "This account has already been activated.",
  clockInAlreadyOpen: "You already have an open shift. Please clock out first.",
  clockOutNoOpenShift: "No open shift to clock out of.",
} as const

export const LABELS = {
  activateAccountLink: "Activate your account",
  badgeActive: "Active",
  badgePending: "Pending",
  clockIn: "Clock In",
  clockOut: "Clock Out",
} as const

export const PAGE_TITLES = {
  loginActivation: "Login / Account Activation",
  clock: "Clock",
  shiftHistory: "Shift History",
  payrollBreakdown: "Payroll Breakdown",
  team: "Team",
  payrollOverview: "Payroll Overview",
  settings: "Settings",
} as const
