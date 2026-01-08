import { useState } from 'react'
import { Check, Zap, ArrowRight, CreditCard, Calendar, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'
import { createCheckoutSession, createPortalSession } from '../../lib/api/subscription'

export function BillingPage() {
  const { user, profile } = useAuth()
  const { theme } = useThemeContext()
  const isDark = theme === 'dark'
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentPlan = profile?.plan || 'basic'
  const subscriptionStatus = profile?.subscription_status

  const plans = [
    {
      id: 'basic',
      name: 'BASIC',
      price: 'FREE',
      description: 'Up to 3 units',
      features: [
        'Up to 3 units',
        'Tenant portal',
        'Basic maintenance requests',
        'Basic rent collection',
        'Property management'
      ],
      isCurrent: currentPlan === 'basic'
    },
    {
      id: 'pro',
      name: 'PRO',
      price: '$10',
      period: '/MO',
      badge: 'Recommended',
      description: 'Up to 100 units',
      features: [
        'Up to 100 units',
        'Everything in Basic',
        'Tenant screening',
        'Maintenance routing',
        'Marketing tools',
        'Standard reporting',
        'Lease renewals',
        'Communication hub'
      ],
      isCurrent: currentPlan === 'pro',
      highlighted: true
    },
    {
      id: 'premium',
      name: 'PREMIUM',
      price: '$20',
      period: '/MO',
      description: 'Up to unlimited units',
      features: [
        'Unlimited units',
        'Everything in Pro',
        'AI risk scoring',
        'Integrated accounting',
        'HVAC filter program',
        'Electronic showings',
        '24/7 emergency support',
        'Advanced analytics',
        'Advanced exports',
        'Custom reports',
        'API access'
      ],
      isCurrent: currentPlan === 'premium'
    }
  ]

  const handleUpgrade = async (planId: string) => {
    if (!user || !profile) return

    setLoading(planId)
    setError(null)

    try {
      const { url } = await createCheckoutSession({
        accountId: profile.id,
        plan: planId as 'pro' | 'premium',
        userId: user.id
      })

      // Redirect to Stripe Checkout
      window.location.href = url
    } catch (err: any) {
      setError(err.message || 'Failed to start checkout')
      setLoading(null)
    }
  }

  const handleManageSubscription = async () => {
    if (!profile) return

    setLoading('portal')
    setError(null)

    try {
      const { url } = await createPortalSession({
        accountId: profile.id
      })

      // Redirect to Stripe Customer Portal
      window.location.href = url
    } catch (err: any) {
      setError(err.message || 'Failed to open billing portal')
      setLoading(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          BILLING & SUBSCRIPTION
        </h2>
        <p className={`${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
          Manage your subscription and billing information
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className={`p-4 rounded-lg border ${isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'} flex items-start gap-3`}>
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`font-medium ${isDark ? 'text-red-300' : 'text-red-800'}`}>
              Error
            </p>
            <p className={`text-sm ${isDark ? 'text-red-400' : 'text-red-700'}`}>
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Current Plan Status */}
      {currentPlan !== 'basic' && (
        <div className={`p-6 rounded-xl border ${isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <CreditCard className="w-6 h-6 text-[#ff6b35]" />
                <h3 className="text-xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {currentPlan.toUpperCase()} PLAN
                </h3>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span className={isDark ? 'text-white/70' : 'text-gray-600'}>
                    Monthly billing
                  </span>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  subscriptionStatus === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : subscriptionStatus === 'past_due'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {subscriptionStatus || 'Active'}
                </div>
              </div>
            </div>
            <button
              onClick={handleManageSubscription}
              disabled={loading === 'portal'}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                isDark
                  ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                  : 'bg-gray-100 hover:bg-gray-200 border border-gray-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {loading === 'portal' ? 'Loading...' : 'Manage Subscription'}
            </button>
          </div>
        </div>
      )}

      {/* Available Plans */}
      <div>
        <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          AVAILABLE PLANS
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl p-6 ${
                plan.highlighted
                  ? 'border-2 border-blue-500 shadow-xl shadow-blue-500/10'
                  : plan.isCurrent
                  ? isDark
                    ? 'border-2 border-gray-500 bg-[#1a1f35]'
                    : 'border-2 border-gray-400 bg-gray-50'
                  : isDark
                  ? 'border border-white/10 bg-[#1a1f35]'
                  : 'border border-gray-200 bg-white'
              }`}
            >
              {/* Badge */}
              {plan.badge && !plan.isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                    {plan.badge}
                  </div>
                </div>
              )}

              {plan.isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="bg-gray-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                    Current Plan
                  </div>
                </div>
              )}

              {/* Plan Header */}
              <div className="mb-4">
                <h4
                  className={`text-xs font-bold mb-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  {plan.name}
                </h4>
                <div className="mb-1">
                  <span className="text-4xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  {plan.description}
                </p>
              </div>

              {/* Features */}
              <div className="space-y-2 mb-6">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              {plan.isCurrent ? (
                <button
                  disabled
                  className={`w-full py-2 rounded-lg font-medium ${
                    isDark
                      ? 'bg-white/5 border border-white/10 text-white/50'
                      : 'bg-gray-200 border border-gray-300 text-gray-500'
                  } cursor-not-allowed text-sm`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  Current Plan
                </button>
              ) : plan.id === 'basic' ? (
                <button
                  onClick={handleManageSubscription}
                  disabled={loading !== null}
                  className={`w-full py-2 rounded-lg font-medium transition-colors text-sm ${
                    isDark
                      ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                      : 'bg-gray-100 hover:bg-gray-200 border border-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  Downgrade to Basic
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={loading !== null}
                  className={`w-full py-2 rounded-lg font-medium transition-all text-sm flex items-center justify-center gap-2 ${
                    plan.highlighted
                      ? 'bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white hover:scale-105'
                      : isDark
                      ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  {loading === plan.id ? (
                    'Loading...'
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Upgrade Now
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Billing Info */}
      <div className={`p-6 rounded-xl border ${isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-gray-50 border-gray-200'}`}>
        <h3 className="text-lg font-bold mb-3" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          BILLING INFORMATION
        </h3>
        <p className={`text-sm mb-4 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
          All billing is securely processed through Stripe. Click "Manage Subscription" to update your payment method,
          view invoices, or cancel your subscription.
        </p>
        <div className="flex items-center gap-2">
          <div className="w-8 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">
            S
          </div>
          <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
            Secured by Stripe
          </span>
        </div>
      </div>
    </div>
  )
}
