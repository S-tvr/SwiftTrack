// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import {
  createEmployee,
  deactivateEmployee,
  getEmployees,
  reactivateEmployee,
  resetPassword,
  resetSetupCode,
  updateEmployee,
  type UserResponse,
} from "@/api/users"
import { TeamPage } from "@/pages/TeamPage"

// The largest surface in the project: six endpoints, three badge states and a
// filter. What this spec holds down is the handful of things a reader cannot
// check by looking at the screen — above all the **fourth** state, where a
// deactivated employee still carries a live setup code that cannot work.

// ⚠️ `isPending` is kept **real** via `importOriginal`. It is the single
// implementation of "which rows may be handed a code", and the assertions below
// exist to prove that rule rather than a mock of it — the same reasoning that
// kept `deriveCycleEndDay` real in step 13-2.
vi.mock("@/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/users")>()),
  getEmployees: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deactivateEmployee: vi.fn(),
  reactivateEmployee: vi.fn(),
  resetSetupCode: vi.fn(),
  resetPassword: vi.fn(),
}))

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}))

function employee(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 1,
    name: "Anna Jónsdóttir",
    email: "anna@swifttrack.local",
    role: "EMPLOYEE",
    hourlyRate: 3500,
    isActive: true,
    hasActivated: true,
    setupCode: null,
    setupCodeExpiresAt: null,
    ...overrides,
  }
}

/** `isActive: true, hasActivated: false` — carries a usable code. */
const PENDING = employee({
  id: 2,
  name: "Björn Einarsson",
  email: "bjorn@swifttrack.local",
  hasActivated: false,
  setupCode: "7391",
  setupCodeExpiresAt: "2026-08-29T09:12:44.000Z",
})

/** `isActive: false, hasActivated: true` — has a password, cannot sign in. */
const DEACTIVATED = employee({
  id: 3,
  name: "Katrín Ólafsdóttir",
  email: "katrin@swifttrack.local",
  isActive: false,
})

/**
 * `isActive: false, hasActivated: false` — the fourth state. The backend leaves
 * `setupCode` in place on a soft delete, while `set-initial-password` checks
 * `isActive` before it ever looks at the code.
 */
const DEACTIVATED_PENDING = employee({
  id: 4,
  name: "Dagur Pétursson",
  email: "dagur@swifttrack.local",
  isActive: false,
  hasActivated: false,
  setupCode: "5140",
  setupCodeExpiresAt: "2026-08-29T09:12:44.000Z",
})

async function renderPage() {
  render(
    <MemoryRouter initialEntries={["/team"]}>
      <Routes>
        <Route path="/team" element={<TeamPage />} />
        <Route path="/shifts/:userId" element={<p>shift history</p>} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {})
}

function row(name: string) {
  return screen.getByRole("row", { name: new RegExp(name) })
}

async function click(element: HTMLElement) {
  fireEvent.click(element)
  await act(async () => {})
}

async function showDeactivated() {
  await click(screen.getByRole("switch"))
}

beforeEach(() => {
  vi.mocked(getEmployees).mockReset().mockResolvedValue([employee()])
  vi.mocked(createEmployee).mockReset()
  vi.mocked(updateEmployee).mockReset()
  vi.mocked(deactivateEmployee).mockReset().mockResolvedValue(DEACTIVATED)
  vi.mocked(reactivateEmployee).mockReset().mockResolvedValue(employee())
  vi.mocked(resetSetupCode).mockReset()
  vi.mocked(resetPassword).mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

afterEach(cleanup)

describe("TeamPage — the three badge states", () => {
  it("shows Active for an activated employee", async () => {
    await renderPage()

    expect(within(row("Anna")).getByText("Active")).toBeTruthy()
  })

  it("shows Pending for one who has not set a password", async () => {
    vi.mocked(getEmployees).mockResolvedValue([PENDING])
    await renderPage()

    expect(within(row("Björn")).getByText("Pending")).toBeTruthy()
  })

  it("shows Deactivated for one who HAS a password — the case two badges get wrong", async () => {
    // `hasActivated` is true here. A design keyed off it alone would print
    // "Active" beside someone who cannot sign in at all.
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED])
    await renderPage()
    await showDeactivated()

    const cells = within(row("Katrín"))
    expect(cells.getByText("Deactivated")).toBeTruthy()
    expect(cells.queryByText("Active")).toBeNull()
  })
})

