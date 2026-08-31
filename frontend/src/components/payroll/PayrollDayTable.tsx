import type { PayrollResponse } from "@/api/payroll"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/datetime"
import { formatHours } from "@/lib/format"
import { LABELS, zoneShortLabel } from "@/lib/messages"

interface PayrollDayTableProps {
  data: PayrollResponse
}

/**
 * The hours half of the breakdown: a row per **date**, a column per zone, and
 * **no money at all**.
 *
 * Rows are dates rather than shifts because the zones are defined by the
 * calendar day — the calculation already cuts at midnight, so a night shift
 * appears as evening hours on one date and night hours on the next. Only dates
 * with hours are sent, and a cycle with none is an empty state on the page
 * rather than a table of zeros here.
 *
 * Money is deliberately absent: ~25 rows × 4 zones would multiply the rounding
 * surface for no gain, and the summary above already answers "how much".
 *
 * ⚠️ **Both totals are read, never added.** A column's total *is*
 * `zones[].hours` and the grand total *is* `totalHours` — the server builds the
 * zone totals by summing these very cells in integer centihours, so reading
 * them back is not a shortcut, it is the only way to get the same answer. A
 * JavaScript re-sum disagrees in about a third of rows.
 */
export function PayrollDayTable({ data }: PayrollDayTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{LABELS.columnDate}</TableHead>
            {/* Columns generated from the response — count, order and key all
                come from `zones[]`. Only the short *word* is local (§8a names
                these headers without percentages), and an unknown zone falls
                back to the label the server sent. */}
            {data.zones.map((zone) => (
              <TableHead key={zone.zone} className="text-right">
                {zoneShortLabel(zone.zone, zone.label)}
              </TableHead>
            ))}
            <TableHead className="text-right">{LABELS.total}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.days.map((day) => (
            <TableRow key={day.date}>
              {/* ⚠️ Formatted as UTC. `date` is a bare YYYY-MM-DD, and reading
                  it in a negative-offset browser prints the previous day —
                  which would put a Saturday's weekend hours on a row labelled
                  Friday. */}
              <TableCell className="whitespace-nowrap">
                {formatDate(day.date)}
              </TableCell>
              {data.zones.map((zone) => {
                // `?? 0` covers the one case the fallback header exists for: a
                // zone this client does not know. All four known keys are
                // always present, zeros included.
                const hours = day.hours[zone.zone] ?? 0
                return (
                  <TableCell
                    key={zone.zone}
                    className="text-right tabular-nums"
                  >
                    {hours === 0 ? (
                      <span className="text-muted-foreground">
                        {LABELS.emptyCell}
                      </span>
                    ) : (
                      formatHours(hours)
                    )}
                  </TableCell>
                )
              })}
              <TableCell className="text-right tabular-nums">
                {formatHours(day.totalHours)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            {/* ⚠️ A row header, not a data cell — see PayrollSummary. In a
                six-column table this is the difference between "Total: 18.87,
                5.25, …" and six unlabelled numbers. `TableFooter` already
                applies `font-medium`. */}
            <TableHead scope="row">{LABELS.total}</TableHead>
            {data.zones.map((zone) => (
              <TableCell key={zone.zone} className="text-right tabular-nums">
                {formatHours(zone.hours)}
              </TableCell>
            ))}
            {/* ⚠️ A zero column total prints `0.00` here while a zero *cell*
                above prints a dash. Deliberate, not an oversight: a totals row
                is a row of totals, and a dash there reads as "not computed"
                rather than "none". */}
            <TableCell className="text-right tabular-nums">
              {formatHours(data.totalHours)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
