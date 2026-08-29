import {
  formatUtcOffsetDifference,
  getBrowserTimeZone,
  getUtcOffsetMinutes,
} from "@/lib/datetime"
import { NOTICES } from "@/lib/messages"

/**
 * States the UTC rule rather than hiding it — but only when it matters.
 *
 * In Iceland UTC *is* the wall clock, so this renders nothing there. Anywhere
 * else, a shift clocked at 15:00 local displays as 12:00 and looks like the app
 * lost three hours.
 *
 * ⚠️ The zone and the difference come from the **browser**, never from IP: the
 * right question is "does your clock differ from UTC", and one IP needs two
 * different answers in Athens depending on the month.
 *
 * ⚠️ Not dismissible, deliberately — someone who dismisses it then types a
 * shift three hours wrong.
 */
export function TimezoneNotice() {
  const offsetMinutes = getUtcOffsetMinutes()

  if (offsetMinutes === 0) return null

  return (
    <div className="border-b border-border bg-muted px-4 py-2 text-center text-sm text-muted-foreground sm:px-6">
      {NOTICES.timezone(
        getBrowserTimeZone(),
        formatUtcOffsetDifference(offsetMinutes),
      )}
    </div>
  )
}
