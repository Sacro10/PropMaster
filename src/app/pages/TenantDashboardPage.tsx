import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, CreditCard, UploadCloud, Wrench, BadgeCheck } from 'lucide-react'
import { useThemeContext } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { createMaintenanceRequest, updateMaintenanceRequestStatus } from '../../lib/api/maintenance'
import { getTenantPaymentMethods, saveTenantPaymentMethod, setTenantAutoPay } from '../../lib/api/tenantPortal'

type TenantProfile = {
  fullName: string
  phone: string
  unit: string
  moveInDate: string
  email: string
}

type PaymentMethod = {
  id: string
  type: 'card' | 'ach'
  label: string
  brand?: string | null
  last4?: string | null
  isDefault?: boolean
}

type MaintenanceRequest = {
  id: string
  category: string
  priority: string
  description: string
  status: string
  displayStatus: string
  photos: string[]
  createdAt: string
}

type LeaseSummary = {
  id: string
  rent: number
  autoPayEnabled: boolean
  unitId: string
  propertyId: string | null
  unitLabel: string
}

const STATUS_STEPS = ['New', 'Assigned', 'In progress', 'Completed']

const STATUS_LABELS: Record<string, string> = {
  submitted: 'New',
  reviewed: 'New',
  assigned: 'Assigned',
  scheduled: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  closed: 'Completed',
  cancelled: 'Completed',
}

const STATUS_TRANSITIONS: Record<string, string> = {
  submitted: 'assigned',
  reviewed: 'assigned',
  assigned: 'in_progress',
  scheduled: 'in_progress',
  in_progress: 'completed',
}

