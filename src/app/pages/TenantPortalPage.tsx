import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Calendar, CreditCard, FileText, LogOut, MessageSquare, Send, Upload, Wrench } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { useThemeStyles } from '../hooks/useThemeStyles'
import { formatCurrency } from '@/lib/utils/currencyHelpers'
import { formatDisplayDate, formatRelativeTime } from '@/lib/utils/dateHelpers'
import { supabase } from '@/lib/supabase'
import { getCurrentAccountId } from '@/lib/api/client'
import { useCreateMaintenanceRequest } from '@/lib/hooks/useMaintenance'
import { NewApplicationForm, type ApplicationFormData } from '../components/NewApplicationForm'
import { createApplication } from '@/lib/api/applications'
import { useLocation, useNavigate } from 'react-router-dom'
import { PortalBrand } from '../components/PortalBrand'
import { getTenantPortalMessages, sendTenantPortalMessage, type TenantPortalMessage } from '@/lib/api/tenantPortal'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'maintenance-attachments'

interface LeaseDetails {
  id: string
  lease_start: string
  lease_end: string
  rent: number
  auto_pay_enabled: boolean
  lease_document_url?: string | null
  signed_lease_url?: string | null
  unit?: {
    id: string
    unit_number: string
    bedrooms: number
    bathrooms: number
    sqft: number | null
    property_id: string
    properties?: {
      id: string
      name: string
      address1: string
      city: string
      state: string
      zip: string
    } | null
  } | null
  units?: LeaseDetails['unit'] | null
  property?: {
    id: string
    name: string
    address1: string
    city: string
    state: string
    zip: string
  } | null
}

interface TenantPayment {
  id: string
  amount: number
  due_date: string
  paid_at: string | null
  status: string
  payment_method: string | null
  payment_type: string
  receipt_url?: string | null
}

interface TenantMaintenance {
  id: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  requested_at: string
  scheduled_for: string | null
  completed_at: string | null
  images?: any
  maintenance_assignments?: Array<{
    id: string
    status: string
    before_images?: any
    after_images?: any
    vendor_profiles?: {
      business_name: string
      phone: string | null
      email: string | null
    } | null
  }>
}

interface PortalNotification {
  id: string
  title: string
  message: string
  is_read: boolean
  action_url?: string | null
  created_at: string
}
interface TenantPortalDocument {
  id: string
  source: 'owner' | 'tenant'
  sourceLabel: string
  uploadedAt: string
  title: string
  fileName: string
  url: string
}

const MAINTENANCE_CATEGORIES = [
  'hvac',
  'plumbing',
  'electrical',
  'appliance',
  'general',
  'pest',
  'roofing',
  'flooring',
  'security',
] as const

const MAINTENANCE_PRIORITIES = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Urgent' },
  { value: 'emergency', label: 'Emergency' },
]

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

