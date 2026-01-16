import { TrendingUp, TrendingDown, Users, Wrench, DollarSign, CircleCheck, Activity, Bell, ListFilter, RefreshCw, FileText, Building2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useDashboardData } from '../../lib/hooks/useDashboardData';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import { formatCurrencyCompact, formatPercentageChange, formatNumber } from '../../lib/utils/currencyHelpers';
import { formatRelativeTime } from '../../lib/utils/dateHelpers';
import { AddPropertyModal } from './AddPropertyModal';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { getCurrentAccountId } from '../../lib/api/client';

export function DashboardOverview() {
  const { isDark, text, border } = useThemeStyles();
  const navigate = useNavigate();
  const { metrics, recentActivity, systemMetrics, upcomingTasks, loading, error, refetch } = useDashboardData();
  const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [deletingPropertyId, setDeletingPropertyId] = useState<string | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all');
  const [isActivityFilterOpen, setIsActivityFilterOpen] = useState(false);

  // Fetch properties
  const fetchProperties = async () => {
    try {
      setLoadingProperties(true);
      const accountId = await getCurrentAccountId();
      if (!accountId) return;

      const { data, error } = await (supabase as any)
        .from('properties')
        .select(`
          id,
          name,
          address1,
          city,
          state,
          property_type,
          units:units(count)
        `)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoadingProperties(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const handlePropertySuccess = () => {
    fetchProperties();
    refetch(); // Refresh dashboard metrics
  };

  const handleDeleteProperty = async (property: any) => {
    const name = property?.name || 'this property';
    const confirmed = confirm(`Delete ${name}? This will remove associated units and records.`);
    if (!confirmed) return;

    try {
      setDeletingPropertyId(property.id);
      const accountId = await getCurrentAccountId();
      if (!accountId) {
        throw new Error('Account ID required');
      }

      const { error } = await (supabase as any)
        .from('properties')
        .delete()
        .eq('id', property.id)
        .eq('account_id', accountId);

      if (error) throw error;
      await fetchProperties();
      refetch();
    } catch (error) {
      console.error('Error deleting property:', error);
      alert('Failed to delete property. Please try again.');
    } finally {
      setDeletingPropertyId(null);
    }
  };

  const activityTypeOptions = useMemo(() => {
    const types = Array.from(new Set(recentActivity.map((activity) => activity.type))).sort();
    return ['all', ...types];
  }, [recentActivity]);

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return recentActivity;
    return recentActivity.filter((activity) => activity.type === activityFilter);
  }, [activityFilter, recentActivity]);

  const visibleActivity = showAllActivity ? filteredActivity : filteredActivity.slice(0, 5);

  const formatActivityTypeLabel = (value: string) => {
    if (value === 'all') return 'All Activity';
    return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  // Show loading state
  if (loading) {
    return <LoadingPage />;
  }

  // Show error state
  if (error || !metrics) {
    return <ErrorState error={error} retry={refetch} />;
  }

  // Prepare stats for display
  const stats = [
    {
      label: 'Total Units',
      value: formatNumber(metrics.total_units),
      change: formatPercentageChange(metrics.occupancy_change), // Use occupancy change as proxy for units
      trend: metrics.occupancy_change >= 0 ? 'up' as const : 'down' as const,
      tooltip: 'Change vs last month based on occupancy trend',
      icon: Activity,
    },
    {
      label: 'Occupied',
      value: formatNumber(metrics.occupied_units),
      change: `${metrics.occupancy_rate}%`,
      trend: 'up' as const,
      tooltip: 'Current occupancy rate',
      icon: CircleCheck,
    },
    {
      label: 'Active Tenants',
      value: formatNumber(metrics.active_tenants),
      change: metrics.tenant_change > 0 ? `+${metrics.tenant_change}` : `${metrics.tenant_change}`,
      trend: metrics.tenant_change >= 0 ? 'up' as const : 'down' as const,
      tooltip: 'Change vs last month',
      icon: Users,
    },
    {
      label: 'Monthly Revenue',
      value: formatCurrencyCompact(metrics.monthly_revenue),
      change: formatPercentageChange(metrics.revenue_change),
      trend: metrics.revenue_change >= 0 ? 'up' as const : 'down' as const,
      tooltip: 'Change vs last month',
      icon: DollarSign,
    },
  ];

  const quickActions = [
    { label: 'Screen New Tenant', icon: Users, color: 'from-[#ff6b35] to-[#f7931e]', path: '/app/tenants' },
    { label: 'Create Maintenance Request', icon: Wrench, color: 'from-[#3b82f6] to-[#8b5cf6]', path: '/app/maintenance' },
    { label: 'Generate Report', icon: FileText, color: 'from-[#10b981] to-[#06b6d4]', path: '/app/analytics' },
    { label: 'Schedule Showing', icon: Bell, color: 'from-[#f59e0b] to-[#ef4444]', path: '/app/showings' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            PROPERTY OVERVIEW
          </h2>
          <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Real-time insights across all your properties
          </p>
        </div>
        <button
          onClick={refetch}
          className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
          title="Refresh data"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm font-medium" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Refresh
          </span>
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const TrendIcon = stat.trend === 'up' ? TrendingUp : TrendingDown;
          const trendColor = stat.trend === 'up' ? 'text-emerald-400' : 'text-red-400';

          return (
            <div
              key={index}
              className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6 hover:border-[#ff6b35]/50 transition-all group`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2 ${isDark ? 'bg-white/5 group-hover:bg-white/10' : 'bg-gray-100 group-hover:bg-gray-200'} rounded-lg transition-colors`}>
                  <Icon className="w-5 h-5 text-[#ff6b35]" />
                </div>
                <span
                  className={`text-sm ${trendColor} flex items-center gap-1`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                  title={stat.tooltip}
                >
                  <TrendIcon className="w-3 h-3" />
                  {stat.change}
                </span>
              </div>
              <div>
                <p className="text-4xl font-bold mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {stat.value}
                </p>
                <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className={`xl:col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              RECENT ACTIVITY
            </h3>
            <div className="relative">
              <button
                onClick={() => setIsActivityFilterOpen((prev) => !prev)}
                className={`text-sm ${text.muted} hover:${text.primary} flex items-center gap-2 transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                <ListFilter className="w-4 h-4" />
                Filter
              </button>
              {isActivityFilterOpen && (
                <div
                  className={`absolute right-0 mt-2 w-52 ${isDark ? 'bg-[#0f1523]' : 'bg-white'} border ${border.default} rounded-lg shadow-lg z-10`}
                >
                  {activityTypeOptions.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setActivityFilter(type);
                        setShowAllActivity(false);
                        setIsActivityFilterOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm ${
                        type === activityFilter ? 'text-[#ff6b35]' : text.muted
                      } hover:${text.primary}`}
                      style={{ fontFamily: 'Work Sans, sans-serif' }}
                    >
                      {formatActivityTypeLabel(type)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {filteredActivity.length === 0 ? (
              <div className="text-center py-8">
                <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No recent activity
                </p>
              </div>
            ) : (
              visibleActivity.map((activity) => {
                // Determine status color based on event type
                const statusColor =
                  activity.type.includes('payment') || activity.type.includes('completed') ? 'bg-emerald-400' :
                  activity.type.includes('urgent') || activity.type.includes('emergency') ? 'bg-red-400' :
                  'bg-amber-400';

                return (
                  <div
                    key={activity.id}
                    className={`flex items-center justify-between p-4 ${isDark ? 'bg-white/5 hover:bg-white/10 border-transparent hover:border-white/10' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-gray-300'} rounded-lg transition-colors border`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                      <div>
                        <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {activity.summary}
                        </p>
                        <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {activity.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                      </div>
                    </div>
                    <span className={`text-sm ${text.inactive}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {formatRelativeTime(activity.timestamp)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          {filteredActivity.length > 5 && (
            <div className="pt-4">
              <button
                onClick={() => setShowAllActivity((prev) => !prev)}
                className={`text-sm ${text.muted} hover:${text.primary} transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                {showAllActivity ? 'Show Less' : 'Show More'}
              </button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              QUICK ACTIONS
            </h3>
            <div className="space-y-3">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={index}
                    onClick={() => navigate(action.path)}
                    className={`w-full flex items-center gap-3 p-4 ${isDark ? 'bg-white/5 hover:bg-white/10 border-transparent hover:border-white/10' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-gray-300'} rounded-lg transition-all group border`}
                  >
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${action.color} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-medium" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* System Status */}
          {systemMetrics && (
            <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
              <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                SYSTEM STATUS
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      Support
                    </span>
                    <span className="text-emerald-400 text-sm font-medium">
                      {systemMetrics.support_status}
                    </span>
                  </div>
                  <div className={`h-1 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                    <div className="h-full w-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      Avg. Lease Time
                    </span>
                    <span className="text-emerald-400 text-sm font-medium">
                      {systemMetrics.avg_lease_time_days} DAYS
                    </span>
                  </div>
                  <div className={`h-1 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                    <div
                      className="h-full bg-gradient-to-r from-[#ff6b35] to-[#f7931e]"
                      style={{ width: `${Math.min(100, (systemMetrics.avg_lease_time_days / 365) * 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      Eviction Rate
                    </span>
                    <span className="text-emerald-400 text-sm font-medium">
                      {systemMetrics.eviction_rate < 1 ? '<1%' : `${systemMetrics.eviction_rate.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className={`h-1 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                      style={{ width: `${Math.max(2, systemMetrics.eviction_rate)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Properties Section */}
      <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            MY PROPERTIES
          </h3>
          <button
            onClick={() => setIsPropertyModalOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + Add Property
          </button>
        </div>

        {loadingProperties ? (
          <div className="text-center py-8">
            <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Loading properties...
            </p>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-white/20" />
            <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              No properties yet. Click "Add Property" to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {properties.map((property) => (
              <div
                key={property.id}
                className={`p-5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg border ${border.default} hover:border-[#ff6b35]/50 transition-all group cursor-pointer`}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="p-2 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-lg">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {property.name}
                    </h4>
                    <p className={`text-sm ${text.muted}`}>
                      {property.address1}
                    </p>
                    <p className={`text-sm ${text.muted}`}>
                      {property.city}, {property.state}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteProperty(property);
                    }}
                    disabled={deletingPropertyId === property.id}
                    className={`p-2 rounded-lg transition-colors ${
                      isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-white hover:bg-gray-100'
                    } ${deletingPropertyId === property.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Delete property"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div>
                    <p className={`text-xs ${text.inactive} mb-1`}>Type</p>
                    <p className="text-sm font-medium">{property.property_type || 'N/A'}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${text.inactive} mb-1`}>Units</p>
                    <p className="text-sm font-medium">{property.units?.[0]?.count || 0}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Property Modal */}
      <AddPropertyModal
        isOpen={isPropertyModalOpen}
        onClose={() => setIsPropertyModalOpen(false)}
        onSuccess={handlePropertySuccess}
      />
    </div>
  );
}
