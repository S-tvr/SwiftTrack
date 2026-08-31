// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { PayrollDay, PayrollResponse, PayrollZone } from "@/api/payroll"
import { PayrollDayTable } from "@/components/payroll/PayrollDayTable"
import { zoneShortLabel } from "@/lib/messages"

// Presentational, nothing mocked. Two properties matter here and nowhere else:
// the columns are generated from the response, and both totals are read rather
// than added.

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

const ZONES: PayrollZone[] = [
  zone(),
  zone({ zone: "EVENING", label: "Evening +33%", hours: 5.25, rate: 3258.5, pay: 17107 }),
  zone({ zone: "NIGHT", label: "Night +45%", hours: 6, rate: 3552.5, pay: 21315 }),
  zone({ zone: "WEEKEND", label: "Weekend +45%", hours: 12.5, rate: 3552.5, pay: 44406 }),
]

function day(overrides: Partial<PayrollDay> = {}): PayrollDay {
  return {
    // ⚠️ A bare YYYY-MM-DD, and chosen as a trap: the suite runs at
    // TZ=America/St_Johns (-3:30), where this instant is 24 Jul 20:30 locally.
    // A formatter without `timeZone: "UTC"` prints the **24th** here — which is
    // how a Saturday's weekend hours land on a row labelled Friday.
    date: "2026-07-25",
    hours: { DAY: 5, EVENING: 3.25, NIGHT: 0, WEEKEND: 0 },
    totalHours: 8.25,
    ...overrides,
  }
}

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
    zones: ZONES,
    days: [day()],
    ...overrides,
  }
}

function footerOf(container: HTMLElement) {
  const footer = container.querySelector("tfoot")
  if (!footer) throw new Error("no <tfoot> — the Total row is missing")
  return footer as HTMLElement
}

afterEach(cleanup)

describe("PayrollDayTable — the columns", () => {
  it("carries the binding headers of spec §8a, without percentages", () => {
    // Two different sets of words, both binding: the summary prints the full
    // label because the surcharge is checkable there against Rate and Total
    // Pay. This table has no money in it, so a percentage would be
    // unverifiable noise across six columns.
    render(<PayrollDayTable data={payroll()} />)

    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent)
    expect(headers).toEqual([
      "Date",
      "Day",
      "Evening",
      "Night",
      "Weekend",
      "Total",
    ])
  })

  it("⚠️ falls back to the server's label for a zone it does not know", () => {
    // What keeps "a fifth zone appears with no frontend change" true rather
    // than aspirational. The short names are local; the *set* of columns is not.
    render(
      <PayrollDayTable
        data={payroll({
          zones: [zone({ zone: "HOLIDAY" as PayrollZone["zone"], label: "Holiday +100%" })],
          days: [day({ hours: {} as PayrollDay["hours"], totalHours: 0 })],
        })}
      />,
    )

    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent)
    expect(headers).toEqual(["Date", "Holiday +100%", "Total"])
  })

  it("generates the columns from the response, not from four known names", () => {
    render(
      <PayrollDayTable
        data={payroll({ zones: [ZONES[3], ZONES[0]] })}
      />,
    )

    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent)
    expect(headers).toEqual(["Date", "Weekend", "Day", "Total"])
  })
})

describe("zoneShortLabel — the map behind those headers", () => {
  // `SHORT_ZONE_LABELS` is keyed by plain `string` rather than by `PayZone`,
  // because importing that type closed an import cycle through api/client.
  // These take over what the compiler used to check — with one honest limit,
  // stated so nobody mistakes their reach.
  it("has a short name for each of the four zones the app knows", () => {
    // ⚠️ Catches the realistic regression: an entry renamed or deleted, after
    // which that column silently starts printing "Evening +33%" as a header.
    // It does **not** catch a fifth zone added without a label — and does not
    // need to, since that case degrades to the server's own label by design.
    expect(zoneShortLabel("DAY", "Day")).toBe("Day")
    expect(zoneShortLabel("EVENING", "Evening +33%")).toBe("Evening")
    expect(zoneShortLabel("NIGHT", "Night +45%")).toBe("Night")
    expect(zoneShortLabel("WEEKEND", "Weekend +45%")).toBe("Weekend")
  })

  it("hands back the server's label for anything else", () => {
    expect(zoneShortLabel("HOLIDAY", "Holiday +100%")).toBe("Holiday +100%")
  })

  it("does not treat an inherited property as a zone", () => {
    // `Object.hasOwn`, never `in` — which would accept "toString" and render
    // a function body as a column header.
    expect(zoneShortLabel("toString", "Fallback")).toBe("Fallback")
  })
})

describe("PayrollDayTable — the cells", () => {
  it("⚠️ formats the date as UTC", () => {
    render(<PayrollDayTable data={payroll()} />)

    expect(screen.queryByText("25 Jul 2026")).not.toBeNull()
    expect(screen.queryByText("24 Jul 2026")).toBeNull()
  })

  it("prints a dash where a zone has no hours", () => {
    render(<PayrollDayTable data={payroll()} />)

    const row = within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row")[0]
    const cells = within(row).getAllByRole("cell")
    expect(cells[1].textContent).toBe("5.00")
    expect(cells[2].textContent).toBe("3.25")
    expect(cells[3].textContent).toBe("—")
    expect(cells[4].textContent).toBe("—")
  })

  it("⚠️ prints the row total as sent, never the sum of the four cells", () => {
    // The measurement behind the rule: `1.99 + 22.35 + 2.92` in JavaScript is
    // 27.259999999999998, not 27.26 — and it disagrees in about a third of
    // rows. The fixture is deliberately inconsistent so that reading and
    // summing produce visibly different answers.
    render(
      <PayrollDayTable data={payroll({ days: [day({ totalHours: 99.99 })] })} />,
    )

    const row = within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row")[0]
    const cells = within(row).getAllByRole("cell")
    expect(cells[5].textContent).toBe("99.99")
  })

  it("lists only the dates the server sent", () => {
    render(
      <PayrollDayTable
        data={payroll({ days: [day(), day({ date: "2026-07-26" })] })}
      />,
    )

    const rows = within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row")
    expect(rows).toHaveLength(2)
  })
})

describe("PayrollDayTable — the Total row is read, not computed", () => {
  it("⚠️ takes each column's total from zones[].hours", () => {
    // Not a shortcut: the server builds those zone totals by summing these very
    // cells in integer centihours, so reading them back is the only way to get
    // the same answer. Here the single day carries 5.00 while the DAY zone
    // reports 18.87 — the column must show the zone's figure.
    const { container } = render(<PayrollDayTable data={payroll()} />)

    // The "Total" label is a `<th scope="row">`, so the data cells start at the
    // first zone column.
    const cells = within(footerOf(container)).getAllByRole("cell")
    expect(cells).toHaveLength(5)
    expect(cells[0].textContent).toBe("18.87")
    expect(cells[1].textContent).toBe("5.25")
    expect(cells[2].textContent).toBe("6.00")
    expect(cells[3].textContent).toBe("12.50")
  })

  it("⚠️ takes the grand total from totalHours", () => {
    const { container } = render(
      <PayrollDayTable data={payroll({ totalHours: 55.55 })} />,
    )

    const cells = within(footerOf(container)).getAllByRole("cell")
    expect(cells[4].textContent).toBe("55.55")
  })
})
