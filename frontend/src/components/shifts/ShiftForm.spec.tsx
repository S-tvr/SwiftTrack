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

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await act(async () => {})
}

afterEach(cleanup)

describe("ShiftForm", () => {
  it("refuses an empty form without sending a request", async () => {
    const { onSubmit } = renderForm()

    await save()

    expect(screen.getByText("Enter a start time.")).not.toBeNull()
    expect(screen.getByText("Enter an end time.")).not.toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("catches an end before the start before any request", async () => {
    // Mirrors the backend's @IsNotBefore, so the 400 that does come back from a
    // save is almost always a genuine overlap rather than one of these.
    const { onSubmit } = renderForm()

    type("Start time", "2026-08-04T10:00")
    type("End time", "2026-08-04T02:00")
    await save()

    expect(screen.getByText("End time cannot be before start time.")).not.toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("allows a zero-length shift, which the API accepts", async () => {
    const { onSubmit } = renderForm()

    type("Start time", "2026-08-04T02:00")
    type("End time", "2026-08-04T02:00")
    await save()

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("catches a time in the future before any request", async () => {
    const { onSubmit } = renderForm()

    type("Start time", "2099-01-01T09:00")
    type("End time", "2099-01-01T17:00")
    await save()

    expect(screen.getAllByText("Times cannot be in the future.").length).toBe(2)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("sends the typed wall clock as UTC, not reinterpreted as local", async () => {
    // ⚠️ The bug this exists to catch: `new Date(value).toISOString()` on this
    // suite's TZ (-3:30) would send 05:30Z for a shift typed as 02:00 — moving
    // it into a different rate zone and changing what the person is paid.
    const { onSubmit, onSaved } = renderForm()

    type("Start time", "2026-08-04T02:00")
    type("End time", "2026-08-04T10:00")
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

    expect(field("Start time").value).toBe("2026-08-04T02:00")
    expect(field("End time").value).toBe("2026-08-04T10:00")
  })

  it("prefills the end from the start, so an overnight shift must be made explicit", () => {
    // A datetime-local cannot hold a date without a time, so the start's clock
    // time comes along. That is the intent rather than a compromise: typing
    // 03:00 for an overnight shift then fails end-before-start and forces the
    // date to be moved deliberately, instead of the form guessing "+1 day".
    renderForm()

    type("Start time", "2026-08-04T20:00")
    fireEvent.blur(field("Start time"))

    expect(field("End time").value).toBe("2026-08-04T20:00")
  })

  it("never overwrites an end the user already set", () => {
    renderForm()

    type("End time", "2026-08-04T10:00")
    type("Start time", "2026-08-04T02:00")
    fireEvent.blur(field("Start time"))

    expect(field("End time").value).toBe("2026-08-04T10:00")
  })

  it("shows the shift-screen wording for an open shift, not the clock one", async () => {
    // Same code, two audiences. Telling someone editing a *past* shift to
    // "clock out first" pushes them to end a real shift early.
    const { onSubmit } = renderForm()
    onSubmit.mockRejectedValue(new ApiError(400, "OPEN_SHIFT_EXISTS"))

    type("Start time", "2026-08-04T02:00")
    type("End time", "2026-08-04T10:00")
    await save()

    expect(screen.getByRole("alert").textContent).toBe(
      "You're currently clocked in. You can add or change past shifts once you clock out.",
    )
  })
})
