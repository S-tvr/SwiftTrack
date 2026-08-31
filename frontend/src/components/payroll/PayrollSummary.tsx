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
import { formatHours, formatIsk, formatRate } from "@/lib/format"
import { LABELS } from "@/lib/messages"

interface PayrollSummaryProps {
  data: PayrollResponse
}

/**
 * The money half of the breakdown: one row per rate zone, plus a Total.
 * Shared by both roles — the employee's `/payroll` and the admin's
 * `/payroll/:userId` render the identical response through this component.
 *
 * Presentational, and **arithmetically inert**. Every figure on screen is a
 * figure the server sent:
 *
 * - the rows come from `zones[]`, never from hardcoded zone names, so a fifth
 *   zone appears here with no change to this file — the condition the
 *   four-zone decision was taken under
 * - `zone.label` is printed **verbatim**, surcharge included. The client never
 *   composes its own "+33%": a label that stopped matching its factor would
 *   make this table misstate a wage
 * - the Total row reads `totalHours` and `totalPay`. ⚠️ Summing the column
 *   instead would be a second, competing answer — the cells are decimals, and
 *   adding them in JavaScript disagrees with the server in about a third of
 *   cases (`1.99 + 22.35 + 2.92` → `27.259999999999998`), measured on this
 *   project in step 6
 *
 * The Rate column is what makes the whole table checkable by hand: it carries
 * hundredths and is never rounded, so `hours × rate` really does reproduce the
 * `pay` beside it.
 */
export function PayrollSummary({ data }: PayrollSummaryProps) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{LABELS.columnZone}</TableHead>
            <TableHead className="text-right">{LABELS.columnHours}</TableHead>
            <TableHead className="text-right">{LABELS.columnRate}</TableHead>
            <TableHead className="text-right">
              {LABELS.columnTotalPay}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.zones.map((zone) => (
            <TableRow key={zone.zone}>
              <TableCell className="whitespace-nowrap">{zone.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(zone.hours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRate(zone.rate)}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {formatIsk(zone.pay)} {LABELS.currency}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            {/* ⚠️ A row header, not a data cell. Without `scope="row"` a screen
                reader announces this row as four bare numbers with nothing
                naming them — on the row carrying the wage. `TableFooter`
                already applies `font-medium`, so no cell here repeats it. */}
            <TableHead scope="row">{LABELS.total}</TableHead>
            <TableCell className="text-right tabular-nums">
              {formatHours(data.totalHours)}
            </TableCell>
            {/* No total for a rate: averaging four rates would produce a number
                that is not anybody's rate and multiplies into nothing. */}
            <TableCell />
            <TableCell className="text-right whitespace-nowrap tabular-nums">
              {formatIsk(data.totalPay)} {LABELS.currency}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
