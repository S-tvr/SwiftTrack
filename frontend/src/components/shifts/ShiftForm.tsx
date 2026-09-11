import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ApiError } from "@/api/client"
import type { CycleTimeEntry, TimeEntry, TimeEntryInput } from "@/api/timeEntries"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  fromDateAndTime,
  nowIsoUtc,
  toDateAndTime,
  toIsoUtc,
} from "@/lib/datetime"
import { errorText, LABELS, NOTICES, VALIDATION, type ErrorCode } from "@/lib/messages"

// Follows the form pattern established by LoginPage in step 9: react-hook-form
// + zod + the presentational `Field` components. There is no <Form>/<FormField>
// in this style (architecture.md § Stack Traps #1), and no `z.coerce` anywhere,
// which does not typecheck on this stack (Stack Trap #3).

/**
 * ⚠️ **Four inputs: a date and a time at each end — still two full instants.**
 *
 * A single-date-plus-two-times layout cannot express `20:00 → 03:00` without
 * inferring "+1 day", and that inference makes a zero-length shift — which the
 * API allows — impossible to enter. Both ends therefore keep their own date.
 *
 * ⚠️ **Why not one `datetime-local` per end, which is the obvious shape.**
 * Measured in headless Chrome across 768/900/1080px screens: that control's
 * popup is roughly 320px of **browser chrome**, anchored under the field, while
 * only ~152px separate the End field from the dialog's Save button. It covered
 * Save at *every* screen height, and Chrome only flips such a popup upward when
 * there is no room below — which there always was. The popup is outside the
 * page's stacking context, so no CSS, z-index or dialog height could move it.
 * Splitting the control is what shrinks the popup: `time` opens a short list
 * rather than a calendar.
 *
 * A welcome second effect: the end **date** becomes a field the user can see,
 * instead of a segment buried inside a composite control — which is exactly what
 * an overnight shift needs them to notice.
 *
 * The object-level rules mirror the backend's `@IsNotBefore` and
 * `@IsNotInTheFuture`, so the 400 that does come back from a save is almost
 * always a genuine overlap. They are layers, not duplicates: the server still
 * enforces both.
 */
