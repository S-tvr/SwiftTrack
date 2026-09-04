import { Link, useNavigate } from "react-router-dom"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { LABELS, PAGE_TITLES } from "@/lib/messages"

const EMPLOYEE_LINKS = [
  { to: "/clock", label: PAGE_TITLES.clock },
  { to: "/shifts", label: PAGE_TITLES.shiftHistory },
  { to: "/payroll", label: PAGE_TITLES.payrollBreakdown },
]

const ADMIN_LINKS = [
  { to: "/team", label: PAGE_TITLES.team },
  { to: "/payroll-overview", label: PAGE_TITLES.payrollOverview },
  { to: "/settings", label: PAGE_TITLES.settings },
]

export function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // The header only ever renders inside AppLayout, which sits behind
  // ProtectedRoute — so this is a type narrowing, not a real state.
  if (user === null) return null

  const links = user.role === "ADMIN" ? ADMIN_LINKS : EMPLOYEE_LINKS

  function handleLogout() {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
      <Link to="/" className="text-lg font-semibold tracking-tight">
        SwiftTrack
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="gap-1.5">
              {user.name}
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
          {/* Outside `links` on purpose: those two arrays are role-specific and
              this is the one destination both roles share. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/change-password" />}>
            {PAGE_TITLES.changePassword}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            {LABELS.logOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
