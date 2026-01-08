import { useNavigate } from 'react-router-dom'
import { Building, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'
import { ThemeToggle } from '../components/ThemeToggle'

export function PricingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeContext()
  const isDark = theme === 'dark'

  const plans = [
    {
      id: 'basic',
      name: 'BASIC',
      price: 'Free',
      description: 'Perfect for getting started',
      features: [
        'Up to 3 units',
        'Tenant portal',
        'Basic maintenance requests',
        'Basic rent collection',
        'Property management'
      ],
      cta: 'Get Started',
      highlighted: false
    },
    {
      id: 'pro',
      name: 'PRO',
      price: '$10',
      period: '/month',
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
      cta: 'Upgrade Now',
      highlighted: true
    },
    {
      id: 'premium',
      name: 'PREMIUM',
      price: '$20',
      period: '/month',
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
      cta: 'Start Free Trial',
      highlighted: false
    }
  ]

  const handlePlanSelect = (planId: string) => {
    if (user) {
      // If logged in, go to billing page
      navigate('/app/settings')
    } else {
      // If not logged in, go to auth page
      navigate('/auth')
    }
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0e1a] text-white' : 'bg-white text-gray-900'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 border-b ${isDark ? 'border-white/10 bg-[#0f1523]/95' : 'border-gray-200 bg-white/95'} backdrop-blur-xl`}>
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/')}>
              <div className="bg-gradient-to-br from-[#ff6b35] to-[#f7931e] p-3 rounded-lg">
                <Building className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl tracking-wide" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  PROPMASTER
                </h1>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'} -mt-1`}>
                  Property Management Automation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              {user ? (
                <button
                  onClick={() => navigate('/app/dashboard')}
                  className="px-6 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  Go to Dashboard
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/auth')}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-100'}`}
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => navigate('/auth')}
                    className="px-6 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                  >
                    Get Started
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Pricing Section */}
      <section className="max-w-7xl mx-auto px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-5xl mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            AVAILABLE PLANS
          </h2>
          <p className={`text-xl ${isDark ? 'text-white/70' : 'text-gray-600'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Choose the perfect plan for your property management needs
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-8 ${
                plan.highlighted
                  ? 'border-2 border-blue-500 shadow-2xl shadow-blue-500/20'
                  : isDark
                  ? 'border border-white/10 bg-[#1a1f35]'
                  : 'border border-gray-200 bg-white shadow-lg'
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                    {plan.badge}
                  </div>
                </div>
              )}

              {/* Plan Header */}
              <div className="text-center mb-6">
                <h3
                  className={`text-sm font-bold mb-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  {plan.name}
                </h3>
                <div className="mb-2">
                  <span className="text-5xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-lg ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  {plan.description}
                </p>
              </div>

              {/* Features */}
              <div className="space-y-3 mb-8">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handlePlanSelect(plan.id)}
                className={`w-full py-3 rounded-lg font-semibold transition-all ${
                  plan.highlighted
                    ? 'bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white hover:scale-105'
                    : plan.id === 'basic'
                    ? isDark
                      ? 'bg-white/5 hover:bg-white/10 border border-white/10'
                      : 'bg-gray-100 hover:bg-gray-200 border border-gray-200'
                    : isDark
                    ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                {plan.id === 'basic' && user ? 'Current Plan' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ or Additional Info */}
        <div className="mt-20 text-center">
          <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            All plans include free updates and email support.{' '}
            <button
              onClick={() => navigate('/')}
              className="text-[#ff6b35] hover:underline"
            >
              Learn more
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}
