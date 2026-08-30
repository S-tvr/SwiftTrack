import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/datetime"
import { LABELS } from "@/lib/messages"

interface CycleNavigatorProps {
  /** First instant of the cycle, as the API sent it. */
  cycleStart: string
  /** Last instant of the cycle, as the API sent it. */
  cycleEnd: string
  onPrev: () => void
  onNext: () => void
  /** Held while a read is in flight, so a burst of clicks cannot queue up
   *  requests whose answers race each other. */
  disabled?: boolean
}

/**
 * ◀▶ and the dates between them. **It computes nothing** — not a boundary, not
 * a month rollover, not even which cycle comes next: the page hands it the
 * `prevCycle`/`nextCycle` keys the server supplied, and it hands them back.
 *
 * That is the whole point of the component. Resolving a cycle boundary in the
 * browser is forbidden (architecture.md § Frontend invariants), and this is the
 * one place where it would be tempting.
 */
export function CycleNavigator({
  cycleStart,
  cycleEnd,
  onPrev,
  onNext,
  disabled = false,
}: CycleNavigatorProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={onPrev}
        disabled={disabled}
        aria-label={LABELS.previousCycle}
      >
        <ChevronLeft className="size-4" />
      </Button>
      {/* Rendered through lib/datetime in UTC. `toLocaleDateString` here would
          print the 24th for a cycle starting on the 25th in any browser west of
          Greenwich, and the header would then disagree with the rows. */}
      <p className="min-w-56 text-center text-sm font-medium">
        {formatDate(cycleStart)} – {formatDate(cycleEnd)}
      </p>
      <Button
        variant="outline"
        size="icon"
        onClick={onNext}
        disabled={disabled}
        aria-label={LABELS.nextCycle}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
