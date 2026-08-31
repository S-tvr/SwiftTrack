// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import { getSettings, updateSettings, type Settings } from "@/api/settings"
import { SettingsPage } from "@/pages/SettingsPage"

// The first write of step 13, on the smallest surface in the project. What this
// spec exists to hold down is not the layout: it is the three things a reader
// cannot check by looking at the screen — that the derived end day is really
// `start - 1`, that **both** fields go out as numbers, and that Cancel on the
// confirmation writes nothing at all.

// ⚠️ Only the two requests are stubbed. `deriveCycleEndDay` is kept **real** —
// it is the single implementation of the `end = start - 1` rule, and mocking it
// would leave the assertions below proving the mock rather than the rule.
vi.mock("@/api/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/settings")>()),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}))

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }))

const DEFAULTS: Settings = { cycleStartDay: 25, cycleEndDay: 24 }

async function renderPage() {
  render(<SettingsPage />)
  await act(async () => {})
}

/** Base UI's trigger is a button, not a native `<select>`. */
function trigger() {
  return screen.getByRole("combobox")
}

async function openList() {
  fireEvent.click(trigger())
  await act(async () => {})
}

/**
 * ⚠️ The `pointerdown` is required, and the reason is in Base UI's source
 * rather than in ours: `SelectItem.onClick` discards a mouse click that did not
 * *begin* on the item (`allowMouseSelectionRef`), because opening the popup
 * with `alignItemWithTrigger` can place an item directly under the cursor. A
 * bare `fireEvent.click` therefore highlights the option and selects nothing.
 */
async function chooseDay(day: number) {
  await openList()
  const option = screen.getByRole("option", { name: String(day) })
  fireEvent.pointerDown(option, { button: 0 })
  fireEvent.click(option)
  await act(async () => {})
}

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }))
  await act(async () => {})
}

beforeEach(() => {
  vi.mocked(getSettings).mockReset().mockResolvedValue(DEFAULTS)
  vi.mocked(updateSettings).mockReset().mockResolvedValue(DEFAULTS)
  toastSuccess.mockReset()
})

afterEach(cleanup)

describe("SettingsPage — the select is the validation", () => {
  it("offers exactly the fifteen days the DTO accepts, 11-25", async () => {
    // The restricted list and @Min(11)/@Max(25) are layers, not duplicates: this
    // one makes an invalid pair impossible by accident, the DTO makes it
    // impossible at all.
    await renderPage()
    await openList()

    const options = screen.getAllByRole("option").map((o) => o.textContent)

    expect(options).toEqual([
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
      "21",
      "22",
      "23",
      "24",
      "25",
    ])
  })

  it("shows the day the server sent", async () => {
    await renderPage()

    expect(trigger().textContent).toContain("25")
  })
})

describe("SettingsPage — the derived end day", () => {
  it("states the day before the start, never offering it as a field", async () => {
    await renderPage()

    expect(
      screen.queryByText("Cycle ends on the 24th of the following month."),
    ).not.toBeNull()
    // One control on the page — the end day is text.
    expect(screen.getAllByRole("combobox")).toHaveLength(1)
  })

  it("follows the selection before anything is saved", async () => {
    await renderPage()
    await chooseDay(12)

    expect(
      screen.queryByText("Cycle ends on the 11th of the following month."),
    ).not.toBeNull()
  })
})

