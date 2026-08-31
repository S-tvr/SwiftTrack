import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ApiError } from "@/api/client"
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  UserResponse,
} from "@/api/users"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { errorText, LABELS, VALIDATION, type ErrorCode } from "@/lib/messages"

// The form pattern established by LoginPage in step 9 and copied by ShiftForm in
// step 11: react-hook-form + zod + the presentational `Field` components. There
// is no <Form>/<FormField> in this style (architecture.md § Stack Traps #1).

/**
 * ⚠️ **`hourlyRate` is where `valueAsNumber` belongs, and step 13-2's `Select`
 * is where it did not.** This is a native `<input type="number">`, whose value
 * is a **string**, so the conversion has to happen somewhere — and
 * architecture.md § Stack Traps #3 names this exact field when it prefers
 * `register(..., { valueAsNumber: true })` over `z.coerce`, which does not
 * typecheck on this stack. Base UI's `Select` is generic over its value type and
 * needed no conversion at all· the two are genuinely different, not inconsistent.
 *
 * ⚠️ An **empty** number input yields `NaN`, not `undefined`, and `z.number()`
 * rejects it — which is why the type-level message is written out rather than
 * left to say "expected number, received NaN" to an admin who has typed nothing.
 */
const employeeSchema = z.object({
  /**
   * ⚠️ **`.trim()` before `.min(1)`, and the order is the whole rule.** Measured
   * on the installed zod (4.5.1), not recalled:
   *
   * - `z.string().trim().min(1)` on `"   "` → **rejects**, and `" ok "` parses to `"ok"`
   * - `z.string().min(1).trim()` on `"   "` → **passes, with `""`**
   *
   * The second is what this form did until the step-13-3 review: `.min(1)` saw a
   * three-character string, and the trim happened afterwards in `submit()`. A
   * name of spaces therefore passed the client, reached the API as `""`, and
   * came back as a `ValidationPipe` 400 — which carries **no `code`**, so the
   * admin read "Something went wrong. Please try again." over a form that
   * visibly had a name in it.
   *
   * Trimming in the schema rather than at the call site also means there is one
   * place that does it: `zodResolver` hands `submit()` the **parsed** values, so
   * the trimmed name is what gets sent.
   */
  name: z.string().trim().min(1, VALIDATION.nameRequired),
  /** ⚠️ Needs no `.trim()`, and adding one would not work anyway: `z.email()`
   *  runs its format check **before** any trim, so `" a@b.local "` is rejected
   *  either way (measured). Whitespace can therefore never reach `submit()`. */
  email: z.email(VALIDATION.email),
  hourlyRate: z
    .number(VALIDATION.hourlyRateRequired)
    .int(VALIDATION.hourlyRateMin)
    .min(1, VALIDATION.hourlyRateMin),
})

type EmployeeValues = z.infer<typeof employeeSchema>

interface EmployeeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing, absent when adding. */
  employee?: UserResponse
  /**
   * Performs the write. Lives on the page, which is what decides between
   * `POST /users` and `PUT /users/:id` — a component receives what to do, it
   * does not decide to call the API.
   */
  onSubmit: (
    input: CreateEmployeeInput | UpdateEmployeeInput,
  ) => Promise<UserResponse>
  /** Called after a successful write, with what the server stored. */
  onSaved: (saved: UserResponse) => void
}

function defaultValues(employee: UserResponse | undefined): EmployeeValues {
  return {
    name: employee?.name ?? "",
    email: employee?.email ?? "",
    // NaN rather than 0: an empty field must fail the schema, and 0 would both
    // pass as "a number" and print a misleading zero into the input.
    hourlyRate: employee?.hourlyRate ?? Number.NaN,
  }
}

export function EmployeeForm({
  open,
  onOpenChange,
  employee,
  onSubmit,
  onSaved,
}: EmployeeFormProps) {
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const isEdit = employee !== undefined

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: defaultValues(employee),
  })

  // The dialog is mounted once and reused for both add and edit, so the fields
  // have to be re-seeded each time it opens — otherwise the second employee
  // edited shows the first one's name.
  useEffect(() => {
    if (open) reset(defaultValues(employee))
  }, [open, employee, reset])

  /** Every path that closes this dialog goes through here, which is what clears
   *  the request-level failure without a `setState` inside an effect body. */
  function close() {
    setFailure(null)
    onOpenChange(false)
  }

  async function submit(values: EmployeeValues) {
    setFailure(null)
    try {
      // ⚠️ **The email is dropped on an edit, not merely hidden.** `PUT /users/:id`
      // takes `name` and `hourlyRate` only, and its DTO rejects an undeclared
      // property outright rather than ignoring it — so sending the unchanged
      // address back would turn every edit into a 400.
      // ⚠️ No `.trim()` here any more, deliberately. `values` are the **parsed**
      // values from the schema, which already trimmed the name — and doing it
      // in both places is how the two come to disagree about what was validated
      // versus what was sent. That gap is exactly what the review found.
      const saved = await onSubmit(
        isEdit
          ? { name: values.name, hourlyRate: values.hourlyRate }
          : {
              name: values.name,
              email: values.email,
              hourlyRate: values.hourlyRate,
            },
      )
      close()
      onSaved(saved)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.code : "UNKNOWN_ERROR")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => void handleSubmit(submit)(event)}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>
              {isEdit ? LABELS.editEmployeeTitle : LABELS.addEmployeeTitle}
            </DialogTitle>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="employeeName">{LABELS.name}</FieldLabel>
            <Input
              id="employeeName"
              aria-invalid={errors.name !== undefined}
              {...register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>

          {/* ⚠️ **Absent in edit mode, not disabled.** Email is a create-only
              field, and a greyed-out input still says "this is editable, just
              not now" about something that is never editable. The step-0 mockup
              disabled it· an input whose value the API refuses is worse than no
              input at all. */}
          {!isEdit && (
            <Field>
              <FieldLabel htmlFor="employeeEmail">{LABELS.email}</FieldLabel>
              <Input
                id="employeeEmail"
                type="email"
                aria-invalid={errors.email !== undefined}
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="employeeHourlyRate">
              {LABELS.hourlyRateField}
            </FieldLabel>
            <Input
              id="employeeHourlyRate"
              type="number"
              min={1}
              step={1}
              aria-invalid={errors.hourlyRate !== undefined}
              {...register("hourlyRate", { valueAsNumber: true })}
            />
            <FieldError errors={[errors.hourlyRate]} />
          </Field>

          {/* Request-level failures render above the buttons; field-level ones
              render under their field. `EMAIL_ALREADY_EXISTS` is the one that
              actually arrives here. */}
          {failure !== null && (
            <p className="text-sm text-destructive" role="alert">
              {errorText(failure, "team")}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={isSubmitting}
            >
              {LABELS.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {LABELS.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
