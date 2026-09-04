// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { changePassword } from "@/api/auth"
import { ApiError } from "@/api/client"
import { ChangePasswordPage } from "@/pages/ChangePasswordPage"

// Two things here cannot be seen by looking at the screen, and they are why this
// spec exists:
//
//   1. The replacement token is stored. The request revokes every token the user
//      holds, including the one it was made with — so failing to store the
//      replacement means the *next* request 401s and throws the user out
//      moments after they succeeded.
//   2. A wrong current password leaves the user **on this page**. That is the
//      exact bug step 8f was created to remove: the endpoint used to answer 401,
//      and api/client.ts logs out on any 401 carrying a token, so a typo signed
//      the user out and blamed an expired session. The 400 keeps them here.

vi.mock("@/api/auth", () => ({ changePassword: vi.fn() }))

const { replaceToken } = vi.hoisted(() => ({ replaceToken: vi.fn() }))
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ replaceToken }),
}))

const CURRENT = "current-password"
const NEXT = "a-brand-new-password"

function fill({
  current = CURRENT,
  next = NEXT,
  confirm = NEXT,
}: { current?: string; next?: string; confirm?: string } = {}) {
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: current },
  })
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: next },
  })
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: confirm },
  })
}

async function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Update password" }))
  await act(async () => {})
}

/** No jest-dom in this project — the suite asserts with plain vitest matchers. */
function valueOf(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value
}

beforeEach(() => {
  vi.mocked(changePassword)
    .mockReset()
    .mockResolvedValue({ accessToken: "replacement.jwt.token" })
  replaceToken.mockReset()
  render(<ChangePasswordPage />)
})

afterEach(cleanup)

describe("ChangePasswordPage", () => {
  it("sends only the two fields the API accepts, never the confirmation", async () => {
    fill()
    await submit()

    // `confirmPassword` is a client-only field: the DTO does not declare it, and
    // the global ValidationPipe rejects any property it does not declare — so
    // sending it would 400 every successful change.
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT,
      newPassword: NEXT,
    })
  })

  it("⭐ stores the replacement token on success", async () => {
    fill()
    await submit()

    expect(replaceToken).toHaveBeenCalledWith("replacement.jwt.token")
    expect(
      screen.queryByText(/your password has been changed/i),
    ).not.toBeNull()
  })

  it("says other devices were signed out — the only place the app admits it", async () => {
    fill()
    await submit()

    // Without this sentence the revocation is invisible to the one person who
    // asked for it, and their other device dropping reads as a bug.
    expect(
      screen.queryByText(/other devices signed in as you have been signed out/i),
    ).not.toBeNull()
  })

  it("clears the form on success, so a second submit cannot resend a stale password", async () => {
    fill()
    await submit()

    expect(valueOf("Current password")).toBe("")
    expect(valueOf("New password")).toBe("")
    expect(valueOf("Confirm password")).toBe("")
  })

  it("⭐ keeps the user on the page when the current password is wrong", async () => {
    vi.mocked(changePassword).mockRejectedValue(
      new ApiError(400, "INVALID_CURRENT_PASSWORD"),
    )
    fill({ current: "wrong" })
    await submit()

    expect(
      screen.queryByText("Your current password is incorrect."),
    ).not.toBeNull()
    // The form is still here, and the session was never touched.
    expect(screen.queryByLabelText("Current password")).not.toBeNull()
    expect(replaceToken).not.toHaveBeenCalled()
  })

  it("shows the server's refusal of an unchanged password", async () => {
    vi.mocked(changePassword).mockRejectedValue(
      new ApiError(400, "NEW_PASSWORD_SAME_AS_CURRENT"),
    )
    fill({ next: CURRENT, confirm: CURRENT })
    await submit()

    expect(
      screen.queryByText(
        "Your new password must be different from your current one.",
      ),
    ).not.toBeNull()
  })

  it("catches a mismatched confirmation before any request goes out", async () => {
    fill({ confirm: "something-else" })
    await submit()

    expect(screen.queryByText("Passwords do not match.")).not.toBeNull()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it("catches a short new password before any request goes out", async () => {
    fill({ next: "short", confirm: "short" })
    await submit()

    expect(screen.queryByText("Use at least 8 characters.")).not.toBeNull()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it("requires the current password without guessing at a length rule", async () => {
    fill({ current: "" })
    await submit()

    // Only the server can say whether it matches, so the client checks presence
    // and nothing more.
    expect(screen.queryByText("Enter your current password.")).not.toBeNull()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it("falls back to the generic message for an unmapped failure", async () => {
    vi.mocked(changePassword).mockRejectedValue(new Error("boom"))
    fill()
    await submit()

    expect(
      screen.queryByText("Something went wrong. Please try again."),
    ).not.toBeNull()
    expect(replaceToken).not.toHaveBeenCalled()
  })
})
