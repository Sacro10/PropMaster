import { TrendingUp, DollarSign, Activity, FileText } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate } from './UpgradeCTA';

export function AnalyticsPanel() {
  // Feature checks for plan gating
  const standardReporting = useHasFeature('standard_reporting');
  const advancedAnalytics = useHasFeature('advanced_analytics');
  const advancedExports = useHasFeature('advanced_exports');
  const revenueData = [
    { month: 'Jul', revenue: 245 },
    { month: 'Aug', revenue: 258 },
    { month: 'Sep', revenue: 267 },
    { month: 'Oct', revenue: 271 },
    { month: 'Nov', revenue: 276 },
    { month: 'Dec', revenue: 280 },
    { month: 'Jan', revenue: 284 },
  ];

  const occupancyData = [
    { month: 'Jul', rate: 91 },
    { month: 'Aug', rate: 92 },
    { month: 'Sep', rate: 93 },
    { month: 'Oct', rate: 92 },
    { month: 'Nov', rate: 94 },
    { month: 'Dec', rate: 93 },
    { month: 'Jan', rate: 94 },
  ];

  const propertyPerformance = [
    { name: 'Sunset Villa', revenue: 68500, occupancy: 96, units: 24 },
    { name: 'Downtown Lofts', revenue: 102400, occupancy: 94, units: 32 },
    { name: 'Oak Park', revenue: 39600, occupancy: 92, units: 18 },
    { name: 'Riverside', revenue: 31500, occupancy: 93, units: 15 },
    { name: 'Maple Street', revenue: 42000, occupancy: 95, units: 20 },
  ];

  const expenseBreakdown = [
    { name: 'Maintenance', value: 32, color: '#ff6b35' },
    { name: 'Utilities', value: 18, color: '#f7931e' },
    { name: 'Insurance', value: 15, color: '#3b82f6' },
    { name: 'Marketing', value: 12, color: '#10b981' },
    { name: 'Other', value: 23, color: '#8b5cf6' },
  ];

  const kpis = [
    { label: 'Total Revenue', value: '$284K', change: '+8.2%', trend: 'up' },
    { label: 'Occupancy Rate', value: '93.7%', change: '+1.2%', trend: 'up' },
    { label: 'Avg. Rent/Unit', value: '$2,236', change: '+3.5%', trend: 'up' },
    { label: 'NOI Margin', value: '67.8%', change: '+2.1%', trend: 'up' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            REPORTING & ANALYTICS
          </h2>
          <p className="text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Customizable reports with real-time data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50">
            <option>Last 7 months</option>
            <option>Last 30 days</option>
            <option>Last 90 days</option>
            <option>Last year</option>
          </select>
          {/* Export button - Gated by Premium (advanced_exports) */}
          {advancedExports.hasAccess ? (
            <button className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Export Report
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/billing?upgrade=premium'}
              className="px-6 py-3 bg-white/10 border border-white/20 rounded-lg font-medium hover:bg-white/20 transition-colors flex items-center gap-2"
              title="Upgrade to Premium for advanced exports"
            >
              <FileText className="w-4 h-4" />
              Export (Premium)
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-6">
        {kpis.map((kpi, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6"
          >
            <p className="text-sm text-white/50 mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {kpi.label}
            </p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {kpi.value}
              </p>
              <span className="text-sm text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {kpi.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid - Gated by Pro (standard_reporting) */}
      <FeatureGate
        feature="standard_reporting"
        hasAccess={standardReporting.hasAccess}
        loading={standardReporting.loading}
        variant="inline"
      >
        <div className="grid grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            REVENUE TREND
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="month" 
                stroke="rgba(255,255,255,0.5)" 
                style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.5)"
                style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(26, 31, 53, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontFamily: 'Work Sans, sans-serif',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="url(#revenueGradient)" 
                strokeWidth={3}
                dot={{ fill: '#ff6b35', strokeWidth: 2, r: 4 }}
              />
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ff6b35" />
                  <stop offset="100%" stopColor="#f7931e" />
                </linearGradient>
              </defs>
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Occupancy Rate */}
        <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            OCCUPANCY RATE
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={occupancyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="month" 
                stroke="rgba(255,255,255,0.5)"
                style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.5)"
                domain={[85, 100]}
                style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(26, 31, 53, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontFamily: 'Work Sans, sans-serif',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="rate" 
                stroke="#10b981" 
                strokeWidth={3}
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        </div>
      </FeatureGate>

      {/* Bottom Grid - Also gated by Pro (standard_reporting) */}
      <FeatureGate
        feature="standard_reporting"
        hasAccess={standardReporting.hasAccess}
        loading={standardReporting.loading}
        variant="inline"
      >
        <div className="grid grid-cols-3 gap-6">
        {/* Property Performance */}
        <div className="col-span-2 bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            PROPERTY PERFORMANCE
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={propertyPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="name" 
                stroke="rgba(255,255,255,0.5)"
                style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 11 }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.5)"
                style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(26, 31, 53, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontFamily: 'Work Sans, sans-serif',
                }}
              />
              <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                {propertyPerformance.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`url(#barGradient${index})`} />
                ))}
              </Bar>
              <defs>
                {propertyPerformance.map((entry, index) => (
                  <linearGradient key={index} id={`barGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6b35" />
                    <stop offset="100%" stopColor="#f7931e" />
                  </linearGradient>
                ))}
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            EXPENSE BREAKDOWN
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={expenseBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {expenseBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(26, 31, 53, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontFamily: 'Work Sans, sans-serif',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-4">
            {expenseBreakdown.map((expense, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: expense.color }}
                  />
                  <span className="text-sm text-white/70" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    {expense.name}
                  </span>
                </div>
                <span className="text-sm font-medium">{expense.value}%</span>
              </div>
            ))}
          </div>
        </div>
        </div>
      </FeatureGate>

      {/* Market Intelligence - Gated by Premium (advanced_analytics) */}
      <FeatureGate
        feature="advanced_analytics"
        hasAccess={advancedAnalytics.hasAccess}
        loading={advancedAnalytics.loading}
        variant="inline"
      >
        <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
        <div className="flex items-start gap-6">
          <div className="p-4 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-xl">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              MARKET PRICING INTELLIGENCE
            </h3>
            <p className="text-white/70 mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              AI-powered lease renewal optimization analyzes local market trends, comparable properties, and seasonal demand patterns to recommend optimal pricing strategies. Average 23 days to lease with 94% renewal rate.
            </p>
            <div className="grid grid-cols-5 gap-4">
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  23
                </p>
                <p className="text-xs text-white/50">Days to Lease</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  94%
                </p>
                <p className="text-xs text-white/50">Renewal Rate</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  +8.2%
                </p>
                <p className="text-xs text-white/50">Revenue Growth</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  $284K
                </p>
                <p className="text-xs text-white/50">Monthly Revenue</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  67.8%
                </p>
                <p className="text-xs text-white/50">NOI Margin</p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </FeatureGate>
    </div>
  );
}
