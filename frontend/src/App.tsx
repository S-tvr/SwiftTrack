import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom"

import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import {
  HomeRedirect,
  ProtectedRoute,
} from "@/components/layout/ProtectedRoute"
import { TimezoneNotice } from "@/components/layout/TimezoneNotice"
import { Button } from "@/components/ui/button"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { errorText, LABELS } from "@/lib/messages"
import { ClockPage } from "@/pages/ClockPage"
import { LoginPage } from "@/pages/LoginPage"
import { PayrollOverviewPage } from "@/pages/PayrollOverviewPage"
import { PayrollPage } from "@/pages/PayrollPage"
import { SetInitialPasswordPage } from "@/pages/SetInitialPasswordPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { ShiftHistoryPage } from "@/pages/ShiftHistoryPage"
import { TeamPage } from "@/pages/TeamPage"

function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <Header />
      <TimezoneNotice />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/**
 * Holds every route behind the boot check.
 *
 * Nothing renders until `GET /users/me` has answered — including the redirect
 * to /login, which would otherwise flash the login page on every refresh of an
 * authenticated session.
 */
function AppGate() {
  const { isBootstrapping, bootstrapError, retryBootstrap, logout } = useAuth()

  // The boot request failed with something other than a 401 — no response at
  // all, or a 5xx. The token is deliberately kept, since neither case means the
  // session is invalid and a retry can succeed without signing in again.
  if (bootstrapError !== null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">{errorText(bootstrapError)}</p>
        <div className="flex gap-2">
          <Button onClick={retryBootstrap}>{LABELS.retry}</Button>
          {/* The way out. Without it, a stale token plus an unreachable
              backend leaves this screen up with no route to /login. */}
          <Button variant="outline" onClick={logout}>
            {LABELS.logOut}
          </Button>
        </div>
      </div>
    )
  }

  if (isBootstrapping) return null

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/activate" element={<SetInitialPasswordPage />} />

      <Route element={<AppLayout />}>
        <Route index element={<HomeRedirect />} />

        {/* Paramless routes are EMPLOYEE-only because the endpoints behind
            them are /me routes. An admin has no shifts and no hourlyRate. */}
        <Route element={<ProtectedRoute allow="EMPLOYEE" />}>
          <Route path="/clock" element={<ClockPage />} />
          <Route path="/shifts" element={<ShiftHistoryPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
        </Route>

        <Route element={<ProtectedRoute allow="ADMIN" />}>
          <Route path="/shifts/:userId" element={<ShiftHistoryPage />} />
          <Route path="/payroll/:userId" element={<PayrollPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/payroll-overview" element={<PayrollOverviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppGate />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