describe("SettingsPage — saving", () => {
  it("asks for confirmation before writing anything", async () => {
    await renderPage()
    await chooseDay(20)
    await save()

    expect(screen.queryByText("Change the pay cycle?")).not.toBeNull()
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it("writes nothing when the confirmation is cancelled", async () => {
    await renderPage()
    await chooseDay(20)
    await save()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await act(async () => {})

    expect(updateSettings).not.toHaveBeenCalled()
  })

  it("sends both fields, with the end day derived from the start", async () => {
    // PUT is a full replacement — @IsDayBefore rejects any other pair.
    await renderPage()
    await chooseDay(20)
    await save()

    fireEvent.click(screen.getByRole("button", { name: "Change cycle" }))
    await act(async () => {})

    expect(updateSettings).toHaveBeenCalledWith({
      cycleStartDay: 20,
      cycleEndDay: 19,
    })
  })

  it("sends numbers, not the strings a native select would yield", async () => {
    // Base UI's Select.Root is generic over its value type, which is why no
    // z.coerce and no valueAsNumber appear anywhere on this page.
    await renderPage()
    await chooseDay(11)
    await save()

    fireEvent.click(screen.getByRole("button", { name: "Change cycle" }))
    await act(async () => {})

    const [sent] = vi.mocked(updateSettings).mock.calls[0]

    expect(typeof sent.cycleStartDay).toBe("number")
    expect(typeof sent.cycleEndDay).toBe("number")
  })

  it("confirms with a toast, because the screen itself cannot", async () => {
    // Same page, same values after a successful save — this is the case the
    // toast rule exists for.
    await renderPage()
    await chooseDay(20)
    await save()

    fireEvent.click(screen.getByRole("button", { name: "Change cycle" }))
    await act(async () => {})

    expect(toastSuccess).toHaveBeenCalledWith("Settings saved.")
  })

  it("re-reads the settings after the write", async () => {
    await renderPage()
    expect(getSettings).toHaveBeenCalledTimes(1)

    await chooseDay(20)
    await save()
    fireEvent.click(screen.getByRole("button", { name: "Change cycle" }))
    await act(async () => {})

    expect(getSettings).toHaveBeenCalledTimes(2)
  })

  it("names both days in the confirmation, from the one derivation", async () => {
    // The `- 1` rule lives in `deriveCycleEndDay` and nowhere else. If a second
    // copy ever appears, this sentence is where it shows up as a contradiction.
    await renderPage()
    await chooseDay(20)
    await save()

    expect(
      screen.queryByText(
        /Cycles will run from the 20th to the 19th of the following month\./,
      ),
    ).not.toBeNull()
  })

  it("keeps the confirmation open on failure, with the reason inside it", async () => {
    // Same rule as DeleteShiftDialog: a confirmation that closes on failure
    // returns the user to a screen that looks unchanged — which is the very
    // question they were asking.
    vi.mocked(updateSettings).mockRejectedValue(new ApiError(0, "NETWORK_ERROR"))
    await renderPage()
    await chooseDay(20)
    await save()

    fireEvent.click(screen.getByRole("button", { name: "Change cycle" }))
    await act(async () => {})

    expect(screen.queryByText("Change the pay cycle?")).not.toBeNull()
    expect(
      screen.queryByText(
        "Could not reach the server. Check your connection and try again.",
      ),
    ).not.toBeNull()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("closes the confirmation once the write lands", async () => {
    await renderPage()
    await chooseDay(20)
    await save()

    fireEvent.click(screen.getByRole("button", { name: "Change cycle" }))
    await act(async () => {})

    expect(screen.queryByText("Change the pay cycle?")).toBeNull()
  })
})

describe("SettingsPage — Save is the other half of the confirmation", () => {
  it("is disabled while nothing has changed", async () => {
    await renderPage()

    expect(
      screen.getByRole("button", { name: "Save Settings" }),
    ).toHaveProperty("disabled", true)
  })

  it("enables once a different day is chosen", async () => {
    await renderPage()
    await chooseDay(20)

    expect(
      screen.getByRole("button", { name: "Save Settings" }),
    ).toHaveProperty("disabled", false)
  })

  it("goes quiet again after a successful save", async () => {
    // The permanent half: a toast lasts four seconds, this does not.
    await renderPage()
    await chooseDay(20)
    await save()

    fireEvent.click(screen.getByRole("button", { name: "Change cycle" }))
    await act(async () => {})

    expect(
      screen.getByRole("button", { name: "Save Settings" }),
    ).toHaveProperty("disabled", true)
  })
})

describe("SettingsPage — the states a page must have", () => {
  it("keeps the heading while the first read is in flight", async () => {
    vi.mocked(getSettings).mockReturnValue(new Promise(() => {}))
    await renderPage()

    expect(screen.queryByText("Settings")).not.toBeNull()
    expect(screen.queryByRole("status")).not.toBeNull()
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("offers a retry when the read fails", async () => {
    vi.mocked(getSettings).mockRejectedValue(new ApiError(0, "NETWORK_ERROR"))
    await renderPage()

    expect(screen.queryByRole("combobox")).toBeNull()

    vi.mocked(getSettings).mockResolvedValue(DEFAULTS)
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await act(async () => {})

    expect(screen.queryByRole("combobox")).not.toBeNull()
  })
})
