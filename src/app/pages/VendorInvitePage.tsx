import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Mail, Store, UserRound } from 'lucide-react'
import { useThemeContext } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { setActivePortalRoleIntent, setSessionRoleIntent } from '@/lib/portalRole'
import { createVendor, type CreateVendorData } from '@/lib/api/vendors'
import { acceptVendorInvite, fetchVendorInvite } from '@/lib/api/vendorInvites'

type InviteStep = 'credentials' | 'profile'

const SERVICE_CATEGORIES = [
  { value: 'hvac', label: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'appliance', label: 'Appliance Repair' },
  { value: 'general', label: 'General Maintenance' },
  { value: 'remodel', label: 'Remodeling' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'pest', label: 'Pest Control' },
  { value: 'painting', label: 'Painting' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'security', label: 'Security Systems' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'other', label: 'Other' },
]

export function VendorInvitePage() {
  const [step, setStep] = useState<InviteStep>('credentials')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState<Omit<CreateVendorData, 'services'> & { services: string[] }>({
    business_name: '',
    contact_name: '',
    phone: '',
    email: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    license_number: '',
    insurance_policy_number: '',
    insurance_expiry: '',
    services: [],
  })

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { theme } = useThemeContext()
  const { signIn } = useAuth()
  const isDark = theme === 'dark'

  const token = searchParams.get('token') || ''

  useEffect(() => {
    const loadInvite = async () => {
      if (!token) {
        setError('Invite token is missing.')
        setLoadingInvite(false)
        return
      }
      try {
        setLoadingInvite(true)
        const invite = await fetchVendorInvite(token)
        setInviteEmail(invite.email)
        setFormData((prev) => ({ ...prev, email: invite.email }))
      } catch (err: any) {
        setError(err?.message || 'Invite unavailable.')
      } finally {
        setLoadingInvite(false)
      }
    }

    loadInvite()
  }, [token])

  const inviteMeta = useMemo(() => {
    return {
      email: inviteEmail || 'vendor@example.com',
    }
  }, [inviteEmail])

  const handleCredentialsSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!inviteEmail) {
      setError('Invite email is missing.')
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

  const validateProfile = () => {
    const requiredFields: Array<keyof CreateVendorData> = [
      'business_name',
      'contact_name',
      'phone',
      'address1',
      'city',
      'state',
      'zip',
    ]

    for (const field of requiredFields) {
      if (!String(formData[field] || '').trim()) {
        return `Please enter ${field.replace('_', ' ')}.`
      }
    }
    if (formData.services.length === 0) {
      return 'Select at least one service category.'
    }

    return ''
  }

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const profileError = validateProfile()
    if (profileError) {
      setError(profileError)
      return
    }

    if (!token) {
      setError('Invite token is missing.')
      return
    }

    try {
      setLoading(true)
      const inviteResult = await acceptVendorInvite(token, {
        password,
        fullName: formData.contact_name.trim(),
      })

      setSessionRoleIntent('vendor')
      setActivePortalRoleIntent('vendor')

      const { error: signInError } = await signIn(inviteEmail, password)
      if (signInError) {
        setError(signInError.message)
        return
      }

      const vendorPayload: CreateVendorData = {
        business_name: formData.business_name.trim(),
        contact_name: formData.contact_name.trim(),
        phone: formData.phone.trim(),
        email: inviteEmail,
        address1: formData.address1.trim(),
        address2: formData.address2.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        zip: formData.zip.trim(),
        license_number: formData.license_number.trim(),
        insurance_policy_number: formData.insurance_policy_number.trim(),
        insurance_expiry: formData.insurance_expiry.trim(),
        services: formData.services,
      }

      const result = await createVendor(vendorPayload, { accountId: inviteResult.accountId })
      if (!result.success) {
        setError(result.error?.message || 'Failed to create vendor profile.')
        return
      }

      setSuccess('Profile complete! Redirecting to your dashboard...')
      setTimeout(() => {
        navigate('/vendor/dashboard', { replace: true })
      }, 1200)
    } catch (err: any) {
      setError(err?.message || 'Unable to complete setup.')
    } finally {
      setLoading(false)
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
      </div>

      <div className="relative w-full max-w-5xl">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-2/5 space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-[#ff6b35] to-[#f7931e] p-3 rounded-xl shadow-lg">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                  Vendor Invitation
                </p>
                <h1 className="text-3xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  Join the Network
                </h1>
              </div>
            </div>

            <div className={`${panelClasses} border rounded-2xl p-6 shadow-xl space-y-4`}>
              <div className="text-sm">
                <p className={`${isDark ? 'text-white/50' : 'text-gray-500'}`}>Invitation Email</p>
                <p className="font-medium">{inviteMeta.email}</p>
              </div>
              <div className="pt-2 space-y-2">
                {['Secure your account', 'Confirm business details', 'Access vendor dashboard'].map((item, index) => {
                  const isActive = (step === 'credentials' && index === 0) || (step === 'profile' && index === 1)
                  const isComplete = step === 'profile' && index === 0
                  return (
                    <div key={item} className={`flex items-center gap-2 text-sm ${isActive ? 'font-semibold' : ''}`}>
                      {isComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <div className={`w-4 h-4 rounded-full border ${isActive ? 'border-[#ff6b35]' : isDark ? 'border-white/20' : 'border-gray-300'}`} />
                      )}
                      <span className={isDark ? 'text-white/80' : 'text-gray-600'}>{item}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="md:w-3/5">
            <div className={`${panelClasses} border rounded-3xl p-8 shadow-2xl`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-xl ${isDark ? 'bg-white/10' : 'bg-[#fff3ea]'}`}>
                  {step === 'credentials' ? (
                    <Mail className="w-5 h-5 text-[#ff6b35]" />
                  ) : (
                    <UserRound className="w-5 h-5 text-[#ff6b35]" />
                  )}
                </div>
                <div>
                  <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Step {step === 'credentials' ? '1' : '2'} of 2
                  </p>
                  <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {step === 'credentials' ? 'Create Your Vendor Login' : 'Complete Your Vendor Profile'}
                  </h2>
                </div>
              </div>

              {loadingInvite ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                  Loading invite details...
                </div>
              ) : (
                <>
                  {error && (
                    <div className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="mb-5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                      {success}
                    </div>
                  )}

                  {step === 'credentials' ? (
                    <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                      <div>
                        <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Email</label>
                        <input
                          type="email"
                          value={inviteEmail}
                          readOnly
                          className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                            isDark ? 'bg-white/5 border-white/10 text-white/70' : 'bg-gray-50 border-gray-200 text-gray-700'
                          }`}
                        />
                      </div>
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
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white font-semibold tracking-wide flex items-center justify-center gap-2"
                      >
                        Continue <ArrowRight className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleProfileSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Business Name</label>
                          <input
                            type="text"
                            value={formData.business_name}
                            onChange={(event) => setFormData((prev) => ({ ...prev, business_name: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            placeholder="Apex Property Services"
                            required
                          />
                        </div>
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Contact Name</label>
                          <input
                            type="text"
                            value={formData.contact_name}
                            onChange={(event) => setFormData((prev) => ({ ...prev, contact_name: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            placeholder="Jordan Brooks"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Phone</label>
                          <input
                            type="tel"
                            value={formData.phone}
                            onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            placeholder="(555) 987-6543"
                            required
                          />
                        </div>
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Email</label>
                          <input
                            type="email"
                            value={inviteEmail}
                            readOnly
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white/70' : 'bg-gray-50 border-gray-200 text-gray-700'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Street Address</label>
                          <input
                            type="text"
                            value={formData.address1}
                            onChange={(event) => setFormData((prev) => ({ ...prev, address1: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            placeholder="123 Main St"
                            required
                          />
                        </div>
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Address Line 2</label>
                          <input
                            type="text"
                            value={formData.address2}
                            onChange={(event) => setFormData((prev) => ({ ...prev, address2: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            placeholder="Suite 400"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>City</label>
                          <input
                            type="text"
                            value={formData.city}
                            onChange={(event) => setFormData((prev) => ({ ...prev, city: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            required
                          />
                        </div>
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>State</label>
                          <input
                            type="text"
                            value={formData.state}
                            onChange={(event) => setFormData((prev) => ({ ...prev, state: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            placeholder="CA"
                            required
                          />
                        </div>
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>ZIP</label>
                          <input
                            type="text"
                            value={formData.zip}
                            onChange={(event) => setFormData((prev) => ({ ...prev, zip: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>License #</label>
                          <input
                            type="text"
                            value={formData.license_number}
                            onChange={(event) => setFormData((prev) => ({ ...prev, license_number: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Insurance Policy</label>
                          <input
                            type="text"
                            value={formData.insurance_policy_number}
                            onChange={(event) => setFormData((prev) => ({ ...prev, insurance_policy_number: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Insurance Expiry</label>
                          <input
                            type="date"
                            value={formData.insurance_expiry}
                            onChange={(event) => setFormData((prev) => ({ ...prev, insurance_expiry: event.target.value }))}
                            className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                            }`}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Services</label>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          {SERVICE_CATEGORIES.map((service) => {
                            const selected = formData.services.includes(service.value)
                            return (
                              <button
                                key={service.value}
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    services: selected
                                      ? prev.services.filter((item) => item !== service.value)
                                      : [...prev.services, service.value],
                                  }))
                                }}
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                  selected
                                    ? 'border-[#ff6b35] bg-[#ff6b35]/10 text-[#ff6b35]'
                                    : isDark
                                      ? 'border-white/10 text-white/60 hover:text-white'
                                      : 'border-gray-200 text-gray-600 hover:text-gray-900'
                                }`}
                              >
                                {service.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white font-semibold tracking-wide flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {loading ? 'Creating Account...' : 'Complete Setup'}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
