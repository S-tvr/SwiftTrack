import { Card, CardContent } from "@/components/ui/card"

interface MonthSummaryProps {
  totalHours: number
  estimatedPay: number
}

export function MonthSummary({ totalHours, estimatedPay }: MonthSummaryProps) {
  return (
    <Card className="w-full max-w-xs">
      <CardContent className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Hours</p>
          <p className="text-2xl font-semibold tabular-nums">
            {totalHours.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Estimated Pay</p>
          <p className="text-2xl font-semibold tabular-nums">
            {estimatedPay.toLocaleString("en-US")} ISK
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
