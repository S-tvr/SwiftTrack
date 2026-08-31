import { AlertCircle } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import type { PayrollOverviewResponse } from "@/api/payroll"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatHours, formatIsk } from "@/lib/format"
import { LABELS, NOTICES } from "@/lib/messages"

interface PayrollOverviewProps {
  data: PayrollOverviewResponse
}

/**
 * The admin's team-wide view of one cycle: what the business pays, and who it
 * pays it to.
 *
 * Presentational — it fetches nothing. The page owns the query, the cycle in the
 * URL and the ◀▶ callbacks, exactly as `PayrollPage` owns them for
 * `PayrollSummary`/`PayrollDayTable`.
 *
 * ⚠️ **Arithmetically inert, and this is the file where that matters most.** The
 * step 0 draft computed every figure on screen — hours from raw entries, pay as
 * `Math.round(hours × rate)` at a flat rate, and the team total by adding the
 * rows up. All three are now server work, and the flat rate was materially wrong
 * for anyone working evenings or weekends. Nothing here adds, rounds or derives.
 */
export function PayrollOverview({ data }: PayrollOverviewProps) {
  const navigate = useNavigate()

  /**
   * ⚠️ The cycle comes from **the response**, never from `useSearchParams`. On
   * first load the URL carries no `?cycle=` at all — the server resolved "the
   * cycle containing now" — so a link built from the URL would be bare, and a
   * bare link asks the next page to re-derive the same default. That agrees
   * almost always, and the two cases where it does not are real: a tab left open
   * across a cycle boundary (the link would land in the new cycle while the
   * screen still shows the old), and the moment after ◀ when the URL has already
   * moved but the rows on screen have not.
   *
   * Carrying the key also makes the URL a stable thing to copy: `?cycle=2026-07`
   * means one cycle forever, where a bare link means "whichever is current when
   * you open it".
   */
  function payrollPath(userId: number): string {
    return `/payroll/${userId}?cycle=${data.cycle}`
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The number the admin came for, so it leads rather than closing the
          table as a footer row. It is *not* a total of the column beneath it —
          it is a figure about the cycle, which is why it survives a filter and
          why it is printed rather than summed. */}
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">{LABELS.totalCost}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {formatIsk(data.totalCost)} {LABELS.currency}
          </p>
        </CardContent>
      </Card>

      {data.rows.length === 0 ? (
        // No employees at all. ⚠️ Not the same as "nobody worked this cycle",
        // which arrives as rows of zeros — every active employee is listed.
        <p className="text-sm text-muted-foreground">{NOTICES.noEmployees}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{LABELS.columnName}</TableHead>
                <TableHead className="text-right">
                  {LABELS.columnHours}
                </TableHead>
                <TableHead className="text-right">
                  {LABELS.columnTotalPay}
                </TableHead>
                {/* Centred: the cell below holds a 16px icon under a ~70px
                    header, so left alignment leaves the marker hanging off the
                    header's left edge instead of under it. */}
                <TableHead className="text-center">
                  {LABELS.columnOpenShift}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                /* Two ways into the same page, deliberately. The row click is a
                   convenience for the mouse; the link inside it is the real
                   navigation — it has an href, so Ctrl+click opens a second
                   employee in a new tab, and it is reachable from the keyboard.
                   ⚠️ The row gets no `tabIndex`/`role`: a second tab stop to the
                   same destination makes the keyboard worse, not better. */
                <TableRow
                  key={row.userId}
                  className="cursor-pointer"
                  onClick={() => navigate(payrollPath(row.userId))}
                >
                  <TableCell>
                    {/* ⚠️ stopPropagation is load-bearing: without it a click on
                        the name fires both the link and the row handler, which
                        pushes two history entries for one click and makes Back
                        need two presses.

                        Deliberately unstyled as a link: the whole row is the
                        target, so underlining one cell would suggest that only
                        that cell works. The anchor is here for what it *does* —
                        an href the keyboard can reach and Ctrl+click can open in
                        a second tab — not for how it looks. */}
                    <Link
                      to={payrollPath(row.userId)}
                      className="font-medium"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatHours(row.totalHours)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatIsk(row.totalPay)} {LABELS.currency}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.hasOpenShift && (
                      /* The marker qualifies the pay beside it: hours were
                         worked that this figure does not contain. The column
                         header names it for anyone not hovering, and the SVG
                         <title> states the consequence — the same icon+title
                         pattern the split marker uses in ShiftList, and the
                         same sentence the breakdown page already shows an admin
                         about someone else. */
                      <AlertCircle
                        /* ⚠️ `mx-auto`, not the cell's `text-center` alone:
                           Tailwind's preflight sets `svg { display: block }`,
                           and text alignment does not move a block element. */
                        className="mx-auto size-4 text-destructive"
                        aria-label={LABELS.columnOpenShift}
                      >
                        <title>{NOTICES.openShiftOther}</title>
                      </AlertCircle>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
