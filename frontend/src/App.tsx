import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"

import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { ClockPage } from "@/pages/ClockPage"
import { LoginPage } from "@/pages/LoginPage"
import { PayrollOverviewPage } from "@/pages/PayrollOverviewPage"
import { PayrollPage } from "@/pages/PayrollPage"
import { SetInitialPasswordPage } from "@/pages/SetInitialPasswordPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { ShiftHistoryPage } from "@/pages/ShiftHistoryPage"
import { TeamPage } from "@/pages/TeamPage"
import { currentUser } from "@/mocks/data"

function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/activate" element={<SetInitialPasswordPage />} />

        <Route element={<AppLayout />}>
          <Route
            index
            element={<Navigate to={currentUser.role === "ADMIN" ? "/team" : "/clock"} replace />}
          />
          <Route path="/clock" element={<ClockPage />} />
          <Route path="/shifts" element={<ShiftHistoryPage />} />
          <Route path="/shifts/:userId" element={<ShiftHistoryPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/payroll/:userId" element={<PayrollPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/payroll-overview" element={<PayrollOverviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
