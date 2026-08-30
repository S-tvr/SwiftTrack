import { describe, expect, it } from "vitest"

import {
  formatDate,
  formatDateTime,
  formatDayTime,
  formatTime,
  formatUtcOffsetDifference,
  toDatetimeLocal,
  toIsoUtc,
} from "./datetime"

describe("toIsoUtc", () => {
  it("appends the UTC marker instead of reinterpreting the value", () => {
    expect(toIsoUtc("2026-08-25T14:30")).toBe("2026-08-25T14:30:00.000Z")
  })

  it("accepts the seconds-bearing form some browsers emit", () => {
    expect(toIsoUtc("2026-08-25T14:30:45")).toBe("2026-08-25T14:30:45.000Z")
  })

  it("is independent of the machine's timezone", () => {
    // The assertion is the point rather than the value: `new Date(v).toISOString()`
    // would produce a different string on a machine at a non-zero offset, which
    // is how a shift silently moves into another rate zone and changes someone's
    // pay. Appending "Z" cannot do that, whatever TZ this suite runs under.
    expect(toIsoUtc("2026-01-15T09:00")).toBe("2026-01-15T09:00:00.000Z")
    expect(toIsoUtc("2026-07-15T09:00")).toBe("2026-07-15T09:00:00.000Z")
  })

  it("keeps both halves of an overnight shift on their own dates", () => {
    expect(toIsoUtc("2026-08-24T20:00")).toBe("2026-08-24T20:00:00.000Z")
    expect(toIsoUtc("2026-08-25T03:00")).toBe("2026-08-25T03:00:00.000Z")
  })

  it("does not roll a shift over a month boundary", () => {
    expect(toIsoUtc("2026-08-31T23:00")).toBe("2026-08-31T23:00:00.000Z")
    expect(toIsoUtc("2026-09-01T02:00")).toBe("2026-09-01T02:00:00.000Z")
  })

  it("refuses a value that is not a datetime-local", () => {
    expect(() => toIsoUtc("")).toThrow()
    expect(() => toIsoUtc("2026-08-25")).toThrow()
    expect(() => toIsoUtc("2026-08-25T14:30:00.000Z")).toThrow()
  })
})

describe("formatDayTime", () => {
  it("prints weekday, day-month and 24h time", () => {
    expect(formatDayTime("2026-05-07T11:05:00.000Z")).toBe("Thu 07-May 11:05")
    expect(formatDayTime("2026-05-07T22:40:00.000Z")).toBe("Thu 07-May 22:40")
  })

  it("reads the weekday in UTC, which is what decides the rate zone", () => {
    // Saturday and Sunday are paid at +45% all day, so a weekday printed in the
    // browser's zone would not merely look odd — it would contradict the pay.
    // On this suite's TZ (-3:30) this instant is Friday evening locally.
    expect(formatDayTime("2026-08-01T02:00:00.000Z")).toBe("Sat 01-Aug 02:00")
  })

  it("prints midnight as 00:00, never 24:00", () => {
    // The h23/h24 trap: some ICU builds render midnight as "24:00" under
    // hour12:false, which would put a shift on the wrong day's row.
    expect(formatDayTime("2026-08-29T00:00:00.000Z")).toBe("Sat 29-Aug 00:00")
  })
})

describe("toDatetimeLocal", () => {
  it("shows the API's own wall clock, not the machine's", () => {
    // On this suite's TZ (-3:30) a Date-based implementation would render
    // 04:30 — so the edit form would open on a different time than the shift
    // it is editing, and saving it untouched would move the shift.
    expect(toDatetimeLocal("2026-08-25T08:00:00.000Z")).toBe("2026-08-25T08:00")
  })

  it("round-trips every instant the API produces", () => {
    // The property that matters: opening the edit form and saving without
    // changing anything must be a no-op. A one-way bug here is invisible on a
    // UTC machine and silently repays someone at a different rate elsewhere.
    for (const iso of [
      "2026-08-24T20:00:00.000Z", // overnight shift, first half
      "2026-08-25T03:00:00.000Z", // overnight shift, second half
      "2026-08-31T23:00:00.000Z", // month boundary, before
      "2026-09-01T02:00:00.000Z", // month boundary, after
      "2026-01-15T00:00:00.000Z", // midnight, the value most likely to roll
      "2026-07-25T23:59:00.000Z", // last minute of a cycle
    ]) {
      expect(toIsoUtc(toDatetimeLocal(iso))).toBe(iso)
    }
  })

  it("refuses something that is not an instant", () => {
    expect(() => toDatetimeLocal("")).toThrow()
    expect(() => toDatetimeLocal("2026-08-25")).toThrow()
  })
})

describe("formatters", () => {
  it("formats an instant in UTC, not local time", () => {
    expect(formatDateTime("2026-08-25T14:30:00.000Z")).toBe("25 Aug 2026, 14:30")
    expect(formatTime("2026-08-25T14:30:00.000Z")).toBe("14:30")
  })

  it("keeps a bare YYYY-MM-DD on its own day", () => {
    // ⚠️ The case this exists for: a browser at a negative offset formatting
    // this locally prints the 24th, which would move a Saturday's weekend hours
    // onto a row labelled Friday.
    expect(formatDate("2026-07-25")).toBe("25 Jul 2026")
  })

  it("does not shift an instant just before midnight into the next day", () => {
    expect(formatDateTime("2026-08-25T23:59:00.000Z")).toBe(
      "25 Aug 2026, 23:59",
    )
    expect(formatDateTime("2026-08-26T00:01:00.000Z")).toBe(
      "26 Aug 2026, 00:01",
    )
  })
})

describe("formatUtcOffsetDifference", () => {
  it("reads whole hours in both directions", () => {
    expect(formatUtcOffsetDifference(180)).toBe("3 hours ahead")
    expect(formatUtcOffsetDifference(-300)).toBe("5 hours behind")
  })

  it("says hour, not hours, at one", () => {
    expect(formatUtcOffsetDifference(60)).toBe("1 hour ahead")
    expect(formatUtcOffsetDifference(-60)).toBe("1 hour behind")
  })

  it("formats fractional offsets as minutes rather than dividing them away", () => {
    // India +5:30 and Nepal +5:45 — the reason `offset / 60` is forbidden.
    expect(formatUtcOffsetDifference(330)).toBe("5 hours 30 minutes ahead")
    expect(formatUtcOffsetDifference(345)).toBe("5 hours 45 minutes ahead")
    expect(formatUtcOffsetDifference(-210)).toBe("3 hours 30 minutes behind")
  })

  it("handles a sub-hour offset with no hours part", () => {
    expect(formatUtcOffsetDifference(45)).toBe("45 minutes ahead")
    expect(formatUtcOffsetDifference(-1)).toBe("1 minute behind")
  })

  it("never produces a bare direction at zero", () => {
    // Unreachable through TimezoneNotice, which renders nothing at 0 — but a
    // function that returns " ahead" is a trap for the next caller.
    expect(formatUtcOffsetDifference(0)).toBe("on UTC")
  })
})
