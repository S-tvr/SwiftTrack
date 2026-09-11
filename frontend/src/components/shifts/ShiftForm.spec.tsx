// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import type { CycleTimeEntry, TimeEntry } from "@/api/timeEntries"
import { ShiftForm } from "@/components/shifts/ShiftForm"

const SAVED: TimeEntry = {
  id: 9,
  userId: 2,
  startTime: "2026-08-04T02:00:00.000Z",
  endTime: "2026-08-04T10:00:00.000Z",
  notes: null,
}

const EXISTING: CycleTimeEntry = {
  ...SAVED,
  notes: "Late delivery",
  isSplit: false,
  canEdit: true,
}

function renderForm(entry?: CycleTimeEntry) {
  const onSubmit = vi.fn<(input: unknown) => Promise<TimeEntry>>()
  onSubmit.mockResolvedValue(SAVED)
  const onSaved = vi.fn()
  render(
    <ShiftForm
      open
      onOpenChange={vi.fn()}
      entry={entry}
      onSubmit={onSubmit}
      onSaved={onSaved}
    />,
  )
  return { onSubmit, onSaved }
}

const field = (label: string) =>
  screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label)

function type(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } })
}

/**
 * Each end is a **pair** of inputs — a date and a clock — rather than one
 * `datetime-local` (see the note on `shiftSchema` for the measurement behind
 * that). These helpers keep the tests written in whole instants, so what they
 * assert stays "a shift from X to Y" rather than which box holds which half.
 *
 * `""` clears both halves, which is how a test says "this end is empty".
 */
function typeInstant(which: "Start time" | "End time", value: string) {
  const [date, clock] = value === "" ? ["", ""] : value.split("T")
  type(`${which} — date`, date)
  type(`${which} — time`, clock)
}

/** Reads a pair back as one `datetime-local`-shaped string, or "" if either
 *  half is blank — the same rule `fromDateAndTime` applies in the component. */
function instantValue(which: "Start time" | "End time"): string {
  const date = field(`${which} — date`).value
  const clock = field(`${which} — time`).value
  return date === "" || clock === "" ? "" : `${date}T${clock}`
}

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await act(async () => {})
}

afterEach(cleanup)

