import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ApiError } from "@/api/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import {
  errorText,
  LABELS,
  NOTICES,
  PAGE_TITLES,
  VALIDATION,
  type ErrorCode,
} from "@/lib/messages"

// ⚠️ This is the reference implementation of the form pattern, and the other
// four forms copy it. There is no <Form>/<FormField> here: in the base-nova
// style `form.json` is an empty shell, so `npx shadcn add form` writes nothing
// and reports no error (architecture.md § Stack Traps #1). `field.tsx` is
// presentational only, so the binding to react-hook-form is written by hand and
// nothing in the library enforces that the five forms agree.
//
// ⚠️ No `z.coerce` anywhere — it does not typecheck on this stack (Stack Trap #3).

const loginSchema = z.object({
  email: z.email(VALIDATION.email),
  password: z.string().min(1, VALIDATION.password),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login, sessionExpired } = useAuth()
  const navigate = useNavigate()

  // Request-level failure, keyed by code. Field-level failures live in
  // `formState.errors` and never reach here.
  const [failure, setFailure] = useState<ErrorCode | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginValues) {
    setFailure(null)
    try {
      await login(values.email, values.password)
      // "/" resolves by role — ADMIN to /team, EMPLOYEE to /clock.
      navigate("/", { replace: true })
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">SwiftTrack</CardTitle>
          <CardDescription>{PAGE_TITLES.loginActivation}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            noValidate
          >
            {/* Shown after an auto-logout, so being thrown out reads as an
                explanation rather than a glitch. Cleared on the next attempt. */}
            {sessionExpired && (
              <p
                className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
                role="status"
              >
                {NOTICES.sessionExpired}
              </p>
            )}

            <Field>
              <FieldLabel htmlFor="email">{LABELS.email}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email !== undefined}
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="password">{LABELS.password}</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password !== undefined}
                {...register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>

            {/* Request-level errors render above the submit button; field-level
                ones render under their field. */}
            {failure !== null && (
              <p className="text-sm text-destructive" role="alert">
                {errorText(failure, "login")}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {LABELS.signIn}
            </Button>

            <Link
              to="/activate"
              className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {LABELS.activateAccountLink}
            </Link>

            {/* ⚠️ Always visible, and deliberately not tied to a failed sign-in.
                `login` answers INVALID_CREDENTIALS for an unknown email and a
                wrong password alike — one code so neither can be enumerated —
                so a hint shown only after a failure could not know which case
                it was answering. It is not an error either, so it has no place
                in SCREEN_ERRORS: this is text the page shows because of where
                the user is.

                Plain text rather than a link, because there is nothing to link
                to — the reset is done by an admin, out of band. What it does do
                is name the activation code, which is what connects it to the
                link directly above: that is where they come back to once the
                admin has read them the four digits. */}
            <p className="text-center text-sm text-muted-foreground">
              {NOTICES.forgotPassword}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
