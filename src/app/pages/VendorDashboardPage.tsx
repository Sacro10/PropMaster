import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Bell, CalendarClock, CheckCircle2, CircleDashed, LogOut, MapPin, RefreshCw, Wrench, Send, ImagePlus, Search, MapPinned, MessageSquare } from 'lucide-react'
import { useThemeContext } from '../context/ThemeContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { formatDisplayDate, formatRelativeTime } from '@/lib/utils/dateHelpers'
import { createVendorStripeConnectOnboardingLink, getVendorJobs, getVendorProfile, updateVendorJobDetails, updateVendorJobStatus, updateVendorJobPhotos, type VendorJob } from '@/lib/api/vendorPortal'
import { getManagerRecipientForRequest, getMessagesForRequest, sendMessage } from '@/lib/api/communications'
import { useAuth } from '../context/AuthContext'
import { supabase } from '@/lib/supabase'
import { PortalBrand } from '../components/PortalBrand'
import { useLocation, useNavigate } from 'react-router-dom'

type JobStatusLabel = 'New' | 'In progress' | 'Completed'

const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'maintenance-attachments'
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const statusToLabel = (status: VendorJob['status']): JobStatusLabel => {
  if (status === 'in_progress') return 'In progress'
  if (status === 'completed') return 'Completed'
  return 'New'
}

const statusPill = (status: JobStatusLabel) => {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
    case 'In progress':
      return 'bg-amber-500/15 text-amber-300 border-amber-400/30'
    default:
      return 'bg-sky-500/15 text-sky-300 border-sky-400/30'
  }
}

const normalizeImages = (value: any): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string')
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string')
    } catch {
      return value.startsWith('http') ? [value] : []
    }
  }
  return []
}

