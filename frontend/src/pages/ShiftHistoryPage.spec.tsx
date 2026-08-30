// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import {
  createEntry,
  deleteEntry,
  getEntriesForUser,
  getMyEntries,
  type CycleEntriesResponse,
  type CycleTimeEntry,
  type TimeEntry,
} from "@/api/timeEntries"
import { ShiftHistoryPage } from "@/pages/ShiftHistoryPage"

// The project's first page spec. It exists for two things nothing else could
// see: the `userId` the admin route must send, and the toast that reports where
// a saved shift actually landed.

vi.mock("@/api/timeEntries", () => ({
  getMyEntries: vi.fn(),
  getEntriesForUser: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}))

// Hoisted so the factory below can close over it — `vi.mock` is lifted above
// the imports, and a plain const would not exist yet when it runs.
const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }))

const EMPLOYEE_ID = 65

function entry(overrides: Partial<CycleTimeEntry> = {}): CycleTimeEntry {
  return {
    id: 1,
    userId: EMPLOYEE_ID,
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
    cycleStart: "2026-07-25T00:00:00.000Z",
    cycleEnd: "2026-08-24T23:59:59.999Z",
    userId: EMPLOYEE_ID,
    name: "Elín Sigurðardóttir",
    canWrite: true,
    entries: [entry()],
    ...overrides,
  }
}

const SAVED: TimeEntry = {
  id: 99,
  userId: EMPLOYEE_ID,
  startTime: "2026-08-04T02:00:00.000Z",
  endTime: "2026-08-04T10:00:00.000Z",
  notes: null,
}

/** `/shifts` is the employee's own history; `/shifts/:userId` is an admin's. */
async function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/shifts" element={<ShiftHistoryPage />} />
        <Route path="/shifts/:userId" element={<ShiftHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {})
}

async function addShift() {
  fireEvent.click(screen.getByRole("button", { name: "Add Shift" }))
  fireEvent.change(screen.getByLabelText("Start time"), {
    target: { value: "2026-08-04T02:00" },
  })
  fireEvent.change(screen.getByLabelText("End time"), {
    target: { value: "2026-08-04T10:00" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await act(async () => {})
}

beforeEach(() => {
  vi.mocked(getMyEntries).mockReset().mockResolvedValue(response())
  vi.mocked(getEntriesForUser).mockReset().mockResolvedValue(response())
  vi.mocked(createEntry).mockReset().mockResolvedValue(SAVED)
  vi.mocked(deleteEntry).mockReset().mockResolvedValue(undefined)
  toastSuccess.mockReset()
})

afterEach(cleanup)

describe("ShiftHistoryPage — which endpoint, and whose shift", () => {
  it("reads the caller's own history on /shifts", async () => {
    await renderAt("/shifts")

    expect(getMyEntries).toHaveBeenCalledTimes(1)
    expect(getEntriesForUser).not.toHaveBeenCalled()
  })

  it("reads the employee in the URL on /shifts/:userId", async () => {
    await renderAt(`/shifts/${EMPLOYEE_ID}`)

    expect(getEntriesForUser).toHaveBeenCalledWith(EMPLOYEE_ID, undefined)
    expect(getMyEntries).not.toHaveBeenCalled()
  })

  it("⚠️ sends userId when an ADMIN adds a shift", async () => {
    // The single most damaging line in this step. Without `userId` the shift is
    // written to the *admin's own* account — which has no hourlyRate, appears
    // in no list and is never paid. Invisible in every other test.
    await renderAt(`/shifts/${EMPLOYEE_ID}`)
    await addShift()

    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ userId: EMPLOYEE_ID }),
    )
  })

  it("⚠️ never sends userId when an EMPLOYEE adds a shift", async () => {
    // The mirror rule, and it is not cosmetic: the API answers
    // USER_ID_NOT_ALLOWED, so sending one here would break the employee's own
    // form outright.
    await renderAt("/shifts")
    await addShift()

    const [body] = vi.mocked(createEntry).mock.calls[0]
    expect("userId" in body).toBe(false)
  })

  it("shows the employee's name only on the admin route", async () => {
    await renderAt(`/shifts/${EMPLOYEE_ID}`)
    expect(screen.queryByText("Elín Sigurðardóttir")).not.toBeNull()

    cleanup()

    // On their own page the name is already in the header, and the response's
    // `name` is the caller's own.
    await renderAt("/shifts")
    expect(screen.queryByText("Elín Sigurðardóttir")).toBeNull()
  })
})

describe("ShiftHistoryPage — telling the user where the shift went", () => {
  it("confirms plainly when the saved shift is in the list", async () => {
    await renderAt("/shifts")
    vi.mocked(getMyEntries).mockResolvedValue(
      response({ entries: [entry(), entry({ id: SAVED.id })] }),
    )

    await addShift()

    expect(toastSuccess).toHaveBeenCalledWith("Shift saved.")
  })

  it("⚠️ says so when the shift landed outside the cycle on screen", async () => {
    // The reason sonner was adopted at all: the dialog closes, the list is
    // identical, and nothing on screen changes.
    //
    // Note *how* it decides — the row is absent from the refetched list. It
    // does not compare startTime against the cycle bounds, which would mean
    // reimplementing the server's overlap rule in the browser.
    await renderAt("/shifts")
    vi.mocked(getMyEntries).mockResolvedValue(response({ entries: [entry()] }))

    await addShift()

    expect(toastSuccess).toHaveBeenCalledWith(
      "Shift saved. It falls outside the cycle you're viewing, so it isn't in this list.",
    )
  })

  it("gets a split shift right for free, since the server lists it in both", async () => {
    await renderAt("/shifts")
    vi.mocked(getMyEntries).mockResolvedValue(
      response({ entries: [entry({ id: SAVED.id, isSplit: true })] }),
    )

    await addShift()

    expect(toastSuccess).toHaveBeenCalledWith("Shift saved.")
  })

  it("still confirms the save when the reload behind it fails", async () => {
    // The write landed; only the refresh did not. Staying silent would let the
    // page's error read as if the shift had been lost.
    await renderAt("/shifts")
    vi.mocked(getMyEntries).mockRejectedValue(new ApiError(0, "NETWORK_ERROR"))

    await addShift()

    expect(toastSuccess).toHaveBeenCalledWith("Shift saved.")
  })

  it("confirms a delete, which otherwise only removes a row", async () => {
    await renderAt("/shifts")

    fireEvent.click(screen.getByRole("button", { name: "Delete shift" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await act(async () => {})

    expect(deleteEntry).toHaveBeenCalledWith(1)
    expect(toastSuccess).toHaveBeenCalledWith("Shift deleted.")
  })
})

describe("ShiftHistoryPage — the cycle in the URL", () => {
  it("omits ?cycle= on first load, letting the server resolve it", async () => {
    // The current cycle is not the current calendar month, so guessing one
    // client-side would be wrong for six days out of every thirty.
    await renderAt("/shifts")

    expect(getMyEntries).toHaveBeenCalledWith(undefined)
  })

  it("reads ?cycle= from the URL, so a refresh keeps its place", async () => {
    await renderAt("/shifts?cycle=2026-07")

    expect(getMyEntries).toHaveBeenCalledWith("2026-07")
  })

  it("navigates with the key the server supplied, computing nothing", async () => {
    await renderAt("/shifts")

    fireEvent.click(screen.getByRole("button", { name: "Previous cycle" }))
    await act(async () => {})

    expect(getMyEntries).toHaveBeenLastCalledWith("2026-07")
  })
})
