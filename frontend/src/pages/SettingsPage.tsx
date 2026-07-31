import { useState, type SubmitEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PAGE_TITLES } from "@/lib/messages"
import { mockSettings } from "@/mocks/data"

// Admin only. Local state only — PUT /settings wiring happens in step 13.
export function SettingsPage() {
  const [cycleStartDay, setCycleStartDay] = useState(String(mockSettings.cycleStartDay))
  const [cycleEndDay, setCycleEndDay] = useState(String(mockSettings.cycleEndDay))

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{PAGE_TITLES.settings}</h1>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Pay Cycle</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycleStartDay">Cycle Start Day</Label>
              <Input
                id="cycleStartDay"
                type="number"
                min={1}
                max={31}
                value={cycleStartDay}
                onChange={(event) => setCycleStartDay(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycleEndDay">Cycle End Day</Label>
              <Input
                id="cycleEndDay"
                type="number"
                min={1}
                max={31}
                value={cycleEndDay}
                onChange={(event) => setCycleEndDay(event.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-fit">
              Save Settings
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
