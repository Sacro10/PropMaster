import { useState, useEffect, useRef } from 'react'
import { Building, Users, Wrench, DollarSign, ChartBar, Bell, Settings, Key, MessageSquare, House, LogOut } from 'lucide-react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { supabase } from '@/lib/supabase'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  action_url?: string
  is_read: boolean
  created_at: string
}

export function AppLayout() {
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [unitsCount, setUnitsCount] = useState<number | null>(null)
  const [unitBreakdown, setUnitBreakdown] = useState<{ occupied: number; vacant: number; other: number } | null>(null)
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [showUnitsSummary, setShowUnitsSummary] = useState(false)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const unitsSummaryRef = useRef<HTMLDivElement>(null)
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

  // Fetch units count for the user's account
  useEffect(() => {
    const fetchUnitsCount = async () => {
      if (!user) {
        setLoadingUnits(false)
        return
      }

      try {
        setLoadingUnits(true)

        // First, get the user's account_id from account_members
        const { data: memberData, error: memberError } = await supabase
          .from('account_members')
          .select('account_id')
          .eq('user_id', user.id)
          .single()

        if (memberError || !memberData) {
          console.error('Error fetching account membership:', memberError)
          setUnitsCount(0)
          setLoadingUnits(false)
          return
        }

        // Then count the units for this account
        const [totalResult, occupiedResult, vacantResult] = await Promise.all([
          supabase
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('account_id', memberData.account_id),
          supabase
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('account_id', memberData.account_id)
            .eq('status', 'occupied'),
          supabase
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('account_id', memberData.account_id)
            .eq('status', 'vacant'),
        ])

        if (totalResult.error || occupiedResult.error || vacantResult.error) {
          console.error('Error counting units:', totalResult.error || occupiedResult.error || vacantResult.error)
          setUnitsCount(0)
          setUnitBreakdown({ occupied: 0, vacant: 0, other: 0 })
          setLoadingUnits(false)
          return
        }

        const totalUnits = totalResult.count || 0
        const occupiedUnits = occupiedResult.count || 0
        const vacantUnits = vacantResult.count || 0
        const otherUnits = Math.max(0, totalUnits - occupiedUnits - vacantUnits)

        console.log('Units count fetched:', totalUnits)
        setUnitsCount(totalUnits)
        setUnitBreakdown({ occupied: occupiedUnits, vacant: vacantUnits, other: otherUnits })
        setLoadingUnits(false)
      } catch (error) {
        console.error('Error in fetchUnitsCount:', error)
        setUnitsCount(0)
        setUnitBreakdown({ occupied: 0, vacant: 0, other: 0 })
        setLoadingUnits(false)
      }
    }

    fetchUnitsCount()
  }, [user])

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user) return

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('id, type, title, message, action_url, is_read, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10)

        if (error) {
          console.error('Error fetching notifications:', error)
          return
        }

        setNotifications(data || [])
        setUnreadCount(data?.filter(n => !n.is_read).length || 0)
      } catch (error) {
        console.error('Error in fetchNotifications:', error)
      }
    }

    fetchNotifications()

    // Set up realtime subscription for new notifications
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user?.id}`
        },
        () => {
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
    }

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showNotifications])

  // Close units summary dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (unitsSummaryRef.current && !unitsSummaryRef.current.contains(event.target as Node)) {
        setShowUnitsSummary(false)
      }
    }

    if (showUnitsSummary) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUnitsSummary])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)

      if (error) {
        console.error('Error marking notification as read:', error)
        return
      }

      // Update local state
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error in markAsRead:', error)
    }
  }

  const markAllAsRead = async () => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)

      if (error) {
        console.error('Error marking all notifications as read:', error)
        return
      }

      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error in markAllAsRead:', error)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
    if (notification.action_url) {
      navigate(notification.action_url)
      setShowNotifications(false)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'payment_due':
      case 'payment_received':
        return <DollarSign className="w-4 h-4" />
      case 'maintenance_update':
        return <Wrench className="w-4 h-4" />
      case 'message':
        return <MessageSquare className="w-4 h-4" />
      case 'system':
      case 'announcement':
        return <Bell className="w-4 h-4" />
      default:
        return <Bell className="w-4 h-4" />
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    return date.toLocaleDateString()
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
        className={`relative z-50 border-b ${
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
              <div className="relative" ref={unitsSummaryRef}>
                <button
                  type="button"
                  onClick={() => setShowUnitsSummary(prev => !prev)}
                  aria-expanded={showUnitsSummary}
                  aria-haspopup="dialog"
                  className={`flex items-center gap-3 px-4 py-2 ${
                    isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  } rounded-lg border transition-colors`}
                >
                  <House className="w-5 h-5 text-[#ff6b35]" />
                  <div className="text-left">
                    <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      Active Properties
                    </p>
                    <p className="text-lg font-semibold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {loadingUnits ? (
                        <span className="inline-block animate-pulse">...</span>
                      ) : (
                        `${unitsCount ?? 0} ${unitsCount === 1 ? 'UNIT' : 'UNITS'}`
                      )}
                    </p>
                  </div>
                </button>

                {showUnitsSummary && (
                  <div
                    className={`absolute top-full left-0 mt-2 w-64 ${
                      isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'
                    } border rounded-lg shadow-xl z-50`}
                    role="dialog"
                    aria-label="Unit summary"
                  >
                    <div className={`px-4 py-3 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                      <p className="text-sm font-semibold" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                        Unit Summary
                      </p>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {loadingUnits ? (
                        <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          Loading unit totals...
                        </p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            <span className={`${isDark ? 'text-white/70' : 'text-gray-600'}`}>Total units</span>
                            <span className="font-semibold text-[#ff6b35]">{unitsCount ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            <span className={`${isDark ? 'text-white/70' : 'text-gray-600'}`}>Occupied</span>
                            <span className="font-semibold">{unitBreakdown?.occupied ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            <span className={`${isDark ? 'text-white/70' : 'text-gray-600'}`}>Vacant</span>
                            <span className="font-semibold">{unitBreakdown?.vacant ?? 0}</span>
                          </div>
                          {(unitBreakdown?.other ?? 0) > 0 && (
                            <div className="flex items-center justify-between text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                              <span className={`${isDark ? 'text-white/70' : 'text-gray-600'}`}>Other</span>
                              <span className="font-semibold">{unitBreakdown?.other ?? 0}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`relative p-3 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 min-w-[18px] h-[18px] bg-[#ff6b35] text-white text-[10px] font-semibold rounded-full flex items-center justify-center px-1">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div
                    className={`absolute top-full right-0 mt-2 w-96 ${
                      isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'
                    } border rounded-lg shadow-xl z-50 max-h-[500px] flex flex-col`}
                  >
                    {/* Header */}
                    <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                      <h3 className="font-semibold" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                        Notifications
                      </h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-[#ff6b35] hover:text-[#f7931e] transition-colors"
                          style={{ fontFamily: 'Work Sans, sans-serif' }}
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    {/* Notifications List */}
                    <div className="overflow-y-auto flex-1">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                          <Bell className={`w-12 h-12 mb-3 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
                          <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            No notifications yet
                          </p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`px-4 py-3 border-b ${
                              isDark ? 'border-white/5' : 'border-gray-100'
                            } ${
                              !notification.is_read
                                ? isDark
                                  ? 'bg-white/5'
                                  : 'bg-blue-50'
                                : ''
                            } ${
                              notification.action_url ? 'cursor-pointer' : ''
                            } ${
                              isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                            } transition-colors`}
                          >
                            <div className="flex gap-3">
                              <div
                                className={`flex-shrink-0 w-8 h-8 rounded-lg ${
                                  isDark ? 'bg-white/10' : 'bg-gray-100'
                                } flex items-center justify-center text-[#ff6b35]`}
                              >
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h4
                                    className={`text-sm font-medium ${
                                      !notification.is_read ? 'font-semibold' : ''
                                    }`}
                                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                                  >
                                    {notification.title}
                                  </h4>
                                  {!notification.is_read && (
                                    <div className="w-2 h-2 bg-[#ff6b35] rounded-full flex-shrink-0 mt-1" />
                                  )}
                                </div>
                                <p
                                  className={`text-xs ${
                                    isDark ? 'text-white/60' : 'text-gray-600'
                                  } line-clamp-2 mb-1`}
                                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                                >
                                  {notification.message}
                                </p>
                                <p
                                  className={`text-xs ${
                                    isDark ? 'text-white/40' : 'text-gray-400'
                                  }`}
                                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                                >
                                  {formatTimeAgo(notification.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                      <div className={`border-t ${isDark ? 'border-white/10' : 'border-gray-200'} px-4 py-3`}>
                        <button
                          onClick={() => {
                            navigate('/app/notifications')
                            setShowNotifications(false)
                          }}
                          className="text-sm text-[#ff6b35] hover:text-[#f7931e] transition-colors w-full text-center"
                          style={{ fontFamily: 'Work Sans, sans-serif' }}
                        >
                          View all notifications
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                  <div className={`absolute top-full right-0 mt-2 w-48 ${isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'} border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-60`}>
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
        className={`relative z-40 border-b ${
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
