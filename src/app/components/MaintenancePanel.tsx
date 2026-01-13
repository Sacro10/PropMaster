import { Wrench, CircleCheck, Activity, Bell, ListFilter, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate, LockedFeatureCard } from './UpgradeCTA';
import { useMaintenanceRequests, useMaintenanceMetrics, useHVACProgram, useRoutingMetrics, useAssignVendor } from '../../lib/hooks/useMaintenance';
import { getAvailableVendors, generateHVACBatch } from '../../lib/api/maintenanceMetrics';
import { updateMaintenanceRequestStatus } from '../../lib/api/maintenance';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import { formatRelativeTime, formatDisplayDate } from '../../lib/utils/dateHelpers';
import { CreateMaintenanceRequestModal } from './CreateMaintenanceRequestModal';
import { CreateVendorModal } from './CreateVendorModal';

export function MaintenancePanel() {
  const { isDark, bg, text, border } = useThemeStyles();
  const [assigningRequestId, setAssigningRequestId] = useState<string | null>(null);
  const [availableVendors, setAvailableVendors] = useState<any[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<'all' | 'emergency' | 'high' | 'normal' | 'low'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'submitted' | 'reviewed' | 'assigned' | 'scheduled' | 'in_progress' | 'completed' | 'closed' | 'cancelled'>('all');
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<{ id: string; message: string } | null>(null);
  const { assign, isAssigning } = useAssignVendor();

  // Feature checks for plan gating
  const maintenanceRouting = useHasFeature('maintenance_routing');
  const hvacFilterProgram = useHasFeature('hvac_filter_program');
  const emergencySupport = useHasFeature('emergency_support_24_7');

  // Fetch data
  const { data: requests, loading: requestsLoading, error: requestsError, refetch: refetchRequests } = useMaintenanceRequests();
  const { data: metrics, loading: metricsLoading, error: metricsError } = useMaintenanceMetrics();
  const { data: hvacProgram, loading: hvacLoading } = useHVACProgram();
  const { data: routingMetrics } = useRoutingMetrics();

  // Show loading state
  if (requestsLoading || metricsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (requestsError || metricsError) {
    return <ErrorState error={requestsError || metricsError} retry={refetchRequests} />;
  }

  // Handle vendor assignment
  const handleAssignClick = async (requestId: string) => {
    setAssigningRequestId(requestId);
    setAssignError(null);
    setIsLoadingVendors(true);
    try {
      const vendors = await getAvailableVendors(requestId);
      setAvailableVendors(vendors);
    } catch (error) {
      console.error('Failed to load vendors:', error);
      setAvailableVendors([]);
      setAssignError('Failed to load vendors. Please try again.');
    } finally {
      setIsLoadingVendors(false);
    }
  };

  const handleVendorSelect = async (vendorId: string) => {
    if (!assigningRequestId) return;

    const vendor = availableVendors.find((v) => v.id === vendorId);
    if (!vendor?.email) {
      setAssignError('Vendor email is missing. Add an email to the vendor profile.');
      return;
    }

    const request = requests.find((r) => r.id === assigningRequestId);
    const propertyDisplay = request?.property && request?.unit
      ? `${request.property.name} #${request.unit.unit_number}`
      : request?.property?.name || 'Unknown Property';
    const requestedAt = request?.requested_at
      ? formatDisplayDate(request.requested_at, 'MMM d, yyyy h:mm a')
      : 'N/A';
    const subject = `Maintenance Request: ${request?.title || assigningRequestId}`;
    const body = [
      `You have been assigned a maintenance request.`,
      '',
      `Request ID: ${assigningRequestId}`,
      `Title: ${request?.title || 'N/A'}`,
      `Property: ${propertyDisplay}`,
      `Priority: ${request?.priority || 'normal'}`,
      `Category: ${request?.category || 'general'}`,
      `Reported: ${requestedAt}`,
      `Description: ${request?.description || 'N/A'}`,
    ].join('\n');
    const mailto = `mailto:${encodeURIComponent(vendor.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    const result = await assign(assigningRequestId, vendorId);
    if (result.success) {
      setAssigningRequestId(null);
      setAvailableVendors([]);
      refetchRequests();
      setAssignError(null);
    } else {
      setAssignError(result.error?.message || 'Failed to assign vendor. Please try again.');
    }
  };

  // Handle HVAC batch generation
  const handleGenerateBatch = async () => {
    setGeneratingBatch(true);
    try {
      await generateHVACBatch();
      alert('HVAC delivery batch generated successfully!');
    } catch (error) {
      console.error('Failed to generate batch:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate batch. Please try again.';
      alert(message);
    } finally {
      setGeneratingBatch(false);
    }
  };

  // Handle emergency request
  const handleEmergencyClick = () => {
    setIsEmergencyModalOpen(true);
  };

  const handleStatusChange = async (requestId: string, status: string) => {
    setUpdatingStatusId(requestId);
    setStatusUpdateError(null);
    try {
      await updateMaintenanceRequestStatus(requestId, status);
      await refetchRequests();
    } catch (error) {
      console.error('Failed to update status:', error);
      setStatusUpdateError({ id: requestId, message: 'Failed to update status. Please try again.' });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const filteredRequests = selectedPriority === 'all'
    ? requests
    : requests.filter((request) => request.priority === selectedPriority);

  const fullyFilteredRequests = selectedStatus === 'all'
    ? filteredRequests
    : filteredRequests.filter((request) => request.status === selectedStatus);

  const maintenanceStatusOptions = [
    { value: 'submitted', label: 'Submitted' },
    { value: 'reviewed', label: 'Reviewed' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'closed', label: 'Closed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const maintenanceStats = metrics ? [
    { label: 'Active Requests', value: metrics.active_requests.toString(), change: '0%', icon: Wrench },
    { label: 'Avg. Response Time', value: `${metrics.avg_response_time_hours} hrs`, change: '0%', icon: Activity },
    { label: 'Completion Rate', value: `${metrics.completion_rate}%`, change: '0%', icon: CheckCircle },
    { label: 'Emergency Support', value: metrics.emergency_support_status, change: metrics.emergency_support_status === '24/7' ? 'Active' : 'Limited', icon: Bell },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            MAINTENANCE & REMODEL
          </h2>
          <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Advanced maintenance management with smart routing and 24/7 emergency support
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetchRequests}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsVendorModalOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + Add Vendor
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + Create Request
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6">
        {maintenanceStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                  <Icon className="w-4 h-4 text-[#ff6b35]" />
                </div>
                <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {stat.label}
                </p>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {stat.value}
                </p>
                <span className={`text-sm ${stat.change.includes('Active') || stat.change.includes('+') ? 'text-emerald-400' : stat.change.includes('-') ? 'text-red-400' : 'text-gray-400'}`}>
                  {stat.change}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Maintenance Requests */}
        <div className={`col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              MAINTENANCE REQUESTS
            </h3>
            <div className="flex items-center gap-3">
              <select
                value={selectedPriority}
                onChange={(event) => {
                  setSelectedPriority(event.target.value as typeof selectedPriority);
                  setShowAllRequests(false);
                }}
                className={`px-4 py-2 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
              >
                <option value="all">All Priorities</option>
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
              <select
                value={selectedStatus}
                onChange={(event) => {
                  setSelectedStatus(event.target.value as typeof selectedStatus);
                  setShowAllRequests(false);
                }}
                className={`px-4 py-2 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
              >
                <option value="all">All Statuses</option>
                {maintenanceStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button className={`p-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-colors`}>
                <ListFilter className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {fullyFilteredRequests.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className={`w-12 h-12 ${text.muted} mx-auto mb-4`} />
                <p className={`${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No maintenance requests
                </p>
                <p className={`text-sm ${text.inactive}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  All systems running smoothly
                </p>
              </div>
            ) : (
              fullyFilteredRequests.slice(0, showAllRequests ? fullyFilteredRequests.length : 5).map((request) => {
                const propertyDisplay = request.property && request.unit
                  ? `${request.property.name} #${request.unit.unit_number}`
                  : request.property?.name || 'Unknown';
                const vendorName = request.assignment?.vendor?.business_name;

                return (
                  <div
                    key={request.id}
                    className={`p-4 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-all border ${border.default} hover:border-[#ff6b35]/50`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`text-sm ${text.inactive}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            #{request.id.substring(0, 8)}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              request.priority === 'emergency'
                                ? 'bg-red-500/20 text-red-400'
                                : request.priority === 'high'
                                ? 'bg-orange-500/20 text-orange-400'
                                : request.priority === 'normal'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {request.priority.toUpperCase()}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              request.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : request.status === 'in_progress'
                                ? 'bg-blue-500/20 text-blue-400'
                                : request.status === 'assigned'
                                ? 'bg-purple-500/20 text-purple-400'
                                : request.status === 'scheduled'
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-white/20 text-white/60'
                            }`}
                          >
                            {request.status.replace('_', ' ').toUpperCase()}
                          </span>
                          <select
                            value={request.status}
                            onChange={(event) => handleStatusChange(request.id, event.target.value)}
                            disabled={updatingStatusId === request.id}
                            className={`px-2 py-1 ${isDark ? 'bg-white/10' : 'bg-white'} border ${border.default} rounded-md text-xs focus:outline-none focus:border-[#ff6b35]/50`}
                          >
                            {maintenanceStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {statusUpdateError?.id === request.id && (
                          <p className="text-xs text-red-400 mb-2">{statusUpdateError.message}</p>
                        )}
                        <p className="font-medium mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {request.title}
                        </p>
                        <div className={`flex items-center gap-4 text-sm ${text.muted}`}>
                          <span>{propertyDisplay}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(request.requested_at)}</span>
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        {vendorName ? (
                          <>
                            <p className={`text-sm ${text.muted} mb-1`}>Technician</p>
                            <p className="text-sm font-medium mb-1">{vendorName}</p>
                            {request.scheduled_for && (
                              <p className="text-xs text-[#ff6b35]">
                                ETA: {formatDisplayDate(request.scheduled_for, 'MMM d, h:mm a')}
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            {assigningRequestId === request.id ? (
                              <div className={`p-3 ${isDark ? 'bg-white/10' : 'bg-gray-100'} rounded-lg min-w-[200px]`}>
                                <p className="text-xs mb-2">Select Vendor:</p>
                                {isLoadingVendors ? (
                                  <p className="text-xs text-gray-400">Loading vendors...</p>
                                ) : availableVendors.length === 0 ? (
                                  <p className="text-xs text-gray-400">No vendors available.</p>
                                ) : (
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {availableVendors.map((vendor) => (
                                      <button
                                        key={vendor.id}
                                        onClick={() => handleVendorSelect(vendor.id)}
                                        disabled={isAssigning}
                                        className={`w-full text-left p-2 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-200'} rounded text-xs transition-colors`}
                                      >
                                        {vendor.businessName}
                                        <span className="text-xs text-gray-400 ml-1">★{vendor.rating}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {assignError && (
                                  <p className="mt-2 text-xs text-red-400">{assignError}</p>
                                )}
                                <button
                                  onClick={() => setAssigningRequestId(null)}
                                  className="mt-2 text-xs text-gray-400 hover:text-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAssignClick(request.id)}
                                className="px-4 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
                              >
                                Assign
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {fullyFilteredRequests.length > 5 && (
            <button 
              onClick={() => setShowAllRequests(!showAllRequests)}
              className={`w-full mt-4 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm font-medium transition-colors`}
            >
              {showAllRequests ? 'Show Less' : 'View All Requests'}
            </button>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* HVAC Filter Program - Gated by Premium (hvac_filter_program) */}
          <FeatureGate
            feature="hvac_filter_program"
            hasAccess={hvacFilterProgram.hasAccess}
            loading={hvacFilterProgram.loading}
            fallback={
              <LockedFeatureCard
                name="HVAC Filter Program"
                description="Automated monthly filter delivery for all your properties"
                icon={<Activity className="w-6 h-6" />}
                feature="hvac_filter_program"
              />
            }
          >
            <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-lg">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  HVAC FILTER PROGRAM
                </h3>
              </div>

              <p className={`text-sm ${text.secondary} mb-4`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                Monthly tenant filter delivery program
              </p>

              {hvacLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg animate-pulse`}>
                      <div className="h-4 bg-white/10 rounded w-1/2 mb-2"></div>
                      <div className="h-3 bg-white/10 rounded w-3/4"></div>
                    </div>
                  ))}
                </div>
              ) : hvacProgram.length === 0 ? (
                <div className="text-center py-8">
                  <p className={`text-sm ${text.muted}`}>No active HVAC subscriptions</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {hvacProgram.map((property) => (
                      <div
                        key={property.property_id}
                        className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg border ${border.default}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            {property.property_name}
                          </p>
                          <span className={`text-xs ${text.muted}`}>{property.unit_count} units</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={text.muted}>
                            Next delivery: {property.next_delivery ? formatDisplayDate(property.next_delivery, 'MMM d') : 'Not scheduled'}
                          </span>
                          <span className="text-emerald-400">{property.total_filters} filters</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={`mt-4 p-3 ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'} border border-emerald-500/20 rounded-lg`}>
                    <p className="text-sm text-emerald-400 mb-1 font-medium">
                      {hvacProgram.reduce((sum, p) => sum + p.total_filters, 0)} filters scheduled
                    </p>
                    <p className={`text-xs ${text.muted} mb-3`}>
                      Across {hvacProgram.length} properties
                    </p>
                    <button
                      onClick={handleGenerateBatch}
                      disabled={generatingBatch}
                      className={`w-full py-2 ${isDark ? 'bg-emerald-500/20 hover:bg-emerald-500/30' : 'bg-emerald-100 hover:bg-emerald-200'} text-emerald-400 rounded-lg text-xs font-medium transition-colors ${generatingBatch ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {generatingBatch ? 'Generating...' : 'Generate Next Batch'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </FeatureGate>

          {/* Emergency Support - Gated by Premium (emergency_support_24_7) */}
          <FeatureGate
            feature="emergency_support_24_7"
            hasAccess={emergencySupport.hasAccess}
            loading={emergencySupport.loading}
            fallback={
              <LockedFeatureCard
                name="24/7 Emergency Support"
                description="Round-the-clock emergency response for urgent maintenance"
                icon={<Bell className="w-6 h-6" />}
                feature="emergency_support_24_7"
              />
            }
          >
            <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#ef4444] to-[#dc2626] rounded-lg">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  24/7 EMERGENCY
                </h3>
              </div>

              <div className={`p-4 ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'} border border-emerald-500/20 rounded-lg mb-4`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  <p className="font-medium text-emerald-400">System Active</p>
                </div>
                <p className={`text-sm ${text.muted}`}>Round-the-clock emergency response team standing by</p>
              </div>

              <div className="space-y-3">
                {metrics && metrics.recent_emergency_count > 0 && (
                  <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <p className={`text-sm ${text.muted} mb-1`}>Recent Emergency Requests</p>
                    <p className="text-2xl font-bold text-[#ff6b35]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {metrics.recent_emergency_count}
                    </p>
                    <p className={`text-xs ${text.inactive}`}>Last 24 hours</p>
                  </div>
                )}

                <button
                  onClick={handleEmergencyClick}
                  className={`w-full py-3 ${isDark ? 'bg-red-500/20 hover:bg-red-500/30' : 'bg-red-50 hover:bg-red-100'} border border-red-500/30 text-red-400 rounded-lg font-medium transition-colors flex items-center justify-center gap-2`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Create Emergency Request
                </button>
              </div>

              {maintenanceRouting.hasAccess && routingMetrics && (
                <div className="space-y-3">
                  <p className={`text-sm ${text.muted} font-medium`}>Smart Routing Metrics</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                      <p className={`text-xs ${text.inactive} mb-1`}>Assignment Rate</p>
                      <p className="text-lg font-bold text-emerald-400">{routingMetrics.assignment_rate}%</p>
                    </div>
                    <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                      <p className={`text-xs ${text.inactive} mb-1`}>Avg Response</p>
                      <p className="text-lg font-bold text-emerald-400">{routingMetrics.avg_acceptance_time_hours}h</p>
                    </div>
                    <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg col-span-2`}>
                      <p className={`text-xs ${text.inactive} mb-1`}>Routing Efficiency</p>
                      <p className="text-lg font-bold text-emerald-400">{routingMetrics.vendor_utilization_rate}%</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </FeatureGate>
        </div>
      </div>

      {/* Create Maintenance Request Modal */}
      <CreateMaintenanceRequestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          refetchRequests();
        }}
      />

      {/* Create Emergency Request Modal */}
      <CreateMaintenanceRequestModal
        isOpen={isEmergencyModalOpen}
        onClose={() => setIsEmergencyModalOpen(false)}
        onSuccess={() => {
          refetchRequests();
        }}
        emergencyMode
      />

      {/* Create Vendor Modal */}
      <CreateVendorModal
        isOpen={isVendorModalOpen}
        onClose={() => setIsVendorModalOpen(false)}
        onSuccess={() => {
          // Optionally refresh vendor list or show success message
          console.log('Vendor created successfully');
        }}
      />
    </div>
  );
}
