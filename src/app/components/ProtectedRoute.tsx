import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const { theme } = useThemeContext()
  const isDark = theme === 'dark'

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#0a0e1a]' : 'bg-white'}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className={`${isDark ? 'text-white' : 'text-gray-900'} text-xl`} style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            Loading...
          </p>
        </div>
      </div>
    )
  }

  // Redirect to /auth if not authenticated, preserving the attempted URL
  if (!user) {
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(location.pathname)}`} replace />
  }

  return <>{children}</>
}
