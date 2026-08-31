import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import {
  deriveCycleEndDay,
  getSettings,
  updateSettings,
  type Settings,
} from "@/api/settings"
import { ChangeCycleDialog } from "@/components/settings/ChangeCycleDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useApiQuery } from "@/hooks/useApiQuery"
import { formatOrdinalDay } from "@/lib/format"
import { errorText, LABELS, NOTICES, PAGE_TITLES } from "@/lib/messages"

/**
 * The days a cycle may start on, matching `@Min(11) @Max(25)` on
 * `UpdateSettingsDto`.
 *
 * ⚠️ The restricted list and the DTO are **layers, not duplicates** — the same
 * shape as `findByEmail()` beside the `P2002` catch. The select makes an
 * invalid pair impossible *by accident*; the DTO makes it impossible *at all*,
 * for any caller. Removing either one is a real loss.
 *
 * The range itself is not cosmetic: every day in it exists in every month, so
 * resolving a cycle never needs day-of-month clamping, and consecutive cycles
 * stay contiguous (spec §4, decision 5a).
 */
const START_DAYS = Array.from({ length: 15 }, (_, index) => index + 11)

/**
 * ⚠️ **No `z.coerce`** — it does not typecheck on this stack (architecture.md
 * § Stack Traps #3). It is not needed either: Base UI's `Select.Root` is
 * generic over its value type, so the field holds a **number** end to end and
 * there is nothing to convert. That is also why the build-plan's
 * `register(..., { valueAsNumber: true })` does not apply here — that idiom
 * belongs to a native `<select>`, which yields a string.
 *
 * The bounds carry no message on purpose: a value outside 11-25 cannot be
 * produced by a list of exactly those fifteen options, so any sentence written
 * here would be copy no user can reach. The schema is the type boundary, not a
 * second thing to read.
 */
const settingsSchema = z.object({
  cycleStartDay: z.number().int().min(11).max(25),
})

type SettingsValues = z.infer<typeof settingsSchema>

interface PayCycleFormProps {
  settings: Settings
  /**
   * Performs the write and reports it. Lives on the page, as `ShiftForm`'s and
   * `DeleteShiftDialog`'s do — a component receives what to do, it does not
   * decide to call the API.
   */
  onSave: (settings: Settings) => Promise<void>
}

/**
 * Mounted only once the settings have arrived, which is what lets react-hook-form
 * take its `defaultValues` from real data instead of seeding empty and correcting
 * itself in an effect. `isDirty` is then meaningful from the first render.
 */
function PayCycleForm({ settings, onSave }: PayCycleFormProps) {
  /** The submitted day, held while the confirmation is open. */
  const [pending, setPending] = useState<number | null>(null)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { cycleStartDay: settings.cycleStartDay },
  })

  /**
   * ⚠️ `useWatch`, **not** `watch()` from `useForm`. The latter returns a
   * function the React Compiler cannot memoize safely, so calling it opts this
   * whole component out of compilation — `react-hooks/incompatible-library`
   * reports it. `useWatch` subscribes to the one field and returns a value.
   */
  const selectedStartDay = useWatch({ control, name: "cycleStartDay" })

  /** Submit does not write — it opens the confirmation. */
  function openConfirmation(values: SettingsValues) {
    setPending(values.cycleStartDay)
  }

  /**
   * Throws on failure **on purpose**: `ChangeCycleDialog` catches it, stays open
   * and shows the reason, exactly as `DeleteShiftDialog` does. Only a successful
   * write reaches the two lines below it.
   */
  async function save(cycleStartDay: number) {
    await onSave({ cycleStartDay, cycleEndDay: deriveCycleEndDay(cycleStartDay) })
    // Clears `isDirty`, so the button goes quiet again. That is the *permanent*
    // half of the confirmation — the toast lasts four seconds, and this page is
    // the one where a save otherwise leaves no trace at all.
    reset({ cycleStartDay })
    setPending(null)
  }

  return (
    <>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleSubmit(openConfirmation)(event)}
        noValidate
      >
        <Field>
          <FieldLabel htmlFor="cycleStartDay">{LABELS.cycleStartDay}</FieldLabel>
          <Controller
            control={control}
            name="cycleStartDay"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  // ⚠️ Base UI types this as `number | null`. There is no clear
                  // affordance here, so `null` cannot arrive in practice —
                  // ignoring it keeps the last valid day rather than writing a
                  // null into a field the schema types as a number.
                  if (value !== null) field.onChange(value)
                }}
              >
                <SelectTrigger id="cycleStartDay" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {START_DAYS.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {/* The end day is stated, never offered — it is derived, so a field
              could only ever let an admin build a pair the API rejects. */}
          <FieldDescription>
            {NOTICES.cycleEndDerived(
              formatOrdinalDay(deriveCycleEndDay(selectedStartDay)),
            )}
          </FieldDescription>
          <FieldError errors={[errors.cycleStartDay]} />
        </Field>

        <p className="text-sm text-muted-foreground">
          {NOTICES.cycleBoundaryWarning}
        </p>

        {/* Disabled until something actually changes — which is what stops the
            admin pressing Save three times on a screen that never moves, and
            what makes every submit a real change by construction. */}
        <Button
          type="submit"
          className="w-fit"
          disabled={!isDirty || isSubmitting || pending !== null}
        >
          {LABELS.saveSettings}
        </Button>
      </form>

      <ChangeCycleDialog
        startDay={pending}
        onCancel={() => setPending(null)}
        onConfirm={save}
      />
    </>
  )
}

/**
 * ADMIN only — the pay cycle's start day, and nothing else.
 *
 * The page's shape is the one every read page has used since step 11: the read
 * goes through `useApiQuery`, the states are ordered error → loading → content,
 * and the write is explicit (`refetch()` afterwards, never through the hook).
 * What is new here is the **toast rule** step 13-3 copies: a write is confirmed
 * by a toast when the screen it leaves the user on cannot show that it happened
 * — and here it cannot, since a save leaves the same page with the same values.
 */
export function SettingsPage() {
  const { data, error, refetch } = useApiQuery(getSettings, [])

  /**
   * The page owns the write, as `ShiftHistoryPage` does. It rethrows nothing and
   * catches nothing: the dialog that called it needs the rejection to stay open.
   */
  async function saveSettings(settings: Settings) {
    await updateSettings(settings)
    refetch()
    toast.success(NOTICES.settingsSaved)
  }

  const heading = <h1 className="text-xl font-semibold">{PAGE_TITLES.settings}</h1>

  if (error !== null && data === null) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {heading}
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive" role="alert">
            {errorText(error, "settings")}
          </p>
          <Button onClick={refetch}>{LABELS.retry}</Button>
        </div>
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {heading}
        <p className="text-sm text-muted-foreground" role="status">
          {LABELS.loading}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {heading}

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">{LABELS.payCycle}</CardTitle>
        </CardHeader>
        <CardContent>
          <PayCycleForm settings={data} onSave={saveSettings} />
        </CardContent>
      </Card>
    </div>
  )
}