export function TenantDashboardPage() {
  const { theme } = useThemeContext()
  const { user, loading: authLoading } = useAuth()
  const isDark = theme === 'dark'
  const [profile, setProfile] = useState<TenantProfile | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [autoPayEnabled, setAutoPayEnabled] = useState(false)
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([])
  const [paymentType, setPaymentType] = useState<'card' | 'ach'>('card')
  const [maintenanceForm, setMaintenanceForm] = useState({
    category: 'Plumbing',
    priority: 'Medium',
    description: '',
    photos: [] as File[],
  })
  const [paymentForm, setPaymentForm] = useState({
    cardNumber: '',
    exp: '',
    cvc: '',
    routing: '',
    account: '',
  })
  const [lease, setLease] = useState<LeaseSummary | null>(null)
  const [rentDue, setRentDue] = useState({ amount: 0, dueDate: 'N/A' })
  const [loading, setLoading] = useState(true)
  const [savingPayment, setSavingPayment] = useState(false)
  const [savingRequest, setSavingRequest] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        const [{ data: tenantProfile }, leaseResult] = await Promise.all([
          supabase
            .from('tenant_profiles')
            .select('full_name, phone, email, move_in_date')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('leases')
            .select(`
              id,
              rent,
              auto_pay_enabled,
              unit_id,
              units (
                id,
                unit_number,
                properties (id, name)
              )
            `)
            .eq('tenant_user_id', user.id)
            .order('lease_start', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        const unitNumber = leaseResult.data?.units?.unit_number
        const propertyName = leaseResult.data?.units?.properties?.name

        setProfile(tenantProfile ? {
          fullName: tenantProfile.full_name,
          phone: tenantProfile.phone || '',
          unit: unitNumber && propertyName ? `${propertyName} • Unit ${unitNumber}` : unitNumber ? `Unit ${unitNumber}` : 'Unit',
          moveInDate: tenantProfile.move_in_date || '',
          email: tenantProfile.email || user.email || '',
        } : null)

        if (leaseResult.data) {
          setLease({
            id: leaseResult.data.id,
            rent: Number(leaseResult.data.rent || 0),
            autoPayEnabled: Boolean(leaseResult.data.auto_pay_enabled),
            unitId: leaseResult.data.unit_id,
            propertyId: leaseResult.data.units?.properties?.id || null,
            unitLabel: unitNumber ? `Unit ${unitNumber}` : 'Unit',
          })
          setAutoPayEnabled(Boolean(leaseResult.data.auto_pay_enabled))
        }

        const [paymentResult, maintenanceResult, methods] = await Promise.all([
          supabase
            .from('payments')
            .select('amount, due_date, status')
            .eq('tenant_user_id', user.id)
            .eq('payment_type', 'rent')
            .order('due_date', { ascending: true }),
          supabase
            .from('maintenance_requests')
            .select('id, category, priority, description, status, requested_at, images')
            .eq('created_by_user_id', user.id)
            .order('requested_at', { ascending: false }),
          getTenantPaymentMethods().catch(() => []),
        ])

        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        const dueThisMonth = (paymentResult.data || []).find((payment: any) => {
          const dueDate = new Date(payment.due_date)
          return dueDate >= monthStart && dueDate <= monthEnd && payment.status !== 'paid'
        })

        const fallbackDueDate = new Date(now.getFullYear(), now.getMonth(), 1)
        const dueDateLabel = dueThisMonth
          ? new Date(dueThisMonth.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : fallbackDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

        setRentDue({
          amount: dueThisMonth ? Number(dueThisMonth.amount || 0) : Number(leaseResult.data?.rent || 0),
          dueDate: dueDateLabel,
        })

        setMaintenanceRequests((maintenanceResult.data || []).map((request: any) => ({
          id: request.id,
          category: request.category,
          priority: request.priority,
          description: request.description,
          status: request.status,
          displayStatus: STATUS_LABELS[request.status] || 'New',
          photos: (request.images as string[]) || [],
          createdAt: request.requested_at
            ? new Date(request.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'Recently',
        })))

        setPaymentMethods((methods || []).map((method: any) => ({
          id: method.id,
          type: method.method_type,
          label: method.label,
          brand: method.brand,
          last4: method.last4,
          isDefault: method.is_default,
        })))
      } catch (err: any) {
        setError(err?.message || 'Unable to load tenant dashboard.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user])

  const openRequests = useMemo(() => {
    return maintenanceRequests.filter((request) => request.displayStatus !== 'Completed').length
  }, [maintenanceRequests])

  const handleSavePayment = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (paymentType === 'card' && (!paymentForm.cardNumber || !paymentForm.exp || !paymentForm.cvc)) {
      setError('Enter a valid card number, expiration, and CVC.')
      return
    }

    if (paymentType === 'ach' && (!paymentForm.routing || !paymentForm.account)) {
      setError('Enter a routing and account number.')
      return
    }

    try {
      setSavingPayment(true)
      const last4 = paymentType === 'card'
        ? paymentForm.cardNumber.slice(-4)
        : paymentForm.account.slice(-4)

      const label = paymentType === 'card'
        ? `Card ending in ${last4}`
        : `ACH account ending in ${last4}`

      await saveTenantPaymentMethod({
        methodType: paymentType,
        label,
        last4,
        brand: paymentType === 'card' ? 'Card' : undefined,
        bankName: paymentType === 'ach' ? 'Bank Account' : undefined,
      })

      const refreshed = await getTenantPaymentMethods().catch(() => [])
      setPaymentMethods((refreshed || []).map((method: any) => ({
        id: method.id,
        type: method.method_type,
        label: method.label,
        brand: method.brand,
        last4: method.last4,
        isDefault: method.is_default,
      })))

      setPaymentForm({ cardNumber: '', exp: '', cvc: '', routing: '', account: '' })
    } catch (err: any) {
      setError(err?.message || 'Unable to save payment method.')
    } finally {
      setSavingPayment(false)
    }
  }

  const handleMaintenanceSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!maintenanceForm.description.trim()) {
      setError('Please describe the issue.')
      return
    }

    if (!lease) {
      setError('No active lease found for this account.')
      return
    }

    const categoryMap: Record<string, string> = {
      Plumbing: 'plumbing',
      Electrical: 'electrical',
      HVAC: 'hvac',
      Appliances: 'appliance',
      Other: 'general',
    }

    const priorityMap: Record<string, 'low' | 'normal' | 'high' | 'emergency'> = {
      Low: 'low',
      Medium: 'normal',
      High: 'high',
      Urgent: 'emergency',
    }

    try {
      setSavingRequest(true)
      await createMaintenanceRequest({
        unit_id: lease.unitId,
        property_id: lease.propertyId || null,
        title: `${maintenanceForm.category} Issue`,
        description: maintenanceForm.description,
        category: categoryMap[maintenanceForm.category] || 'general',
        priority: priorityMap[maintenanceForm.priority] || 'normal',
        images: maintenanceForm.photos.map((file) => file.name),
      })

      const { data: updatedRequests } = await supabase
        .from('maintenance_requests')
        .select('id, category, priority, description, status, requested_at, images')
        .eq('created_by_user_id', user?.id || '')
        .order('requested_at', { ascending: false })

      setMaintenanceRequests((updatedRequests || []).map((request: any) => ({
        id: request.id,
        category: request.category,
        priority: request.priority,
        description: request.description,
        status: request.status,
        displayStatus: STATUS_LABELS[request.status] || 'New',
        photos: (request.images as string[]) || [],
        createdAt: request.requested_at
          ? new Date(request.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'Recently',
      })))

      setMaintenanceForm({ category: 'Plumbing', priority: 'Medium', description: '', photos: [] })
    } catch (err: any) {
      setError(err?.message || 'Unable to submit request.')
    } finally {
      setSavingRequest(false)
    }
  }

  const advanceStatus = async (id: string, currentStatus: string) => {
    const nextStatus = STATUS_TRANSITIONS[currentStatus]
    if (!nextStatus) return

    try {
      await updateMaintenanceRequestStatus(id, nextStatus)
      setMaintenanceRequests((prev) =>
        prev.map((request) => {
          if (request.id !== id) return request
          const displayStatus = STATUS_LABELS[nextStatus] || request.displayStatus
          return { ...request, status: nextStatus, displayStatus }
        })
      )
    } catch (err: any) {
      setError(err?.message || 'Unable to update request status.')
    }
  }

  const handleAutoPayToggle = async (enabled: boolean) => {
    if (!lease) {
      return
    }
    setAutoPayEnabled(enabled)
    try {
      await setTenantAutoPay(lease.id, enabled)
    } catch (err: any) {
      setAutoPayEnabled(!enabled)
      setError(err?.message || 'Unable to update auto-pay.')
    }
  }

  const cardClasses = isDark
    ? 'bg-gradient-to-br from-[#141c2f] to-[#0f1626] border-white/10 text-white'
    : 'bg-white border-[#e6d8c8] text-gray-900'

  if (authLoading || loading) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-[#0b1120] text-white' : 'bg-[#f7f2ea] text-gray-900'} px-4 py-10`}>
        <div className="max-w-5xl mx-auto">Loading tenant dashboard...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-[#0b1120] text-white' : 'bg-[#f7f2ea] text-gray-900'} px-4 py-10`}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>Please sign in</h1>
          <p className="mt-2 text-sm">Use your tenant account to access the dashboard.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b1120] text-white' : 'bg-[#f7f2ea] text-gray-900'} px-4 py-10`}>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className={`text-xs uppercase tracking-[0.25em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Tenant Dashboard
            </p>
            <h1 className="text-4xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              Welcome back{profile?.fullName ? `, ${profile.fullName.split(' ')[0]}` : ''}
            </h1>
            <p className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              {profile?.unit ? `${profile.unit} · ${profile?.email || ''}` : 'Finish your onboarding details anytime.'}
            </p>
          </div>
          <div
            className={`${cardClasses} border rounded-2xl px-6 py-4 flex items-center gap-4`}
            style={{ boxShadow: isDark ? '0 18px 45px rgba(15,23,42,0.5)' : '0 18px 45px rgba(87, 63, 43, 0.15)' }}
          >
            <CalendarDays className="w-6 h-6 text-[#ff6b35]" />
            <div>
              <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Next Rent Due</p>
              <p className="text-lg font-semibold">{rentDue.dueDate}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div
            className={`${cardClasses} border rounded-2xl p-6`}
            style={{ boxShadow: isDark ? '0 20px 50px rgba(15,23,42,0.5)' : '0 20px 50px rgba(87, 63, 43, 0.12)' }}
          >
            <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Rent due this month</p>
            <p className="text-3xl font-semibold mt-2">${rentDue.amount.toLocaleString()}</p>
            <p className={`${isDark ? 'text-white/60' : 'text-gray-600'} mt-2`}>Due {rentDue.dueDate}</p>
          </div>
          <div
            className={`${cardClasses} border rounded-2xl p-6`}
            style={{ boxShadow: isDark ? '0 20px 50px rgba(15,23,42,0.5)' : '0 20px 50px rgba(87, 63, 43, 0.12)' }}
          >
            <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Open maintenance requests</p>
            <p className="text-3xl font-semibold mt-2">{openRequests}</p>
            <p className={`${isDark ? 'text-white/60' : 'text-gray-600'} mt-2`}>Track status in real time</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div
            className={`${cardClasses} border rounded-3xl p-6 space-y-6`}
            style={{ boxShadow: isDark ? '0 24px 60px rgba(15,23,42,0.5)' : '0 24px 60px rgba(87, 63, 43, 0.12)' }}
          >
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-[#ff6b35]" />
              <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>Payment Method</h2>
            </div>

            <div className="flex gap-3">
              {(['card', 'ach'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPaymentType(type)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                    paymentType === type
                      ? 'border-[#ff6b35] text-[#ff6b35]'
                      : isDark
                      ? 'border-white/10 text-white/60'
                      : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {type === 'card' ? 'Card' : 'ACH'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSavePayment} className="space-y-4">
              {paymentType === 'card' ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Card number"
                    value={paymentForm.cardNumber}
                    onChange={(event) => setPaymentForm((prev) => ({ ...prev, cardNumber: event.target.value }))}
                    className={`w-full rounded-xl border px-4 py-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={paymentForm.exp}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, exp: event.target.value }))}
                      className={`w-full rounded-xl border px-4 py-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                    />
                    <input
                      type="text"
                      placeholder="CVC"
                      value={paymentForm.cvc}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, cvc: event.target.value }))}
                      className={`w-full rounded-xl border px-4 py-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Routing number"
                    value={paymentForm.routing}
                    onChange={(event) => setPaymentForm((prev) => ({ ...prev, routing: event.target.value }))}
                    className={`w-full rounded-xl border px-4 py-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  />
                  <input
                    type="text"
                    placeholder="Account number"
                    value={paymentForm.account}
                    onChange={(event) => setPaymentForm((prev) => ({ ...prev, account: event.target.value }))}
                    className={`w-full rounded-xl border px-4 py-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={savingPayment}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white font-semibold disabled:opacity-60"
              >
                {savingPayment ? 'Saving...' : 'Save payment method'}
              </button>
            </form>

            {paymentMethods.length > 0 && (
              <div className={`rounded-xl border px-4 py-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-[#f0e1d0] bg-[#fff8f0]'}`}>
                <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Saved Method</p>
                <p className="font-semibold mt-1">{paymentMethods[0].label}</p>
              </div>
            )}

            <label className={`flex items-center justify-between rounded-xl border px-4 py-3 ${isDark ? 'border-white/10' : 'border-[#f0e1d0]'}`}>
              <div>
                <p className="font-medium">Enable AutoPay</p>
                <p className={`${isDark ? 'text-white/60' : 'text-gray-600'} text-sm`}>Automatically pay rent each month.</p>
              </div>
              <input
                type="checkbox"
                checked={autoPayEnabled}
                onChange={(event) => handleAutoPayToggle(event.target.checked)}
                className="h-5 w-5 accent-[#ff6b35]"
              />
            </label>
          </div>

          <div
            className={`${cardClasses} border rounded-3xl p-6 space-y-6`}
            style={{ boxShadow: isDark ? '0 24px 60px rgba(15,23,42,0.5)' : '0 24px 60px rgba(87, 63, 43, 0.12)' }}
          >
            <div className="flex items-center gap-3">
              <Wrench className="w-5 h-5 text-[#ff6b35]" />
              <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>Submit Maintenance Request</h2>
            </div>

            <form onSubmit={handleMaintenanceSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select
                  value={maintenanceForm.category}
                  onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, category: event.target.value }))}
                  className={`w-full rounded-xl border px-4 py-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                >
                  {['Plumbing', 'Electrical', 'HVAC', 'Appliances', 'Other'].map((option) => (
                    <option key={option} value={option} className="text-gray-900">
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  value={maintenanceForm.priority}
                  onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, priority: event.target.value }))}
                  className={`w-full rounded-xl border px-4 py-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                >
                  {['Low', 'Medium', 'High', 'Urgent'].map((option) => (
                    <option key={option} value={option} className="text-gray-900">
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={maintenanceForm.description}
                onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Describe the issue in detail..."
                rows={4}
                className={`w-full rounded-xl border px-4 py-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
              />
              <label className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer ${isDark ? 'border-white/10 text-white/70' : 'border-gray-200 text-gray-600'}`}>
                <UploadCloud className="w-5 h-5 text-[#ff6b35]" />
                <span>{maintenanceForm.photos.length > 0 ? `${maintenanceForm.photos.length} photo(s) selected` : 'Upload photos'}</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, photos: Array.from(event.target.files || []) }))}
                />
              </label>
              <button
                type="submit"
                disabled={savingRequest}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white font-semibold disabled:opacity-60"
              >
                {savingRequest ? 'Submitting...' : 'Submit request'}
              </button>
            </form>

            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Request Status</p>
              {maintenanceRequests.length === 0 ? (
                <div className={`rounded-xl border border-dashed px-4 py-6 text-sm ${isDark ? 'border-white/10 text-white/60' : 'border-gray-200 text-gray-600'}`}>
                  No requests yet. Submit one to track its status.
                </div>
              ) : (
                maintenanceRequests.map((request) => (
                  <div key={request.id} className={`rounded-xl border px-4 py-4 ${isDark ? 'border-white/10' : 'border-[#f0e1d0]'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{request.category}</p>
                        <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>{request.description}</p>
                      </div>
                      <span className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/60' : 'text-gray-500'}`}>{request.createdAt}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {STATUS_STEPS.map((status) => (
                        <span
                          key={status}
                          className={`text-xs px-3 py-1 rounded-full border ${
                            status === request.displayStatus
                              ? 'border-[#ff6b35] text-[#ff6b35]'
                              : isDark
                              ? 'border-white/10 text-white/50'
                              : 'border-gray-200 text-gray-500'
                          }`}
                        >
                          {status}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <BadgeCheck className="w-4 h-4 text-emerald-400" />
                        <span className={isDark ? 'text-white/70' : 'text-gray-600'}>{request.displayStatus}</span>
                      </div>
                      {request.displayStatus !== 'Completed' && (
                        <button
                          type="button"
                          onClick={() => advanceStatus(request.id, request.status)}
                          className={`text-sm font-medium ${isDark ? 'text-white/70 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                          Advance status
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