describe("TeamPage — the fourth state, deactivated and never activated", () => {
  it("hides the setup code, which cannot work while the account is inactive", async () => {
    // The backend leaves the code in place on a soft delete, but
    // set-initial-password rejects on `isActive` before reading it. Printing it
    // would invite the admin to hand over a code guaranteed to fail.
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED_PENDING])
    await renderPage()
    await showDeactivated()

    expect(screen.queryByText(/5140/)).toBeNull()
  })

  it("offers no New code button, only Reactivate", async () => {
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED_PENDING])
    await renderPage()
    await showDeactivated()

    const actions = within(row("Dagur"))
    expect(actions.queryByRole("button", { name: "New code" })).toBeNull()
    expect(actions.getByRole("button", { name: "Reactivate" })).toBeTruthy()
  })

  it("badges them Deactivated, not Pending", async () => {
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED_PENDING])
    await renderPage()
    await showDeactivated()

    const cells = within(row("Dagur"))
    expect(cells.getByText("Deactivated")).toBeTruthy()
    expect(cells.queryByText("Pending")).toBeNull()
  })
})

describe("TeamPage — the filter and its count", () => {
  it("hides deactivated rows by default and counts them in the toggle", async () => {
    vi.mocked(getEmployees).mockResolvedValue([
      employee(),
      DEACTIVATED,
      DEACTIVATED_PENDING,
    ])
    await renderPage()

    // The count is not decoration: without it the toggle is invisible, and an
    // admin whose employee returns creates a second account and hits a 409.
    expect(screen.getByText("Show deactivated (2)")).toBeTruthy()
    expect(screen.queryByText("Katrín Ólafsdóttir")).toBeNull()
  })

  it("reveals them when switched on", async () => {
    vi.mocked(getEmployees).mockResolvedValue([employee(), DEACTIVATED])
    await renderPage()
    await showDeactivated()

    expect(screen.getByText("Katrín Ólafsdóttir")).toBeTruthy()
  })

  it("offers no toggle when nobody is deactivated", async () => {
    await renderPage()

    expect(screen.queryByRole("switch")).toBeNull()
  })

  it("explains an empty table rather than claiming there are no employees", async () => {
    // Every employee deactivated with the filter closed empties the table while
    // the roster is not empty. "No employees yet." would be false here.
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED])
    await renderPage()

    expect(screen.getByText(/Every employee is deactivated/)).toBeTruthy()
    expect(screen.queryByText("No employees yet.")).toBeNull()
  })
})

describe("TeamPage — Reactivate replaces Deactivate", () => {
  it("offers Reactivate and not Deactivate on a deactivated row", async () => {
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED])
    await renderPage()
    await showDeactivated()

    const actions = within(row("Katrín"))
    expect(actions.getByRole("button", { name: "Reactivate" })).toBeTruthy()
    expect(actions.queryByRole("button", { name: "Deactivate" })).toBeNull()
  })

  it("offers Deactivate and not Reactivate on an active row", async () => {
    await renderPage()

    const actions = within(row("Anna"))
    expect(actions.getByRole("button", { name: "Deactivate" })).toBeTruthy()
    expect(actions.queryByRole("button", { name: "Reactivate" })).toBeNull()
  })

  it("calls the reactivate endpoint with that employee's id", async () => {
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED])
    await renderPage()
    await showDeactivated()
    await click(within(row("Katrín")).getByRole("button", { name: "Reactivate" }))

    expect(reactivateEmployee).toHaveBeenCalledWith(3)
  })

  it("reports a failed reactivate instead of letting it pass silently", async () => {
    // No dialog and no form stands between this button and the API, so a
    // rejection has nowhere else to surface.
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED])
    vi.mocked(reactivateEmployee).mockRejectedValue(
      new ApiError(404, "EMPLOYEE_NOT_FOUND"),
    )
    await renderPage()
    await showDeactivated()
    await click(within(row("Katrín")).getByRole("button", { name: "Reactivate" }))

    expect(toastError).toHaveBeenCalledTimes(1)
  })
})

