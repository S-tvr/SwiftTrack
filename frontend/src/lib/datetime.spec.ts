import { describe, expect, it } from "vitest"

import {
  formatDate,
  formatDateTime,
  formatTime,
  formatUtcOffsetDifference,
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
