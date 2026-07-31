import { Clock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LABELS } from "@/lib/messages"

interface ClockButtonProps {
  isOpen: boolean
  onToggle: () => void
}

// Toggle is local UI state only — no backend call. Wiring to the real
// POST /time-entries/clock-in|out happens in step 10 via api/timeEntries.ts
// (architecture.md § Data Flow).
export function ClockButton({ isOpen, onToggle }: ClockButtonProps) {
  return (
    <Button
      size="lg"
      variant={isOpen ? "destructive" : "default"}
      className="h-16 w-full max-w-xs gap-2 text-base"
      onClick={onToggle}
    >
      <Clock className="size-5" />
      {isOpen ? LABELS.clockOut : LABELS.clockIn}
    </Button>
  )
}
