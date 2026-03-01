import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building, KeyRound, UserRound, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useThemeContext } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { setActivePortalRoleIntent, setSessionRoleIntent } from '@/lib/portalRole'
import { acceptTenantInvite, fetchTenantInvite, type TenantInviteDetails } from '../../lib/api/tenantPortal'

type InviteStep = 'credentials' | 'profile'

type TenantProfile = {
  fullName: string
  phone: string
  moveInDate: string
  employmentStatus: 'employed' | 'self_employed' | 'student' | 'retired' | 'unemployed' | 'other'
  monthlyIncome: string
  creditScore: string
  backgroundCheckStatus: 'pending' | 'approved' | 'rejected' | 'not_required'
}

export function TenantInvitePage() {
  const [step, setStep] = useState<InviteStep>('credentials')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profile, setProfile] = useState<TenantProfile>({
    fullName: '',
    phone: '',
    moveInDate: '',
    employmentStatus: 'employed',
    monthlyIncome: '',
    creditScore: '',
    backgroundCheckStatus: 'pending',
  })
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<TenantInviteDetails | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [inviteLoading, setInviteLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { theme } = useThemeContext()
  const { signIn } = useAuth()
  const isDark = theme === 'dark'

  const inviteToken = searchParams.get('token') || ''

  useEffect(() => {
    let isMounted = true
    const loadInvite = async () => {
      if (!inviteToken) {
        setInviteError('Invalid or missing invite link.')
        setInviteLoading(false)
        return
      }

      try {
        const data = await fetchTenantInvite(inviteToken)
        if (isMounted) {
          setInvite(data)
          setInviteLoading(false)
        }
      } catch (err: any) {
        if (isMounted) {
          setInviteError(err?.message || 'Unable to load invite.')
          setInviteLoading(false)
        }
      }
    }

    loadInvite()
    return () => {
      isMounted = false
    }
  }, [inviteToken])

  const inviteMeta = useMemo(() => {
    const propertyName = invite?.property?.name || invite?.unit?.properties?.name || 'Property'
    const unitNumber = invite?.unit?.unit_number ? `Unit ${invite.unit.unit_number}` : 'Unit to be selected'
    return {
      property: propertyName,
      unit: unitNumber,
      email: invite?.email || 'tenant@example.com',
    }
  }, [invite])

  const estimatedRiskScore = useMemo(() => {
    const monthlyIncome = Number(profile.monthlyIncome)
    const creditScore = Number(profile.creditScore)
    const rent = Number(invite?.rent || 0)
    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return null
    if (!Number.isFinite(creditScore) || creditScore < 300 || creditScore > 850) return null

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
    const parts: Array<{ score: number; weight: number }> = []
    const normalizedCredit = clamp(((creditScore - 300) / 550) * 100, 0, 100)
    parts.push({ score: Math.round(normalizedCredit), weight: 0.4 })

    if (rent > 0) {
      const ratio = monthlyIncome / rent
      const ratioScore =
        ratio >= 3 ? 100 :
        ratio >= 2.5 ? 90 :
        ratio >= 2 ? 80 :
        ratio >= 1.5 ? 60 :
        ratio >= 1.2 ? 50 :
        ratio >= 1 ? 40 :
        20
      parts.push({ score: ratioScore, weight: 0.3 })
    }

    const backgroundScore =
      profile.backgroundCheckStatus === 'approved' ? 90 :
      profile.backgroundCheckStatus === 'pending' ? 60 :
      profile.backgroundCheckStatus === 'rejected' ? 20 :
      70
    parts.push({ score: backgroundScore, weight: 0.2 })

    const employmentScore =
      profile.employmentStatus === 'employed' || profile.employmentStatus === 'self_employed' ? 80 :
      profile.employmentStatus === 'unemployed' ? 30 :
      profile.employmentStatus === 'student' || profile.employmentStatus === 'retired' ? 50 :
      60
    parts.push({ score: employmentScore, weight: 0.1 })

    const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0)
    const weightedScore = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight
    return clamp(Math.round(weightedScore), 0, 100)
  }, [invite?.rent, profile.backgroundCheckStatus, profile.creditScore, profile.employmentStatus, profile.monthlyIncome])

  const handleCredentialsSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (inviteLoading) {
      setError('Invite details are still loading.')
      return
    }

    if (inviteError) {
      setError(inviteError)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setStep('profile')
  }

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!profile.fullName.trim() || !profile.phone.trim()) {
      setError('Please complete all required fields.')
      return
    }
    const monthlyIncome = Number(profile.monthlyIncome)
    const creditScore = Number(profile.creditScore)
    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
      setError('Enter a valid monthly income.')
      return
    }
    if (!Number.isFinite(creditScore) || creditScore < 300 || creditScore > 850) {
      setError('Credit score must be between 300 and 850.')
      return
    }
    if (!inviteToken) {
      setError('Invite link missing.')
      return
    }

    try {
      setSubmitting(true)
      const result = await acceptTenantInvite(inviteToken, {
        password,
        fullName: profile.fullName,
        phone: profile.phone || undefined,
        moveInDate: profile.moveInDate,
        employmentStatus: profile.employmentStatus,
        monthlyIncome,
        creditScore,
        backgroundCheckStatus: profile.backgroundCheckStatus,
      })
      setSessionRoleIntent('tenant')
      setActivePortalRoleIntent('tenant')
      const signInResult = await signIn(result.email, password)
      if (signInResult.error) {
        setError(signInResult.error.message)
        return
      }
      navigate('/portal/tenant', { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Unable to complete onboarding.')
    } finally {
      setSubmitting(false)
    }
  }

  const panelClasses = isDark
    ? 'bg-gradient-to-br from-[#131a2c] to-[#0b1222] border-white/10 text-white'
    : 'bg-white border-gray-200 text-gray-900'

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0e1a] text-white' : 'bg-[#f6f1ea] text-gray-900'} flex items-center justify-center px-4 py-10`}>
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: isDark
              ? 'radial-gradient(circle at top, rgba(255, 107, 53, 0.2), transparent 60%)'
              : 'radial-gradient(circle at top, rgba(255, 193, 111, 0.3), transparent 60%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 40%)',
          }}
        />
      </div>

      <div className="relative w-full max-w-3xl">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-2/5 space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-[#ff6b35] to-[#f7931e] p-3 rounded-xl shadow-lg">
                <Building className="w-6 h-6 text-white" />
              </div>
              <div>
                <p
                  className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/60' : 'text-gray-500'}`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  Tenant Invitation
                </p>
                <h1 className="text-3xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  Welcome Home
                </h1>
              </div>
            </div>

            <div className={`${panelClasses} border rounded-2xl p-6 shadow-xl space-y-4`}>
              {inviteLoading ? (
                <div className="space-y-3">
                  <div className="h-4 w-2/3 rounded bg-white/10" />
                  <div className="h-3 w-1/2 rounded bg-white/10" />
                </div>
              ) : inviteError ? (
                <div className="text-sm text-red-400">{inviteError}</div>
              ) : (
                <>
                  <div>
                    <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Invited To
                    </p>
                    <p className="text-lg font-semibold">{inviteMeta.property}</p>
                    <p className={`${isDark ? 'text-white/70' : 'text-gray-600'}`}>{inviteMeta.unit}</p>
                  </div>
                  <div className="text-sm">
                    <p className={`${isDark ? 'text-white/50' : 'text-gray-500'}`}>Invitation Email</p>
                    <p className="font-medium">{inviteMeta.email}</p>
                  </div>
                </>
              )}
              <div className="pt-2 space-y-2">
                {['Create password', 'Complete profile', 'Access tenant dashboard'].map((item, index) => {
                  const isActive = (step === 'credentials' && index === 0) || (step === 'profile' && index === 1)
                  const isComplete = step === 'profile' && index === 0
                  return (
                    <div key={item} className={`flex items-center gap-2 text-sm ${isActive ? 'font-semibold' : ''}`}>
                      {isComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <div
                          className={`w-4 h-4 rounded-full border ${isActive ? 'border-[#ff6b35]' : isDark ? 'border-white/20' : 'border-gray-300'}`}
                        />
                      )}
                      <span className={isDark ? 'text-white/80' : 'text-gray-600'}>{item}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="md:w-3/5">
            <div
              className={`${panelClasses} border rounded-3xl p-8 shadow-2xl`}
              style={{
                boxShadow: isDark ? '0 25px 80px rgba(15, 23, 42, 0.6)' : '0 25px 70px rgba(87, 63, 43, 0.15)',
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-xl ${isDark ? 'bg-white/10' : 'bg-[#fff3ea]'}`}>
                  {step === 'credentials' ? (
                    <KeyRound className="w-5 h-5 text-[#ff6b35]" />
                  ) : (
                    <UserRound className="w-5 h-5 text-[#ff6b35]" />
                  )}
                </div>
                <div>
                  <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Step {step === 'credentials' ? '1' : '2'} of 2
                  </p>
                  <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {step === 'credentials' ? 'Secure Your Account' : 'Tell Us About You'}
                  </h2>
                </div>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {step === 'credentials' ? (
                <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                  <div>
                    <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Create Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                        isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                      placeholder="Minimum 6 characters"
                      required
                    />
                  </div>
                  <div>
                    <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                        isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                      placeholder="Re-enter password"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={inviteLoading || Boolean(inviteError)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white font-semibold tracking-wide flex items-center justify-center gap-2"
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div>
                    <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Full Name</label>
                    <input
                      type="text"
                      value={profile.fullName}
                      onChange={(event) => setProfile((prev) => ({ ...prev, fullName: event.target.value }))}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                        isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                      placeholder="Alex Johnson"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Phone Number</label>
                      <input
                        type="tel"
                        value={profile.phone}
                        onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
                        className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                          isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                        }`}
                        placeholder="(555) 555-0123"
                        required
                      />
                    </div>
                    <div>
                      <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Employment Status</label>
                      <select
                        value={profile.employmentStatus}
                        onChange={(event) =>
                          setProfile((prev) => ({
                            ...prev,
                            employmentStatus: event.target.value as TenantProfile['employmentStatus'],
                          }))
                        }
                        className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                          isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                        }`}
                        required
                      >
                        <option value="employed">Employed</option>
                        <option value="self_employed">Self-employed</option>
                        <option value="student">Student</option>
                        <option value="retired">Retired</option>
                        <option value="unemployed">Unemployed</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Monthly Income ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={profile.monthlyIncome}
                        onChange={(event) => setProfile((prev) => ({ ...prev, monthlyIncome: event.target.value }))}
                        className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                          isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                        }`}
                        placeholder="4500"
                        required
                      />
                    </div>
                    <div>
                      <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Credit Score</label>
                      <input
                        type="number"
                        min="300"
                        max="850"
                        step="1"
                        value={profile.creditScore}
                        onChange={(event) => setProfile((prev) => ({ ...prev, creditScore: event.target.value }))}
                        className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                          isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                        }`}
                        placeholder="700"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Background Check Status</label>
                    <select
                      value={profile.backgroundCheckStatus}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          backgroundCheckStatus: event.target.value as TenantProfile['backgroundCheckStatus'],
                        }))
                      }
                      className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                        isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                      required
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="not_required">Not required</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Move-in Date</label>
                    <input
                      type="date"
                      value={profile.moveInDate}
                      onChange={(event) => setProfile((prev) => ({ ...prev, moveInDate: event.target.value }))}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                        isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>
                  <div className={`rounded-xl border px-4 py-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
                    <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Estimated Risk Score
                    </p>
                    <p className="text-2xl font-semibold mt-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {estimatedRiskScore ?? 'N/A'}
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white font-semibold tracking-wide flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {submitting ? 'Setting up your account...' : 'Finish & Go to Dashboard'} <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
