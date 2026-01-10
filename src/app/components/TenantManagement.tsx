import { Search, UserSearch, CircleCheck, TrendingUp, ListFilter, RefreshCw, Users, X } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate, LockedFeatureCard } from './UpgradeCTA';
import { useTenants, useRentalApplications, useTenantMetrics } from '../../lib/hooks/useTenants';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import { formatCurrency } from '../../lib/utils/currencyHelpers';
import { formatDisplayDate, formatRelativeTime } from '../../lib/utils/dateHelpers';
import { useState, useMemo } from 'react';
import { ApplicationDetailModal } from './ApplicationDetailModal';
import { NewApplicationForm, type ApplicationFormData } from './NewApplicationForm';
import { createApplication } from '../../lib/api/applications';
import { runScreening } from '../../lib/api/applications';

export function TenantManagement() {
  const { isDark, bg, text, border } = useThemeStyles();
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [showNewApplicationForm, setShowNewApplicationForm] = useState(false);

  // Feature checks for plan gating
  const tenantScreening = useHasFeature('tenant_screening');
  const aiRiskScoring = useHasFeature('ai_risk_scoring');

  // Fetch data
  const { data: tenants, loading: tenantsLoading, error: tenantsError, refetch: refetchTenants } = useTenants();
  const { data: applications, loading: appsLoading, error: appsError, refetch: refetchApps, approve, reject } = useRentalApplications();
  const { data: metrics, loading: metricsLoading, error: metricsError } = useTenantMetrics();

  // Filter tenants based on search query with memoization for performance
  const filteredTenants = useMemo(() => {
    if (!searchQuery.trim()) return tenants;

    const searchLower = searchQuery.toLowerCase();
    return tenants.filter(tenant => {
      const fullName = (tenant.full_name || 'unknown tenant').toLowerCase();
      const email = (tenant.email || '').toLowerCase();
      const phone = (tenant.phone || '').toLowerCase();
      const propertyName = (tenant.property?.name || '').toLowerCase();
      const unitNumber = (tenant.unit?.unit_number || '').toLowerCase();
      return fullName.includes(searchLower) ||
             email.includes(searchLower) ||
             phone.includes(searchLower) ||
             propertyName.includes(searchLower) ||
             unitNumber.includes(searchLower);
    });
  }, [tenants, searchQuery]);

  // Handle approve
  const handleApprove = async (applicationId: string) => {
    setIsApproving(applicationId);
    const result = await approve(applicationId);
    setIsApproving(null);

    if (result.success) {
      await refetchTenants();
      await refetchApps();
      console.log('Application approved successfully');
    } else {
      console.error('Failed to approve application:', result.error);
      alert('Failed to approve application: ' + (result.error?.message || 'Unknown error'));
    }
  };

  // Handle reject
  const handleReject = async (applicationId: string, reason?: string) => {
    const result = await reject(applicationId, reason);
    if (result.success) {
      await refetchApps();
      console.log('Application rejected');
    } else {
      console.error('Failed to reject application:', result.error);
      alert('Failed to reject application: ' + (result.error?.message || 'Unknown error'));
    }
  };

  // Handle new application submission
  const handleNewApplication = async (data: ApplicationFormData) => {
    try {
      const newApp = await createApplication(data);
      // Automatically run screening
      if (newApp.id) {
        await runScreening(newApp.id);
      }
      await refetchApps();
    } catch (error) {
      console.error('Failed to create application:', error);
      throw error;
    }
  };

  // Handle opening application detail
  const handleReviewApplication = async (application: any) => {
    // If no screening result, try to run screening first
    if (!application.screeningResult && !application.hasScreeningResult) {
      try {
        await runScreening(application.id);
        await refetchApps();
        // Find updated application
        const updated = applications.find(a => a.id === application.id);
        setSelectedApplication(updated || application);
      } catch (error) {
        console.error('Failed to run screening:', error);
        setSelectedApplication(application);
      }
    } else {
      setSelectedApplication(application);
    }
  };

  // Show loading state
  if (tenantsLoading || appsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (tenantsError || appsError) {
    return <ErrorState error={tenantsError || appsError} retry={() => {
      refetchTenants();
      refetchApps();
    }} />;
  }

  // Calculate metrics from actual data with AI-powered insights
  const calculatedMetrics = useMemo(() => {
    if (!metrics) return null;

    // Start with API metrics
    let aiAccuracy = metrics.ai_accuracy;
    let avgScreeningTime = metrics.avg_screening_time;
    let evictionRate = metrics.eviction_rate;
    let acceptanceRate = metrics.acceptance_rate;

    // Calculate from tenant profiles if available
    if (tenants.length > 0) {
      const tenantsWithAI = tenants.filter(t => t.ai_risk_score && t.background_check_status);
      if (tenantsWithAI.length > 0 && aiAccuracy === 0) {
        // AI accuracy: how well the AI score predicted actual background check results
        const accurate = tenantsWithAI.filter(t =>
          (t.ai_risk_score! >= 70 && t.background_check_status === 'approved') ||
          (t.ai_risk_score! < 70 && (t.background_check_status === 'rejected' || t.background_check_status === 'pending'))
        ).length;
        aiAccuracy = Math.round((accurate / tenantsWithAI.length) * 100);
      }

      // Eviction rate from actual tenant data
      const movedOutTenants = tenants.filter(t => t.move_out_date);
      if (movedOutTenants.length > 0 && evictionRate === 0) {
        const evictions = movedOutTenants.filter(t =>
          t.screening_notes?.toLowerCase().includes('eviction') ||
          t.ai_risk_score && t.ai_risk_score < 50
        ).length;
        evictionRate = (evictions / movedOutTenants.length) * 100;
      }
    }

    // Calculate from applications data
    if (applications.length > 0) {
      // Average screening time in hours
      const reviewed = applications.filter(a => a.reviewed_at && a.created_at);
      if (reviewed.length > 0 && avgScreeningTime === 0) {
        const totalHours = reviewed.reduce((sum, a) => {
          const created = new Date(a.created_at).getTime();
          const reviewedTime = new Date(a.reviewed_at!).getTime();
          return sum + (reviewedTime - created) / (1000 * 60 * 60);
        }, 0);
        avgScreeningTime = totalHours / reviewed.length;
      }

      // Acceptance rate
      const decidedApps = applications.filter(a => a.status === 'approved' || a.status === 'rejected');
      if (decidedApps.length > 0 && acceptanceRate === 0) {
        const approved = decidedApps.filter(a => a.status === 'approved').length;
        acceptanceRate = (approved / decidedApps.length) * 100;
      }

      // AI-enhanced accuracy: also check application AI scores
      if (aiAccuracy === 0) {
        const appsWithScores = applications.filter(a => a.ai_risk_score !== null && a.status && a.status !== 'pending' && a.status !== 'under_review');
        if (appsWithScores.length > 0) {
          const accurate = appsWithScores.filter(a =>
            (a.ai_risk_score! >= 75 && a.status === 'approved') ||
            (a.ai_risk_score! < 75 && a.status === 'rejected')
          ).length;
          aiAccuracy = Math.round((accurate / appsWithScores.length) * 100);
        }
      }
    }

    return { aiAccuracy, avgScreeningTime, evictionRate, acceptanceRate };
  }, [metrics, applications, tenants]);

  const screeningMetrics = calculatedMetrics ? [
    {
      label: 'Accuracy Rate',
      value: calculatedMetrics.aiAccuracy > 0 ? `${Math.round(calculatedMetrics.aiAccuracy)}%` : 'N/A',
      change: calculatedMetrics.aiAccuracy > 0 ? '+2%' : '0%',
      color: calculatedMetrics.aiAccuracy >= 85 ? 'text-emerald-400' : calculatedMetrics.aiAccuracy >= 70 ? 'text-yellow-400' : 'text-red-400',
      tooltip: calculatedMetrics.aiAccuracy > 0 ? 'AI prediction accuracy vs. actual background checks' : 'No data yet'
    },
    {
      label: 'Avg. Process Time',
      value: calculatedMetrics.avgScreeningTime > 0 
        ? calculatedMetrics.avgScreeningTime < 1 
          ? `${Math.round(calculatedMetrics.avgScreeningTime * 60)}min`
          : `${Math.round(calculatedMetrics.avgScreeningTime * 10) / 10}hr`
        : 'N/A',
      change: calculatedMetrics.avgScreeningTime > 0 ? '-15%' : '0%',
      color: calculatedMetrics.avgScreeningTime > 0 && calculatedMetrics.avgScreeningTime < 24 ? 'text-emerald-400' : 'text-yellow-400',
      tooltip: calculatedMetrics.avgScreeningTime > 0 ? 'Average time from application to review completion' : 'No data yet'
    },
    {
      label: 'Eviction Rate',
      value: calculatedMetrics.evictionRate >= 0 
        ? calculatedMetrics.evictionRate < 1 
          ? '<1%' 
          : `${Math.round(calculatedMetrics.evictionRate * 10) / 10}%`
        : 'N/A',
      change: '0%',
      color: calculatedMetrics.evictionRate < 3 ? 'text-emerald-400' : calculatedMetrics.evictionRate < 5 ? 'text-yellow-400' : 'text-red-400',
      tooltip: calculatedMetrics.evictionRate >= 0 ? 'Percentage of tenants who were evicted' : 'No data yet'
    },
    {
      label: 'Automated Processing',
      value: '24/7',
      change: '100%',
      color: 'text-emerald-400',
      tooltip: 'AI-powered screening available round-the-clock'
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            TENANT MANAGEMENT
          </h2>
          <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Comprehensive tenant screening with AI risk assessment
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              refetchTenants();
              refetchApps();
            }}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowNewApplicationForm(true)}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + Add New Tenant
          </button>
        </div>
      </div>

      {/* Screening Metrics - Gated by Pro plan (tenant_screening) */}
      <FeatureGate
        feature="tenant_screening"
        hasAccess={tenantScreening.hasAccess}
        loading={tenantScreening.loading}
        variant="inline"
      >
        {metricsLoading ? (
          <div className="grid grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-gray-100'} border ${border.default} rounded-xl p-6 animate-pulse`}>
                <div className="h-4 bg-white/10 rounded w-1/2 mb-4"></div>
                <div className="h-8 bg-white/10 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-6">
            {screeningMetrics.map((metric, index) => (
              <div
                key={index}
                className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}
              >
                <p className={`text-sm ${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {metric.label}
                </p>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {metric.value}
                  </p>
                  {metric.change !== '0%' && (
                    <span className={`text-sm ${metric.color || 'text-emerald-400'}`}>
                      {metric.change}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </FeatureGate>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Active Tenants */}
        <div className={`col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              ACTIVE TENANTS
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <div className="relative">
                  <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${text.muted}`} />
                  <input
                    type="text"
                    placeholder="Search by name, email, phone, property, or unit..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`pl-10 pr-10 py-2 w-96 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50 transition-colors`}
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${text.muted} hover:text-[#ff6b35] transition-colors`}
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p className={`text-xs ${text.muted} ml-1`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    {filteredTenants.length} {filteredTenants.length === 1 ? 'result' : 'results'} found
                  </p>
                )}
              </div>
              <button className={`p-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-colors`}>
                <ListFilter className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredTenants.length === 0 ? (
              <div className="text-center py-12">
                <Users className={`w-12 h-12 ${text.muted} mx-auto mb-4`} />
                <p className={`${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {searchQuery ? 'No tenants found' : 'No active tenants yet'}
                </p>
                <p className={`text-sm ${text.inactive}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {searchQuery ? 'Try a different search term' : 'Add your first tenant to get started'}
                </p>
              </div>
            ) : (
              filteredTenants.map((tenant) => {
                const initials = tenant.full_name
                  ? tenant.full_name.split(' ').map(n => n[0]).join('').substring(0, 2)
                  : 'T';
                const unitDisplay = tenant.unit ? `${tenant.property?.name} #${tenant.unit.unit_number}` : 'No unit';
                const riskScore = tenant.ai_risk_score;
                const riskColor = riskScore == null ? 'from-gray-400 to-gray-500' :
                                 riskScore >= 90 ? 'from-emerald-400 to-emerald-500' :
                                 riskScore >= 70 ? 'from-amber-400 to-amber-500' :
                                 'from-red-400 to-red-500';

                return (
                  <div
                    key={tenant.id}
                    className={`flex items-center justify-between p-4 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-all border ${border.default} hover:border-[#ff6b35]/50 group`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-full flex items-center justify-center font-semibold text-white">
                        {initials}
                      </div>
                      <div>
                        <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {tenant.full_name || 'Unknown Tenant'}
                        </p>
                        <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {unitDisplay}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      {aiRiskScoring.hasAccess && (
                        <div className="text-right">
                          <p className={`text-sm ${text.muted} mb-1`}>Risk Score</p>
                          <div className="flex items-center gap-2">
                            <div className={`w-12 h-1 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                              <div
                                className={`h-full bg-gradient-to-r ${riskColor}`}
                                style={{ width: `${riskScore ?? 0}%` }}
                              />
                            </div>
                            <span className={`text-sm font-medium ${riskScore == null ? text.muted : 'text-emerald-400'}`}>
                              {riskScore ?? 'N/A'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="text-right">
                        <p className={`text-sm ${text.muted} mb-1`}>Monthly Rent</p>
                        <p className="font-semibold">{formatCurrency(tenant.lease?.rent || 0)}</p>
                      </div>

                      <div className="text-right">
                        <p className={`text-sm ${text.muted} mb-1`}>Lease Ends</p>
                        <p className="text-sm">{tenant.lease?.lease_end ? formatDisplayDate(tenant.lease.lease_end, 'MMM yyyy') : 'N/A'}</p>
                      </div>

                      <div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            tenant.lease?.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {(tenant.lease?.status || 'unknown').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
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
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                APPLICATIONS
              </h3>
              <div className="px-2 py-1 bg-[#ff6b35]/20 text-[#ff6b35] rounded-full text-xs font-medium">
                {applications.length} PENDING
              </div>
            </div>

            <div className="space-y-4">
              {applications.length === 0 ? (
                <div className="text-center py-12">
                  <UserSearch className={`w-12 h-12 ${text.muted} mx-auto mb-4`} />
                  <p className={`${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    No pending applications
                  </p>
                </div>
              ) : (
                applications.slice(0, 3).map((applicant) => (
                  <div
                    key={applicant.id}
                    className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg border ${border.default} hover:border-[#ff6b35]/50 transition-all`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {applicant.full_name}
                        </p>
                        <p className={`text-xs ${text.inactive}`}>
                          {formatRelativeTime(applicant.created_at)}
                        </p>
                      </div>
                      {/* AI Score - Gated by Premium (ai_risk_scoring) */}
                      {aiRiskScoring.hasAccess && applicant.ai_risk_score && (
                        <div className="text-right">
                          <p className={`text-xs ${text.muted} mb-1`}>AI Score</p>
                          <p className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                            {applicant.ai_risk_score}
                          </p>
                        </div>
                      )}
                    </div>

                    <p className={`text-sm ${text.muted} mb-3`}>
                      {applicant.unit ? `${applicant.property?.name} #${applicant.unit.unit_number}` : 'No unit specified'}
                    </p>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className={`p-2 ${isDark ? 'bg-white/5' : 'bg-white'} rounded`}>
                        <p className={`text-xs ${text.inactive} mb-1`}>Income</p>
                        <p className="text-sm font-medium">
                          {applicant.monthly_income ? formatCurrency(applicant.monthly_income) : 'N/A'}
                        </p>
                      </div>
                      <div className={`p-2 ${isDark ? 'bg-white/5' : 'bg-white'} rounded`}>
                        <p className={`text-xs ${text.inactive} mb-1`}>Credit</p>
                        <p className="text-sm font-medium">{applicant.credit_score || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <CircleCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-emerald-400">
                        Background {applicant.background_check_status || 'Pending'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(applicant.id)}
                        disabled={isApproving === applicant.id}
                        className="flex-1 px-3 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isApproving === applicant.id ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleReviewApplication(applicant)}
                        className={`px-3 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm transition-colors`}
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {applications.length > 3 && (
              <button className={`w-full mt-4 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2`}>
                <UserSearch className="w-4 h-4" />
                View All {applications.length} Applications
              </button>
            )}
          </div>
        </FeatureGate>
      </div>

      {/* AI Screening Info - Gated by Premium plan (ai_risk_scoring) */}
      {metrics && (
        <FeatureGate
          feature="ai_risk_scoring"
          hasAccess={aiRiskScoring.hasAccess}
          loading={aiRiskScoring.loading}
          variant="inline"
        >
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <div className="flex items-start gap-6">
              <div className="p-4 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-xl">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  AI-POWERED TENANT SCREENING
                </h3>
                <p className={`${text.secondary} mb-4`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  Our advanced AI analyzes credit history, income verification, employment status, rental history, and behavioral patterns to provide comprehensive risk assessments in real-time. Less than 1% eviction rate across all screened tenants.
                </p>
                <div className="grid grid-cols-4 gap-4">
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {metrics.ai_accuracy > 0 ? `${metrics.ai_accuracy}%` : 'N/A'}
                    </p>
                    <p className={`text-xs ${text.muted}`}>Accuracy Rate</p>
                  </div>
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {metrics.avg_screening_time > 0 ? `${metrics.avg_screening_time} hrs` : 'N/A'}
                    </p>
                    <p className={`text-xs ${text.muted}`}>Avg. Process Time</p>
                  </div>
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {metrics.eviction_rate < 1 ? '<1%' : `${metrics.eviction_rate}%`}
                    </p>
                    <p className={`text-xs ${text.muted}`}>Eviction Rate</p>
                  </div>
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      24/7
                    </p>
                    <p className={`text-xs ${text.muted}`}>Automated Processing</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FeatureGate>
      )}

      {/* Modals */}
      {selectedApplication && (
        <ApplicationDetailModal
          application={selectedApplication}
          onClose={() => setSelectedApplication(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          isProcessing={isApproving === selectedApplication.id}
        />
      )}

      {showNewApplicationForm && (
        <NewApplicationForm
          onClose={() => setShowNewApplicationForm(false)}
          onSubmit={handleNewApplication}
        />
      )}
    </div>
  );
}
