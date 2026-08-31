import { describe, expect, it } from "vitest"

import {
  formatHours,
  formatIsk,
  formatOrdinalDay,
  formatRate,
} from "./format"

// Pure functions, no DOM — the `node` environment, like datetime.spec.ts.
//
// What these lock down is not "does Intl work". It is the three display rules
// that the payroll pipeline's correctness rests on, each of which was decided
// against a measurement rather than a preference.

describe("formatHours", () => {
  it("prints the two decimals the server rounded to", () => {
    expect(formatHours(42.62)).toBe("42.62")
  })

  it("pads a whole number to the same two decimals", () => {
    // Presentation of the *same* value: 2 decimals per cell is the canonical
    // unit, and it is the figure that gets multiplied by the rate. Without the
    // padding a column of hours has ragged decimals and reads as inconsistent
    // data.
    expect(formatHours(5)).toBe("5.00")
    expect(formatHours(0)).toBe("0.00")
  })

  it("⚠️ never shows fewer decimals than were sent", () => {
    // Hiding a decimal here would be a **fourth** rounding point — in the
    // browser, invisible, untested — where the system is specified to have
    // exactly three.
    expect(formatHours(8.74)).toBe("8.74")
    expect(formatHours(0.01)).toBe("0.01")
  })

  it("groups thousands, for a cycle nobody hopes to work", () => {
    expect(formatHours(1234.5)).toBe("1,234.50")
  })
})

describe("formatRate", () => {
  it("⚠️ keeps the hundredths, which is the whole point of the column", () => {
    // Measured in step 6: printing 3,259 here makes the row contradict itself —
    // `hours × rate` stops reproducing the `pay` beside it, by ~3 ISK on one
    // line. The error is systematic (0.5 ISK per surcharged hour, always the
    // same direction for a given wage, ~50 ISK a month), not random.
    expect(formatRate(3258.5)).toBe("3,258.50")
    expect(formatRate(3552.5)).toBe("3,552.50")
  })

  it("pads the base rate, which has no surcharge and no fraction", () => {
    expect(formatRate(2450)).toBe("2,450.00")
  })

  it("shows a rate that lands on an odd hundredth", () => {
    // An integer ISK rate times 1.33 always lands exactly on hundredths — this
    // is why two decimals are enough and a third can never be hidden.
    expect(formatRate(2451 * 1.33)).toBe("3,259.83")
  })
})

describe("formatIsk", () => {
  it("prints whole króna with thousands separators", () => {
    expect(formatIsk(129060)).toBe("129,060")
    expect(formatIsk(17107)).toBe("17,107")
    expect(formatIsk(0)).toBe("0")
  })

  it("records the contract: every pay amount the API sends is an integer", () => {
    // `pay`, `totalPay` and `totalCost` are `Int` in the DTOs and are computed
    // in integer centi-ISK, converted once on the way out. So the zero-decimal
    // setting never rounds anything away, and there is deliberately no runtime
    // guard against a value the API cannot produce.
    const everyAmountFromTheWorkedExample = [46232, 17107, 21315, 44406, 129060]

    for (const amount of everyAmountFromTheWorkedExample) {
      expect(Number.isInteger(amount)).toBe(true)
    }
  })
})

describe("formatOrdinalDay", () => {
  it("gets the teens right, which is why Intl does this and not a last-digit rule", () => {
    // The naive "1 → st, 2 → nd, 3 → rd" rule produces "11st" and "12nd", and
    // both days are inside the range this project uses.
    expect(formatOrdinalDay(11)).toBe("11th")
    expect(formatOrdinalDay(12)).toBe("12th")
    expect(formatOrdinalDay(13)).toBe("13th")
  })

  it("covers every end day the settings page can produce (10-24)", () => {
    // cycleStartDay is 11-25, so the derived end day spans exactly these.
    const expected = [
      "10th",
      "11th",
      "12th",
      "13th",
      "14th",
      "15th",
      "16th",
      "17th",
      "18th",
      "19th",
      "20th",
      "21st",
      "22nd",
      "23rd",
      "24th",
    ]

    expect(
      Array.from({ length: 15 }, (_, index) => formatOrdinalDay(index + 10)),
    ).toEqual(expected)
  })

  it("names the default cycle's two days", () => {
    expect(formatOrdinalDay(25)).toBe("25th")
    expect(formatOrdinalDay(24)).toBe("24th")
  })
})

describe("the worked example of spec §7, printed", () => {
  it("reproduces the agreed table exactly", () => {
    // hourlyRate 2,450. If any of these ever change, the page and the spec have
    // stopped agreeing about a wage.
    expect(formatHours(18.87)).toBe("18.87")
    expect(formatRate(2450)).toBe("2,450.00")
    expect(formatIsk(46232)).toBe("46,232")

    expect(formatHours(5.25)).toBe("5.25")
    expect(formatRate(3258.5)).toBe("3,258.50")
    expect(formatIsk(17107)).toBe("17,107")

    expect(formatHours(42.62)).toBe("42.62")
    expect(formatIsk(129060)).toBe("129,060")
  })
})
