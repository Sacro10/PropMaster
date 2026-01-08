import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { useTheme } from './hooks/useTheme'
import { HomePage } from './pages/HomePage'
import { AuthPage } from './pages/AuthPage'
import { PricingPage } from './pages/PricingPage'
import { AppLayout } from './pages/AppLayout'
import { DashboardOverview } from './components/DashboardOverview'
import { TenantManagement } from './components/TenantManagement'
import { MaintenancePanel } from './components/MaintenancePanel'
import { AnalyticsPanel } from './components/AnalyticsPanel'
import { PropertyShowings } from './components/PropertyShowings'
import { RentCollection } from './components/RentCollection'
import { CommunicationHub } from './components/CommunicationHub'
import { ProtectedRoute } from './components/ProtectedRoute'
import { BillingPage } from './pages/BillingPage'

export default function App() {
  const { theme, toggleTheme } = useTheme()

  // Apply theme class to document root for consistent theming
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }
  }, [theme])

  return (
    <ThemeProvider theme={theme} toggleTheme={toggleTheme}>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth.html" element={<AuthPage />} /> {/* Support both /auth and /auth.html */}
          <Route path="/pricing" element={<PricingPage />} />

          {/* Protected application routes */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* Nested routes under /app */}
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardOverview />} />
            <Route path="tenants" element={<TenantManagement />} />
            <Route path="maintenance" element={<MaintenancePanel />} />
            <Route path="analytics" element={<AnalyticsPanel />} />
            <Route path="showings" element={<PropertyShowings />} />
            <Route path="rent" element={<RentCollection />} />
            <Route path="communication" element={<CommunicationHub />} />

            {/* Billing & Settings pages */}
            <Route path="billing" element={<BillingPage />} />
            <Route path="settings" element={<BillingPage />} />
          </Route>

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}