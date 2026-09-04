import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { changePassword } from "@/api/auth"
import { ApiError } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

// The form pattern is LoginPage's, unchanged — react-hook-form + zod + `Field`,
// bound by hand. What is different here is what happens *after* a success, and
// it is the whole reason this page needs care: the request revokes every token
// this user holds, so the response carries a replacement that must be stored
// before anything else fires a request.

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, VALIDATION.currentPasswordRequired),
    newPassword: z.string().min(8, VALIDATION.newPassword),
    // Client-side only: the API takes no confirmation field.
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: VALIDATION.passwordsDoNotMatch,
    path: ["confirmPassword"],
  })

type ChangePasswordValues = z.infer<typeof changePasswordSchema>

export function ChangePasswordPage() {
  const { replaceToken } = useAuth()

  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [isChanged, setIsChanged] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  })

  async function onSubmit(values: ChangePasswordValues) {
    setFailure(null)
    setIsChanged(false)
    try {
      const { accessToken } = await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })

      // ⚠️ Before anything else. The token this request was made with is
      // already dead — the change revoked it along with every other session —
      // so any request sent between here and storing the replacement would 401
      // and trip the auto-logout, throwing the user out moments after they
      // succeeded.
      replaceToken(accessToken)

      // Cleared rather than left filled: the values are now stale, and a form
      // still holding the old password invites a second, failing submit.
      reset()
      setIsChanged(true)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{PAGE_TITLES.changePassword}</h1>

      <Card className="w-full max-w-sm">
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            noValidate
          >
            <Field>
              <FieldLabel htmlFor="currentPassword">
                {LABELS.currentPassword}
              </FieldLabel>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.currentPassword !== undefined}
                {...register("currentPassword")}
              />
              <FieldError errors={[errors.currentPassword]} />
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

            {/* Request-level errors render above the submit button; field-level
                ones render under their field. */}
            {failure !== null && (
              <p className="text-sm text-destructive" role="alert">
                {errorText(failure)}
              </p>
            )}

            {/* Stays on the page rather than replacing the form the way
                /activate does: there is nowhere to send the user afterwards,
                and they may want to read the sentence about other devices. */}
            {isChanged && (
              <p className="text-sm text-muted-foreground" role="status">
                {NOTICES.passwordChanged}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {LABELS.updatePassword}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
