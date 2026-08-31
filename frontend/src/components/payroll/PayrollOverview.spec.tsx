// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PayrollOverviewResponse } from "@/api/payroll"
import { PayrollOverview } from "@/components/payroll/PayrollOverview"

/**
 * The row's click handler is the only behaviour here that leaves no trace in the
 * DOM — and the whole point of the hybrid is that it must **not** fire when the
 * link inside it is clicked. Mocking `useNavigate` is what makes that
 * observable. `Link` is unaffected: it reaches its own navigation through the
 * router internals, not through this module's export.
 */
const navigate = vi.fn()

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>()
  return { ...actual, useNavigate: () => navigate }
})

function overview(
  overrides: Partial<PayrollOverviewResponse> = {},
): PayrollOverviewResponse {
  return {
    cycle: "2026-07",
    prevCycle: "2026-06",
    nextCycle: "2026-08",
    cycleStart: "2026-07-25T00:00:00.000Z",
    cycleEnd: "2026-08-24T23:59:59.999Z",
    // 129,060 + 154,300 + 103,820 — consistent on the happy path, so the specs
    // that deliberately break it below are unmistakably about reading vs summing.
    totalCost: 387180,
    rows: [
      {
        userId: 4,
        name: "Anna Jónsdóttir",
        totalHours: 42.62,
        totalPay: 129060,
        hasOpenShift: false,
      },
      {
        userId: 7,
        name: "Björn Ólafsson",
        totalHours: 51.1,
        totalPay: 154300,
        hasOpenShift: true,
      },
      {
        userId: 9,
        name: "Dagur Pétursson",
        totalHours: 33.4,
        totalPay: 103820,
        hasOpenShift: false,
      },
    ],
    ...overrides,
  }
}

function renderOverview(data: PayrollOverviewResponse = overview()) {
  return render(
    <MemoryRouter>
      <PayrollOverview data={data} />
    </MemoryRouter>,
  )
}

/** The `<tbody>` — `getAllByRole("rowgroup")[0]` is the header. */
function bodyRows() {
  return within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row")
}

beforeEach(() => navigate.mockReset())
afterEach(cleanup)

describe("PayrollOverview — the figures come from the response", () => {
  it("renders one row per entry, in the order sent", () => {
    // The server sorts by name; the client does not re-sort.
    renderOverview()

    const rows = bodyRows()
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain("Anna Jónsdóttir")
    expect(rows[2].textContent).toContain("Dagur Pétursson")
  })

  it("prints hours and money through lib/format", () => {
    renderOverview()

    // 51.1 fills to two decimals — the server's canonical unit — and the money
    // carries thousands separators and its unit.
    expect(screen.queryByText("51.10")).not.toBeNull()
    expect(screen.queryByText("129,060 ISK")).not.toBeNull()
  })

  it("⚠️ prints totalCost as sent, never the sum of the rows", () => {
    // The fixture is deliberately inconsistent: the three rows add to 387,180
    // while `totalCost` says otherwise. In production they always agree — the
    // point is *which number wins* if this component ever starts adding.
    //
    // The failure this guards is not a wrong sum today: it is the day something
    // filters the table, at which point a `reduce` silently starts reporting the
    // total of what is visible under a label that says "the business".
    renderOverview(overview({ totalCost: 999999 }))

    expect(screen.queryByText("999,999 ISK")).not.toBeNull()
    expect(screen.queryByText("387,180 ISK")).toBeNull()
  })

  it("carries the four column headers", () => {
    renderOverview()

    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent)
    expect(headers).toEqual(["Name", "Hours", "Total Pay", "Open Shift"])
  })
})

describe("PayrollOverview — the drill-down", () => {
  it("⚠️ carries the cycle from the response, not from the URL", () => {
    // Without it an admin clicking a July figure lands in whatever cycle is
    // current when the next page loads. The response's key is always the cycle
    // actually on screen.
    renderOverview()

    expect(
      screen.getByRole("link", { name: "Anna Jónsdóttir" }).getAttribute("href"),
    ).toBe("/payroll/4?cycle=2026-07")
  })

  it("⚠️ navigates once when the name itself is clicked", () => {
    // Without stopPropagation the link and the row handler both fire, pushing
    // two history entries for one click — Back would then need two presses.
    renderOverview()

    fireEvent.click(screen.getByRole("link", { name: "Anna Jónsdóttir" }))

    expect(navigate).not.toHaveBeenCalled()
  })

  it("follows the row to the same place when clicked anywhere else", () => {
    renderOverview()

    fireEvent.click(screen.getByText("51.10"))

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith("/payroll/7?cycle=2026-07")
  })
})

describe("PayrollOverview — the open-shift marker", () => {
  it("marks only the rows the server flagged", () => {
    renderOverview()

    const markers = screen.getAllByLabelText("Open Shift")
    expect(markers).toHaveLength(1)
    expect(bodyRows()[1].textContent).toContain("Björn")
  })

  it("explains the consequence rather than the fact", () => {
    // The marker qualifies the pay beside it: hours were worked that this
    // figure does not contain.
    const { container } = renderOverview()

    expect(container.querySelector("title")?.textContent).toContain(
      "hasn't been clocked out",
    )
  })

  it("shows nothing when no one has an open shift", () => {
    renderOverview(
      overview({ rows: overview().rows.map((r) => ({ ...r, hasOpenShift: false })) }),
    )

    expect(screen.queryByLabelText("Open Shift")).toBeNull()
  })
})

describe("PayrollOverview — the empty state", () => {
  it("⚠️ shows it only when there are no employees at all", () => {
    // An empty `rows[]` means nobody is employed — every active employee is
    // listed even with zero hours, so "nobody worked" is a table of zeros.
    renderOverview(overview({ rows: [], totalCost: 0 }))

    expect(screen.queryByText("No employees yet.")).not.toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("keeps the cost card visible even then", () => {
    // Decided deliberately: the card is the page, and hiding it on an empty
    // team would make the screen look broken rather than empty.
    renderOverview(overview({ rows: [], totalCost: 0 }))

    expect(screen.queryByText("Total Cost")).not.toBeNull()
    expect(screen.queryByText("0 ISK")).not.toBeNull()
  })

  it("renders a table of zeros when nobody worked", () => {
    renderOverview(
      overview({
        totalCost: 0,
        rows: overview().rows.map((r) => ({
          ...r,
          totalHours: 0,
          totalPay: 0,
        })),
      }),
    )

    expect(bodyRows()).toHaveLength(3)
    expect(screen.queryByText("No employees yet.")).toBeNull()
  })
})