describe("TeamPage — the setup code and its expiry", () => {
  it("prints the code and a DATE on a pending row", async () => {
    // A date can be written down beside the code· "3 days" is arithmetic against
    // a calendar the reader may not be looking at.
    vi.mocked(getEmployees).mockResolvedValue([PENDING])
    await renderPage()

    const cells = within(row("Björn"))
    expect(cells.getByText(/7391/)).toBeTruthy()
    expect(cells.getByText(/29 Aug 2026/)).toBeTruthy()
  })

  it("prints no code on an activated row", async () => {
    await renderPage()

    expect(within(row("Anna")).queryByText(/Valid until/)).toBeNull()
  })

  it("opens the dialog with the new code after New code", async () => {
    vi.mocked(getEmployees).mockResolvedValue([PENDING])
    vi.mocked(resetSetupCode).mockResolvedValue({
      ...PENDING,
      setupCode: "4826",
    })
    await renderPage()
    await click(within(row("Björn")).getByRole("button", { name: "New code" }))

    expect(resetSetupCode).toHaveBeenCalledWith(2)
    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.getByText("New activation code")).toBeTruthy()
    expect(dialog.getByText("4826")).toBeTruthy()
  })

  it("surfaces the admin's wording when the list is stale, not the employee's", async () => {
    // SCREEN_ERRORS.team's first consumer, sitting unused since step 9: the same
    // code reaches an employee about themselves and an admin about someone else.
    vi.mocked(getEmployees).mockResolvedValue([PENDING])
    vi.mocked(resetSetupCode).mockRejectedValue(
      new ApiError(409, "ACCOUNT_ALREADY_ACTIVATED"),
    )
    await renderPage()
    await click(within(row("Björn")).getByRole("button", { name: "New code" }))

    expect(toastError).toHaveBeenCalledWith(
      "This employee has already activated their account. Refresh the list.",
    )
  })
})

