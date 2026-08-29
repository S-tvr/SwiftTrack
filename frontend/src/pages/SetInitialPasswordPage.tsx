import { useState } from "react"
import { Link } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { setInitialPassword } from "@/api/auth"
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
import {
  errorText,
  LABELS,
  NOTICES,
  VALIDATION,
  type ErrorCode,
} from "@/lib/messages"

// Same pattern as LoginPage — react-hook-form + zod + `Field`, bound by hand.
// The cross-field check uses `.refine()`, which typechecks cleanly on this
// stack (the old "ZodEffects" problem does not apply — architecture.md
// § Stack Traps #3).

const activationSchema = z
  .object({
    email: z.email(VALIDATION.email),
    setupCode: z.string().regex(/^\d{4}$/, VALIDATION.setupCode),
    newPassword: z.string().min(8, VALIDATION.newPassword),
    // Client-side only: the API takes no confirmation field.
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: VALIDATION.passwordsDoNotMatch,
    path: ["confirmPassword"],
  })

type ActivationValues = z.infer<typeof activationSchema>

export function SetInitialPasswordPage() {
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isActivated, setIsActivated] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActivationValues>({ resolver: zodResolver(activationSchema) })

  async function onSubmit(values: ActivationValues) {
    setFailure(null)
    try {
      await setInitialPassword({
        email: values.email,
        setupCode: values.setupCode,
        newPassword: values.newPassword,
      })
      setIsActivated(true)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">SwiftTrack</CardTitle>
          <CardDescription>{LABELS.accountActivation}</CardDescription>
        </CardHeader>
        <CardContent>
          {isActivated ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm" role="status">
                {NOTICES.accountActivated}
              </p>
              <Button render={<Link to="/login" />} className="w-full">
                {LABELS.signIn}
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => void handleSubmit(onSubmit)(event)}
              noValidate
            >
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
                <FieldLabel htmlFor="setupCode">{LABELS.setupCode}</FieldLabel>
                <Input
                  id="setupCode"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  aria-invalid={errors.setupCode !== undefined}
                  {...register("setupCode")}
                />
                <FieldError errors={[errors.setupCode]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="newPassword">
                  {LABELS.newPassword}
                </FieldLabel>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={errors.newPassword !== undefined}
                  {...register("newPassword")}
                />
                <FieldError errors={[errors.newPassword]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword">
                  {LABELS.confirmPassword}
                </FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={errors.confirmPassword !== undefined}
                  {...register("confirmPassword")}
                />
                <FieldError errors={[errors.confirmPassword]} />
              </Field>

              {failure !== null && (
                <p className="text-sm text-destructive" role="alert">
                  {errorText(failure, "activate")}
                </p>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {LABELS.activateAccount}
              </Button>

              <Link
                to="/login"
                className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                {LABELS.backToLogin}
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