export function VendorDashboardPage() {
  const { theme } = useThemeContext()
  const isDark = theme === 'dark'
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const mutedLabel = isDark ? 'text-white/50' : 'text-gray-500'
  const mutedText = isDark ? 'text-white/60' : 'text-gray-600'
  const mutedHint = isDark ? 'text-white/40' : 'text-gray-400'
  const [jobs, setJobs] = useState<VendorJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [stripeConnectedAccountId, setStripeConnectedAccountId] = useState('')
  const [stripeSaving, setStripeSaving] = useState(false)
  const [stripeMessage, setStripeMessage] = useState<string | null>(null)
  const [beforeUploads, setBeforeUploads] = useState<File[]>([])
  const [afterUploads, setAfterUploads] = useState<File[]>([])
  const [beforePreviews, setBeforePreviews] = useState<string[]>([])
  const [afterPreviews, setAfterPreviews] = useState<string[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [messageDraft, setMessageDraft] = useState('')
  const [messages, setMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [managerRecipientId, setManagerRecipientId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'in_progress' | 'completed'>('all')
  const [dragOverTarget, setDragOverTarget] = useState<'before' | 'after' | null>(null)
  const [notifications, setNotifications] = useState<Array<{
    id: string
    title: string
    message: string
    is_read: boolean
    action_url?: string | null
    created_at: string
  }>>([])
  const requestedRequestId = new URLSearchParams(location.search).get('request')

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || null, [jobs, selectedJobId])
  const jobStats = useMemo(() => {
    const summary = { total: jobs.length, new: 0, inProgress: 0, completed: 0 }
    jobs.forEach((job) => {
      if (job.status === 'completed') {
        summary.completed += 1
        return
      }
      if (job.status === 'in_progress') {
        summary.inProgress += 1
        return
      }
      summary.new += 1
    })
    return summary
  }, [jobs])
  const filteredJobs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return jobs.filter((job) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'new' && job.status !== 'pending' && job.status !== 'accepted') return false
        if (statusFilter === 'in_progress' && job.status !== 'in_progress') return false
        if (statusFilter === 'completed' && job.status !== 'completed') return false
      }
      if (!normalizedSearch) return true
      const propertyName = job.request.property?.name || ''
      const unitNumber = job.request.unit?.unit_number || ''
      const target = `${job.request.title} ${job.request.description || ''} ${propertyName} ${unitNumber}`.toLowerCase()
      return target.includes(normalizedSearch)
    })
  }, [jobs, searchTerm, statusFilter])

  const refreshJobs = async () => {
    try {
      setLoading(true)
      setError(null)
      const [data, vendorProfile] = await Promise.all([
        getVendorJobs(),
        getVendorProfile(),
      ])
      setJobs(data)
      const stripeAccountId = typeof (vendorProfile as any)?.stripe_connected_account_id === 'string'
        ? (vendorProfile as any).stripe_connected_account_id
        : ''
      setStripeConnectedAccountId(stripeAccountId)
      if (data.length > 0 && !selectedJobId) {
        setSelectedJobId(data[0].id)
      }
    } catch (err: any) {
      console.error('[Vendor Dashboard] Failed to load jobs:', err)
      setError(err?.message || 'Unable to load jobs')
    } finally {
      setLoading(false)
    }
  }

  const handleConnectStripe = async () => {
    try {
      setStripeSaving(true)
      setStripeMessage(null)
      const result = await createVendorStripeConnectOnboardingLink()
      setStripeConnectedAccountId(result.stripeConnectedAccountId || '')
      setStripeMessage('Redirecting to Stripe onboarding...')
      setError(null)
      window.location.assign(result.url)
    } catch (err: any) {
      console.warn('[Vendor Dashboard] Unable to open Stripe onboarding:', err?.message || err)
      setStripeMessage(err?.message || 'Unable to open Stripe onboarding.')
    } finally {
      setStripeSaving(false)
    }
  }

  const handleNotificationClick = async (notification: {
    id: string
    is_read: boolean
    action_url?: string | null
  }) => {
    if (!notification.is_read) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notification.id)

      if (!error) {
        setNotifications((prev) =>
          prev.map((item) => item.id === notification.id ? { ...item, is_read: true } : item)
        )
      }
    }

    if (!notification.action_url) return
    if (/^https?:\/\//i.test(notification.action_url)) {
      window.open(notification.action_url, '_blank', 'noopener,noreferrer')
      return
    }

    navigate(notification.action_url)
  }

  useEffect(() => {
    refreshJobs()
  }, [])

  useEffect(() => {
    const loadNotifications = async () => {
      if (!user) return

      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, message, is_read, action_url, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8)

      if (error) {
        console.error('[Vendor Dashboard] Failed to load notifications:', error)
        return
      }

      setNotifications((data as any[]) || [])
    }

    loadNotifications()
  }, [user?.id])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const stripeState = params.get('stripe')
    if (!stripeState) {
      return
    }

    if (stripeState === 'return') {
      setStripeMessage('Stripe onboarding updated. Refreshing connection status...')
      refreshJobs()
    } else if (stripeState === 'refresh') {
      setStripeMessage('Stripe onboarding was not completed. You can continue at any time.')
    }

    params.delete('stripe')
    const query = params.toString()
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`
    window.history.replaceState({}, '', nextUrl)
  }, [])

  useEffect(() => {
    if (!requestedRequestId || jobs.length === 0) return
    const matchingJob = jobs.find((job) => job.request.id === requestedRequestId)
    if (!matchingJob) return
    setSelectedJobId(matchingJob.id)
    const element = document.getElementById(`vendor-job-${matchingJob.id}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [requestedRequestId, jobs])

  useEffect(() => {
    let cancelled = false
    const loadRecipient = async () => {
      if (!selectedJob?.request?.id) {
        if (!cancelled) {
          setManagerRecipientId(null)
        }
        return
      }
      const recipient = await getManagerRecipientForRequest(selectedJob.request.id)
      if (!cancelled) {
        setManagerRecipientId(recipient)
      }
    }
    loadRecipient()
    return () => {
      cancelled = true
    }
  }, [selectedJob?.request?.id])

  useEffect(() => {
    if (!selectedJob) {
      setNotes('')
      setCost('')
      setMessages([])
      setMessageDraft('')
      return
    }
    setNotes(selectedJob.vendor_notes || selectedJob.completion_notes || '')
    setCost(selectedJob.request.actual_cost ? String(selectedJob.request.actual_cost) : '')
    setBeforeUploads([])
    setAfterUploads([])
  }, [selectedJob])

  useEffect(() => {
    const urls = beforeUploads.map((file) => URL.createObjectURL(file))
    setBeforePreviews(urls)
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [beforeUploads])

  useEffect(() => {
    const urls = afterUploads.map((file) => URL.createObjectURL(file))
    setAfterPreviews(urls)
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [afterUploads])

  useEffect(() => {
    if (!selectedJob?.request?.id) {
      setMessages([])
      return
    }

    let cancelled = false
    const loadMessages = async (silent = false) => {
      try {
        if (!silent) {
          setLoadingMessages(true)
        }
        const data = await getMessagesForRequest(selectedJob.request.id, 100)
        if (!cancelled) {
          setMessages(data)
        }
      } catch (err: any) {
        console.error('[Vendor Dashboard] Failed to load messages:', err)
      } finally {
        if (!silent && !cancelled) {
          setLoadingMessages(false)
        }
      }
    }

    void loadMessages(false)
    const intervalId = window.setInterval(() => {
      void loadMessages(true)
    }, 12000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [selectedJob?.request?.id])

  const updateLocalJob = (jobId: string, updates: Partial<VendorJob>, requestUpdates?: Partial<VendorJob['request']>) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? {
              ...job,
              ...updates,
              request: requestUpdates ? { ...job.request, ...requestUpdates } : job.request,
            }
          : job
      )
    )
  }

  const uploadWorkPhotos = async (type: 'before' | 'after') => {
    if (!selectedJob || !user) return
    const files = type === 'before' ? beforeUploads : afterUploads
    if (files.length === 0) return

    try {
      setUploadingPhotos(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No active session')
      }

      const uploadedUrls = await Promise.all(
        files.map(async (file) => {
          const signResponse = await fetch(`${API_BASE}/api/maintenance/uploads/sign`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
            }),
          })

          if (!signResponse.ok) {
            const signPayload = await signResponse.json().catch(() => null)
            throw new Error(signPayload?.details || signPayload?.error || 'Failed to prepare image upload')
          }

          const signed = await signResponse.json() as {
            bucket: string
            path: string
            token: string
            publicUrl: string
          }

          const { error: uploadError } = await supabase.storage
            .from(signed.bucket || STORAGE_BUCKET)
            .uploadToSignedUrl(signed.path, signed.token, file)
          if (uploadError) throw uploadError

          return signed.publicUrl
        })
      )

      const currentBefore = normalizeImages(selectedJob.before_images)
      const currentAfter = normalizeImages(selectedJob.after_images)
      const nextBefore = type === 'before' ? [...currentBefore, ...uploadedUrls] : currentBefore
      const nextAfter = type === 'after' ? [...currentAfter, ...uploadedUrls] : currentAfter

      await updateVendorJobPhotos({
        assignmentId: selectedJob.id,
        requestId: selectedJob.request.id,
        beforeImages: nextBefore,
        afterImages: nextAfter,
      })

      updateLocalJob(selectedJob.id, {
        before_images: nextBefore,
        after_images: nextAfter,
      })

      if (type === 'before') {
        setBeforeUploads([])
      } else {
        setAfterUploads([])
      }
    } catch (err: any) {
      console.error('[Vendor Dashboard] Photo upload failed:', err)
      setError(err?.message || 'Failed to upload photos.')
    } finally {
      setUploadingPhotos(false)
    }
  }

  const removeBeforeUpload = (index: number) => {
    setBeforeUploads((prev) => prev.filter((_, i) => i !== index))
  }

  const removeAfterUpload = (index: number) => {
    setAfterUploads((prev) => prev.filter((_, i) => i !== index))
  }

  const appendUploads = (files: FileList | File[], type: 'before' | 'after') => {
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (list.length === 0) return
    if (type === 'before') {
      setBeforeUploads((prev) => [...prev, ...list])
    } else {
      setAfterUploads((prev) => [...prev, ...list])
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, type: 'before' | 'after') => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.dataTransfer?.files?.length) return
    appendUploads(event.dataTransfer.files, type)
  }

  const handleSendMessage = async () => {
    if (!selectedJob || !managerRecipientId || !messageDraft.trim()) return
    try {
      setSendingMessage(true)
      await sendMessage({
        to_user_id: managerRecipientId,
        body: messageDraft.trim(),
        maintenance_request_id: selectedJob.request.id,
        property_id: selectedJob.request.property?.id || undefined,
        unit_id: selectedJob.request.unit?.id || undefined,
        subject: selectedJob.request.title || 'Maintenance update',
      })
      const refreshedMessages = await getMessagesForRequest(selectedJob.request.id, 100)
      setMessages(refreshedMessages)
      setMessageDraft('')
    } catch (err: any) {
      console.error('[Vendor Dashboard] Failed to send message:', err)
      setError(err?.message || 'Unable to send message.')
    } finally {
      setSendingMessage(false)
    }
  }

  const historyItems = useMemo(() => {
    if (!selectedJob) return []
    const items = [
      { label: 'Request submitted', timestamp: selectedJob.request.requested_at },
      { label: 'Assigned to you', timestamp: selectedJob.assigned_at },
      { label: 'Accepted', timestamp: selectedJob.accepted_at },
      { label: 'Scheduled', timestamp: selectedJob.request.scheduled_for },
      { label: 'Work started', timestamp: selectedJob.started_at },
      { label: 'Completed', timestamp: selectedJob.completed_at },
    ]
      .filter((item) => Boolean(item.timestamp))
      .map((item) => ({ ...item, timestamp: String(item.timestamp) }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    return items
  }, [selectedJob])

  const mapQuery = useMemo(() => {
    if (!selectedJob?.request.property) return ''
    const { address1, city, state, zip } = selectedJob.request.property
    return [address1, city, state, zip].filter(Boolean).join(', ')
  }, [selectedJob])

  const handleSaveDetails = async () => {
    if (!selectedJob) return
    if (!selectedJob.request?.id) {
      setError('Missing request details.')
      return
    }
    const trimmedNotes = notes.trim()
    const parsedCost = cost.trim() === '' ? null : Number(cost)
    if (parsedCost !== null && Number.isNaN(parsedCost)) {
      setError('Cost must be a valid number.')
      return
    }

    try {
      setSaving(true)
      await updateVendorJobDetails({
        assignmentId: selectedJob.id,
        requestId: selectedJob.request.id,
        notes: trimmedNotes || null,
        actualCost: parsedCost,
      })
      updateLocalJob(
        selectedJob.id,
        { vendor_notes: trimmedNotes || null },
        { actual_cost: parsedCost }
      )
      setError(null)
    } catch (err: any) {
      console.error('[Vendor Dashboard] Failed to save details:', err)
      setError(err?.message || 'Unable to save job details.')
    } finally {
      setSaving(false)
    }
  }

  const handleStartJob = async () => {
    if (!selectedJob) return
    if (!selectedJob.request?.id) {
      setError('Missing request details.')
      return
    }
    try {
      setUpdatingStatus(true)
      await updateVendorJobStatus({
        assignmentId: selectedJob.id,
        requestId: selectedJob.request.id,
        nextStatus: 'in_progress',
      })
      updateLocalJob(
        selectedJob.id,
        { status: 'in_progress', started_at: new Date().toISOString() },
        { status: 'in_progress' }
      )
      setError(null)
    } catch (err: any) {
      console.error('[Vendor Dashboard] Failed to update status:', err)
      setError(err?.message || 'Unable to update status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleCompleteJob = async () => {
    if (!selectedJob) return
    if (!selectedJob.request?.id) {
      setError('Missing request details.')
      return
    }
    const parsedCost = cost.trim() === '' ? null : Number(cost)
    if (parsedCost !== null && Number.isNaN(parsedCost)) {
      setError('Cost must be a valid number.')
      return
    }
    if (parsedCost === null) {
      setError('Enter the job cost before marking completed.')
      return
    }

    try {
      setUpdatingStatus(true)
      const completionResult = await updateVendorJobStatus({
        assignmentId: selectedJob.id,
        requestId: selectedJob.request.id,
        nextStatus: 'completed',
        notes: notes.trim() || null,
        actualCost: parsedCost,
        propertyId: selectedJob.request.property?.id || null,
        unitId: selectedJob.request.unit?.id || null,
        vendorProfileId: selectedJob.vendor_profile_id || null,
      })
      updateLocalJob(
        selectedJob.id,
        { status: 'completed', completed_at: new Date().toISOString(), completion_notes: notes.trim() || null },
        { status: 'completed', actual_cost: parsedCost }
      )
      const notifiedCount = Array.isArray(completionResult?.notifiedRecipients)
        ? completionResult.notifiedRecipients.length
        : 0
      if (notifiedCount === 0) {
        setError('Job was marked completed, but no owner/manager recipients were notified. Please verify account roles and assignment ownership.')
      } else {
        setError(null)
      }
    } catch (err: any) {
      console.error('[Vendor Dashboard] Failed to complete job:', err)
      setError(err?.message || 'Unable to mark job completed.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const panelClasses = isDark
    ? 'bg-gradient-to-br from-[#151c2f] to-[#0d1324] border-white/10 text-white'
    : 'bg-white border-gray-200 text-gray-900'
  const cardClasses = isDark
    ? 'bg-white/5 border-white/10'
    : 'bg-gray-50 border-gray-200'
  const hasStripePayoutSetup = stripeConnectedAccountId.trim().startsWith('acct_')

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0e1a] text-white' : 'bg-[#f6f1ea] text-gray-900'}`}>
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: isDark
              ? 'radial-gradient(circle at 15% 10%, rgba(255, 107, 53, 0.18), transparent 55%)'
              : 'radial-gradient(circle at 20% 15%, rgba(255, 193, 111, 0.35), transparent 60%)',
          }}
        />
      </div>
      <div className="px-6 py-10 max-w-7xl mx-auto">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <PortalBrand />
              <div>
                <p className={`text-sm sm:text-base font-semibold uppercase tracking-[0.24em] ${mutedLabel}`}>Vendor Portal</p>
                <p className={`text-lg sm:text-2xl font-semibold leading-tight ${mutedText}`}>Assigned Jobs</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle variant="portal" />
            <button
              onClick={refreshJobs}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${isDark ? 'border-white/10 text-white/70 hover:text-white' : 'border-gray-200 text-gray-600 hover:text-gray-800'} transition`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={signOut}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${isDark ? 'border-white/10 text-white/70 hover:text-white' : 'border-gray-200 text-gray-600 hover:text-gray-800'} transition`}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Jobs', value: jobStats.total, accent: 'from-[#ff6b35] to-[#f7931e]' },
            { label: 'New', value: jobStats.new, accent: 'from-[#38bdf8] to-[#0ea5e9]' },
            { label: 'In Progress', value: jobStats.inProgress, accent: 'from-[#f59e0b] to-[#d97706]' },
            { label: 'Completed', value: jobStats.completed, accent: 'from-[#10b981] to-[#059669]' },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`${panelClasses} border rounded-2xl p-4 shadow-xl`}
            >
              <p className={`text-xs uppercase tracking-[0.2em] ${mutedLabel}`}>{stat.label}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-2xl font-semibold">{stat.value}</span>
                <span className={`h-10 w-10 rounded-xl bg-gradient-to-br ${stat.accent}`} />
              </div>
            </div>
          ))}
        </div>

        <div className={`${panelClasses} border rounded-2xl p-4 shadow-xl mt-4`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-lg" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>Stripe Payout Account</h3>
              <p className={`text-xs mt-1 ${mutedText}`}>
                Connect Stripe once and enter card/bank payout details securely on Stripe.
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${
              hasStripePayoutSetup
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                : isDark
                  ? 'border-white/20 text-white/70'
                  : 'border-gray-300 text-gray-600'
            }`}>
              {hasStripePayoutSetup ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <div className="mt-3 flex flex-col md:flex-row md:items-center gap-3">
            <button
              onClick={handleConnectStripe}
              disabled={stripeSaving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#f25a23] disabled:opacity-50"
            >
              {stripeSaving
                ? 'Opening Stripe...'
                : hasStripePayoutSetup
                  ? 'Manage Stripe Payout Setup'
                  : 'Connect Stripe Payout Setup'}
            </button>
            {hasStripePayoutSetup && (
              <p className={`text-xs ${mutedText}`}>
                Connected account: <span className="font-mono">{stripeConnectedAccountId}</span>
              </p>
            )}
          </div>
          {stripeMessage && (
            <p className={`mt-2 text-xs ${
              stripeMessage.toLowerCase().includes('updated') ||
              stripeMessage.toLowerCase().includes('redirecting') ||
              stripeMessage.toLowerCase().includes('connected')
                ? 'text-emerald-400'
                : 'text-red-400'
            }`}>
              {stripeMessage}
            </p>
          )}
        </div>

        <div className={`${panelClasses} border rounded-2xl p-4 shadow-xl mt-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#ff6b35]" />
              <h3 className="text-lg" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>Notifications</h3>
            </div>
            <span className={`text-xs ${mutedLabel}`}>{notifications.filter((item) => !item.is_read).length} unread</span>
          </div>
          <div className="mt-3 space-y-2">
            {notifications.length === 0 ? (
              <p className={`text-sm ${mutedText}`}>No notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleNotificationClick(notification)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    notification.is_read
                      ? isDark
                        ? 'border-white/10 bg-white/5'
                        : 'border-gray-200 bg-gray-50'
                      : 'border-[#ff6b35]/40 bg-[#ff6b35]/10'
                  }`}
                >
                  <p className="text-sm font-semibold">{notification.title}</p>
                  <p className={`mt-1 text-xs ${mutedText}`}>{notification.message}</p>
                  <p className={`mt-2 text-[11px] ${mutedHint}`}>{formatRelativeTime(notification.created_at)}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-6">
          <div className={`${panelClasses} border rounded-2xl p-4 shadow-xl`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>Job Queue</h2>
              <span className={`text-xs ${mutedLabel}`}>{jobs.length} jobs</span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${mutedHint}`} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search jobs, properties, units"
                  className={`w-full rounded-xl border pl-9 pr-3 py-2 text-sm ${
                    isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                  }`}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'new', label: 'New' },
                  { value: 'in_progress', label: 'In Progress' },
                  { value: 'completed', label: 'Completed' },
                ].map((filter) => {
                  const isActive = statusFilter === filter.value
                  return (
                    <button
                      key={filter.value}
                      onClick={() => setStatusFilter(filter.value as typeof statusFilter)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition ${
                        isActive
                          ? 'border-[#ff6b35]/60 bg-[#ff6b35]/10 text-[#ff6b35]'
                          : isDark
                            ? 'border-white/10 text-white/70 hover:border-white/30'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {filter.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {loading ? (
              <div className={`py-10 text-center text-sm ${mutedLabel}`}>Loading assignments...</div>
            ) : filteredJobs.length === 0 ? (
              <div className={`py-10 text-center text-sm ${mutedLabel}`}>
                No jobs match your filters.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {filteredJobs.map((job) => {
                  const label = statusToLabel(job.status)
                  const isActive = job.id === selectedJobId
                  const propertyName = job.request.property?.name || 'Property'
                  const unitLabel = job.request.unit?.unit_number ? `#${job.request.unit.unit_number}` : 'Unit'
                  return (
                    <button
                      key={job.id}
                      id={`vendor-job-${job.id}`}
                      onClick={() => setSelectedJobId(job.id)}
                      className={`w-full text-left rounded-xl border px-3 py-3 transition ${
                        isActive || requestedRequestId === job.request.id
                          ? 'border-[#ff6b35]/50 bg-[#ff6b35]/10'
                          : isDark
                            ? 'border-white/10 bg-white/5 hover:bg-white/10'
                            : 'border-gray-200 bg-gray-50 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{job.request.title}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusPill(label)}`}>{label}</span>
                      </div>
                      <div className={`mt-2 text-xs ${mutedText}`}>
                        {propertyName} - {unitLabel}
                      </div>
                      <div className={`mt-1 text-xs ${mutedHint}`}>
                        Assigned {formatRelativeTime(job.assigned_at)}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className={`${panelClasses} border rounded-2xl p-6 shadow-2xl`}>
            {!selectedJob ? (
              <div className={`py-12 text-center text-sm ${mutedLabel}`}>
                Select a job to view details.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className={`text-xs uppercase tracking-[0.3em] ${mutedLabel}`}>Job Details</p>
                    <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{selectedJob.request.title}</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full border ${statusPill(statusToLabel(selectedJob.status))}`}>
                      {statusToLabel(selectedJob.status)}
                    </span>
                    {selectedJob.status === 'completed' && (
                      <BadgeCheck className="w-5 h-5 text-emerald-400" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`${cardClasses} rounded-xl p-4 border`}>
                    <div className={`flex items-center gap-2 text-xs ${mutedText}`}>
                      <CalendarClock className="w-4 h-4 text-[#ff6b35]" />
                      Requested
                    </div>
                    <p className="mt-2 text-sm font-semibold">
                      {selectedJob.request.requested_at ? formatDisplayDate(selectedJob.request.requested_at) : 'N/A'}
                    </p>
                  </div>
                  <div className={`${cardClasses} rounded-xl p-4 border`}>
                    <div className={`flex items-center gap-2 text-xs ${mutedText}`}>
                      <CircleDashed className="w-4 h-4 text-[#ff6b35]" />
                      Priority
                    </div>
                    <p className="mt-2 text-sm font-semibold">{selectedJob.request.priority || 'Normal'}</p>
                  </div>
                  <div className={`${cardClasses} rounded-xl p-4 border`}>
                    <div className={`flex items-center gap-2 text-xs ${mutedText}`}>
                      <Wrench className="w-4 h-4 text-[#ff6b35]" />
                      Category
                    </div>
                    <p className="mt-2 text-sm font-semibold capitalize">{selectedJob.request.category || 'General'}</p>
                  </div>
                </div>

                <div className={`${cardClasses} rounded-xl p-4 border`}>
                  <div className={`flex items-start gap-2 text-xs ${mutedText}`}>
                    <MapPin className="w-4 h-4 text-[#ff6b35]" />
                    Location
                  </div>
                  <p className="mt-2 text-sm font-semibold">
                    {selectedJob.request.property?.name || 'Property'}
                    {selectedJob.request.unit?.unit_number ? ` - Unit ${selectedJob.request.unit.unit_number}` : ''}
                  </p>
                  <p className={`mt-1 text-xs ${mutedLabel}`}>
                    {[selectedJob.request.property?.address1, selectedJob.request.property?.city, selectedJob.request.property?.state, selectedJob.request.property?.zip]
                      .filter(Boolean)
                      .join(', ') || 'Address unavailable'}
                  </p>
                </div>

                <div className={`${cardClasses} rounded-xl p-4 border`}>
                  <div className={`flex items-center justify-between`}>
                    <p className={`text-xs uppercase tracking-[0.3em] ${mutedLabel}`}>Status Timeline</p>
                    <p className={`text-xs ${mutedHint}`}>New → In progress → Completed</p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {['new', 'in_progress', 'completed'].map((status, index) => {
                      const isReached =
                        status === 'new' ||
                        (status === 'in_progress' && ['in_progress', 'completed'].includes(selectedJob.status)) ||
                        (status === 'completed' && selectedJob.status === 'completed')
                      const stepLabel = status === 'new' ? 'New' : status === 'in_progress' ? 'In Progress' : 'Completed'
                      return (
                        <div
                          key={status}
                          className={`rounded-xl border px-3 py-3 text-sm ${
                            isReached
                              ? 'border-[#ff6b35]/50 bg-[#ff6b35]/10 text-[#ff6b35]'
                              : isDark
                                ? 'border-white/10 text-white/50'
                                : 'border-gray-200 text-gray-500'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{stepLabel}</span>
                            <span className="text-xs">Step {index + 1}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className={`${cardClasses} rounded-xl p-4 border`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm uppercase tracking-[0.2em] ${mutedLabel}`}>History</h3>
                    {mapQuery && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
                          isDark ? 'border-white/10 text-white/70 hover:text-white' : 'border-gray-200 text-gray-600 hover:text-gray-800'
                        }`}
                      >
                        <MapPinned className="w-3.5 h-3.5" />
                        Open in Maps
                      </a>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {historyItems.length === 0 && (
                      <p className={`text-xs ${mutedHint}`}>No history available yet.</p>
                    )}
                    {historyItems.map((item) => (
                      <div key={`${item.label}-${item.timestamp}`} className="flex items-center justify-between text-sm">
                        <span className={isDark ? 'text-white/70' : 'text-gray-600'}>{item.label}</span>
                        <span className={`text-xs ${mutedHint}`}>{formatDisplayDate(item.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className={`text-sm uppercase tracking-[0.2em] ${mutedLabel}`}>Scope</h3>
                  <p className={`text-sm leading-relaxed ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    {selectedJob.request.description || 'No description provided.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className={`text-sm uppercase tracking-[0.2em] ${mutedLabel} mb-3`}>Reported Photos</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {normalizeImages(selectedJob.request.images).map((src, index) => (
                        <a key={`${src}-${index}`} href={src} target="_blank" rel="noreferrer" title="Open full image">
                          <img src={src} alt="Reported issue" className={`h-32 w-full rounded-xl object-cover border ${isDark ? 'border-white/10' : 'border-gray-200'}`} />
                        </a>
                      ))}
                      {normalizeImages(selectedJob.request.images).length === 0 && (
                        <div className={`text-xs ${mutedHint}`}>No photos uploaded.</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className={`text-sm uppercase tracking-[0.2em] ${mutedLabel} mb-3`}>Work Photos</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {normalizeImages(selectedJob.before_images).concat(normalizeImages(selectedJob.after_images)).map((src, index) => (
                        <a key={`${src}-${index}`} href={src} target="_blank" rel="noreferrer" title="Open full image">
                          <img src={src} alt="Work detail" className={`h-32 w-full rounded-xl object-cover border ${isDark ? 'border-white/10' : 'border-gray-200'}`} />
                        </a>
                      ))}
                      {normalizeImages(selectedJob.before_images).length + normalizeImages(selectedJob.after_images).length === 0 && (
                        <div className={`text-xs ${mutedHint}`}>No work photos yet.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className={`${cardClasses} rounded-xl p-4 border`}>
                    <h3 className={`text-sm uppercase tracking-[0.2em] ${mutedLabel}`}>Upload Before Photos</h3>
                    <p className={`text-xs mt-1 ${mutedHint}`}>Show the issue before work starts.</p>
                    <div
                      onDragEnter={() => setDragOverTarget('before')}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onDragLeave={() => setDragOverTarget(null)}
                      onDrop={(event) => handleDrop(event, 'before')}
                      className={`mt-3 rounded-xl border border-dashed px-4 py-4 text-xs transition ${
                        dragOverTarget === 'before'
                          ? 'border-[#ff6b35] bg-[#ff6b35]/10 text-[#ff6b35] animate-pulse'
                          : isDark
                            ? 'border-white/20 text-white/60'
                            : 'border-gray-300 text-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ImagePlus className={`w-4 h-4 ${dragOverTarget === 'before' ? 'scale-110' : ''}`} />
                        <span>
                      Drag & drop images here, or
                      <label className="ml-1 underline cursor-pointer text-[#ff6b35]">
                        browse
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={(event) => appendUploads(event.target.files || [], 'before')}
                          className="hidden"
                        />
                      </label>
                        </span>
                      </div>
                    </div>
                    {beforePreviews.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {beforePreviews.map((src, index) => (
                          <div key={`${src}-${index}`} className="relative">
                            <img
                              src={src}
                              alt={`Before upload ${index + 1}`}
                              className={`h-24 w-full rounded-xl object-cover border ${isDark ? 'border-white/10' : 'border-gray-200'}`}
                            />
                            <button
                              type="button"
                              onClick={() => removeBeforeUpload(index)}
                              className={`absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                isDark ? 'bg-black/60 text-white' : 'bg-white/90 text-gray-700'
                              }`}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => uploadWorkPhotos('before')}
                      disabled={uploadingPhotos || beforeUploads.length === 0}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#ff6b35] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Upload ({beforeUploads.length})
                    </button>
                  </div>
                  <div className={`${cardClasses} rounded-xl p-4 border`}>
                    <h3 className={`text-sm uppercase tracking-[0.2em] ${mutedLabel}`}>Upload After Photos</h3>
                    <p className={`text-xs mt-1 ${mutedHint}`}>Capture completed work.</p>
                    <div
                      onDragEnter={() => setDragOverTarget('after')}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onDragLeave={() => setDragOverTarget(null)}
                      onDrop={(event) => handleDrop(event, 'after')}
                      className={`mt-3 rounded-xl border border-dashed px-4 py-4 text-xs transition ${
                        dragOverTarget === 'after'
                          ? 'border-[#ff6b35] bg-[#ff6b35]/10 text-[#ff6b35] animate-pulse'
                          : isDark
                            ? 'border-white/20 text-white/60'
                            : 'border-gray-300 text-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ImagePlus className={`w-4 h-4 ${dragOverTarget === 'after' ? 'scale-110' : ''}`} />
                        <span>
                      Drag & drop images here, or
                      <label className="ml-1 underline cursor-pointer text-[#ff6b35]">
                        browse
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={(event) => appendUploads(event.target.files || [], 'after')}
                          className="hidden"
                        />
                      </label>
                        </span>
                      </div>
                    </div>
                    {afterPreviews.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {afterPreviews.map((src, index) => (
                          <div key={`${src}-${index}`} className="relative">
                            <img
                              src={src}
                              alt={`After upload ${index + 1}`}
                              className={`h-24 w-full rounded-xl object-cover border ${isDark ? 'border-white/10' : 'border-gray-200'}`}
                            />
                            <button
                              type="button"
                              onClick={() => removeAfterUpload(index)}
                              className={`absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                isDark ? 'bg-black/60 text-white' : 'bg-white/90 text-gray-700'
                              }`}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => uploadWorkPhotos('after')}
                      disabled={uploadingPhotos || afterUploads.length === 0}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#ff6b35] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Upload ({afterUploads.length})
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className={`text-sm uppercase tracking-[0.2em] ${mutedLabel}`}>Cost</label>
                    <input
                      type="text"
                      value={cost}
                      onChange={(event) => setCost(event.target.value)}
                      placeholder="0.00"
                      className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                        isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-sm uppercase tracking-[0.2em] ${mutedLabel}`}>Status Actions</label>
                    <div className="mt-2 flex flex-col gap-2">
                      {selectedJob.status !== 'in_progress' && selectedJob.status !== 'completed' && (
                        <button
                          onClick={handleStartJob}
                          disabled={updatingStatus}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
                        >
                          <CircleDashed className="w-4 h-4" />
                          Start Job
                        </button>
                      )}
                      {selectedJob.status === 'in_progress' && (
                        <button
                          onClick={handleCompleteJob}
                          disabled={updatingStatus}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark Completed
                        </button>
                      )}
                      {selectedJob.status === 'completed' && (
                        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
                          Job completed {selectedJob.completed_at ? formatDisplayDate(selectedJob.completed_at) : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className={`text-sm uppercase tracking-[0.2em] ${mutedLabel}`}>Notes</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add work notes or completion details"
                    rows={4}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 ${
                      isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                    }`}
                  />
                </div>

                <div className={`${cardClasses} rounded-xl p-4 border`}>
                  <div className="flex items-center gap-3 mb-4">
                    <MessageSquare className="w-5 h-5 text-sky-400" />
                    <div>
                      <h3 className="text-lg font-semibold">Messages</h3>
                      <p className={`text-xs ${mutedLabel}`}>Chat with management inside the portal.</p>
                    </div>
                  </div>

                  <div className={`rounded-lg border p-4 min-h-[280px] max-h-[360px] overflow-y-auto ${
                    isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'
                  }`}>
                    {loadingMessages ? (
                      <p className={`text-sm ${mutedText}`}>Loading messages...</p>
                    ) : messages.length > 0 ? (
                      <div className="space-y-3">
                        {messages.map((message) => {
                          const isMe = message.from_user_id === user?.id
                          return (
                            <div
                              key={message.id}
                              className={`rounded-lg border px-3 py-3 ${
                                isMe
                                  ? 'border-[#ff6b35]/40 bg-[#ff6b35]/10 ml-6'
                                  : isDark
                                    ? 'border-white/10 bg-[#151c2f]'
                                    : 'border-gray-200 bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-4">
                                <p className="text-sm font-medium">
                                  {isMe ? 'You' : 'Management'}
                                </p>
                                <p className={`text-[11px] ${mutedLabel}`}>{formatRelativeTime(message.created_at)}</p>
                              </div>
                              {message.subject && (
                                <p className={`text-xs mt-1 uppercase tracking-wide ${mutedLabel}`}>{message.subject}</p>
                              )}
                              <p className={`text-sm mt-2 whitespace-pre-wrap ${mutedText}`}>{message.body}</p>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className={`text-sm ${mutedText}`}>No messages yet. Start the conversation below.</p>
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    <textarea
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      placeholder={managerRecipientId ? 'Write a message to management...' : 'No recipient available yet.'}
                      className={`w-full min-h-[110px] px-3 py-3 rounded-lg border ${
                        isDark ? 'border-white/10 bg-white/5 text-white' : 'border-gray-200 bg-gray-50 text-gray-900'
                      }`}
                      disabled={!managerRecipientId || sendingMessage}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div />
                      <button
                        onClick={handleSendMessage}
                        disabled={!managerRecipientId || sendingMessage || !messageDraft.trim()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white text-sm font-medium disabled:opacity-60"
                      >
                        <Send className="w-4 h-4" />
                        {sendingMessage ? 'Sending...' : 'Send Message'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <p className={`text-xs ${mutedLabel}`}>
                    Last updated {selectedJob.completed_at ? formatRelativeTime(selectedJob.completed_at) : formatRelativeTime(selectedJob.assigned_at)}
                  </p>
                  <button
                    onClick={handleSaveDetails}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#f25a23] disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Updates'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
