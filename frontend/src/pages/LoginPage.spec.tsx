// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import { LoginPage } from "@/pages/LoginPage"

// What this spec holds down is one property that is invisible on screen and
// easy to "tidy away" later: the forgot-password hint is **static**, not a
// response to a failed sign-in.
//
// It cannot be conditional. `login` answers INVALID_CREDENTIALS for an unknown
// email and a wrong password alike — one code on purpose, so neither can be
// enumerated — so a hint rendered only after a failure could not know which
// case it was answering. And an employee who has forgotten their password
// needs to read it *before* guessing, not after.

const { login } = vi.hoisted(() => ({ login: vi.fn() }))
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ login, sessionExpired: false }),
}))

const HINT = /Ask your admin to reset it/

async function renderPage() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  )
  await act(async () => {})
}

async function signIn(password = "some-password") {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "anna@swifttrack.local" },
  })
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  })
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
  await act(async () => {})
}

beforeEach(() => {
  login.mockReset().mockResolvedValue(undefined)
})

afterEach(cleanup)

describe("LoginPage — the forgotten-password hint", () => {
  it("is on screen before anything is typed", async () => {
    await renderPage()

    expect(screen.getByText(HINT)).toBeTruthy()
  })

  /**
   * ⭐ It names the activation code rather than only naming the admin. Without
   * that word, the four digits the admin later reads out and the "Activate your
   * account" link beside this sentence are three unrelated things; with it they
   * are one path. Nothing in that path is automated — no email, no redirect —
   * so this sentence is all the employee has to go on.
   */
  it("names the activation code, and points at the link that uses it", async () => {
    await renderPage()

    expect(screen.getByText(/new activation code/)).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Activate your account" }),
    ).toBeTruthy()
  })

  it("survives a failed sign-in, rather than being replaced by the error", async () => {
    login.mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS"))
    await renderPage()
    await signIn("wrong-password")

    // The error appears...
    expect(screen.getByRole("alert")).toBeTruthy()
    // ...and the way out is still readable underneath it.
    expect(screen.getByText(HINT)).toBeTruthy()
  })
})
