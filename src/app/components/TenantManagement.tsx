import { Search, UserSearch, CircleCheck, TrendingUp, ListFilter, RefreshCw, Users } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate, LockedFeatureCard } from './UpgradeCTA';
import { useTenants, useRentalApplications, useTenantMetrics } from '../../lib/hooks/useTenants';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import { formatCurrency } from '../../lib/utils/currencyHelpers';
import { formatDisplayDate, formatRelativeTime } from '../../lib/utils/dateHelpers';
import { useState } from 'react';
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

  // Filter tenants based on search query
  const filteredTenants = searchQuery.trim()
    ? tenants.filter(tenant => {
        const searchLower = searchQuery.toLowerCase();
        const fullName = (tenant.full_name || '').toLowerCase();
        const email = (tenant.email || '').toLowerCase();
        const phone = (tenant.phone || '').toLowerCase();
        return fullName.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower);
      })
    : tenants;

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

  const screeningMetrics = metrics ? [
    {
      label: 'Avg. Screening Time',
      value: metrics.avg_screening_time > 0 ? `${metrics.avg_screening_time} hrs` : 'N/A',
      change: '-23%' // TODO: Calculate actual change
    },
    {
      label: 'Acceptance Rate',
      value: metrics.acceptance_rate > 0 ? `${metrics.acceptance_rate}%` : '0%',
      change: '+5%' // TODO: Calculate actual change
    },
    {
      label: 'AI Accuracy',
      value: metrics.ai_accuracy > 0 ? `${metrics.ai_accuracy}%` : 'N/A',
      change: '+2%' // TODO: Calculate actual change
    },
    {
      label: 'Eviction Rate',
      value: metrics.eviction_rate < 1 ? '<1%' : `${metrics.eviction_rate}%`,
      change: '0%'
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
                  <span className={`text-sm ${metric.change.startsWith('-') || metric.change === '0%' ? 'text-emerald-400' : 'text-emerald-400'}`}>
                    {metric.change}
                  </span>
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
              <div className="relative">
                <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${text.muted}`} />
                <input
                  type="text"
                  placeholder="Search tenants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`pl-10 pr-4 py-2 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
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
                const riskScore = tenant.ai_risk_score || 0;
                const riskColor = riskScore >= 90 ? 'from-emerald-400 to-emerald-500' :
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
                                style={{ width: `${riskScore}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-emerald-400">{riskScore}</span>
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
