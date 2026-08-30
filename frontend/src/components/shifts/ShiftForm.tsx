import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ApiError } from "@/api/client"
import type { CycleTimeEntry, TimeEntry, TimeEntryInput } from "@/api/timeEntries"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { nowIsoUtc, toDatetimeLocal, toIsoUtc } from "@/lib/datetime"
import { errorText, LABELS, NOTICES, VALIDATION, type ErrorCode } from "@/lib/messages"

// Follows the form pattern established by LoginPage in step 9: react-hook-form
// + zod + the presentational `Field` components. There is no <Form>/<FormField>
// in this style (architecture.md § Stack Traps #1), and no `z.coerce` anywhere,
// which does not typecheck on this stack (Stack Trap #3).

/**
 * ⚠️ **Two `datetime-local` inputs — date *and* time at both ends.**
 *
 * A single-date-plus-two-times layout cannot express `20:00 → 03:00` without
 * inferring "+1 day", and that inference makes a zero-length shift — which the
 * API allows — impossible to enter.
 *
 * The object-level rules mirror the backend's `@IsNotBefore` and
 * `@IsNotInTheFuture`, so the 400 that does come back from a save is almost
 * always a genuine overlap. They are layers, not duplicates: the server still
 * enforces both.
 */
const shiftSchema = z
  .object({
    startTime: z.string().min(1, VALIDATION.startTimeRequired),
    // Required. The manual form is the tool for *closed* shifts; clock-in owns
    // live ones, which is what keeps "at most one open shift" enforced in the
    // single place that can create one.
    endTime: z.string().min(1, VALIDATION.endTimeRequired),
    notes: z.string(),
  })
  .superRefine((values, ctx) => {
    // The field rules above already reported an empty box; comparing here would
    // stack a second, more confusing message on the same field.
    if (values.startTime === "" || values.endTime === "") return

    const start = toIsoUtc(values.startTime)
    const end = toIsoUtc(values.endTime)
    const now = nowIsoUtc()

    // Equal is allowed: a zero-length entry is harmless and can carry notes.
    if (end < start) {
      ctx.addIssue({
        code: "custom",
        message: VALIDATION.endBeforeStart,
        path: ["endTime"],
      })
    }

    // Both instants share one format, so `>` is an exact comparison and needs
    // no date arithmetic.
    if (start > now) {
      ctx.addIssue({
        code: "custom",
        message: VALIDATION.timeInFuture,
        path: ["startTime"],
      })
    }
    if (end > now) {
      ctx.addIssue({
        code: "custom",
        message: VALIDATION.timeInFuture,
        path: ["endTime"],
      })
    }
  })

type ShiftValues = z.infer<typeof shiftSchema>

interface ShiftFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing, absent when adding. */
  entry?: CycleTimeEntry
  /**
   * Performs the write. Lives on the page, which knows whether this is the
   * employee's own history or an admin's view of someone else's — and therefore
   * whether `userId` belongs in the body.
   */
  onSubmit: (input: TimeEntryInput) => Promise<TimeEntry>
  /** Called after a successful write, with what the server stored. */
  onSaved: (saved: TimeEntry) => void
}

function defaultValues(entry: CycleTimeEntry | undefined): ShiftValues {
  return {
    startTime: entry ? toDatetimeLocal(entry.startTime) : "",
    endTime: entry?.endTime ? toDatetimeLocal(entry.endTime) : "",
    notes: entry?.notes ?? "",
  }
}

export function ShiftForm({
  open,
  onOpenChange,
  entry,
  onSubmit,
  onSaved,
}: ShiftFormProps) {
  const [failure, setFailure] = useState<ErrorCode | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ShiftValues>({
    resolver: zodResolver(shiftSchema),
    defaultValues: defaultValues(entry),
  })

  // The dialog is mounted once and reused for both add and edit, so the fields
  // have to be re-seeded each time it opens — otherwise the second shift edited
  // shows the first one's times.
  useEffect(() => {
    if (open) reset(defaultValues(entry))
  }, [open, entry, reset])

  /**
   * Every path that closes this dialog goes through here — Cancel, a dismiss,
   * and a successful save alike.
   *
   * ⚠️ That is what clears the request-level failure, and it is deliberately
   * **not** an effect on `open`: `setState` in an effect body triggers cascading
   * renders and is what `react-hooks/set-state-in-effect` forbids. Clearing on
   * the way out reaches the same state as clearing on the way in, without one.
   */
  function close() {
    setFailure(null)
    onOpenChange(false)
  }

  /**
   * ⚠️ Prefills the **end** from the start when the end is still empty.
   *
   * A `datetime-local` cannot hold a date without a time, so the start's clock
   * time comes along with its date and the user overwrites it. That is not a
   * compromise of the intent — it is the intent: a same-day shift needs only the
   * end time typed, while an overnight one lands on `20:00 → 03:00` **on the
   * same date**, fails the end-before-start rule, and forces the user to move
   * the date deliberately rather than letting the form guess "+1 day".
   */
  function handleStartBlur() {
    const { startTime, endTime } = getValues()
    if (startTime !== "" && endTime === "") {
      setValue("endTime", startTime, { shouldValidate: false })
    }
  }

  async function submit(values: ShiftValues) {
    setFailure(null)
    try {
      const saved = await onSubmit({
        startTime: toIsoUtc(values.startTime),
        endTime: toIsoUtc(values.endTime),
        // ⚠️ Always sent, `null` included. PUT is a full replacement and the
        // service writes `notes ?? null`, so omitting this on an edit silently
        // erases whatever was there. A backend e2e test asserts exactly that.
        notes: values.notes.trim() === "" ? null : values.notes.trim(),
      })
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
              {entry ? LABELS.editShiftTitle : LABELS.addShiftTitle}
            </DialogTitle>
            {/* The only path where a user's own clock can reach the data, so
                the rule is stated rather than assumed. */}
            <DialogDescription>{NOTICES.shiftTimesAreUtc}</DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="startTime">{LABELS.startTime}</FieldLabel>
            <Input
              id="startTime"
              type="datetime-local"
              aria-invalid={errors.startTime !== undefined}
              {...register("startTime", { onBlur: handleStartBlur })}
            />
            <FieldError errors={[errors.startTime]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="endTime">{LABELS.endTime}</FieldLabel>
            <Input
              id="endTime"
              type="datetime-local"
              aria-invalid={errors.endTime !== undefined}
              {...register("endTime")}
            />
            <FieldError errors={[errors.endTime]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">{LABELS.notes}</FieldLabel>
            <Textarea id="notes" rows={3} {...register("notes")} />
          </Field>

          {/* Request-level failures render above the submit button; field-level
              ones render under their field. */}
          {failure !== null && (
            <p className="text-sm text-destructive" role="alert">
              {errorText(failure, "shifts")}
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
