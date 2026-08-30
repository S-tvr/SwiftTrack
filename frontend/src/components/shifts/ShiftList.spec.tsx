// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CycleEntriesResponse, CycleTimeEntry } from "@/api/timeEntries"
import { ShiftList } from "@/components/shifts/ShiftList"

// Purely presentational — it fetches nothing, so nothing is mocked. What the
// spec is about is whether the two server flags actually reach the controls.

function entry(overrides: Partial<CycleTimeEntry> = {}): CycleTimeEntry {
  return {
    id: 1,
    userId: 2,
    // ⚠️ Chosen so a missing `timeZone: "UTC"` changes the **date**, not just
    // the time: the suite runs at TZ=America/St_Johns (-3:30), where this is
    // 3 Aug 22:30 locally. A local formatter would print the 3rd.
    startTime: "2026-08-04T02:00:00.000Z",
    endTime: "2026-08-04T10:00:00.000Z",
    notes: null,
    isSplit: false,
    canEdit: true,
    ...overrides,
  }
}

function response(
  overrides: Partial<CycleEntriesResponse> = {},
): CycleEntriesResponse {
  return {
    cycle: "2026-08",
    prevCycle: "2026-07",
    nextCycle: "2026-09",
    // Also a negative-offset trap: locally this is 24 Jul 20:30.
    cycleStart: "2026-07-25T00:00:00.000Z",
    cycleEnd: "2026-08-24T23:59:59.999Z",
    userId: 2,
    name: "Elín Sigurðardóttir",
    canWrite: true,
    entries: [entry()],
    ...overrides,
  }
}

function renderList(data: CycleEntriesResponse) {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <ShiftList
      data={data}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onAdd={vi.fn()}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  return { onEdit, onDelete }
}

const button = (name: string) =>
  screen.getByRole<HTMLButtonElement>("button", { name })

afterEach(cleanup)

describe("ShiftList", () => {
  it("renders no hours or duration column", () => {
    // The API returns no hours figure on purpose, and a split shift carries its
    // full start and end in *both* cycles — so a duration here would show one
    // 7-hour shift as 7h twice. This asserts the columns exactly rather than
    // just the absence of the word "Hours", so a "Duration" heading fails too.
    renderList(response())

    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent)

    expect(headers).toEqual(["#", "Start", "End", "Notes", "Actions"])
  })

  it("numbers the rows by position, newest first, starting at 1", () => {
    // A reading aid for talking about a row, not the entry's id — which means
    // nothing to anyone holding a payslip.
    renderList(
      response({
        entries: [
          entry({ id: 830 }),
          entry({ id: 829, startTime: "2026-08-03T02:00:00.000Z" }),
          entry({ id: 828, startTime: "2026-08-02T02:00:00.000Z" }),
        ],
      }),
    )

    const firstCells = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.firstElementChild?.textContent)

    expect(firstCells).toEqual(["1", "2", "3"])
  })

  it("prints each end with its own date, in UTC", () => {
    // ⚠️ Both cells carry the whole instant, which is why there is no shared
    // Date column: this shift starts on the 4th and ends on the 5th, and one
    // cell could only ever have printed one of them. The weekday is what lets a
    // reader see a weekend shift — those are paid at +45% all day.
    renderList(
      response({
        entries: [
          entry({
            startTime: "2026-08-04T02:00:00.000Z",
            endTime: "2026-08-05T10:00:00.000Z",
          }),
        ],
      }),
    )

    // Locally (-3:30) the start is 3 Aug 22:30 — a Monday, not a Tuesday.
    expect(screen.getByText("Tue 04-Aug 02:00")).not.toBeNull()
    expect(screen.getByText("Wed 05-Aug 10:00")).not.toBeNull()
    // The cycle header follows the same rule — locally this instant is the 24th.
    expect(screen.getByText(/25 Jul 2026/)).not.toBeNull()
  })

  it("badges an open shift instead of printing an end time", () => {
    renderList(response({ entries: [entry({ endTime: null })] }))

    expect(screen.getByText("Open")).not.toBeNull()
  })

  it("disables Add Shift and says why when canWrite is false", () => {
    // Read from the flag, never worked out from the dates on screen — deciding
    // that client-side would mean resolving cycle boundaries.
    renderList(response({ canWrite: false }))

    expect(button("Add Shift").disabled).toBe(true)
    expect(screen.getByText(/pay cycle is closed/i)).not.toBeNull()
  })

  it("enables Add Shift when canWrite is true", () => {
    renderList(response())

    expect(button("Add Shift").disabled).toBe(false)
  })

  it("disables both Edit and Delete on a row the caller may not change", () => {
    // One flag, two buttons: canEdit reports edit *or* delete.
    renderList(response({ entries: [entry({ canEdit: false })] }))

    expect(button("Edit shift").disabled).toBe(true)
    expect(button("Delete shift").disabled).toBe(true)
  })

  it("explains a locked row in visible text, not in a tooltip", () => {
    // ⚠️ A `title` on a *disabled* button is unreliable across browsers and is
    // never announced to a keyboard or screen-reader user — the buttons would
    // be dead with no stated reason, while canWrite is explained in plain text
    // just above. The note is also what `aria-describedby` points at.
    renderList(response({ entries: [entry({ canEdit: false })] }))

    const note = screen.getByText(/Ask your admin to change a shift this old/i)
    expect(note).not.toBeNull()
    expect(button("Edit shift").getAttribute("aria-describedby")).toBe(note.id)
    expect(button("Delete shift").getAttribute("aria-describedby")).toBe(note.id)
  })

  it("says nothing about locking when every row is editable", () => {
    renderList(response())

    expect(screen.queryByText(/Ask your admin/i)).toBeNull()
    expect(button("Edit shift").getAttribute("aria-describedby")).toBeNull()
  })

  it("keeps the row buttons independent of the response-level flag", () => {
    // A closed cycle for an admin is `canWrite: true` with editable rows; the
    // inverse — a locked row inside a writable cycle — is what a split shift
    // beginning in a closed cycle produces. Neither flag may stand in for the
    // other.
    const { onEdit } = renderList(
      response({ canWrite: true, entries: [entry({ canEdit: false })] }),
    )

    expect(button("Add Shift").disabled).toBe(false)
    expect(button("Edit shift").disabled).toBe(true)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("marks a split shift so the duplicate in the neighbouring cycle reads as intentional", () => {
    renderList(response({ entries: [entry({ isSplit: true })] }))

    expect(screen.getByLabelText("Split")).not.toBeNull()
  })

  it("shows an empty state rather than a blank table", () => {
    renderList(response({ entries: [] }))

    const table = screen.getByRole("table")
    expect(within(table).getByText("No shifts in this cycle.")).not.toBeNull()
  })
})
