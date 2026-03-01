import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'

export function TenantPendingPage() {
  const { signOut } = useAuth()
  const { theme } = useThemeContext()
  const isDark = theme === 'dark'

  return (
    <div className={`min-h-screen flex items-center justify-center px-6 ${isDark ? 'bg-[#0a0e1a] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className={`max-w-lg w-full rounded-2xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'} p-8 shadow-xl`}>
        <p className={`text-xs uppercase tracking-[0.25em] ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
          Tenant Application
        </p>
        <h1 className="text-3xl mt-2 mb-3" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          Pending Owner Approval
        </h1>
        <p className={`${isDark ? 'text-white/70' : 'text-gray-600'} text-sm mb-6`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
          Thanks for submitting your application. Your landlord will review it soon. You’ll get an email when you are approved and can access the tenant portal.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className={`w-full py-3 rounded-xl text-sm font-semibold tracking-wide ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
