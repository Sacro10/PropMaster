import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Hammer, LogOut, MapPin } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { useThemeStyles } from '../hooks/useThemeStyles'
import { formatCurrency } from '@/lib/utils/currencyHelpers'
import { formatDisplayDate } from '@/lib/utils/dateHelpers'
import { supabase } from '@/lib/supabase'
import { PortalBrand } from '../components/PortalBrand'

interface VendorProfile {
  id: string
  business_name: string
  phone: string | null
  email: string | null
}

interface VendorJob {
  id: string
  status: string
  assigned_at: string
  accepted_at: string | null
  completed_at: string | null
  vendor_notes: string | null
  completion_notes: string | null
  maintenance_requests: {
    id: string
    title: string
    description: string
    category: string
    priority: string
    status: string
    scheduled_for: string | null
    requested_at: string
    actual_cost: number | null
    properties?: {
      name: string
      address1: string
      city: string
      state: string
      zip: string
    } | null
    units?: {
      unit_number: string
    } | null
  } | null
}

const STATUS_OPTIONS = [
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

export function VendorPortalPage() {
  const { user, signOut } = useAuth()
  const { bg, text, border, cn } = useThemeStyles()

  const [profile, setProfile] = useState<VendorProfile | null>(null)
  const [jobs, setJobs] = useState<VendorJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<VendorJob | null>(null)
  const [updateStatus, setUpdateStatus] = useState('accepted')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [etaDate, setEtaDate] = useState('')
  const [notes, setNotes] = useState('')
  const [updating, setUpdating] = useState(false)

  const activeJobs = useMemo(() => jobs.filter((job) => job.status !== 'completed'), [jobs])

  useEffect(() => {
    const loadVendorData = async () => {
      if (!user) return
      setLoading(true)
      setError(null)

      try {
        let profileData: any = null
        let profileError: any = null
        ;({ data: profileData, error: profileError } = await supabase
          .from('vendor_profiles')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1))

        if (profileError) {
          ;({ data: profileData, error: profileError } = await supabase
            .from('vendor_profiles')
            .select('*')
            .eq('user_id', user.id)
            .limit(1))
        }

        if (profileError) {
          throw profileError
        }

        const rawProfileRecord = Array.isArray(profileData) ? profileData[0] : profileData
        const profileRecord = rawProfileRecord
          ? {
              ...rawProfileRecord,
              business_name:
                rawProfileRecord.business_name ||
                rawProfileRecord.company_name ||
                rawProfileRecord.contact_name ||
                'Vendor',
            }
          : null
        if (!profileRecord) {
          throw new Error('Vendor profile not found')
        }
        setProfile(profileRecord)

        const { data: jobsData, error: jobsError } = await supabase
          .from('maintenance_assignments')
          .select(`
            id,
            status,
            assigned_at,
            accepted_at,
            completed_at,
            vendor_notes,
            completion_notes,
            maintenance_requests (
              id,
              title,
              description,
              category,
              priority,
              status,
              scheduled_for,
              requested_at,
              actual_cost,
              properties (
                name,
                address1,
                city,
                state,
                zip
              ),
              units (
                unit_number
              )
            )
          `)
          .eq('vendor_profile_id', profileRecord.id)
          .order('assigned_at', { ascending: false })

        if (jobsError) {
          throw jobsError
        }

        setJobs((jobsData as VendorJob[]) || [])
      } catch (err) {
        console.error('[VendorPortal] Failed to load vendor data:', err)
        setError('Unable to load your job assignments. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadVendorData()
  }, [user])

  useEffect(() => {
    if (selectedJob) {
      const nextStatus = STATUS_OPTIONS.some((option) => option.value === selectedJob.status)
        ? selectedJob.status
        : 'accepted'
      setUpdateStatus(nextStatus)
      setInvoiceAmount(selectedJob.maintenance_requests?.actual_cost ? String(selectedJob.maintenance_requests.actual_cost) : '')
      setEtaDate(selectedJob.maintenance_requests?.scheduled_for ? selectedJob.maintenance_requests.scheduled_for.split('T')[0] : '')
      setNotes(selectedJob.completion_notes || selectedJob.vendor_notes || '')
    }
  }, [selectedJob])

  const handleJobUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedJob || !selectedJob.maintenance_requests) return

    setUpdating(true)
    setError(null)

    try {
      const assignmentUpdates: Record<string, string | null> = {
        status: updateStatus,
        vendor_notes: notes || null,
        completion_notes: updateStatus === 'completed' ? notes || null : null,
      }

      if (updateStatus === 'completed') {
        assignmentUpdates.completed_at = new Date().toISOString()
      }
      if (updateStatus === 'in_progress') {
        assignmentUpdates.started_at = new Date().toISOString()
      }
      if (updateStatus === 'accepted') {
        assignmentUpdates.accepted_at = new Date().toISOString()
      }

      const { error: assignmentError } = await supabase
        .from('maintenance_assignments')
        .update(assignmentUpdates)
        .eq('id', selectedJob.id)

      if (assignmentError) {
        throw assignmentError
      }

      const requestUpdates: Record<string, string | number | null> = {
        status: updateStatus === 'in_progress' ? 'in_progress' : updateStatus === 'completed' ? 'completed' : selectedJob.maintenance_requests.status,
      }

      if (invoiceAmount) {
        const amount = Number(invoiceAmount)
        if (!Number.isNaN(amount)) {
          requestUpdates.actual_cost = amount
        }
      }

      if (etaDate) {
        requestUpdates.scheduled_for = new Date(etaDate).toISOString()
      }

      const { error: requestError } = await supabase
        .from('maintenance_requests')
        .update(requestUpdates)
        .eq('id', selectedJob.maintenance_requests.id)

      if (requestError) {
        throw requestError
      }

      const { data: jobsData } = await supabase
        .from('maintenance_assignments')
        .select(`
          id,
          status,
          assigned_at,
          accepted_at,
          completed_at,
          vendor_notes,
          completion_notes,
          maintenance_requests (
            id,
            title,
            description,
            category,
            priority,
            status,
            scheduled_for,
            requested_at,
            actual_cost,
            properties (
              name,
              address1,
              city,
              state,
              zip
            ),
            units (
              unit_number
            )
          )
        `)
        .eq('vendor_profile_id', profile?.id || '')
        .order('assigned_at', { ascending: false })

      setJobs((jobsData as VendorJob[]) || [])
      setSelectedJob(null)
    } catch (err) {
      console.error('[VendorPortal] Failed to update job:', err)
      setError('Unable to update the job. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className={cn('min-h-screen', bg.primary)}>
      <header className={cn('border-b', border.default, 'px-6 py-4')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <PortalBrand titleClassName={text.primary} />
            <div>
              <p className={cn('text-xs uppercase tracking-[0.3em]', text.muted)}>Vendor Portal</p>
              <p className={cn('text-sm', text.secondary)}>Job Command Center</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle variant="portal" />
            <button
              type="button"
              onClick={handleSignOut}
              className={cn('flex items-center gap-2 text-sm px-3 py-2 rounded-lg border', border.default, text.secondary, bg.secondary)}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="px-6 py-6 space-y-8">
        {loading ? (
          <div className={cn('rounded-xl border p-6 text-center', border.default, bg.card)}>
            <div className="w-8 h-8 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className={text.muted}>Loading assignments...</p>
          </div>
        ) : (
          <>
            {error && (
              <div className={cn('rounded-xl border p-4', border.default, bg.secondary)}>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <section className="grid gap-6 lg:grid-cols-3">
              <div className={cn('rounded-xl border p-5', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-3">
                  <ClipboardList className="w-5 h-5 text-[#ff6b35]" />
                  <p className={cn('text-sm font-semibold', text.primary)}>Active Jobs</p>
                </div>
                <p className={cn('text-3xl font-semibold', text.primary)}>{activeJobs.length}</p>
                <p className={cn('text-xs mt-2', text.muted)}>Jobs needing updates</p>
              </div>
              <div className={cn('rounded-xl border p-5', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-3">
                  <Hammer className="w-5 h-5 text-[#3b82f6]" />
                  <p className={cn('text-sm font-semibold', text.primary)}>Completed</p>
                </div>
                <p className={cn('text-3xl font-semibold', text.primary)}>
                  {jobs.filter((job) => job.status === 'completed').length}
                </p>
                <p className={cn('text-xs mt-2', text.muted)}>Jobs closed</p>
              </div>
              <div className={cn('rounded-xl border p-5', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-3">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                  <p className={cn('text-sm font-semibold', text.primary)}>Service Area</p>
                </div>
                <p className={cn('text-3xl font-semibold', text.primary)}>
                  {profile?.business_name ? profile.business_name.slice(0, 2).toUpperCase() : '—'}
                </p>
                <p className={cn('text-xs mt-2', text.muted)}>Vendor profile</p>
              </div>
            </section>

            <section className={cn('rounded-xl border p-6', border.default, bg.card)}>
              <h2 className={cn('text-lg font-semibold mb-4', text.primary)}>Assigned Jobs</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {jobs.map((job) => {
                  const request = job.maintenance_requests
                  const property = request?.properties
                  const unit = request?.units?.unit_number
                  return (
                    <div key={job.id} className={cn('rounded-lg border p-4', border.default, bg.secondary)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={cn('text-sm font-semibold', text.primary)}>{request?.title || 'Maintenance Request'}</p>
                          <p className={cn('text-xs', text.muted)}>{request?.category} • {request?.priority}</p>
                        </div>
                        <span className={cn('text-xs px-2 py-1 rounded-full border', border.default, text.secondary)}>
                          {job.status}
                        </span>
                      </div>
                      <p className={cn('text-xs mt-2', text.muted)}>
                        Assigned {formatDisplayDate(job.assigned_at)}
                      </p>
                      {property && (
                        <p className={cn('text-xs mt-2', text.secondary)}>
                          {property.name} • Unit {unit || '—'}
                        </p>
                      )}
                      <p className={cn('text-xs mt-1', text.muted)}>
                        Tenant contact is masked. Use portal messaging for updates.
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <p className={cn('text-xs', text.secondary)}>
                          {request?.scheduled_for ? `ETA ${formatDisplayDate(request.scheduled_for)}` : 'ETA not set'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedJob(job)}
                          className="text-xs px-3 py-1 rounded-full border border-[#ff6b35]/40 text-[#ff6b35]"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  )
                })}
                {jobs.length === 0 && (
                  <p className={cn('text-sm', text.muted)}>No jobs assigned yet.</p>
                )}
              </div>
            </section>

            {selectedJob && (
              <section className={cn('rounded-xl border p-6', border.default, bg.card)}>
                <h3 className={cn('text-lg font-semibold mb-4', text.primary)}>Update Job</h3>
                <form onSubmit={handleJobUpdate} className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Status</label>
                    <select
                      value={updateStatus}
                      onChange={(event) => setUpdateStatus(event.target.value)}
                      className={cn('w-full mt-2 px-3 py-2 rounded-lg border', border.default, bg.secondary, text.primary)}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={cn('text-xs uppercase tracking-wide', text.muted)}>ETA Date</label>
                    <input
                      type="date"
                      value={etaDate}
                      onChange={(event) => setEtaDate(event.target.value)}
                      className={cn('w-full mt-2 px-3 py-2 rounded-lg border', border.default, bg.secondary, text.primary)}
                    />
                  </div>
                  <div>
                    <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Invoice Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={invoiceAmount}
                      onChange={(event) => setInvoiceAmount(event.target.value)}
                      className={cn('w-full mt-2 px-3 py-2 rounded-lg border', border.default, bg.secondary, text.primary)}
                      placeholder="0.00"
                    />
                    {selectedJob.maintenance_requests?.actual_cost && (
                      <p className={cn('text-xs mt-1', text.muted)}>
                        Current: {formatCurrency(selectedJob.maintenance_requests.actual_cost)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Notes</label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className={cn('w-full mt-2 px-3 py-2 rounded-lg border min-h-[110px]', border.default, bg.secondary, text.primary)}
                      placeholder="Progress notes or invoice details"
                    />
                  </div>
                  <div className="lg:col-span-2 flex justify-between">
                    <button
                      type="button"
                      onClick={() => setSelectedJob(null)}
                      className={cn('px-4 py-2 rounded-lg border text-sm', border.default, text.secondary)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updating}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white text-sm font-medium disabled:opacity-60"
                    >
                      {updating ? 'Saving...' : 'Save Update'}
                    </button>
                  </div>
                </form>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