const shiftSchema = z
  .object({
    startDate: z.string().min(1, VALIDATION.startTimeRequired),
    startClock: z.string().min(1, VALIDATION.startTimeRequired),
    // Required. The manual form is the tool for *closed* shifts; clock-in owns
    // live ones, which is what keeps "at most one open shift" enforced in the
    // single place that can create one.
    endDate: z.string().min(1, VALIDATION.endTimeRequired),
    endClock: z.string().min(1, VALIDATION.endTimeRequired),
    notes: z.string(),
  })
  .superRefine((values, ctx) => {
    const startValue = fromDateAndTime(values.startDate, values.startClock)
    const endValue = fromDateAndTime(values.endDate, values.endClock)

    // The field rules above already reported an empty box; comparing here would
    // stack a second, more confusing message on the same field.
    if (startValue === "" || endValue === "") return

    const start = toIsoUtc(startValue)
    const end = toIsoUtc(endValue)
    const now = nowIsoUtc()

    // ⚠️ Cross-field messages are attached to the **date** half of the pair.
    // Both halves make up the instant being complained about, but an error has
    // to render somewhere, and the date is where an overnight shift is actually
    // corrected — `20:00 → 03:00` is fixed by moving the end *date*, not the
    // clock. Attaching to the clock would point at the one value that is right.

    // Equal is allowed: a zero-length entry is harmless and can carry notes.
    if (end < start) {
      ctx.addIssue({
        code: "custom",
        message: VALIDATION.endBeforeStart,
        path: ["endDate"],
      })
    }

    // Both instants share one format, so `>` is an exact comparison and needs
    // no date arithmetic.
    if (start > now) {
      ctx.addIssue({
        code: "custom",
        message: VALIDATION.timeInFuture,
        path: ["startDate"],
      })
    }
    if (end > now) {
      ctx.addIssue({
        code: "custom",
        message: VALIDATION.timeInFuture,
        path: ["endDate"],
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

/**
 * ⚠️ **Adding prefills the start with now, in Iceland time — and leaves the end
 * empty.**
 *
 * Now is the overwhelmingly common case for a shift being typed in, and an
 * empty `datetime-local` is the most tedious control in the form to fill from
 * scratch. Seeding it also puts the UTC rule on screen as a concrete value
 * rather than only as the sentence above the fields: someone in Athens sees a
 * clock reading three hours behind their wall clock and is told why.
 *
 * The end deliberately stays empty. `handleStartBlur` copies the start into it
 * precisely *because* it is empty, so prefilling both would silence that and
 * leave a zero-length shift one Save away — valid to the API, and not what
 * anybody meant.
 */
function defaultValues(entry: CycleTimeEntry | undefined): ShiftValues {
  const [startDate, startClock] = toDateAndTime(
    entry ? entry.startTime : nowIsoUtc(),
  )
  const [endDate, endClock] = entry?.endTime
    ? toDateAndTime(entry.endTime)
    : ["", ""]

  return {
    startDate,
    startClock,
    endDate,
    endClock,
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
   * ⚠️ Prefills the **end date** from the start date when it is still empty —
   * the date only, never the clock.
   *
   * Splitting the control is what makes this sharper than it used to be. The old
   * `datetime-local` version had to copy a whole instant, dragging the start's
   * clock time along with it; now the end clock stays empty and waits to be
   * typed, which is the one value the user always has to supply.
   *
   * The date still defaults to the same day, and an overnight shift still has to
   * move it deliberately: `20:00 → 03:00` on one date fails the end-before-start
   * rule rather than letting the form guess "+1 day".
   */
  function handleStartDateBlur() {
    const { startDate, endDate } = getValues()
    if (startDate !== "" && endDate === "") {
      setValue("endDate", startDate, { shouldValidate: false })
    }
  }

  async function submit(values: ShiftValues) {
    setFailure(null)
    try {
      const saved = await onSubmit({
        startTime: toIsoUtc(
          fromDateAndTime(values.startDate, values.startClock),
        ),
        endTime: toIsoUtc(fromDateAndTime(values.endDate, values.endClock)),
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
          className="flex min-h-0 flex-col gap-4"
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

          {/* ⚠️ The fields scroll; the header and footer do not. That is what
              keeps Save and Cancel reachable however short the window is. */}
          <DialogBody>
          {/* ⚠️ Date and clock are separate controls, not one `datetime-local`
              — see the note on `shiftSchema` for the measurement behind that.
              `htmlFor` points at the **date**, so clicking the group label
              lands on the field an overnight shift needs corrected. */}
          <Field>
            <FieldLabel htmlFor="startDate">{LABELS.startTime}</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="startDate"
                type="date"
                aria-label={LABELS.dateOf(LABELS.startTime)}
                aria-invalid={errors.startDate !== undefined}
                {...register("startDate", { onBlur: handleStartDateBlur })}
              />
              <Input
                id="startClock"
                type="time"
                aria-label={LABELS.clockOf(LABELS.startTime)}
                aria-invalid={errors.startClock !== undefined}
                {...register("startClock")}
              />
            </div>
            {/* One slot for the pair: the cross-field rules report on the date,
                and `FieldError` dedupes, so a missing clock and a missing date
                do not stack two copies of the same sentence. */}
            <FieldError errors={[errors.startDate, errors.startClock]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="endDate">{LABELS.endTime}</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="endDate"
                type="date"
                aria-label={LABELS.dateOf(LABELS.endTime)}
                aria-invalid={errors.endDate !== undefined}
                {...register("endDate")}
              />
              <Input
                id="endClock"
                type="time"
                aria-label={LABELS.clockOf(LABELS.endTime)}
                aria-invalid={errors.endClock !== undefined}
                {...register("endClock")}
              />
            </div>
            <FieldError errors={[errors.endDate, errors.endClock]} />
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
          </DialogBody>

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
