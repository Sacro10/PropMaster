import { ReactNode, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'
import { inferPortalRoleFromPath, roleToPortalIntent, setActivePortalRoleIntent } from '@/lib/portalRole'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: string[]
  allowInactive?: boolean
}

export function ProtectedRoute({ children, allowedRoles, allowInactive = false }: ProtectedRouteProps) {
  const { user, role, isActive, loading, refreshProfile, signOut } = useAuth()
  const location = useLocation()
  const { theme } = useThemeContext()
  const isDark = theme === 'dark'
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine

  useEffect(() => {
    if (!user || !role) return

    const managementRoles = ['owner', 'admin', 'manager']
    const hasOnlyTenant = allowedRoles?.length === 1 && allowedRoles[0] === 'tenant'
    const hasOnlyVendor = allowedRoles?.length === 1 && allowedRoles[0] === 'vendor'
    const hasOnlyManagement = Boolean(
      allowedRoles &&
      allowedRoles.length > 0 &&
      allowedRoles.every((allowedRole) => managementRoles.includes(allowedRole))
    )

    if (hasOnlyTenant) {
      setActivePortalRoleIntent('tenant')
      return
    }
    if (hasOnlyVendor) {
      setActivePortalRoleIntent('vendor')
      return
    }
    if (hasOnlyManagement) {
      setActivePortalRoleIntent('owner')
      return
    }

    const inferredIntent = inferPortalRoleFromPath(location.pathname) || roleToPortalIntent(role)
    if (inferredIntent) {
      setActivePortalRoleIntent(inferredIntent)
    }
  }, [user, role, allowedRoles, location.pathname])

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

  const roleHome = role === 'tenant'
    ? '/portal/tenant'
    : role === 'vendor'
      ? '/vendor/dashboard'
      : '/app/dashboard'

  // Redirect to /auth if not authenticated, preserving the attempted URL
  if (!user) {
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(location.pathname)}`} replace />
  }

  if (!allowInactive && role === 'tenant' && !isActive) {
    return <Navigate to="/tenant/pending" replace />
  }

  if (allowedRoles && !role) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#0a0e1a] text-white' : 'bg-white text-gray-900'}`}>
        <div className="text-center max-w-md px-6">
          <h2 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            {isOnline ? 'Access role unavailable' : 'You appear offline'}
          </h2>
          <p className={`${isDark ? 'text-white/70' : 'text-gray-600'} text-sm mb-6`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            {isOnline
              ? 'We could not verify your account role. Try refreshing your session or sign out and back in.'
              : 'Reconnect to the internet to verify your account role and continue.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void refreshProfile()}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-white hover:bg-gray-50'} border ${isDark ? 'border-white/10' : 'border-gray-200'} transition-colors`}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to={roleHome} replace />
  }

  return <>{children}</>
}
