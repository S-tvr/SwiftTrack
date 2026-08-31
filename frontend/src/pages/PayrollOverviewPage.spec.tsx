// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import {
  getPayrollOverview,
  type PayrollOverviewResponse,
} from "@/api/payroll"
import { PayrollOverviewPage } from "@/pages/PayrollOverviewPage"

vi.mock("@/api/payroll", () => ({ getPayrollOverview: vi.fn() }))

function overview(
  overrides: Partial<PayrollOverviewResponse> = {},
): PayrollOverviewResponse {
  return {
    cycle: "2026-07",
    prevCycle: "2026-06",
    nextCycle: "2026-08",
    cycleStart: "2026-07-25T00:00:00.000Z",
    cycleEnd: "2026-08-24T23:59:59.999Z",
    totalCost: 387180,
    rows: [
      {
        userId: 4,
        name: "Anna Jónsdóttir",
        totalHours: 42.62,
        totalPay: 129060,
        hasOpenShift: false,
      },
    ],
    ...overrides,
  }
}

async function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/payroll-overview" element={<PayrollOverviewPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {})
}

beforeEach(() => {
  vi.mocked(getPayrollOverview).mockReset().mockResolvedValue(overview())
})

afterEach(cleanup)

describe("PayrollOverviewPage — the cycle in the URL", () => {
  it("omits ?cycle= on first load, letting the server resolve it", async () => {
    // A cycle runs 25 → 24, so "the cycle containing now" is not the current
    // calendar month and the client may not work it out.
    await renderAt("/payroll-overview")

    expect(getPayrollOverview).toHaveBeenCalledWith(undefined)
  })

  it("reads ?cycle= from the URL, so a refresh keeps its place", async () => {
    await renderAt("/payroll-overview?cycle=2026-06")

    expect(getPayrollOverview).toHaveBeenCalledWith("2026-06")
  })

  it("navigates with the key the server supplied, computing nothing", async () => {
    await renderAt("/payroll-overview")

    fireEvent.click(screen.getByRole("button", { name: "Previous cycle" }))
    await act(async () => {})

    expect(getPayrollOverview).toHaveBeenLastCalledWith("2026-06")
  })

  it("prints the cycle dates it was handed, in UTC", async () => {
    await renderAt("/payroll-overview")

    expect(screen.queryByText("25 Jul 2026 – 24 Aug 2026")).not.toBeNull()
  })
})

describe("PayrollOverviewPage — the states a page must have", () => {
  it("renders the table on the happy path", async () => {
    await renderAt("/payroll-overview")

    expect(screen.queryByRole("table")).not.toBeNull()
    expect(screen.queryByText("387,180 ISK")).not.toBeNull()
  })

  it("offers a retry when the read fails", async () => {
    vi.mocked(getPayrollOverview).mockRejectedValue(
      new ApiError(0, "NETWORK_ERROR"),
    )
    await renderAt("/payroll-overview")

    expect(
      screen.queryByText(
        "Could not reach the server. Check your connection and try again.",
      ),
    ).not.toBeNull()
    expect(screen.queryByRole("table")).toBeNull()

    vi.mocked(getPayrollOverview).mockResolvedValue(overview())
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await act(async () => {})

    expect(screen.queryByRole("table")).not.toBeNull()
  })

  it("keeps the heading while the first read is in flight", async () => {
    // Nothing resolves, so the page stays in its loading state.
    vi.mocked(getPayrollOverview).mockReturnValue(new Promise(() => {}))
    await renderAt("/payroll-overview")

    expect(screen.queryByText("Payroll Overview")).not.toBeNull()
    expect(screen.queryByRole("status")).not.toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
  })
})