describe("TeamPage — creating an employee", () => {
  async function openCreateForm() {
    await renderPage()
    await click(screen.getByRole("button", { name: "Add Employee" }))
  }

  async function fill(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
    await act(async () => {})
  }

  async function submit() {
    await click(screen.getByRole("button", { name: "Save" }))
  }

  it("sends the three fields, with the rate as a NUMBER", async () => {
    // A native number input yields a string; `valueAsNumber` is what makes this
    // an integer the DTO's @IsInt() will accept.
    vi.mocked(createEmployee).mockResolvedValue(PENDING)
    await openCreateForm()
    await fill("Name", "Björn Einarsson")
    await fill("Email", "bjorn@swifttrack.local")
    await fill("Hourly Rate (ISK)", "3500")
    await submit()

    expect(createEmployee).toHaveBeenCalledWith({
      name: "Björn Einarsson",
      email: "bjorn@swifttrack.local",
      hourlyRate: 3500,
    })
  })

  it("opens the code dialog afterwards — the second half of onboarding", async () => {
    vi.mocked(createEmployee).mockResolvedValue(PENDING)
    await openCreateForm()
    await fill("Name", "Björn Einarsson")
    await fill("Email", "bjorn@swifttrack.local")
    await fill("Hourly Rate (ISK)", "3500")
    await submit()

    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.getByText("Activation code")).toBeTruthy()
    expect(dialog.getByText("7391")).toBeTruthy()
  })

  it("takes no toast — the dialog is the confirmation", async () => {
    vi.mocked(createEmployee).mockResolvedValue(PENDING)
    await openCreateForm()
    await fill("Name", "Björn Einarsson")
    await fill("Email", "bjorn@swifttrack.local")
    await fill("Hourly Rate (ISK)", "3500")
    await submit()

    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("rejects a name of nothing but spaces", async () => {
    // Found by the step-13-3 review. `.min(1)` sees three characters, so before
    // the schema trimmed, this passed the client and reached the API as "" —
    // coming back as a codeless ValidationPipe 400, i.e. "Something went wrong."
    await openCreateForm()
    await fill("Name", "   ")
    await fill("Email", "bjorn@swifttrack.local")
    await fill("Hourly Rate (ISK)", "3500")
    await submit()

    expect(screen.getByText("Enter a name.")).toBeTruthy()
    expect(createEmployee).not.toHaveBeenCalled()
  })

  it("sends the name trimmed, proving the resolver passes PARSED values", async () => {
    // The load-bearing half: trimming in the schema is only a fix if
    // react-hook-form hands `submit()` the parsed output rather than the raw
    // input. If it passed raw values, the name would go out with its spaces.
    vi.mocked(createEmployee).mockResolvedValue(PENDING)
    await openCreateForm()
    await fill("Name", "  Björn Einarsson  ")
    await fill("Email", "bjorn@swifttrack.local")
    await fill("Hourly Rate (ISK)", "3500")
    await submit()

    expect(createEmployee).toHaveBeenCalledWith({
      name: "Björn Einarsson",
      email: "bjorn@swifttrack.local",
      hourlyRate: 3500,
    })
  })

  it("says the rate is missing rather than reporting a NaN", async () => {
    // An empty number input reads as NaN, not undefined, so z.number() would
    // otherwise tell an admin "expected number, received nan".
    await openCreateForm()
    await fill("Name", "Björn Einarsson")
    await fill("Email", "bjorn@swifttrack.local")
    await submit()

    expect(screen.getByText("Enter an hourly rate.")).toBeTruthy()
    expect(createEmployee).not.toHaveBeenCalled()
  })

  // The effective-date line belongs to edit only: a new employee has no earlier
  // rate for this one to take effect *after*, and their first rate covers every
  // cycle including past ones.
  it("does not claim a new employee's rate starts next cycle", async () => {
    await openCreateForm()

    expect(screen.queryByText(/applies from the next pay cycle/)).toBeNull()
  })
})

describe("TeamPage — editing an employee", () => {
  async function openEditForm() {
    await renderPage()
    await click(within(row("Anna")).getByRole("button", { name: "Edit employee" }))
  }

  it("offers NO email field — the endpoint would reject it", async () => {
    // PUT /users/:id takes name and hourlyRate only, and its DTO rejects an
    // undeclared property outright. A disabled input would still say "editable,
    // just not now" about something that never is.
    await openEditForm()

    expect(screen.queryByLabelText("Email")).toBeNull()
    expect(screen.getByLabelText("Name")).toBeTruthy()
  })

  /**
   * ⭐ A rate is forward-effective: it applies from the next cycle and leaves
   * settled ones alone. Without this line an admin who raises somebody
   * mid-cycle sees the Team list update, opens payroll, finds the old figure,
   * and reasonably concludes the save failed. It is permanent rather than a
   * toast because the person choosing the number has to read it *while*
   * choosing — the same call SettingsPage makes for the cycle boundary.
   */
  it("states when a new rate takes effect, before anything is typed", async () => {
    await openEditForm()

    expect(
      screen.getByText(
        "A new rate applies from the next pay cycle. Past and current cycles keep the rate they were already paid at.",
      ),
    ).toBeTruthy()
  })

  it("sends only name and hourlyRate", async () => {
    vi.mocked(updateEmployee).mockResolvedValue(employee({ hourlyRate: 4000 }))
    await openEditForm()
    fireEvent.change(screen.getByLabelText("Hourly Rate (ISK)"), {
      target: { value: "4000" },
    })
    await act(async () => {})
    await click(screen.getByRole("button", { name: "Save" }))

    expect(updateEmployee).toHaveBeenCalledWith(1, {
      name: "Anna Jónsdóttir",
      hourlyRate: 4000,
    })
  })

  it("opens no code dialog — that belongs to a create", async () => {
    vi.mocked(updateEmployee).mockResolvedValue(employee())
    await openEditForm()
    await click(screen.getByRole("button", { name: "Save" }))

    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("TeamPage — deactivating", () => {
  async function confirmDialog() {
    await renderPage()
    await click(within(row("Anna")).getByRole("button", { name: "Deactivate" }))
    return within(screen.getByRole("alertdialog"))
  }

  it("asks first, and Cancel writes nothing", async () => {
    const dialog = await confirmDialog()
    await click(dialog.getByRole("button", { name: "Cancel" }))

    expect(deactivateEmployee).not.toHaveBeenCalled()
  })

  it("says the history is kept and that it CAN be undone", async () => {
    // The build-plan's draft wording said "cannot be undone from the app",
    // which reactivate — added in step 8c — makes false.
    const dialog = await confirmDialog()

    expect(dialog.getByText(/reactivate them here at any time/)).toBeTruthy()
    expect(dialog.getByText(/shifts and payroll history are kept/)).toBeTruthy()
  })

  it("toasts on success, because the row vanishes behind the filter", async () => {
    const dialog = await confirmDialog()
    await click(dialog.getByRole("button", { name: "Deactivate" }))

    expect(deactivateEmployee).toHaveBeenCalledWith(1)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it("stays open with the reason when the write fails", async () => {
    // Mirrors DeleteShiftDialog exactly. A confirmation that closes on failure
    // returns the admin to a screen that looks unchanged — the very question
    // they opened it to ask.
    vi.mocked(deactivateEmployee).mockRejectedValue(
      new ApiError(404, "EMPLOYEE_NOT_FOUND"),
    )
    const dialog = await confirmDialog()
    await click(dialog.getByRole("button", { name: "Deactivate" }))

    expect(screen.getByRole("alertdialog")).toBeTruthy()
    expect(screen.getByRole("alert")).toBeTruthy()
  })
})

describe("TeamPage — resetting a forgotten password", () => {
  /** The row as the API returns it once the password has been cleared. */
  const RESET = employee({
    hasActivated: false,
    setupCode: "6204",
    setupCodeExpiresAt: "2026-09-07T09:12:44.000Z",
  })

  async function confirmDialog() {
    await renderPage()
    await click(
      within(row("Anna")).getByRole("button", { name: "Reset password" }),
    )
    return within(screen.getByRole("alertdialog"))
  }

  /**
   * ⭐ The gate, which is the one piece of logic this feature adds. The backend
   * accepts a reset on any employee row, so this is not "an action that would
   * fail" — it is one that would duplicate `New code` on a pending row and do
   * nothing usable on a deactivated one.
   */
  it("offers Reset password on an activated row and New code on a pending one, never both", async () => {
    vi.mocked(getEmployees).mockResolvedValue([employee(), PENDING])
    await renderPage()

    const activated = within(row("Anna"))
    expect(activated.getByRole("button", { name: "Reset password" })).toBeTruthy()
    expect(activated.queryByRole("button", { name: "New code" })).toBeNull()

    const pending = within(row("Björn"))
    expect(pending.getByRole("button", { name: "New code" })).toBeTruthy()
    expect(pending.queryByRole("button", { name: "Reset password" })).toBeNull()
  })

  it("does not offer it on a deactivated row, where the code would be inert", async () => {
    vi.mocked(getEmployees).mockResolvedValue([DEACTIVATED])
    await renderPage()
    await showDeactivated()

    expect(
      within(row("Katrín")).queryByRole("button", { name: "Reset password" }),
    ).toBeNull()
  })

  it("asks first, and Cancel writes nothing", async () => {
    const dialog = await confirmDialog()
    await click(dialog.getByRole("button", { name: "Cancel" }))

    expect(resetPassword).not.toHaveBeenCalled()
  })

  it("warns that they are locked out and every device is signed out", async () => {
    // Both facts are invisible anywhere else, and an admin who assumes this
    // sends a reset link would leave someone stranded believing they helped.
    const dialog = await confirmDialog()

    expect(dialog.getByText(/until they set a new password/)).toBeTruthy()
    expect(dialog.getByText(/will be signed out/)).toBeTruthy()
  })

  /**
   * ⭐ The reset is not finished when the request returns — only when the code
   * reaches the employee, and the app has no channel to deliver it. So success
   * hands the admin the code rather than announcing completion.
   */
  it("hands over the new code and raises no toast", async () => {
    vi.mocked(resetPassword).mockResolvedValue(RESET)
    const dialog = await confirmDialog()
    await click(dialog.getByRole("button", { name: "Reset password" }))

    expect(resetPassword).toHaveBeenCalledWith(1)

    const codeDialog = within(screen.getByRole("dialog"))
    expect(codeDialog.getByText("6204")).toBeTruthy()
    expect(
      codeDialog.getByText("Password reset — new activation code"),
    ).toBeTruthy()

    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("stays open with the reason when the write fails", async () => {
    vi.mocked(resetPassword).mockRejectedValue(
      new ApiError(404, "EMPLOYEE_NOT_FOUND"),
    )
    const dialog = await confirmDialog()
    await click(dialog.getByRole("button", { name: "Reset password" }))

    expect(screen.getByRole("alertdialog")).toBeTruthy()
    expect(screen.getByRole("alert")).toBeTruthy()
  })
})

describe("TeamPage — states", () => {
  it("offers a retry when the read fails", async () => {
    vi.mocked(getEmployees).mockRejectedValue(new ApiError(500, "UNKNOWN_ERROR"))
    await renderPage()

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("says the roster is empty when nobody is employed", async () => {
    vi.mocked(getEmployees).mockResolvedValue([])
    await renderPage()

    expect(screen.getByText("No employees yet.")).toBeTruthy()
  })
})
