import { useNavigate } from 'react-router-dom'
import { Building, Check, TrendingUp, Users, Wrench, Shield, Zap, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useThemeContext } from '../context/ThemeContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { SupabaseConfigBanner } from '../components/SupabaseConfigBanner'

export function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeContext()
  const isDark = theme === 'dark'

  const features = [
    {
      icon: Users,
      title: 'AI Tenant Screening',
      description: 'Advanced AI analyzes credit, income, and rental history with 97.8% accuracy'
    },
    {
      icon: Wrench,
      title: 'Smart Maintenance',
      description: 'Automated tracking, vendor management, and predictive maintenance alerts'
    },
    {
      icon: TrendingUp,
      title: 'Automated Rent Collection',
      description: 'Seamless payment processing with automated reminders and late fee management'
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Comprehensive dashboards with occupancy rates, revenue tracking, and insights'
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level encryption and compliance with industry standards'
    },
    {
      icon: Zap,
      title: '24/7 Automation',
      description: 'Round-the-clock monitoring and automated workflows for efficiency'
    }
  ]

  const plans = [
    {
      name: 'Basic',
      price: 'Free',
      description: 'Perfect for getting started',
      features: [
        'Up to 10 properties',
        'Basic tenant screening',
        'Maintenance tracking',
        'Email support'
      ]
    },
    {
      name: 'Pro',
      price: '$10',
      period: '/month',
      description: 'For growing property managers',
      features: [
        'Up to 50 properties',
        'AI tenant screening',
        'Advanced analytics',
        'Automated rent collection',
        'Priority support'
      ],
      popular: true
    },
    {
      name: 'Premium',
      price: '$20',
      period: '/month',
      description: 'For professionals',
      features: [
        'Unlimited properties',
        'Full AI automation',
        'Custom reports',
        'API access',
        'Dedicated account manager',
        '24/7 phone support'
      ]
    }
  ]

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0e1a] text-white' : 'bg-white text-gray-900'}`}>
      <div className="max-w-7xl mx-auto px-8 pt-6">
        <SupabaseConfigBanner />
      </div>
      {/* Header */}
      <header className={`sticky top-0 z-50 border-b ${isDark ? 'border-white/10 bg-[#0f1523]/95' : 'border-gray-200 bg-white/95'} backdrop-blur-xl`}>
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
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

      {/* Hero Section */}
      <section className={`max-w-7xl mx-auto px-8 py-20 text-center relative isolate overflow-hidden rounded-3xl ${isDark ? 'bg-[#0a0e1a]' : 'bg-gradient-to-br from-gray-50 to-gray-100'}`}>
        <div className="absolute inset-0 z-0 pointer-events-none">
          <video
            className="h-full w-full object-cover brightness-125"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
          >
            <source src="/13761467-uhd_3840_2160_30fps.mp4" type="video/mp4" />
          </video>
          <div className={`absolute inset-0 ${isDark ? 'bg-[#0a0e1a]/30' : 'bg-white/30'}`} />
          <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-b from-[#0a0e1a]/35 via-[#0a0e1a]/20 to-[#0a0e1a]/45' : 'bg-gradient-to-b from-white/35 via-white/20 to-white/45'}`} />
        </div>

        <div className="relative z-10">
          <div className="inline-block mb-6 px-4 py-2 bg-gradient-to-r from-[#ff6b35]/20 to-[#f7931e]/20 rounded-full border border-[#ff6b35]/30">
            <span className="text-[#ff6b35] font-medium text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              AI-Powered Property Management
            </span>
          </div>
          <h2 className={`text-6xl mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`} style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            AUTOMATE YOUR PROPERTY
            <br />
            MANAGEMENT WORKFLOW
          </h2>
          <p className={`text-xl max-w-3xl mx-auto mb-8 ${isDark ? 'text-white/80' : 'text-gray-700'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            From tenant screening to rent collection, maintenance tracking to analytics —
            manage everything in one intelligent platform.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => navigate(user ? '/app/dashboard' : '/auth')}
              className="px-8 py-4 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium text-lg hover:scale-105 transition-transform"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {user ? 'Go to Dashboard' : 'Start Free Trial'}
            </button>
            {!user && (
              <button
                onClick={() => {
                  const pricingSection = document.getElementById('pricing')
                  pricingSection?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="px-8 py-4 rounded-lg font-medium text-lg transition-colors bg-white/10 hover:bg-white/20 text-white"
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                View Pricing
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className={`py-20 ${isDark ? 'bg-[#0f1523]/50' : 'bg-gray-50'}`}>
        <div className="max-w-7xl mx-auto px-8">
          <div className="text-center mb-16">
            <h3 className="text-4xl mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              EVERYTHING YOU NEED
            </h3>
            <p className={`text-lg ${isDark ? 'text-white/70' : 'text-gray-600'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Powerful features to streamline your property management
            </p>
          </div>
          <div className="grid grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div
                  key={index}
                  className={`p-6 rounded-xl ${isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'} border hover:border-[#ff6b35]/50 transition-all group`}
                >
                  <div className="mb-4 inline-flex p-3 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-lg group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {feature.title}
                  </h4>
                  <p className={`${isDark ? 'text-white/70' : 'text-gray-600'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    {feature.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20">
        <div className="max-w-7xl mx-auto px-8">
          <div className="text-center mb-16">
            <h3 className="text-4xl mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              CHOOSE YOUR PLAN
            </h3>
            <p className={`text-lg ${isDark ? 'text-white/70' : 'text-gray-600'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Start free, upgrade as you grow
            </p>
          </div>
          <div className="grid grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`p-8 rounded-xl ${isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'} border ${
                  plan.popular ? 'ring-2 ring-[#ff6b35] scale-105' : ''
                } relative transition-all hover:scale-105`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-full text-sm font-medium">
                    MOST POPULAR
                  </div>
                )}
                <h4 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {plan.name}
                </h4>
                <div className="mb-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className={`text-lg ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{plan.period}</span>
                  )}
                </div>
                <p className={`text-sm mb-6 ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {plan.description}
                </p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-[#ff6b35] flex-shrink-0 mt-0.5" />
                      <span className="text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate(user ? '/app/dashboard' : '/auth')}
                  className={`w-full py-3 rounded-lg font-medium transition-all ${
                    plan.popular
                      ? 'bg-gradient-to-r from-[#ff6b35] to-[#f7931e] hover:scale-105'
                      : isDark
                      ? 'bg-white/5 hover:bg-white/10'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  {plan.price === 'Free' ? 'Get Started' : 'Start Free Trial'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`border-t ${isDark ? 'border-white/10 bg-[#0f1523]' : 'border-gray-200 bg-gray-50'} py-12`}>
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-[#ff6b35] to-[#f7931e] p-2 rounded-lg">
                <Building className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  PROPMASTER
                </p>
                <p className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                  © 2024 All rights reserved
                </p>
              </div>
            </div>
            <p className={`text-sm ${isDark ? 'text-white/40' : 'text-gray-400'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Built with AI-powered automation
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
