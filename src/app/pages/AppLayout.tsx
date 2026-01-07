import { useState } from 'react'
import { Building, Users, Wrench, DollarSign, ChartBar, Bell, Settings, Key, MessageSquare, House, LogOut } from 'lucide-react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'
import { ThemeToggle } from '../components/ThemeToggle'

export function AppLayout() {
  const [notifications] = useState(7)
  const { user, signOut, profile } = useAuth()
  const { theme, toggleTheme } = useThemeContext()
  const navigate = useNavigate()
  const location = useLocation()
  const isDark = theme === 'dark'

  const navItems = [
    { id: 'dashboard', path: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'tenants', path: '/app/tenants', icon: Users, label: 'Tenants' },
    { id: 'maintenance', path: '/app/maintenance', icon: Wrench, label: 'Maintenance' },
    { id: 'analytics', path: '/app/analytics', icon: ChartBar, label: 'Analytics' },
    { id: 'showings', path: '/app/showings', icon: Key, label: 'Showings' },
    { id: 'rent', path: '/app/rent', icon: DollarSign, label: 'Rent' },
    { id: 'communication', path: '/app/communication', icon: MessageSquare, label: 'Messages' },
  ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0e1a] text-white dark-theme' : 'bg-white text-gray-900 light-theme'}`}>
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, ${isDark ? '#fff' : '#000'} 1px, transparent 1px),
              linear-gradient(to bottom, ${isDark ? '#fff' : '#000'} 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Header */}
      <header
        className={`relative border-b ${
          isDark ? 'border-white/10 bg-[#0f1523]/80' : 'border-gray-200 bg-white/80'
        } backdrop-blur-xl`}
      >
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/')}>
              <div className="bg-gradient-to-br from-[#ff6b35] to-[#f7931e] p-3 rounded-lg">
                <Building className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl tracking-wide" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  PROPMASTER
                </h1>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'} -mt-1`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {profile?.subscription_tier ? profile.subscription_tier.toUpperCase() : 'BASIC'} PLAN
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div
                className={`flex items-center gap-3 px-4 py-2 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                } rounded-lg border`}
              >
                <House className="w-5 h-5 text-[#ff6b35]" />
                <div>
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    Active Properties
                  </p>
                  <p className="text-lg font-semibold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    127 UNITS
                  </p>
                </div>
              </div>

              <button className={`relative p-3 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-100'} rounded-lg transition-colors`}>
                <Bell className="w-5 h-5" />
                {notifications > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-[#ff6b35] rounded-full" />}
              </button>

              <ThemeToggle theme={theme} onToggle={toggleTheme} />

              <button
                onClick={() => navigate('/app/settings')}
                className={`p-3 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
              >
                <Settings className="w-5 h-5" />
              </button>

              <div className={`flex items-center gap-3 pl-6 border-l ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                <div className="text-right">
                  <p className="text-sm font-medium" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    {user?.email}
                  </p>
                </div>
                <div
                  className="w-10 h-10 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-full flex items-center justify-center font-semibold cursor-pointer group relative"
                  title="Account Menu"
                >
                  {user?.email?.[0].toUpperCase() || 'U'}

                  {/* Dropdown Menu */}
                  <div className={`absolute top-full right-0 mt-2 w-48 ${isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'} border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50`}>
                    <button
                      onClick={() => navigate('/app/settings')}
                      className={`w-full text-left px-4 py-3 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} transition-colors flex items-center gap-3`}
                      style={{ fontFamily: 'Work Sans, sans-serif' }}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <div className={`border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`} />
                    <button
                      onClick={handleSignOut}
                      className={`w-full text-left px-4 py-3 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} transition-colors flex items-center gap-3 text-red-400`}
                      style={{ fontFamily: 'Work Sans, sans-serif' }}
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav
        className={`relative border-b ${
          isDark ? 'border-white/10 bg-[#0f1523]/60' : 'border-gray-200 bg-gray-50/60'
        } backdrop-blur-lg`}
      >
        <div className="max-w-[1800px] mx-auto px-8">
          <div className="flex gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  className={`flex items-center gap-2 px-6 py-4 transition-all relative ${
                    isActive
                      ? isDark
                        ? 'text-white'
                        : 'text-gray-900'
                      : isDark
                      ? 'text-white/40 hover:text-white/70'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium text-sm uppercase tracking-wider">{item.label}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#ff6b35] to-[#f7931e]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative max-w-[1800px] mx-auto px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}

// Helper component for LayoutDashboard icon
function LayoutDashboard({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  )
}
