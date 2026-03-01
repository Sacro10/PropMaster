import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building, Mail, Lock, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'
import { SupabaseConfigBanner } from '../components/SupabaseConfigBanner'
import {
  clearSessionRoleIntent,
  getSessionRoleIntent,
  roleMatchesPortalIntent,
  setActivePortalRoleIntent,
  setSessionRoleIntent,
} from '@/lib/portalRole'

export function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [selectedRole, setSelectedRole] = useState<'owner' | 'tenant' | 'vendor'>('owner')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [pendingRedirect, setPendingRedirect] = useState(false)

  const { signIn, signUp, signOut, user, role, isActive, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { theme } = useThemeContext()
  const isDark = theme === 'dark'

  const returnToParam = searchParams.get('returnTo')
  const returnTo = returnToParam && returnToParam.startsWith('/') ? returnToParam : '/'

  // Redirect if already logged in
  useEffect(() => {
    if (!user || authLoading) {
      return
    }

    const roleIntent = getSessionRoleIntent()

    if (roleIntent && !roleMatchesPortalIntent(roleIntent, role)) {
      setPendingRedirect(false)
      setError('That account does not have the selected role. Please choose the correct portal and sign in again.')
      clearSessionRoleIntent()
      void signOut()
      return
    }

    if (pendingRedirect) {
      setPendingRedirect(false)
    }

    if (!role) {
      setError('We could not verify your account role. Please try again.')
      return
    }

    const destination = role === 'tenant'
      ? (isActive ? '/portal/tenant' : '/tenant/pending')
      : role === 'vendor'
        ? '/vendor/dashboard'
        : returnTo !== '/'
          ? returnTo
          : '/app/dashboard'

    if (role === 'tenant' || role === 'vendor') {
      setActivePortalRoleIntent(role)
    } else if (role) {
      setActivePortalRoleIntent('owner')
    }

    navigate(destination, { replace: true })
  }, [user, role, isActive, authLoading, navigate, pendingRedirect])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    try {
      if (isSignUp) {
        const { error: signUpError } = await signUp(email, password)
        if (signUpError) {
          setError(signUpError.message)
        } else {
          setSuccess('Account created! Please check your email to verify your account.')
        }
      } else {
        setSessionRoleIntent(selectedRole)
        setActivePortalRoleIntent(selectedRole)
        const { error: signInError } = await signIn(email, password)
        if (signInError) {
          setError(signInError.message)
        } else {
          // Successful login - AuthContext will update user state,
          // useEffect above will handle role-based navigation.
          setPendingRedirect(true)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp)
    setError('')
    setSuccess('')
  }

  return (
    <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#0a0e1a] text-white' : 'bg-gray-50 text-gray-900'}`}>
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

      <div className="max-w-md w-full p-8 relative z-10 space-y-4">
        <SupabaseConfigBanner />
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="bg-gradient-to-br from-[#ff6b35] to-[#f7931e] p-3 rounded-lg">
            <Building className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-4xl tracking-wide" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              PROPMASTER
            </h1>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'} -mt-1`}>
              Property Management Automation
            </p>
          </div>
        </div>

        {/* Auth Form */}
        <div
          className={`${
            isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border-white/10' : 'bg-white border-gray-200 shadow-xl'
          } border rounded-xl p-8`}
        >
          <h2 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            {isSignUp ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}
          </h2>
          <p className={`text-sm mb-6 ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            {isSignUp ? 'Start managing your properties today' : 'Sign in to access your dashboard'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isSignUp && (
              <div>
                <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  I am a
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: 'owner', label: 'Property Owner' },
                    { value: 'tenant', label: 'Tenant' },
                    { value: 'vendor', label: 'Vendor' },
                  ].map((option) => {
                    const isSelected = selectedRole === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedRole(option.value as typeof selectedRole)}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          isSelected
                            ? 'border-[#ff6b35] bg-[#ff6b35]/10 text-[#ff6b35]'
                            : isDark
                              ? 'border-white/10 text-white/70 hover:border-white/30'
                              : 'border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                        style={{ fontFamily: 'Work Sans, sans-serif' }}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  We’ll verify your role from the database after you sign in.
                </p>
              </div>
            )}

            {/* Email Input */}
            <div>
              <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                Email Address
              </label>
              <div className="relative">
                <Mail className={`w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 rounded-lg ${
                    isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400'
                  } border focus:outline-none focus:border-[#ff6b35]/50 transition-colors`}
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                Password
              </label>
              <div className="relative">
                <Lock className={`w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 rounded-lg ${
                    isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400'
                  } border focus:outline-none focus:border-[#ff6b35]/50 transition-colors`}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>
              <p className={`text-xs mt-1 ${isDark ? 'text-white/40' : 'text-gray-400'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                {isSignUp ? 'Minimum 6 characters' : ''}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-400" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {error}
                </p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <AlertCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-400" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {success}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isSignUp ? 'Creating Account...' : 'Signing In...'}
                </span>
              ) : isSignUp ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Toggle Mode */}
          <div className="mt-6 text-center">
            <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button onClick={toggleMode} className="text-[#ff6b35] hover:underline font-medium" disabled={loading}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>

        {/* Additional Info */}
        {isSignUp && (
          <p className={`text-xs text-center mt-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            New accounts start on the <strong className="text-[#ff6b35]">Basic (Free)</strong> plan
          </p>
        )}

        {/* Back to Home */}
        <button
          onClick={() => navigate('/')}
          className={`w-full mt-4 py-2 text-sm ${isDark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'} transition-colors`}
          style={{ fontFamily: 'Work Sans, sans-serif' }}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  )
}
