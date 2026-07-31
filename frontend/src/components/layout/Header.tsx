import { Link } from "react-router-dom"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { currentUser } from "@/mocks/data"

const EMPLOYEE_LINKS = [
  { to: "/clock", label: "Clock" },
  { to: "/shifts", label: "Shift History" },
  { to: "/payroll", label: "Payroll Breakdown" },
]

const ADMIN_LINKS = [
  { to: "/team", label: "Team" },
  { to: "/payroll-overview", label: "Payroll Overview" },
  { to: "/settings", label: "Settings" },
]

export function Header() {
  const links = currentUser.role === "ADMIN" ? ADMIN_LINKS : EMPLOYEE_LINKS

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
      <Link to="/" className="text-lg font-semibold tracking-tight">
        SwiftTrack
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="gap-1.5">
              {currentUser.name}
              <ChevronDown className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {links.map((link) => (
            <DropdownMenuItem key={link.to} render={<Link to={link.to} />}>
              {link.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/login" />}>
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
