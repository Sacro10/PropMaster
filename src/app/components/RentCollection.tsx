import { DollarSign, TrendingUp, CircleCheck, Clock, Activity } from 'lucide-react';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate } from './UpgradeCTA';

export function RentCollection() {
  // Feature checks for plan gating
  const integratedAccounting = useHasFeature('integrated_accounting');
  const recentPayments = [
    {
      tenant: 'Sarah Johnson',
      property: 'Sunset Villa #204',
      amount: '$2,400',
      date: 'Jan 6, 2026',
      method: 'Auto-Pay',
      status: 'completed',
    },
    {
      tenant: 'Michael Chen',
      property: 'Oak Park #15',
      amount: '$1,850',
      date: 'Jan 6, 2026',
      method: 'Credit Card',
      status: 'completed',
    },
    {
      tenant: 'Emily Rodriguez',
      property: 'Downtown Loft #8A',
      amount: '$3,200',
      date: 'Jan 5, 2026',
      method: 'Bank Transfer',
      status: 'completed',
    },
    {
      tenant: 'David Williams',
      property: 'Riverside #302',
      amount: '$2,100',
      date: 'Jan 5, 2026',
      method: 'Auto-Pay',
      status: 'completed',
    },
    {
      tenant: 'Jessica Martinez',
      property: 'Maple Street #12',
      amount: '$1,950',
      date: 'Jan 4, 2026',
      method: 'Check',
      status: 'processing',
    },
  ];

  const pendingPayments = [
    {
      tenant: 'Robert Lee',
      property: 'Oak Park #8',
      amount: '$2,200',
      dueDate: 'Jan 5, 2026',
      daysOverdue: 1,
    },
    {
      tenant: 'Amanda White',
      property: 'Sunset Villa #112',
      amount: '$2,450',
      dueDate: 'Jan 1, 2026',
      daysOverdue: 5,
    },
  ];

  const ownerDisbursements = [
    {
      owner: 'Sunset Villa LLC',
      properties: 24,
      amount: '$54,200',
      date: 'Jan 10, 2026',
      status: 'scheduled',
    },
    {
      owner: 'Downtown Properties Inc',
      properties: 32,
      amount: '$89,600',
      date: 'Jan 10, 2026',
      status: 'scheduled',
    },
    {
      owner: 'Oak Park Investments',
      properties: 18,
      amount: '$32,400',
      date: 'Jan 10, 2026',
      status: 'scheduled',
    },
  ];

  const collectionStats = [
    { label: 'Collected This Month', value: '$284K', change: '+8.2%' },
    { label: 'Collection Rate', value: '98.4%', change: '+0.8%' },
    { label: 'Auto-Pay Enrolled', value: '87%', change: '+5%' },
    { label: 'Avg. Collection Time', value: '2.1 days', change: '-12%' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            RENT COLLECTIONS & DISBURSEMENTS
          </h2>
          <p className="text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Convenient payment options and owner disbursements with integrated accounting
          </p>
        </div>
        <button className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform">
          Process Disbursement
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6">
        {collectionStats.map((stat, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6"
          >
            <p className="text-sm text-white/50 mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {stat.label}
            </p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {stat.value}
              </p>
              <span className="text-sm text-emerald-400">{stat.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Recent Payments */}
        <div className="col-span-2 bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              RECENT PAYMENTS
            </h3>
            <select className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>This month</option>
            </select>
          </div>

          <div className="space-y-3">
            {recentPayments.map((payment, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-full flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {payment.tenant}
                    </p>
                    <p className="text-sm text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {payment.property}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-sm text-white/50 mb-1">Amount</p>
                    <p className="font-semibold text-lg" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {payment.amount}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-white/50 mb-1">Method</p>
                    <p className="text-sm">{payment.method}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-white/50 mb-1">Date</p>
                    <p className="text-sm">{payment.date}</p>
                  </div>

                  <div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        payment.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {payment.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors">
            View All Transactions
          </button>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Pending Payments */}
          <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                PENDING PAYMENTS
              </h3>
              <div className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                {pendingPayments.length} OVERDUE
              </div>
            </div>

            <div className="space-y-3">
              {pendingPayments.map((payment, index) => (
                <div
                  key={index}
                  className="p-4 bg-white/5 rounded-lg border border-red-500/20 hover:border-red-500/40 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                        {payment.tenant}
                      </p>
                      <p className="text-xs text-white/40">{payment.property}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-white/50">Amount Due</span>
                    <span className="text-lg font-bold text-red-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {payment.amount}
                    </span>
                  </div>

                  <div className="p-2 bg-red-500/10 rounded mb-3">
                    <p className="text-xs text-red-400">
                      {payment.daysOverdue} days overdue • Due: {payment.dueDate}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 px-3 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform">
                      Send Reminder
                    </button>
                    <button className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                      Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-Pay Info */}
          <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-lg">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                AUTO-PAY STATUS
              </h3>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-emerald-400 font-medium text-sm">Active</span>
                  <CircleCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-xs text-white/70">
                  87% of tenants enrolled in auto-pay
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Enrolled Tenants</span>
                  <span className="font-medium">123 / 142</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Success Rate</span>
                  <span className="text-emerald-400 font-medium">99.2%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Avg. Payment Day</span>
                  <span className="font-medium">1st of month</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Disbursements */}
      <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            OWNER DISBURSEMENTS
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/50">Next scheduled: Jan 10, 2026</span>
            <div className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium">
              {ownerDisbursements.length} PENDING
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {ownerDisbursements.map((disbursement, index) => (
            <div
              key={index}
              className="p-5 bg-white/5 rounded-lg border border-white/10 hover:border-[#ff6b35]/50 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    {disbursement.owner}
                  </h4>
                  <p className="text-xs text-white/50">{disbursement.properties} properties</p>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                  {disbursement.status.toUpperCase()}
                </span>
              </div>

              <div className="mb-4">
                <p className="text-sm text-white/50 mb-1">Disbursement Amount</p>
                <p className="text-3xl font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {disbursement.amount}
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm text-white/50 mb-4">
                <Clock className="w-4 h-4" />
                <span>Scheduled: {disbursement.date}</span>
              </div>

              <button className="w-full py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform">
                View Details
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Methods Info - Gated by Premium (integrated_accounting) */}
      <FeatureGate
        feature="integrated_accounting"
        hasAccess={integratedAccounting.hasAccess}
        loading={integratedAccounting.loading}
        variant="inline"
      >
        <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
        <div className="flex items-start gap-6">
          <div className="p-4 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-xl">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              INTEGRATED ACCOUNTING & PAYMENT OPTIONS
            </h3>
            <p className="text-white/70 mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Accept payments via credit card, debit card, ACH, bank transfer, and check. Automated rent collection with auto-pay enrollment reduces late payments by 94%. Integrated accounting automatically categorizes income, tracks expenses, and generates financial reports.
            </p>
            <div className="grid grid-cols-5 gap-4">
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  98.4%
                </p>
                <p className="text-xs text-white/50">Collection Rate</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  87%
                </p>
                <p className="text-xs text-white/50">Auto-Pay Enrolled</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  2.1
                </p>
                <p className="text-xs text-white/50">Days to Collect</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  $284K
                </p>
                <p className="text-xs text-white/50">Monthly Revenue</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  100%
                </p>
                <p className="text-xs text-white/50">Automated</p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </FeatureGate>
    </div>
  );
}
