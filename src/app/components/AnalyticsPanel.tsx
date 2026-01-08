import { useState } from 'react';
import { TrendingUp, TrendingDown, Activity, FileText, RefreshCw, Download } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useHasFeature } from '../hooks/usePlanGating';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { FeatureGate } from './UpgradeCTA';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import {
  useAnalyticsMetrics,
  useRevenueTrend,
  useOccupancyTrend,
  usePropertyPerformance,
  useExpenseBreakdown,
  useExportAnalytics,
  type TimeframeOption,
} from '../../lib/hooks/useAnalytics';
import { formatCurrencyCompact, formatPercentageChange, formatCurrency } from '../../lib/utils/currencyHelpers';

export function AnalyticsPanel() {
  const { isDark, text, border } = useThemeStyles();
  const [timeframe, setTimeframe] = useState<TimeframeOption>('30d');

  // Feature checks for plan gating
  const standardReporting = useHasFeature('standard_reporting');
  const advancedAnalytics = useHasFeature('advanced_analytics');
  const advancedExports = useHasFeature('advanced_exports');

  // Fetch data
  const { data: metrics, loading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useAnalyticsMetrics(timeframe);
  const { data: revenueTrend, loading: revenueLoading } = useRevenueTrend(timeframe);
  const { data: occupancyTrend, loading: occupancyLoading } = useOccupancyTrend(timeframe);
  const { data: propertyPerformance, loading: propertyLoading } = usePropertyPerformance(timeframe);
  const { data: expenseBreakdown, loading: expenseLoading } = useExpenseBreakdown(timeframe);
  const { exportData, loading: exportLoading } = useExportAnalytics();

  // Show loading state
  if (metricsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (metricsError || !metrics) {
    return <ErrorState error={metricsError} retry={refetchMetrics} />;
  }

  // Handle export
  const handleExport = async () => {
    const result = await exportData('csv', timeframe);
    if (!result.success) {
      console.error('Failed to export data:', result.error);
      alert('Failed to export analytics data. Please try again.');
    }
  };

  // Prepare KPI data
  const kpis = [
    {
      label: 'Total Revenue',
      value: formatCurrencyCompact(metrics.total_revenue * 1000),
      change: formatPercentageChange(metrics.revenue_change),
      trend: metrics.revenue_change >= 0 ? 'up' as const : 'down' as const,
    },
    {
      label: 'Occupancy Rate',
      value: `${metrics.occupancy_rate.toFixed(1)}%`,
      change: formatPercentageChange(metrics.occupancy_change),
      trend: metrics.occupancy_change >= 0 ? 'up' as const : 'down' as const,
    },
    {
      label: 'Avg. Rent/Unit',
      value: formatCurrency(metrics.avg_rent_per_unit),
      change: formatPercentageChange(metrics.rent_change),
      trend: metrics.rent_change >= 0 ? 'up' as const : 'down' as const,
    },
    {
      label: 'NOI Margin',
      value: `${metrics.noi_margin.toFixed(1)}%`,
      change: formatPercentageChange(metrics.noi_change),
      trend: metrics.noi_change >= 0 ? 'up' as const : 'down' as const,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            REPORTING & ANALYTICS
          </h2>
          <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Customizable reports with real-time data
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Timeframe selector */}
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} border ${border.default} rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50 transition-colors`}
            style={{ fontFamily: 'Work Sans, sans-serif' }}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
            <option value="all">All time</option>
          </select>

          {/* Refresh button */}
          <button
            onClick={refetchMetrics}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Export button - Gated by Premium (advanced_exports) */}
          {advancedExports.hasAccess ? (
            <button
              onClick={handleExport}
              disabled={exportLoading}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {exportLoading ? (
                <>
                  <Download className="w-4 h-4 animate-pulse" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Export Report
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/billing?upgrade=premium'}
              className={`px-6 py-3 ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'} border ${border.default} rounded-lg font-medium transition-colors flex items-center gap-2`}
              title="Upgrade to Premium for advanced exports"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              <FileText className="w-4 h-4" />
              Export (Premium)
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-6">
        {kpis.map((kpi, index) => {
          const TrendIcon = kpi.trend === 'up' ? TrendingUp : TrendingDown;
          const trendColor = kpi.trend === 'up' ? 'text-emerald-400' : 'text-red-400';

          return (
            <div
              key={index}
              className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6 hover:border-[#ff6b35]/50 transition-all`}
            >
              <p className={`text-sm ${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                {kpi.label}
              </p>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {kpi.value}
                </p>
                {kpi.change !== '+0.0%' && (
                  <span className={`text-sm ${trendColor} flex items-center gap-1`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    <TrendIcon className="w-3 h-3" />
                    {kpi.change}
                  </span>
                )}
              </div>
            </div>
          );
        })}
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
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              REVENUE TREND
            </h3>
            {revenueLoading ? (
              <div className="flex items-center justify-center h-[280px]">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className={`text-sm ${text.muted}`}>Loading...</p>
                </div>
              </div>
            ) : revenueTrend.length === 0 ? (
              <div className="flex items-center justify-center h-[280px]">
                <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No revenue data available
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} />
                  <XAxis
                    dataKey="month"
                    stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"}
                    style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
                  />
                  <YAxis
                    stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"}
                    style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? 'rgba(26, 31, 53, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
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
            )}
          </div>

          {/* Occupancy Rate */}
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              OCCUPANCY RATE
            </h3>
            {occupancyLoading ? (
              <div className="flex items-center justify-center h-[280px]">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className={`text-sm ${text.muted}`}>Loading...</p>
                </div>
              </div>
            ) : occupancyTrend.length === 0 ? (
              <div className="flex items-center justify-center h-[280px]">
                <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No occupancy data available
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={occupancyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} />
                  <XAxis
                    dataKey="month"
                    stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"}
                    style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
                  />
                  <YAxis
                    stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"}
                    domain={[85, 100]}
                    style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? 'rgba(26, 31, 53, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
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
            )}
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
          <div className={`col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              PROPERTY PERFORMANCE
            </h3>
            {propertyLoading ? (
              <div className="flex items-center justify-center h-[280px]">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className={`text-sm ${text.muted}`}>Loading...</p>
                </div>
              </div>
            ) : propertyPerformance.length === 0 ? (
              <div className="flex items-center justify-center h-[280px]">
                <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No property data available
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={propertyPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} />
                  <XAxis
                    dataKey="name"
                    stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"}
                    style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 11 }}
                  />
                  <YAxis
                    stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"}
                    style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? 'rgba(26, 31, 53, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
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
            )}
          </div>

          {/* Expense Breakdown */}
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              EXPENSE BREAKDOWN
            </h3>
            {expenseLoading ? (
              <div className="flex items-center justify-center h-[200px]">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className={`text-sm ${text.muted}`}>Loading...</p>
                </div>
              </div>
            ) : expenseBreakdown.length === 0 ? (
              <div className="flex items-center justify-center h-[200px]">
                <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No expense data available
                </p>
              </div>
            ) : (
              <>
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
                        backgroundColor: isDark ? 'rgba(26, 31, 53, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
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
                        <span className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {expense.name}
                        </span>
                      </div>
                      <span className="text-sm font-medium">{expense.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
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
        <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-start gap-6">
            <div className="p-4 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-xl">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                MARKET PRICING INTELLIGENCE
              </h3>
              <p className={`${text.secondary} mb-4`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                AI-powered lease renewal optimization analyzes local market trends, comparable properties, and seasonal demand patterns to recommend optimal pricing strategies.
              </p>
              <div className="grid grid-cols-5 gap-4">
                <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    23
                  </p>
                  <p className={`text-xs ${text.inactive}`}>Days to Lease</p>
                </div>
                <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    94%
                  </p>
                  <p className={`text-xs ${text.inactive}`}>Renewal Rate</p>
                </div>
                <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {formatPercentageChange(metrics.revenue_change)}
                  </p>
                  <p className={`text-xs ${text.inactive}`}>Revenue Growth</p>
                </div>
                <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {formatCurrencyCompact(metrics.total_revenue * 1000)}
                  </p>
                  <p className={`text-xs ${text.inactive}`}>Period Revenue</p>
                </div>
                <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                  <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {metrics.noi_margin.toFixed(1)}%
                  </p>
                  <p className={`text-xs ${text.inactive}`}>NOI Margin</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FeatureGate>
    </div>
  );
}