describe("ShiftForm", () => {
  /**
   * ⚠️ Structural, because the behaviour itself is not testable here: jsdom
   * implements no layout, so "Save is reachable when the dialog is taller than
   * the window" cannot be asserted. That was measured in headless Chrome
   * instead — Save stayed visible at viewports from 317px to 797px.
   *
   * What IS checkable is the arrangement that produces it: the scroll container
   * is the middle, and the buttons sit outside it. Wrapping the whole form in
   * `DialogBody` would scroll them away again, which is the regression this
   * catches.
   */
  it("keeps the buttons outside the scrolling area", () => {
    renderForm()

    const body = document.querySelector("[data-slot='dialog-body']")
    expect(body).not.toBeNull()
    for (const name of ["Save", "Cancel"]) {
      expect(body?.contains(screen.getByRole("button", { name }))).toBe(false)
    }
    expect(body?.contains(field("Start time — date"))).toBe(true)
  })

  it("refuses a form with no end time without sending a request", async () => {
    // The start arrives prefilled (see below), so the end is the only box that
    // can still be empty on a fresh Add — which is what this guards.
    const { onSubmit } = renderForm()

    await save()

    expect(screen.getByText("Enter an end time.")).not.toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  /**
   * ⚠️ The state `handleStartDateBlur` creates on every Add: it copies the start
   * **date** into the end and leaves the end clock empty. Splitting one control
   * into two made a half-filled pair reachable for the first time, so the rule
   * that catches it is worth pinning — `fromDateAndTime` returns `""` when either
   * half is missing rather than guessing midnight, and that empty string is what
   * the schema's required rule sees.
   */
  it("refuses a date with no clock beside it", async () => {
    const { onSubmit } = renderForm()

    type("End time — date", "2026-08-04")
    await save()

    expect(screen.getByText("Enter an end time.")).not.toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("refuses a clock with no date beside it", async () => {
    const { onSubmit } = renderForm()

    type("Start time — date", "")
    type("Start time — time", "08:00")
    await save()

    expect(screen.getByText("Enter a start time.")).not.toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("still refuses a start the user has cleared", async () => {
    const { onSubmit } = renderForm()

    typeInstant("Start time", "")
    await save()

    expect(screen.getByText("Enter a start time.")).not.toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("opens an add on the current time in UTC, leaving the end empty", () => {
    // ⚠️ The end must stay empty: handleStartBlur fills it from the start only
    // while it is, so prefilling both would leave a zero-length shift one Save
    // away. Asserted against a pinned clock rather than a recomputed "now",
    // which would pass even if the value were read through the local zone.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-04T02:30:00.000Z"))
    try {
      renderForm()

      expect(instantValue("Start time")).toBe("2026-08-04T02:30")
      expect(instantValue("End time")).toBe("")
    } finally {
      vi.useRealTimers()
    }
  })

  it("catches an end before the start before any request", async () => {
    // Mirrors the backend's @IsNotBefore, so the 400 that does come back from a
    // save is almost always a genuine overlap rather than one of these.
    const { onSubmit } = renderForm()

    typeInstant("Start time", "2026-08-04T10:00")
    typeInstant("End time", "2026-08-04T02:00")
    await save()

    expect(screen.getByText("End time cannot be before start time.")).not.toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("allows a zero-length shift, which the API accepts", async () => {
    const { onSubmit } = renderForm()

    typeInstant("Start time", "2026-08-04T02:00")
    typeInstant("End time", "2026-08-04T02:00")
    await save()

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("catches a time in the future before any request", async () => {
    const { onSubmit } = renderForm()

    typeInstant("Start time", "2099-01-01T09:00")
    typeInstant("End time", "2099-01-01T17:00")
    await save()

    expect(screen.getAllByText("Times cannot be in the future.").length).toBe(2)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("sends the typed wall clock as UTC, not reinterpreted as local", async () => {
    // ⚠️ The bug this exists to catch: `new Date(value).toISOString()` on this
    // suite's TZ (-3:30) would send 05:30Z for a shift typed as 02:00 — moving
    // it into a different rate zone and changing what the person is paid.
    const { onSubmit, onSaved } = renderForm()

    typeInstant("Start time", "2026-08-04T02:00")
    typeInstant("End time", "2026-08-04T10:00")
    await save()

    expect(onSubmit).toHaveBeenCalledWith({
      startTime: "2026-08-04T02:00:00.000Z",
      endTime: "2026-08-04T10:00:00.000Z",
      notes: null,
    })
    expect(onSaved).toHaveBeenCalledWith(SAVED)
  })

  it("always sends notes, so an edit cannot silently erase them", async () => {
    // PUT is a full replacement and the service writes `notes ?? null`, so a
    // form that omitted an unchanged field would wipe it.
    const { onSubmit } = renderForm(EXISTING)

    await save()

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Late delivery" }),
    )
  })

  it("opens an edit on the instant being edited, in UTC", async () => {
    renderForm(EXISTING)

    expect(instantValue("Start time")).toBe("2026-08-04T02:00")
    expect(instantValue("End time")).toBe("2026-08-04T10:00")
  })

  it("prefills the end DATE from the start, leaving the clock to be typed", () => {
    // ⚠️ The date only — splitting the control is what made this possible. The
    // old `datetime-local` version had to copy a whole instant, dragging the
    // start's clock along with it; now the clock stays empty and waits for the
    // one value the user always has to supply.
    renderForm()

    type("Start time — date", "2026-08-04")
    fireEvent.blur(field("Start time — date"))

    expect(field("End time — date").value).toBe("2026-08-04")
    expect(field("End time — time").value).toBe("")
  })

  it("never overwrites an end date the user already set", () => {
    renderForm()

    type("End time — date", "2026-08-05")
    type("Start time — date", "2026-08-04")
    fireEvent.blur(field("Start time — date"))

    // An overnight shift is exactly this: the end lands on the next day, and
    // the form must not drag it back onto the start's date.
    expect(field("End time — date").value).toBe("2026-08-05")
  })

  /**
   * ⭐ The shape the split fields exist to serve. `20:00 → 03:00` is only a real
   * shift if the end lands on the **next** day, and the end date is now a field
   * the user can see rather than a segment buried in a composite control.
   */
  it("sends an overnight shift as two dates, not a same-day one", async () => {
    const { onSubmit } = renderForm()

    typeInstant("Start time", "2026-08-04T20:00")
    typeInstant("End time", "2026-08-05T03:00")
    await save()

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: "2026-08-04T20:00:00.000Z",
        endTime: "2026-08-05T03:00:00.000Z",
      }),
    )
  })

  it("still rejects an overnight shift left on one date", async () => {
    // The safety net behind the field above: same date, end before start.
    const { onSubmit } = renderForm()

    typeInstant("Start time", "2026-08-04T20:00")
    typeInstant("End time", "2026-08-04T03:00")
    await save()

    expect(
      screen.getByText("End time cannot be before start time."),
    ).not.toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("shows the shift-screen wording for an open shift, not the clock one", async () => {
    // Same code, two audiences. Telling someone editing a *past* shift to
    // "clock out first" pushes them to end a real shift early.
    const { onSubmit } = renderForm()
    onSubmit.mockRejectedValue(new ApiError(400, "OPEN_SHIFT_EXISTS"))

    typeInstant("Start time", "2026-08-04T02:00")
    typeInstant("End time", "2026-08-04T10:00")
    await save()

    expect(screen.getByRole("alert").textContent).toBe(
      "You're currently clocked in. You can add or change past shifts once you clock out.",
    )
  })
})
