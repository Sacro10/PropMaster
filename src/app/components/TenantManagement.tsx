import { Search, UserSearch, CircleCheck, TrendingUp, ListFilter } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate, LockedFeatureCard } from './UpgradeCTA';

export function TenantManagement() {
  const { isDark, bg, text, border } = useThemeStyles();

  // Feature checks for plan gating
  const tenantScreening = useHasFeature('tenant_screening');
  const aiRiskScoring = useHasFeature('ai_risk_scoring');

  const tenants = [
    {
      name: 'Sarah Johnson',
      unit: 'Sunset Villa #204',
      moveIn: 'Jan 2024',
      rent: '$2,400',
      status: 'active',
      score: 98,
      paymentHistory: 'Perfect',
      leaseEnd: 'Dec 2024',
    },
    {
      name: 'Michael Chen',
      unit: 'Oak Park #15',
      moveIn: 'Mar 2023',
      rent: '$1,850',
      status: 'active',
      score: 95,
      paymentHistory: 'Excellent',
      leaseEnd: 'Feb 2025',
    },
    {
      name: 'Emily Rodriguez',
      unit: 'Downtown Loft #8A',
      moveIn: 'Jun 2023',
      rent: '$3,200',
      status: 'renewal',
      score: 92,
      paymentHistory: 'Good',
      leaseEnd: 'May 2024',
    },
    {
      name: 'David Williams',
      unit: 'Riverside #302',
      moveIn: 'Sep 2022',
      rent: '$2,100',
      status: 'active',
      score: 96,
      paymentHistory: 'Excellent',
      leaseEnd: 'Aug 2024',
    },
    {
      name: 'Jessica Martinez',
      unit: 'Maple Street #12',
      moveIn: 'Dec 2023',
      rent: '$1,950',
      status: 'active',
      score: 89,
      paymentHistory: 'Good',
      leaseEnd: 'Nov 2024',
    },
  ];

  const applicants = [
    {
      name: 'Robert Thompson',
      applied: '2 days ago',
      unit: 'Garden View #7',
      aiScore: 94,
      income: '$85K',
      credit: 745,
      background: 'Clear',
    },
    {
      name: 'Amanda Garcia',
      applied: '1 week ago',
      unit: 'Parkside #22',
      aiScore: 88,
      income: '$72K',
      credit: 710,
      background: 'Clear',
    },
    {
      name: 'James Wilson',
      applied: '1 week ago',
      unit: 'Hillside #5B',
      aiScore: 91,
      income: '$95K',
      credit: 768,
      background: 'Clear',
    },
  ];

  const screeningMetrics = [
    { label: 'Avg. Screening Time', value: '4.2 hrs', change: '-23%' },
    { label: 'Acceptance Rate', value: '76%', change: '+5%' },
    { label: 'AI Accuracy', value: '97.8%', change: '+2%' },
    { label: 'Eviction Rate', value: '<1%', change: '0%' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            TENANT MANAGEMENT
          </h2>
          <p className="text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Comprehensive tenant screening with AI risk assessment
          </p>
        </div>
        <button className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform">
          + Add New Tenant
        </button>
      </div>

      {/* Screening Metrics - Gated by Pro plan (tenant_screening) */}
      <FeatureGate
        feature="tenant_screening"
        hasAccess={tenantScreening.hasAccess}
        loading={tenantScreening.loading}
        variant="inline"
      >
        <div className="grid grid-cols-4 gap-6">
          {screeningMetrics.map((metric, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6"
            >
              <p className="text-sm text-white/50 mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                {metric.label}
              </p>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {metric.value}
                </p>
                <span className={`text-sm ${metric.change.startsWith('-') || metric.change === '0%' ? 'text-emerald-400' : 'text-emerald-400'}`}>
                  {metric.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      </FeatureGate>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Active Tenants */}
        <div className="col-span-2 bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              ACTIVE TENANTS
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Search tenants..."
                  className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50"
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>
              <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                <ListFilter className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {tenants.map((tenant, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-all border border-transparent hover:border-white/10 group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-full flex items-center justify-center font-semibold">
                    {tenant.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {tenant.name}
                    </p>
                    <p className="text-sm text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {tenant.unit}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-sm text-white/50 mb-1">Risk Score</p>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                          style={{ width: `${tenant.score}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-emerald-400">{tenant.score}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-white/50 mb-1">Monthly Rent</p>
                    <p className="font-semibold">{tenant.rent}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-white/50 mb-1">Lease Ends</p>
                    <p className="text-sm">{tenant.leaseEnd}</p>
                  </div>

                  <div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        tenant.status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {tenant.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Applications - Gated by Pro plan (tenant_screening) */}
        <FeatureGate
          feature="tenant_screening"
          hasAccess={tenantScreening.hasAccess}
          loading={tenantScreening.loading}
          variant="overlay"
          fallback={
            <LockedFeatureCard
              name="Tenant Applications"
              description="Review and approve tenant applications with AI-powered screening"
              icon={<UserSearch className="w-6 h-6" />}
              feature="tenant_screening"
            />
          }
        >
          <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                APPLICATIONS
              </h3>
              <div className="px-2 py-1 bg-[#ff6b35]/20 text-[#ff6b35] rounded-full text-xs font-medium">
                {applicants.length} PENDING
              </div>
            </div>

            <div className="space-y-4">
              {applicants.map((applicant, index) => (
                <div
                  key={index}
                  className="p-4 bg-white/5 rounded-lg border border-white/10 hover:border-[#ff6b35]/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                        {applicant.name}
                      </p>
                      <p className="text-xs text-white/40">{applicant.applied}</p>
                    </div>
                    {/* AI Score - Gated by Premium (ai_risk_scoring) */}
                    {aiRiskScoring.hasAccess && (
                      <div className="text-right">
                        <p className="text-xs text-white/50 mb-1">AI Score</p>
                        <p className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                          {applicant.aiScore}
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-white/50 mb-3">{applicant.unit}</p>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="p-2 bg-white/5 rounded">
                      <p className="text-xs text-white/40 mb-1">Income</p>
                      <p className="text-sm font-medium">{applicant.income}</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded">
                      <p className="text-xs text-white/40 mb-1">Credit</p>
                      <p className="text-sm font-medium">{applicant.credit}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <CircleCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-400">Background {applicant.background}</span>
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 px-3 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform">
                      Approve
                    </button>
                    <button className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
              <UserSearch className="w-4 h-4" />
              View All Applications
            </button>
          </div>
        </FeatureGate>
      </div>

      {/* AI Screening Info - Gated by Premium plan (ai_risk_scoring) */}
      <FeatureGate
        feature="ai_risk_scoring"
        hasAccess={aiRiskScoring.hasAccess}
        loading={aiRiskScoring.loading}
        variant="inline"
      >
        <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <div className="flex items-start gap-6">
            <div className="p-4 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-xl">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                AI-POWERED TENANT SCREENING
              </h3>
              <p className="text-white/70 mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                Our advanced AI analyzes credit history, income verification, employment status, rental history, and behavioral patterns to provide comprehensive risk assessments in real-time. Less than 1% eviction rate across all screened tenants.
              </p>
              <div className="grid grid-cols-4 gap-4">
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    97.8%
                  </p>
                  <p className="text-xs text-white/50">Accuracy Rate</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    4.2 hrs
                  </p>
                  <p className="text-xs text-white/50">Avg. Process Time</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    &lt;1%
                  </p>
                  <p className="text-xs text-white/50">Eviction Rate</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    24/7
                  </p>
                  <p className="text-xs text-white/50">Automated Processing</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FeatureGate>
    </div>
  );
}