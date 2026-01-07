import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { useTheme } from './hooks/useTheme'
import { HomePage } from './pages/HomePage'
import { AuthPage } from './pages/AuthPage'
import { AppLayout } from './pages/AppLayout'
import { DashboardOverview } from './components/DashboardOverview'
import { TenantManagement } from './components/TenantManagement'
import { MaintenancePanel } from './components/MaintenancePanel'
import { AnalyticsPanel } from './components/AnalyticsPanel'
import { PropertyShowings } from './components/PropertyShowings'
import { RentCollection } from './components/RentCollection'
import { CommunicationHub } from './components/CommunicationHub'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SubscriptionSettings } from './components/SubscriptionSettings'

export default function App() {
  const { theme, toggleTheme } = useTheme()

  return (
    <ThemeProvider theme={theme} toggleTheme={toggleTheme}>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth.html" element={<AuthPage />} /> {/* Support both /auth and /auth.html */}

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

            {/* Settings page */}
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

// Settings page with subscription management
function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          SETTINGS
        </h2>
        <p className="text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
          Manage your subscription and account preferences
        </p>
      </div>
      <SubscriptionSettings />
    </div>
  )
}