// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { PayrollResponse, PayrollZone } from "@/api/payroll"
import { PayrollSummary } from "@/components/payroll/PayrollSummary"

// Purely presentational — nothing to mock. What this spec is about is the one
// property the page cannot be trusted to keep by inspection: that every figure
// on screen came from the response rather than from a calculation here.

function zone(overrides: Partial<PayrollZone> = {}): PayrollZone {
  return {
    zone: "DAY",
    label: "Day",
    hours: 18.87,
    rate: 2450,
    pay: 46232,
    ...overrides,
  }
}

/** The worked example of spec §7, hourlyRate 2,450. */
function payroll(overrides: Partial<PayrollResponse> = {}): PayrollResponse {
  return {
    cycle: "2026-07",
    prevCycle: "2026-06",
    nextCycle: "2026-08",
    cycleStart: "2026-07-25T00:00:00.000Z",
    cycleEnd: "2026-08-24T23:59:59.999Z",
    userId: 4,
    name: "Anna Jónsdóttir",
    hourlyRate: 2450,
    totalHours: 42.62,
    totalPay: 129060,
    hasOpenShift: false,
    zones: [
      zone(),
      zone({ zone: "EVENING", label: "Evening +33%", hours: 5.25, rate: 3258.5, pay: 17107 }),
      zone({ zone: "NIGHT", label: "Night +45%", hours: 6, rate: 3552.5, pay: 21315 }),
      zone({ zone: "WEEKEND", label: "Weekend +45%", hours: 12.5, rate: 3552.5, pay: 44406 }),
    ],
    days: [],
    ...overrides,
  }
}

function footerOf(container: HTMLElement) {
  const footer = container.querySelector("tfoot")
  if (!footer) throw new Error("no <tfoot> — the Total row is missing")
  return footer as HTMLElement
}

afterEach(cleanup)

describe("PayrollSummary — the rows come from the response", () => {
  it("renders one row per zone, in the order sent", () => {
    render(<PayrollSummary data={payroll()} />)

    const rows = within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row")
    expect(rows).toHaveLength(4)
    expect(rows[0].textContent).toContain("Day")
    expect(rows[1].textContent).toContain("Evening +33%")
  })

  it("⚠️ prints the label verbatim, surcharge included", () => {
    // The client never composes its own "+33%": a label that stopped matching
    // its factor would make this table misstate a wage.
    render(<PayrollSummary data={payroll()} />)

    expect(screen.queryByText("Evening +33%")).not.toBeNull()
    expect(screen.queryByText("Night +45%")).not.toBeNull()
    expect(screen.queryByText("Weekend +45%")).not.toBeNull()
  })

  it("renders a zone this client has never heard of", () => {
    // The condition the four-zone decision was taken under: a fifth zone must
    // appear with no frontend change. Nothing here is keyed off the four names.
    render(
      <PayrollSummary
        data={payroll({
          zones: [zone({ zone: "HOLIDAY" as PayrollZone["zone"], label: "Holiday +100%" })],
        })}
      />,
    )

    expect(screen.queryByText("Holiday +100%")).not.toBeNull()
  })

  it("keeps a zone with no hours, rate and all", () => {
    // Zero-hour zones are sent deliberately, and the rate is still the rate
    // that would apply — dropping the row would be the client second-guessing
    // a decision the server already made.
    render(
      <PayrollSummary
        data={payroll({ zones: [zone({ hours: 0, pay: 0 })] })}
      />,
    )

    const rows = within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row")
    expect(rows[0].textContent).toContain("0.00")
    expect(rows[0].textContent).toContain("2,450.00")
  })
})

describe("PayrollSummary — nothing is added up here", () => {
  it("⚠️ prints totalPay as sent, never the sum of the column", () => {
    // The fixture is deliberately inconsistent — the four zones do not add to
    // `totalPay` — because that is the only way to tell reading from summing
    // apart. In production they always agree; the point is *which number wins*
    // if this component ever starts computing one of its own.
    const { container } = render(
      <PayrollSummary data={payroll({ totalPay: 999999 })} />,
    )

    expect(footerOf(container).textContent).toContain("999,999")
  })

  it("⚠️ prints totalHours as sent, never the sum of the column", () => {
    const { container } = render(
      <PayrollSummary data={payroll({ totalHours: 77.77 })} />,
    )

    expect(footerOf(container).textContent).toContain("77.77")
  })

  it("leaves the Total row's Rate cell empty", () => {
    // Averaging four rates produces a number that is nobody's rate and
    // multiplies into nothing.
    const { container } = render(<PayrollSummary data={payroll()} />)

    // The "Total" label is a `<th scope="row">`, so it is a rowheader rather
    // than a cell — the data cells here are Hours, Rate, Total Pay.
    const cells = within(footerOf(container)).getAllByRole("cell")
    expect(cells).toHaveLength(3)
    expect(cells[1].textContent).toBe("")
  })
})

describe("PayrollSummary — the figures themselves", () => {
  it("⚠️ shows the rate to the hundredth, so the row reproduces its own pay", () => {
    // 5.25 × 3,258.50 = 17,107. Printing 3,259 would break that by ~3 ISK on
    // this single line, systematically.
    render(<PayrollSummary data={payroll()} />)

    expect(screen.queryByText("3,258.50")).not.toBeNull()
    expect(screen.queryByText("3,259")).toBeNull()
  })

  it("names the currency on the money column", () => {
    render(<PayrollSummary data={payroll()} />)

    expect(screen.queryByText("46,232 ISK")).not.toBeNull()
  })

  it("carries the four binding column headers of spec §8a", () => {
    render(<PayrollSummary data={payroll()} />)

    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent)
    expect(headers).toEqual(["Zone", "Hours", "Rate", "Total Pay"])
  })
})