export function TenantPortalPage() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { bg, text, border, cn } = useThemeStyles()
  const { create, loading: creatingRequest } = useCreateMaintenanceRequest()
  const navigate = useNavigate()
  const location = useLocation()

  const [lease, setLease] = useState<LeaseDetails | null>(null)
  const [payments, setPayments] = useState<TenantPayment[]>([])
  const [requests, setRequests] = useState<TenantMaintenance[]>([])
  const [notifications, setNotifications] = useState<PortalNotification[]>([])
  const [ownerDocuments, setOwnerDocuments] = useState<TenantPortalDocument[]>([])
  const [tenantDocuments, setTenantDocuments] = useState<TenantPortalDocument[]>([])
  const [portalMessages, setPortalMessages] = useState<TenantPortalMessage[]>([])
  const [portalMessagesLoading, setPortalMessagesLoading] = useState(false)
  const [portalMessageError, setPortalMessageError] = useState<string | null>(null)
  const [portalMessageDraft, setPortalMessageDraft] = useState('')
  const [portalMessageRecipientId, setPortalMessageRecipientId] = useState<string | null>(null)
  const [portalMessageSending, setPortalMessageSending] = useState(false)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null)
  const [showOnboardingForm, setShowOnboardingForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsUploading, setDocumentsUploading] = useState(false)
  const [documentsDragActive, setDocumentsDragActive] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('stripe')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const documentsFileInputRef = useRef<HTMLInputElement | null>(null)
  const [requestForm, setRequestForm] = useState({
    title: '',
    description: '',
    category: 'general',
    priority: 'normal',
    photos: [] as File[],
  })

  const nextPayment = useMemo(() => {
    const upcoming = payments.filter((payment) => !['paid', 'refunded'].includes(payment.status))
    if (upcoming.length === 0) {
      return null
    }
    return upcoming.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]
  }, [payments])
  const highlightedPaymentId = new URLSearchParams(location.search).get('payment')
  const highlightedRequestId = new URLSearchParams(location.search).get('request')

  const activeRequests = useMemo(() => {
    return requests.filter((request) => !['completed', 'closed', 'cancelled'].includes(request.status))
  }, [requests])
  const unreadPortalMessageCount = useMemo(() => {
    return portalMessages.filter((message) => message.to_user_id === user?.id && !message.is_read).length
  }, [portalMessages, user?.id])

  const requestStatusStep = (status: string) => {
    switch (status) {
      case 'submitted':
      case 'new':
        return 0
      case 'assigned':
      case 'scheduled':
        return 1
      case 'in_progress':
        return 2
      case 'completed':
      case 'closed':
        return 3
      default:
        return 0
    }
  }

  const loadTenantDocuments = async () => {
    if (!user) return

    setDocumentsLoading(true)
    setDocumentError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No active session')
      }

      const response = await fetch(`${API_BASE}/api/tenant-portal/documents`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'Failed to fetch tenant documents')
      }

      const payload = await response.json() as {
        ownerDocuments?: TenantPortalDocument[]
        tenantDocuments?: TenantPortalDocument[]
      }

      setOwnerDocuments(Array.isArray(payload.ownerDocuments) ? payload.ownerDocuments : [])
      setTenantDocuments(Array.isArray(payload.tenantDocuments) ? payload.tenantDocuments : [])
    } catch (err) {
      console.error('[TenantPortal] Failed to load documents:', err)
      setDocumentError(err instanceof Error ? err.message : 'Failed to load documents')
      setOwnerDocuments([])
      setTenantDocuments([])
    } finally {
      setDocumentsLoading(false)
    }
  }

  const loadTenantMessages = async () => {
    if (!user) return

    setPortalMessagesLoading(true)
    setPortalMessageError(null)

    try {
      const payload = await getTenantPortalMessages()
      setPortalMessages(payload.messages || [])
      setPortalMessageRecipientId(payload.defaultRecipientId || null)
    } catch (err) {
      console.error('[TenantPortal] Failed to load messages:', err)
      setPortalMessageError(err instanceof Error ? err.message : 'Failed to load messages')
      setPortalMessages([])
      setPortalMessageRecipientId(null)
    } finally {
      setPortalMessagesLoading(false)
    }
  }

  const handleDocumentUpload = async (files: File[]) => {
    if (!files.length) return

    setDocumentsUploading(true)
    setDocumentError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No active session')
      }

      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const signResponse = await fetch(`${API_BASE}/api/tenant-portal/documents/upload-sign`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
            }),
          })

          if (!signResponse.ok) {
            const signPayload = await signResponse.json().catch(() => null)
            throw new Error(signPayload?.error || 'Failed to create signed upload URL')
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

          if (uploadError) {
            throw uploadError
          }

          return {
            url: signed.publicUrl,
            fileName: file.name,
            contentType: file.type || null,
            size: file.size || null,
          }
        })
      )

      const shareResponse = await fetch(`${API_BASE}/api/tenant-portal/documents/share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: uploadedFiles,
        }),
      })

      if (!shareResponse.ok) {
        const sharePayload = await shareResponse.json().catch(() => null)
        throw new Error(sharePayload?.error || 'Failed to share uploaded documents')
      }

      await loadTenantDocuments()
    } catch (err) {
      console.error('[TenantPortal] Document upload failed:', err)
      setDocumentError(err instanceof Error ? err.message : 'Failed to upload document(s)')
    } finally {
      setDocumentsUploading(false)
      if (documentsFileInputRef.current) {
        documentsFileInputRef.current.value = ''
      }
    }
  }

  const handleDocumentDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDocumentsDragActive(false)
    const files = Array.from(event.dataTransfer.files || [])
    await handleDocumentUpload(files)
  }

  const handleDocumentFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    await handleDocumentUpload(files)
  }

  useEffect(() => {
    const loadPortalData = async () => {
      if (!user) return
      setLoading(true)
      setError(null)

      try {
        const currentAccountId = await getCurrentAccountId()
        if (!currentAccountId) {
          setError('Unable to load your account details.')
          setLoading(false)
          return
        }
        setAccountId(currentAccountId)

        const [leaseResult, paymentsResult, requestsResult, notificationsResult] = await Promise.all([
          supabase
            .from('leases')
            .select(`
              id,
              lease_start,
              lease_end,
              rent,
              auto_pay_enabled,
              lease_document_url,
              signed_lease_url,
              units (
                id,
                unit_number,
                bedrooms,
                bathrooms,
                sqft,
                property_id,
                properties (
                  id,
                  name,
                  address1,
                  city,
                  state,
                  zip
                )
              )
            `)
            .eq('tenant_user_id', user.id)
            .order('lease_start', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('payments')
            .select('id, amount, due_date, paid_at, status, payment_method, payment_type, receipt_url')
            .eq('tenant_user_id', user.id)
            .order('due_date', { ascending: false })
            .limit(12),
          supabase
            .from('maintenance_requests')
            .select(`
              id,
              title,
              description,
              category,
              priority,
              status,
              requested_at,
              scheduled_for,
              completed_at,
              images,
              maintenance_assignments (
                id,
                status,
                before_images,
                after_images,
                vendor_profiles (
                  business_name,
                  phone,
                  email
                )
              )
            `)
            .eq('account_id', currentAccountId)
            .order('requested_at', { ascending: false })
            .limit(10),
          supabase
            .from('notifications')
            .select('id, title, message, is_read, action_url, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10),
        ])

        if (leaseResult.error) {
          throw leaseResult.error
        }
        if (paymentsResult.error) {
          throw paymentsResult.error
        }
        if (requestsResult.error) {
          throw requestsResult.error
        }
        if (notificationsResult.error) {
          throw notificationsResult.error
        }

        const leaseData = leaseResult.data as LeaseDetails | null
        const unitData = leaseData?.units || null
        const propertyData = unitData?.properties || null
        const formattedLease = leaseData
          ? {
              ...leaseData,
              unit: unitData,
              property: propertyData,
            }
          : null

        setLease(formattedLease)
        setPayments((paymentsResult.data as TenantPayment[]) || [])
        setRequests((requestsResult.data as TenantMaintenance[]) || [])
        setNotifications((notificationsResult.data as PortalNotification[]) || [])
        setShowOnboardingForm(!formattedLease)
        await loadTenantDocuments()
        await loadTenantMessages()
      } catch (err) {
        console.error('[TenantPortal] Failed to load portal data:', err)
        setError('Unable to load your portal data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadPortalData()
  }, [user, reloadKey])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const paymentStatus = params.get('rent_payment')
    const sessionId = params.get('session_id')
    if (!paymentStatus) return

    let isCancelled = false

    const syncCheckoutStatus = async () => {
      if (paymentStatus === 'success') {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) {
            throw new Error('No active session')
          }

          if (sessionId) {
            const response = await fetch(
              `${API_BASE}/api/tenant-portal/rent-checkout-status?sessionId=${encodeURIComponent(sessionId)}`,
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              }
            )

            if (!response.ok) {
              const payload = await response.json().catch(() => null)
              throw new Error(payload?.error || 'Failed to sync Stripe payment status')
            }
          }

          if (!isCancelled) {
            setPaymentNotice('Stripe payment completed. Refreshing your payment history...')
            setReloadKey((prev) => prev + 1)
          }
        } catch (err) {
          console.error('[TenantPortal] Failed to reconcile Stripe checkout status:', err)
          if (!isCancelled) {
            setPaymentNotice('Stripe payment completed, but status sync is delayed. Please refresh in a moment.')
          }
        }
      } else if (paymentStatus === 'cancelled' && !isCancelled) {
        setPaymentNotice('Stripe checkout was cancelled. No charge was recorded.')
      }

      if (!isCancelled) {
        navigate(location.pathname, { replace: true })
      }
    }

    void syncCheckoutStatus()

    return () => {
      isCancelled = true
    }
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section')
    if (!section) return
    const element = document.getElementById(`tenant-section-${section}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.search, notifications, payments, requests])

  useEffect(() => {
    if (!highlightedRequestId) return
    const element = document.getElementById(`tenant-request-${highlightedRequestId}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedRequestId, requests])

  const markPortalNotificationRead = async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)

    if (error) {
      console.error('[TenantPortal] Failed to mark notification as read:', error)
      return
    }

    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      )
    )
  }

  const handleNotificationClick = async (notification: PortalNotification) => {
    if (!notification.is_read) {
      await markPortalNotificationRead(notification.id)
    }

    if (!notification.action_url) {
      return
    }

    if (/^https?:\/\//i.test(notification.action_url)) {
      window.open(notification.action_url, '_blank', 'noopener,noreferrer')
      return
    }

    navigate(notification.action_url)
  }

  useEffect(() => {
    if (!paymentAmount) {
      const defaultAmount = nextPayment?.amount || lease?.rent
      if (defaultAmount) {
        setPaymentAmount(String(defaultAmount))
      }
    }
  }, [nextPayment?.amount, lease?.rent, paymentAmount])

  const handlePaymentSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!lease || !paymentAmount) return

    setPaymentSubmitting(true)
    setError(null)

    try {
      const amount = Number(paymentAmount)
      if (Number.isNaN(amount) || amount <= 0) {
        throw new Error('Enter a valid payment amount')
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No active session')
      }

      const response = await fetch(`${API_BASE}/api/tenant-portal/rent-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseId: lease.id,
          amount,
          dueDate: nextPayment?.due_date || new Date().toISOString().split('T')[0],
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'Failed to start Stripe checkout')
      }

      const payload = await response.json()
      const checkoutUrl = payload?.url as string | undefined
      if (checkoutUrl) {
        window.location.href = checkoutUrl
        return
      }

      throw new Error('Stripe checkout URL was not returned by the server.')
    } catch (err) {
      console.error('[TenantPortal] Payment failed:', err)
      setError(err instanceof Error ? err.message : 'Unable to record payment.')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  const handleRequestSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!lease?.unit?.id || !lease?.property?.id) return

    setError(null)

    let imageUrls: string[] = []
    if (requestForm.photos.length > 0) {
      try {
        if (!user) {
          throw new Error('No user found')
        }
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          throw new Error('No active session')
        }
        imageUrls = await Promise.all(
          requestForm.photos.map(async (file) => {
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
            if (uploadError) {
              throw uploadError
            }

            return signed.publicUrl
          })
        )
      } catch (uploadError) {
        console.error('[TenantPortal] Photo upload failed:', uploadError)
        setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload photos. Please try again.')
        return
      }
    }

    const result = await create({
      unit_id: lease.unit.id,
      property_id: lease.property.id,
      title: requestForm.title.trim(),
      description: requestForm.description.trim(),
      category: requestForm.category,
      priority: requestForm.priority as 'low' | 'normal' | 'high' | 'emergency',
      images: imageUrls,
    })

    if (!result.success) {
      setError(result.error?.message || 'Failed to create maintenance request.')
      return
    }

    setRequestForm({
      title: '',
      description: '',
      category: 'general',
      priority: 'normal',
      photos: [],
    })

    const { data: requestsData } = await supabase
      .from('maintenance_requests')
      .select(`
        id,
        title,
        description,
        category,
        priority,
        status,
        requested_at,
        scheduled_for,
        completed_at,
        images,
        maintenance_assignments (
          id,
          status,
          before_images,
          after_images,
          vendor_profiles (
            business_name,
            phone,
            email
          )
        )
      `)
      .order('requested_at', { ascending: false })
      .limit(10)
    setRequests((requestsData as TenantMaintenance[]) || [])
  }

  const handleSignOut = async () => {
    await signOut()
  }

  const handlePortalMessageSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!portalMessageDraft.trim()) {
      return
    }

    setPortalMessageSending(true)
    setPortalMessageError(null)

    try {
      const result = await sendTenantPortalMessage({
        body: portalMessageDraft.trim(),
        recipientId: portalMessageRecipientId,
      })

      if (result?.defaultRecipientId) {
        setPortalMessageRecipientId(result.defaultRecipientId)
      }
      setPortalMessageDraft('')
      await loadTenantMessages()
    } catch (err) {
      console.error('[TenantPortal] Failed to send message:', err)
      setPortalMessageError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setPortalMessageSending(false)
    }
  }

  return (
    <div className={cn('min-h-screen', bg.primary)}>
      <header className={cn('border-b', border.default, 'px-6 py-4')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <PortalBrand titleClassName={text.primary} />
            <div>
              <p className={cn('text-sm sm:text-base font-semibold uppercase tracking-[0.24em]', text.muted)}>Tenant Portal</p>
              <p className={cn('text-lg sm:text-2xl font-semibold leading-tight', text.secondary)}>Your Home Hub</p>
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
            <p className={text.muted}>Loading your portal...</p>
          </div>
        ) : (
          <>
            {error && (
              <div className={cn('rounded-xl border p-4', border.default, bg.secondary)}>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {paymentNotice && (
              <div className={cn('rounded-xl border p-4', border.default, bg.secondary)}>
                <p className={cn('text-sm', text.secondary)}>{paymentNotice}</p>
              </div>
            )}

            <section className="grid gap-6 lg:grid-cols-3">
              <div className={cn('rounded-xl border p-5', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="w-5 h-5 text-[#ff6b35]" />
                  <h2 className={cn('text-lg font-semibold', text.primary)}>Rent Due This Month</h2>
                </div>
                <p className={cn('text-3xl font-semibold', text.primary)}>
                  {formatCurrency(nextPayment?.amount || lease?.rent || 0)}
                </p>
                <p className={cn('text-sm mt-2', text.secondary)}>
                  {nextPayment?.due_date ? `Due ${formatDisplayDate(nextPayment.due_date)}` : 'No upcoming rent due'}
                </p>
                <p className={cn('text-xs mt-1', text.muted)}>
                  Status: {nextPayment?.status || '—'}
                </p>
              </div>

              <div className={cn('rounded-xl border p-5', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-4">
                  <Wrench className="w-5 h-5 text-[#3b82f6]" />
                  <h2 className={cn('text-lg font-semibold', text.primary)}>Open Maintenance Requests</h2>
                </div>
                <p className={cn('text-3xl font-semibold', text.primary)}>{activeRequests.length}</p>
                <p className={cn('text-sm mt-2', text.secondary)}>
                  {activeRequests.length > 0 ? 'In progress or awaiting action' : 'No active requests'}
                </p>
              </div>

              <div className={cn('rounded-xl border p-5', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-4">
                  <Bell className="w-5 h-5 text-emerald-400" />
                  <h2 className={cn('text-lg font-semibold', text.primary)}>Notifications</h2>
                </div>
                <p className={cn('text-3xl font-semibold', text.primary)}>
                  {notifications.filter((note) => !note.is_read).length + unreadPortalMessageCount}
                </p>
                <p className={cn('text-sm mt-2', text.secondary)}>Unread alerts and messages</p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div id="tenant-section-payments" className={cn('rounded-xl border p-6', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-4">
                  <CreditCard className="w-5 h-5 text-[#ff6b35]" />
                  <h2 className={cn('text-lg font-semibold', text.primary)}>Rent & Payments</h2>
                </div>

                <form onSubmit={handlePaymentSubmit} className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
                  <div>
                    <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Payment Amount</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      className={cn('w-full mt-2 px-3 py-2 rounded-lg border', border.default, bg.secondary, text.primary)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                      className={cn('px-3 py-2 rounded-lg border text-sm', border.default, bg.secondary, text.primary)}
                    >
                      <option value="stripe">Card</option>
                    </select>
                    <button
                      type="submit"
                      disabled={paymentSubmitting}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white text-sm font-medium disabled:opacity-60"
                    >
                      {paymentSubmitting ? 'Submitting...' : 'Pay with Stripe'}
                    </button>
                  </div>
                </form>
              </div>

              <div className={cn('rounded-xl border p-6', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <h2 className={cn('text-lg font-semibold', text.primary)}>Documents</h2>
                </div>

                <div
                  className={cn(
                    'rounded-lg border border-dashed p-4 transition',
                    border.default,
                    bg.secondary,
                    documentsDragActive && 'border-[#ff6b35] bg-[#ff6b35]/10'
                  )}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDocumentsDragActive(true)
                  }}
                  onDragLeave={() => setDocumentsDragActive(false)}
                  onDrop={handleDocumentDrop}
                >
                  <p className={cn('text-sm', text.secondary)}>Drop files here, or upload from your device.</p>
                  <button
                    type="button"
                    onClick={() => documentsFileInputRef.current?.click()}
                    disabled={documentsUploading}
                    className={cn(
                      'mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                      border.default,
                      documentsUploading ? 'opacity-60 cursor-not-allowed' : ''
                    )}
                  >
                    <Upload className="w-4 h-4" />
                    {documentsUploading ? 'Uploading...' : 'Upload Files'}
                  </button>
                  <input
                    ref={documentsFileInputRef}
                    type="file"
                    multiple
                    onChange={handleDocumentFileSelection}
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt"
                  />
                  <p className={cn('text-[11px] mt-2', text.muted)}>Accepted: PDF, image, DOC, DOCX, TXT</p>
                </div>

                {documentError && (
                  <p className={cn('text-xs mt-3 text-rose-400')}>{documentError}</p>
                )}

                <div className="mt-5 space-y-4">
                  <div>
                    <p className={cn('text-xs uppercase tracking-wide mb-2', text.muted)}>Shared by Property Owner</p>
                    {documentsLoading ? (
                      <p className={cn('text-sm', text.muted)}>Loading documents...</p>
                    ) : ownerDocuments.length > 0 ? (
                      <div className="space-y-2">
                        {ownerDocuments.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.url}
                            className={cn('block text-sm underline', text.secondary)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {doc.title}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className={cn('text-sm', text.muted)}>No files shared by the property owner yet.</p>
                    )}
                  </div>

                  <div>
                    <p className={cn('text-xs uppercase tracking-wide mb-2', text.muted)}>Your Uploads</p>
                    {tenantDocuments.length > 0 ? (
                      <div className="space-y-2">
                        {tenantDocuments.map((doc) => (
                          <div key={doc.id} className={cn('text-sm', text.secondary)}>
                            <a href={doc.url} className="underline" target="_blank" rel="noreferrer">
                              {doc.title}
                            </a>
                            <span className={cn('ml-2 text-xs', text.muted)}>
                              {formatDisplayDate(doc.uploadedAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={cn('text-sm', text.muted)}>You have not uploaded any documents yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div id="tenant-section-maintenance" className={cn('rounded-xl border p-6', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-4">
                  <Wrench className="w-5 h-5 text-[#3b82f6]" />
                  <h2 className={cn('text-lg font-semibold', text.primary)}>Maintenance</h2>
                </div>
                <div className="space-y-3">
                  {requests.map((request) => {
                    const assignment = request.maintenance_assignments?.[0]
                    const vendorName = assignment?.vendor_profiles?.business_name
                    const stepIndex = requestStatusStep(request.status)
                    const statusLabel = request.status === 'submitted' ? 'new' : request.status.replace('_', ' ')
                    const issuePhotos = normalizeImages(request.images)
                    const beforePhotos = normalizeImages(assignment?.before_images)
                    const afterPhotos = normalizeImages(assignment?.after_images)
                    return (
                      <div
                        key={request.id}
                        id={`tenant-request-${request.id}`}
                        className={cn(
                          'rounded-lg border p-4',
                          highlightedRequestId === request.id ? 'border-[#ff6b35]' : border.default,
                          bg.secondary
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={cn('text-sm font-semibold', text.primary)}>{request.title}</p>
                            <p className={cn('text-xs', text.muted)}>{request.category} • {request.priority}</p>
                          </div>
                          <span className={cn('text-xs px-2 py-1 rounded-full border', border.default, text.secondary)}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          {['New', 'Assigned', 'In progress', 'Completed'].map((label, index) => (
                            <span
                              key={label}
                              className={cn(
                                'px-2 py-1 rounded-full border',
                                border.default,
                                index <= stepIndex ? 'bg-emerald-500/15 text-emerald-200' : text.inactive
                              )}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                        <p className={cn('text-xs mt-2', text.muted)}>
                          Requested {formatDisplayDate(request.requested_at)} {vendorName ? `• Vendor: ${vendorName}` : ''}
                        </p>
                        {(issuePhotos.length > 0 || beforePhotos.length > 0 || afterPhotos.length > 0) && (
                          <div className="mt-3 space-y-3">
                            {issuePhotos.length > 0 && (
                              <div>
                                <p className={cn('text-[11px] uppercase tracking-wide', text.muted)}>Issue Photos</p>
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                  {issuePhotos.map((src, index) => (
                                    <a key={`${request.id}-issue-${index}`} href={src} target="_blank" rel="noreferrer" title="Open full image">
                                      <img
                                        src={src}
                                        alt={`Issue photo ${index + 1}`}
                                        className={cn('h-16 w-full rounded-md object-cover border', border.default)}
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {beforePhotos.length > 0 && (
                              <div>
                                <p className={cn('text-[11px] uppercase tracking-wide', text.muted)}>Vendor Before Photos</p>
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                  {beforePhotos.map((src, index) => (
                                    <a key={`${request.id}-before-${index}`} href={src} target="_blank" rel="noreferrer" title="Open full image">
                                      <img
                                        src={src}
                                        alt={`Before photo ${index + 1}`}
                                        className={cn('h-16 w-full rounded-md object-cover border', border.default)}
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {afterPhotos.length > 0 && (
                              <div>
                                <p className={cn('text-[11px] uppercase tracking-wide', text.muted)}>Vendor After Photos</p>
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                  {afterPhotos.map((src, index) => (
                                    <a key={`${request.id}-after-${index}`} href={src} target="_blank" rel="noreferrer" title="Open full image">
                                      <img
                                        src={src}
                                        alt={`After photo ${index + 1}`}
                                        className={cn('h-16 w-full rounded-md object-cover border', border.default)}
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {requests.length === 0 && (
                    <p className={cn('text-sm', text.muted)}>No maintenance requests yet.</p>
                  )}
                </div>
              </div>

              <div className={cn('rounded-xl border p-6', border.default, bg.card)}>
                <h3 className={cn('text-lg font-semibold mb-4', text.primary)}>New Maintenance Request</h3>
                {lease?.unit ? (
                  <form onSubmit={handleRequestSubmit} className="space-y-3">
                    <div>
                      <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Title</label>
                      <input
                        value={requestForm.title}
                        onChange={(event) => setRequestForm((prev) => ({ ...prev, title: event.target.value }))}
                        className={cn('w-full mt-2 px-3 py-2 rounded-lg border', border.default, bg.secondary, text.primary)}
                        placeholder="Leaking faucet"
                        required
                      />
                    </div>
                    <div>
                      <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Description</label>
                      <textarea
                        value={requestForm.description}
                        onChange={(event) => setRequestForm((prev) => ({ ...prev, description: event.target.value }))}
                        className={cn('w-full mt-2 px-3 py-2 rounded-lg border min-h-[100px]', border.default, bg.secondary, text.primary)}
                        placeholder="Provide details and access instructions..."
                        required
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Category</label>
                        <select
                          value={requestForm.category}
                          onChange={(event) => setRequestForm((prev) => ({ ...prev, category: event.target.value }))}
                          className={cn('w-full mt-2 px-3 py-2 rounded-lg border', border.default, bg.secondary, text.primary)}
                        >
                          {MAINTENANCE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Priority</label>
                        <select
                          value={requestForm.priority}
                          onChange={(event) => setRequestForm((prev) => ({ ...prev, priority: event.target.value }))}
                          className={cn('w-full mt-2 px-3 py-2 rounded-lg border', border.default, bg.secondary, text.primary)}
                        >
                          {MAINTENANCE_PRIORITIES.map((priority) => (
                            <option key={priority.value} value={priority.value}>
                              {priority.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={cn('text-xs uppercase tracking-wide', text.muted)}>Upload Photos</label>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(event) =>
                          setRequestForm((prev) => ({ ...prev, photos: Array.from(event.target.files || []) }))
                        }
                        className={cn('w-full mt-2 px-3 py-2 rounded-lg border', border.default, bg.secondary, text.primary)}
                      />
                      {requestForm.photos.length > 0 && (
                        <p className={cn('text-xs mt-2', text.muted)}>
                          {requestForm.photos.length} photo{requestForm.photos.length === 1 ? '' : 's'} selected
                        </p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={creatingRequest}
                      className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] text-white text-sm font-medium disabled:opacity-60"
                    >
                      {creatingRequest ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </form>
                ) : (
                  <p className={cn('text-sm', text.muted)}>You do not have an active lease yet.</p>
                )}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <div id="tenant-section-messages" className={cn('rounded-xl border p-6', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-4">
                  <MessageSquare className="w-5 h-5 text-sky-400" />
                  <div>
                    <h2 className={cn('text-lg font-semibold', text.primary)}>Messages</h2>
                    <p className={cn('text-xs', text.muted)}>Chat with your property manager inside the portal.</p>
                  </div>
                </div>

                <div className={cn('rounded-lg border p-4 min-h-[280px] max-h-[360px] overflow-y-auto', border.default, bg.secondary)}>
                  {portalMessagesLoading ? (
                    <p className={cn('text-sm', text.muted)}>Loading messages...</p>
                  ) : portalMessages.length > 0 ? (
                    <div className="space-y-3">
                      {portalMessages.map((message) => {
                        const isMine = message.from_user_id === user?.id
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              'rounded-lg border px-3 py-3',
                              isMine ? 'border-[#ff6b35]/40 bg-[#ff6b35]/10 ml-6' : border.default,
                              !isMine && bg.card
                            )}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <p className={cn('text-sm font-medium', text.primary)}>
                                {isMine ? 'You' : 'Management'}
                              </p>
                              <p className={cn('text-[11px]', text.muted)}>{formatRelativeTime(message.created_at)}</p>
                            </div>
                            {message.subject && (
                              <p className={cn('text-xs mt-1 uppercase tracking-wide', text.muted)}>{message.subject}</p>
                            )}
                            <p className={cn('text-sm mt-2 whitespace-pre-wrap', text.secondary)}>{message.body}</p>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className={cn('text-sm', text.muted)}>No messages yet. Start the conversation below.</p>
                  )}
                </div>

                <form onSubmit={handlePortalMessageSubmit} className="mt-4 space-y-3">
                  <textarea
                    value={portalMessageDraft}
                    onChange={(event) => setPortalMessageDraft(event.target.value)}
                    placeholder={portalMessageRecipientId ? 'Write a message to management...' : 'No recipient available yet.'}
                    className={cn('w-full min-h-[110px] px-3 py-3 rounded-lg border', border.default, bg.secondary, text.primary)}
                    disabled={!portalMessageRecipientId || portalMessageSending}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      {portalMessageError && (
                        <p className="text-xs text-rose-400">{portalMessageError}</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={!portalMessageRecipientId || portalMessageSending || !portalMessageDraft.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white text-sm font-medium disabled:opacity-60"
                    >
                      <Send className="w-4 h-4" />
                      {portalMessageSending ? 'Sending...' : 'Send Message'}
                    </button>
                  </div>
                </form>
              </div>

              <div id="tenant-section-notifications" className={cn('rounded-xl border p-6', border.default, bg.card)}>
                <div className="flex items-center gap-3 mb-4">
                  <Bell className="w-5 h-5 text-emerald-400" />
                  <h2 className={cn('text-lg font-semibold', text.primary)}>Notifications</h2>
                </div>
                <div className="space-y-3">
                  {notifications.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => void handleNotificationClick(note)}
                      className={cn(
                        'w-full text-left rounded-lg border p-3 transition',
                        note.is_read ? border.default : 'border-[#ff6b35]/40',
                        bg.secondary
                      )}
                    >
                      <p className={cn('text-sm font-medium', text.primary)}>{note.title}</p>
                      <p className={cn('text-xs mt-1', text.muted)}>{note.message}</p>
                      <p className={cn('text-xs mt-1', text.inactive)}>Received {formatDisplayDate(note.created_at)}</p>
                    </button>
                  ))}
                  {notifications.length === 0 && (
                    <p className={cn('text-sm', text.muted)}>No notifications yet.</p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      {showOnboardingForm && (
        <NewApplicationForm
          onClose={() => setShowOnboardingForm(false)}
          onSubmit={async (data: ApplicationFormData) => {
            await createApplication(data)
            setShowOnboardingForm(false)
            await refreshProfile()
            navigate('/tenant/pending', { replace: true })
          }}
          initialValues={{
            firstName: profile?.full_name?.split(' ')[0] || '',
            lastName: profile?.full_name?.split(' ').slice(1).join(' ') || '',
            email: user?.email || '',
            phone: profile?.phone || '',
          }}
        />
      )}
    </div>
  )
}
