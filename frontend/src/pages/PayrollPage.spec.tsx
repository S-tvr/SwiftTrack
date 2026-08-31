// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import {
  getMyPayroll,
  getPayrollForUser,
  type PayrollResponse,
} from "@/api/payroll"
import { PayrollPage } from "@/pages/PayrollPage"

vi.mock("@/api/payroll", () => ({
  getMyPayroll: vi.fn(),
  getPayrollForUser: vi.fn(),
}))

const EMPLOYEE_ID = 65

function payroll(overrides: Partial<PayrollResponse> = {}): PayrollResponse {
  return {
    cycle: "2026-07",
    prevCycle: "2026-06",
    nextCycle: "2026-08",
    cycleStart: "2026-07-25T00:00:00.000Z",
    cycleEnd: "2026-08-24T23:59:59.999Z",
    userId: EMPLOYEE_ID,
    name: "Anna Jónsdóttir",
    hourlyRate: 2450,
    totalHours: 8.25,
    totalPay: 30832,
    hasOpenShift: false,
    zones: [
      { zone: "DAY", label: "Day", hours: 5, rate: 2450, pay: 12250 },
      { zone: "EVENING", label: "Evening +33%", hours: 3.25, rate: 3258.5, pay: 10590 },
      { zone: "NIGHT", label: "Night +45%", hours: 0, rate: 3552.5, pay: 0 },
      { zone: "WEEKEND", label: "Weekend +45%", hours: 0, rate: 3552.5, pay: 0 },
    ],
    days: [
      {
        date: "2026-07-25",
        hours: { DAY: 5, EVENING: 3.25, NIGHT: 0, WEEKEND: 0 },
        totalHours: 8.25,
      },
    ],
    ...overrides,
  }
}

/** `/payroll` is the employee's own breakdown; `/payroll/:userId` is an
 *  admin's view of one employee. */
async function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/payroll/:userId" element={<PayrollPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {})
}

beforeEach(() => {
  vi.mocked(getMyPayroll).mockReset().mockResolvedValue(payroll())
  vi.mocked(getPayrollForUser).mockReset().mockResolvedValue(payroll())
})

afterEach(cleanup)

describe("PayrollPage — which endpoint, and whose payroll", () => {
  it("reads the caller's own breakdown on /payroll", async () => {
    await renderAt("/payroll")

    expect(getMyPayroll).toHaveBeenCalledTimes(1)
    expect(getPayrollForUser).not.toHaveBeenCalled()
  })

  it("reads the employee in the URL on /payroll/:userId", async () => {
    await renderAt(`/payroll/${EMPLOYEE_ID}`)

    expect(getPayrollForUser).toHaveBeenCalledWith(EMPLOYEE_ID, undefined)
    expect(getMyPayroll).not.toHaveBeenCalled()
  })

  it("shows the employee's name only on the admin route", async () => {
    // It comes from the response, never from a second call to GET /users —
    // which would download the whole team to print one heading.
    await renderAt(`/payroll/${EMPLOYEE_ID}`)
    expect(screen.queryByText("Anna Jónsdóttir")).not.toBeNull()

    cleanup()

    await renderAt("/payroll")
    expect(screen.queryByText("Anna Jónsdóttir")).toBeNull()
  })
})

describe("PayrollPage — the cycle in the URL", () => {
  it("omits ?cycle= on first load, letting the server resolve it", async () => {
    // The current cycle is not the current calendar month.
    await renderAt("/payroll")

    expect(getMyPayroll).toHaveBeenCalledWith(undefined)
  })

  it("reads ?cycle= from the URL, so a refresh keeps its place", async () => {
    // ⚠️ This is also what carries step 13's drill-down: without the cycle in
    // the URL, an admin clicking a July figure on the overview lands in August.
    await renderAt("/payroll?cycle=2026-06")

    expect(getMyPayroll).toHaveBeenCalledWith("2026-06")
  })

  it("navigates with the key the server supplied, computing nothing", async () => {
    await renderAt("/payroll")

    fireEvent.click(screen.getByRole("button", { name: "Previous cycle" }))
    await act(async () => {})

    expect(getMyPayroll).toHaveBeenLastCalledWith("2026-06")
  })

  it("prints the cycle dates it was handed, in UTC", async () => {
    // The suite runs at -3:30, where cycleStart is 24 Jul 20:30 locally.
    await renderAt("/payroll")

    expect(screen.queryByText("25 Jul 2026 – 24 Aug 2026")).not.toBeNull()
  })
})

describe("PayrollPage — explaining a gap", () => {
  it("⚠️ warns about an open shift, addressing the employee about themselves", async () => {
    await renderAt("/payroll")
    cleanup()
    vi.mocked(getMyPayroll).mockResolvedValue(payroll({ hasOpenShift: true }))
    await renderAt("/payroll")

    expect(
      screen.queryByText(/You have a shift in this cycle/),
    ).not.toBeNull()
  })

  it("⚠️ addresses the admin about someone else", async () => {
    // Same fact, two audiences — the same split as ACCOUNT_ALREADY_ACTIVATED
    // and OPEN_SHIFT_EXISTS. The page always knows which route it is on.
    vi.mocked(getPayrollForUser).mockResolvedValue(
      payroll({ hasOpenShift: true }),
    )
    await renderAt(`/payroll/${EMPLOYEE_ID}`)

    expect(
      screen.queryByText(/This employee has a shift in this cycle/),
    ).not.toBeNull()
  })

  it("stays silent when nothing is open", async () => {
    await renderAt("/payroll")

    expect(screen.queryByText(/hasn't been clocked out/)).toBeNull()
  })
})

describe("PayrollPage — the states a page must have", () => {
  it("shows an empty state rather than two tables of zeros", async () => {
    vi.mocked(getMyPayroll).mockResolvedValue(
      payroll({
        days: [],
        totalHours: 0,
        totalPay: 0,
        zones: payroll().zones.map((z) => ({ ...z, hours: 0, pay: 0 })),
      }),
    )
    await renderAt("/payroll")

    expect(screen.queryByText("No hours in this cycle.")).not.toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("keeps the open-shift explanation on an otherwise empty cycle", async () => {
    // The sharpest case for the warning: the whole cycle looks empty, and the
    // reason is a shift nobody closed.
    vi.mocked(getMyPayroll).mockResolvedValue(
      payroll({ days: [], hasOpenShift: true }),
    )
    await renderAt("/payroll")

    expect(screen.queryByText("No hours in this cycle.")).not.toBeNull()
    expect(screen.queryByText(/hasn't been clocked out/)).not.toBeNull()
  })

  it("offers a retry when the read fails", async () => {
    vi.mocked(getMyPayroll).mockRejectedValue(new ApiError(0, "NETWORK_ERROR"))
    await renderAt("/payroll")

    expect(
      screen.queryByText(
        "Could not reach the server. Check your connection and try again.",
      ),
    ).not.toBeNull()

    vi.mocked(getMyPayroll).mockResolvedValue(payroll())
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await act(async () => {})

    expect(screen.getAllByRole("table")).toHaveLength(2)
  })

  it("refuses a userId that is not a number, without offering a retry", async () => {
    // Retrying a malformed URL would fail identically every time.
    await renderAt("/payroll/abc")

    expect(
      screen.queryByText("We couldn't find that employee. Refresh the page."),
    ).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
  })

  it("renders both tables on the happy path", async () => {
    await renderAt("/payroll")

    expect(screen.getAllByRole("table")).toHaveLength(2)
  })
})
