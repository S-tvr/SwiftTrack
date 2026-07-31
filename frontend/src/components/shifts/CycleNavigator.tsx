import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

interface CycleNavigatorProps {
  cycleStart: string
  cycleEnd: string
  onPrev: () => void
  onNext: () => void
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

// Display only — never computes cycle boundaries itself. In the real app
// cycleStart/cycleEnd come from the backend response (architecture.md §
// Invariants); the mockup's onPrev/onNext just swap in a different mock pair.
export function CycleNavigator({
  cycleStart,
  cycleEnd,
  onPrev,
  onNext,
}: CycleNavigatorProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button variant="outline" size="icon" onClick={onPrev} aria-label="Previous cycle">
        <ChevronLeft className="size-4" />
      </Button>
      <p className="min-w-48 text-center text-sm font-medium">
        {dateFormatter.format(new Date(cycleStart))} – {dateFormatter.format(new Date(cycleEnd))}
      </p>
      <Button variant="outline" size="icon" onClick={onNext} aria-label="Next cycle">
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
