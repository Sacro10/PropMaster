import { Search, TrendingUp, ListFilter, RefreshCw, Users, X, Trash2 } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate, LockedFeatureCard } from './UpgradeCTA';
import { useTenants, useRentalApplications, useTenantMetrics } from '../../lib/hooks/useTenants';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import { formatCurrency } from '../../lib/utils/currencyHelpers';
import { formatDisplayDate } from '../../lib/utils/dateHelpers';
import { useEffect, useMemo, useState } from 'react';
import { ApplicationDetailModal } from './ApplicationDetailModal';
import { InviteTenantsModal } from './InviteTenantsModal';
import { deleteTenant, setLeaseAutoPay } from '../../lib/api/tenants';
import { Switch } from './ui/switch';
import { useLocation } from 'react-router-dom';

export function TenantManagement() {
  const { isDark, bg, text, border } = useThemeStyles();
  const location = useLocation();
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllTenants, setShowAllTenants] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);
  const [autoPayUpdating, setAutoPayUpdating] = useState<Record<string, boolean>>({});

  // Feature checks for plan gating
  const aiRiskScoring = useHasFeature('ai_risk_scoring');

  // Fetch data
  const { data: tenants, loading: tenantsLoading, error: tenantsError, refetch: refetchTenants } = useTenants();
  const { loading: appsLoading, error: appsError, refetch: refetchApps, approve, reject } = useRentalApplications();
  const { data: metrics, loading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useTenantMetrics();

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
  const visibleTenants = (!showAllTenants && !searchQuery.trim())
    ? filteredTenants.slice(0, 6)
    : filteredTenants;
  const hasExtraTenants = !searchQuery.trim() && filteredTenants.length > 6;
  const highlightedTenantId = new URLSearchParams(location.search).get('tenant');

  useEffect(() => {
    if (!highlightedTenantId) return;
    const element = document.getElementById(`tenant-${highlightedTenantId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedTenantId, filteredTenants]);

  // Handle approve
  const handleApprove = async (applicationId: string) => {
    setIsApproving(applicationId);
    const result = await approve(applicationId);
    setIsApproving(null);

    if (result.success) {
      await refetchTenants();
      await refetchApps();
      console.log('Application approved successfully');
      alert('Application approved. Tenant is now in Active Tenants.');
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

  const handleDeleteTenant = async (tenant: any) => {
    if (!tenant?.lease?.id) {
      alert('Unable to delete tenant without an active lease.');
      return;
    }

    const name = tenant.full_name || 'this tenant';
    const confirmed = confirm(`Delete ${name}? This will remove their active lease.`);
    if (!confirmed) return;

    try {
      setDeletingTenantId(tenant.lease.id);
      await deleteTenant(tenant.lease.id, tenant.user_id);
      await refetchTenants();
      await refetchApps();
      await refetchMetrics();
    } catch (error) {
      console.error('Failed to delete tenant:', error);
      alert('Failed to delete tenant. Please try again.');
    } finally {
      setDeletingTenantId(null);
    }
  };

  const handleAutoPayToggle = async (tenant: any, enabled: boolean) => {
    const leaseId = tenant?.lease?.id;
    if (!leaseId) {
      alert('Unable to update auto-pay without an active lease.');
      return;
    }

    setAutoPayUpdating((prev) => ({ ...prev, [leaseId]: true }));
    try {
      await setLeaseAutoPay(leaseId, enabled);
      await refetchTenants();
    } catch (error) {
      console.error('Failed to update auto-pay:', error);
      alert('Failed to update auto-pay. Please try again.');
    } finally {
      setAutoPayUpdating((prev) => {
        const next = { ...prev };
        delete next[leaseId];
        return next;
      });
    }
  };

  // Show loading state
  if (tenantsLoading || appsLoading || metricsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (tenantsError || appsError || metricsError) {
    return <ErrorState error={tenantsError || appsError || metricsError} retry={() => {
      refetchTenants();
      refetchApps();
      refetchMetrics();
    }} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            TENANT MANAGEMENT
          </h2>
          <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Comprehensive tenant screening with AI risk assessment
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
            onClick={() => setShowInviteModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + Add New Tenant
          </button>
        </div>
      </div>

      {/* Active Tenants */}
      <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              ACTIVE TENANTS
            </h3>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 lg:w-auto lg:justify-end">
              <div className="min-w-0 flex-1 sm:flex-none">
                <div className="relative">
                  <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${text.muted}`} />
                  <input
                    type="text"
                    placeholder="Search by name, email, phone, property, or unit..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`pl-10 pr-10 py-2 w-full sm:w-[22rem] md:w-[26rem] xl:w-[32rem] ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50 transition-colors`}
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
              <button className={`self-end p-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-colors sm:self-auto`}>
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
              visibleTenants.map((tenant) => {
                const initials = tenant.full_name
                  ? tenant.full_name.split(' ').map(n => n[0]).join('').substring(0, 2)
                  : 'T';
                const unitDisplay = tenant.unit ? `${tenant.property?.name} #${tenant.unit.unit_number}` : 'No unit';
                const riskScore = tenant.ai_risk_score;
                const riskColor = riskScore == null ? 'from-gray-400 to-gray-500' :
                                 riskScore >= 90 ? 'from-emerald-400 to-emerald-500' :
                                 riskScore >= 70 ? 'from-amber-400 to-amber-500' :
                                 'from-red-400 to-red-500';
                const leaseStatusClass = tenant.lease?.status === 'active'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400';

                const tenantKey = [
                  tenant.id,
                  tenant.lease?.id,
                  tenant.unit?.id,
                ]
                  .filter(Boolean)
                  .join('-');
                const detailGridColumns = aiRiskScoring.hasAccess
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

                return (
                  <div
                    key={tenantKey}
                    id={`tenant-${tenant.user_id}`}
                    className={`grid grid-cols-1 gap-4 p-4 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-all border ${highlightedTenantId === tenant.user_id ? 'border-[#ff6b35] shadow-[0_0_0_1px_rgba(255,107,53,0.4)]' : border.default} hover:border-[#ff6b35]/50 group xl:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-full flex items-center justify-center font-semibold text-white">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium mb-1 break-normal leading-tight" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {tenant.full_name || 'Unknown Tenant'}
                        </p>
                        <p className={`text-sm ${text.muted} break-normal`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {unitDisplay}
                        </p>
                      </div>
                    </div>

                    <div className={`grid gap-3 w-full ${detailGridColumns} xl:items-end`}>
                      {aiRiskScoring.hasAccess && (
                        <div className="min-w-0">
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

                      <div className="min-w-0">
                        <p className={`text-sm ${text.muted} mb-1`}>Monthly Rent</p>
                        <p className="font-semibold">{formatCurrency(tenant.lease?.rent || 0)}</p>
                      </div>

                      <div className="min-w-0">
                        <p className={`text-sm ${text.muted} mb-1`}>Lease Ends</p>
                        <p className="text-sm">{tenant.lease?.lease_end ? formatDisplayDate(tenant.lease.lease_end, 'MMM yyyy') : 'N/A'}</p>
                      </div>

                      <div className="min-w-0">
                        <p className={`text-sm ${text.muted} mb-1`}>Auto-Pay</p>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={Boolean(tenant.lease?.auto_pay_enabled)}
                            onCheckedChange={(checked) => handleAutoPayToggle(tenant, checked)}
                            disabled={tenant.lease?.id ? Boolean(autoPayUpdating[tenant.lease.id]) : true}
                            aria-label={`Toggle auto-pay for ${tenant.full_name || 'tenant'}`}
                          />
                          <span className={`text-xs ${text.muted}`}>
                            {tenant.lease?.auto_pay_enabled ? 'On' : 'Off'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 min-w-0 sm:justify-between">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${leaseStatusClass}`}>
                          {(tenant.lease?.status || 'unknown').toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteTenant(tenant)}
                          disabled={deletingTenantId === tenant.lease?.id}
                          className={`p-2 rounded-lg transition-colors ${
                            isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-white hover:bg-gray-100'
                          } ${deletingTenantId === tenant.lease?.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title="Delete tenant"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {hasExtraTenants && (
            <button
              type="button"
              onClick={() => setShowAllTenants((prev) => !prev)}
              className={`w-full mt-4 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm font-medium transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              aria-expanded={showAllTenants}
            >
              {showAllTenants ? 'Show less' : 'Show all tenants'}
            </button>
          )}
      </div>

      {/* AI Screening Info - Gated by Premium plan (ai_risk_scoring) */}
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
            </div>
          </div>
        </div>
      </FeatureGate>

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

      <InviteTenantsModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={() => {
          refetchApps();
        }}
      />
    </div>
  );
}
