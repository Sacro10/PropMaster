import { DollarSign, TrendingUp, CircleCheck, Clock, Activity, RefreshCw, X } from 'lucide-react';
import { useHasFeature } from '../hooks/usePlanGating';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { FeatureGate } from './UpgradeCTA';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import {
  useRecentPayments,
  usePendingPayments,
  useOwnerDisbursements,
  useCollectionStats,
} from '../../lib/hooks/usePayments';
import { processDisbursement } from '../../lib/api/payments';
import { formatCurrency, formatCurrencyCompact } from '../../lib/utils/currencyHelpers';
import { formatDisplayDate } from '../../lib/utils/dateHelpers';
import { useState } from 'react';

export function RentCollection() {
  const { isDark, text, border } = useThemeStyles();
  const [processingDisbursement, setProcessingDisbursement] = useState<string | null>(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showAllPendingPayments, setShowAllPendingPayments] = useState(false);
  const [selectedPendingPayment, setSelectedPendingPayment] = useState<any | null>(null);

  // Feature checks for plan gating
  const integratedAccounting = useHasFeature('integrated_accounting');

  // Fetch data
  const { data: recentPayments, loading: paymentsLoading, error: paymentsError, refetch: refetchPayments } = useRecentPayments();
  const { data: pendingPayments, loading: pendingLoading } = usePendingPayments();
  const { data: disbursements, loading: disbursementsLoading, refetch: refetchDisbursements } = useOwnerDisbursements();
  const { data: stats, loading: statsLoading } = useCollectionStats();

  // Show loading state
  if (paymentsLoading || statsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (paymentsError) {
    return <ErrorState error={paymentsError} retry={refetchPayments} />;
  }

  // Prepare stats display
  const collectionStatsDisplay = stats ? [
    { label: 'Collected This Month', value: formatCurrencyCompact(stats.collected_this_month) },
    { label: 'Collection Rate', value: `${stats.collection_rate}%` },
    { label: 'Auto-Pay Enrolled', value: `${stats.auto_pay_enrolled}%` },
    { label: 'Avg. Collection Time', value: `${stats.avg_collection_time} days` },
  ] : [];
  const autoPayEnrolledPercent = stats ? Number(stats.auto_pay_enrolled) : 0;
  const visiblePendingPayments = showAllPendingPayments ? pendingPayments : pendingPayments.slice(0, 3);
  const hasExtraPendingPayments = pendingPayments.length > 3;

  const buildReminderMailto = (payment: any) => {
    const propertyLabel = payment.unit ? `${payment.property} #${payment.unit}` : payment.property;
    const subject = `Rent payment overdue - ${propertyLabel}`;
    const body = [
      `Hi ${payment.tenant},`,
      '',
      `This is a friendly reminder that your rent payment of ${formatCurrency(payment.amount)} for ${propertyLabel} was due on ${formatDisplayDate(payment.dueDate)} and is currently ${payment.daysOverdue} day${payment.daysOverdue !== 1 ? 's' : ''} overdue.`,
      '',
      'Please submit payment at your earliest convenience.',
      '',
      'Thank you,',
      'Property Management',
    ].join('\n');

    return `mailto:${payment.tenantEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Handle send reminder
  const handleSendReminder = (payment: any) => {
    if (!payment.tenantEmail) {
      alert('No tenant email on file. Please add an email address to send a reminder.');
      return;
    }

    window.location.href = buildReminderMailto(payment);
  };

  // Handle process disbursement
  const handleProcessDisbursement = async (disbursementId: string) => {
    try {
      setProcessingDisbursement(disbursementId);
      const idempotencyKey = `process-${disbursementId}-${Date.now()}`;
      await processDisbursement(disbursementId, idempotencyKey);
      console.log('Disbursement processed successfully');
      refetchDisbursements();
    } catch (error) {
      console.error('Failed to process disbursement:', error);
      alert('Failed to process disbursement. Please try again.');
    } finally {
      setProcessingDisbursement(null);
    }
  };

  // Note: auto-pay stats come directly from API via stats.auto_pay_enrolled

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            RENT COLLECTIONS & DISBURSEMENTS
          </h2>
          <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Convenient payment options and owner disbursements with integrated accounting
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetchPayments}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (disbursements.length > 0) {
                handleProcessDisbursement(disbursements[0].id);
              }
            }}
            disabled={disbursements.length === 0 || processingDisbursement !== null}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ fontFamily: 'Work Sans, sans-serif' }}
          >
            {processingDisbursement ? 'Processing...' : 'Process Disbursement'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6">
        {collectionStatsDisplay.map((stat, index) => (
          <div
            key={index}
            className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6 hover:border-[#ff6b35]/50 transition-all`}
          >
            <p className={`text-sm ${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {stat.label}
            </p>
            <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Recent Payments */}
        <div className={`col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              RECENT PAYMENTS
            </h3>
          </div>

          {recentPayments.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 mx-auto mb-4 text-white/20" />
              <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                No recent payments
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {(showAllTransactions ? recentPayments : recentPayments.slice(0, 5)).map((payment) => {
                  const propertyName = payment.property?.name || 'Unknown Property';
                  const unitNumber = payment.unit?.unit_number || '';
                  const fullName = unitNumber ? `${propertyName} #${unitNumber}` : propertyName;

                  return (
                    <div
                      key={payment.id}
                      className={`flex items-center justify-between p-4 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-all border ${border.default}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-full flex items-center justify-center">
                          <DollarSign className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            {payment.tenant_name || 'Unknown Tenant'}
                          </p>
                          <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            {fullName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className={`text-sm ${text.muted} mb-1`}>Amount</p>
                          <p className="font-semibold text-lg" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                            {formatCurrency(payment.amount)}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className={`text-sm ${text.muted} mb-1`}>Method</p>
                          <p className="text-sm">{payment.payment_method || 'N/A'}</p>
                        </div>

                        <div className="text-right">
                          <p className={`text-sm ${text.muted} mb-1`}>Date</p>
                          <p className="text-sm">{formatDisplayDate(payment.payment_date)}</p>
                        </div>

                        <div>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              payment.payment_status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : payment.payment_status === 'processing'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {payment.payment_status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {recentPayments.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllTransactions((prev) => !prev)}
                  className={`w-full mt-4 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm font-medium transition-colors`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                  aria-expanded={showAllTransactions}
                >
                  {showAllTransactions ? 'Show Recent Transactions' : 'View All Transactions'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Pending Payments */}
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                PENDING PAYMENTS
              </h3>
              {pendingPayments.length > 0 && (
                <div className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                  {pendingPayments.length} OVERDUE
                </div>
              )}
            </div>

            {pendingLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pendingPayments.length === 0 ? (
              <div className="text-center py-8">
                <CircleCheck className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
                <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No pending payments
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visiblePendingPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className={`p-4 ${isDark ? 'bg-white/5' : 'bg-red-50'} rounded-lg border border-red-500/20 hover:border-red-500/40 transition-all`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {payment.tenant}
                        </p>
                        <p className={`text-xs ${text.inactive}`}>{payment.property} {payment.unit ? `#${payment.unit}` : ''}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-sm ${text.muted}`}>Amount Due</span>
                      <span className="text-lg font-bold text-red-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>

                    <div className="p-2 bg-red-500/10 rounded mb-3">
                      <p className="text-xs text-red-400">
                        {payment.daysOverdue} day{payment.daysOverdue !== 1 ? 's' : ''} overdue • Due: {formatDisplayDate(payment.dueDate)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSendReminder(payment)}
                        disabled={!payment.tenantEmail}
                        className="flex-1 px-3 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ fontFamily: 'Work Sans, sans-serif' }}
                        title={payment.tenantEmail ? 'Send reminder email' : 'Add a tenant email to send a reminder'}
                      >
                        Send Reminder
                      </button>
                      <button
                        onClick={() => setSelectedPendingPayment(payment)}
                        className={`px-3 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg text-sm transition-colors`}
                        style={{ fontFamily: 'Work Sans, sans-serif' }}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                ))}
                {hasExtraPendingPayments && (
                  <button
                    type="button"
                    onClick={() => setShowAllPendingPayments((prev) => !prev)}
                    className={`w-full mt-2 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm font-medium transition-colors`}
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                    aria-expanded={showAllPendingPayments}
                  >
                    {showAllPendingPayments ? 'Show less' : 'Show all pending payments'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Auto-Pay Info */}
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
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
                <p className={`text-xs ${text.secondary}`}>
                  {stats?.auto_pay_enrolled}% of tenants enrolled in auto-pay
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className={text.muted}>Auto-Pay Enrolled</span>
                  <span className="font-medium">{autoPayEnrolledPercent}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className={text.muted}>Success Rate</span>
                  <span className="text-emerald-400 font-medium">99.2%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className={text.muted}>Avg. Payment Day</span>
                  <span className="font-medium">1st of month</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Disbursements */}
      <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            OWNER DISBURSEMENTS
          </h3>
          {disbursements.length > 0 && (
            <div className="flex items-center gap-3">
              <span className={`text-sm ${text.muted}`}>Next scheduled: {formatDisplayDate(disbursements[0]?.scheduled_date)}</span>
              <div className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium">
                {disbursements.length} PENDING
              </div>
            </div>
          )}
        </div>

        {disbursementsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className={`text-sm ${text.muted}`}>Loading disbursements...</p>
            </div>
          </div>
        ) : disbursements.length === 0 ? (
          <div className="text-center py-12">
            <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              No pending disbursements
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {disbursements.slice(0, 3).map((disbursement) => (
              <div
                key={disbursement.id}
                className={`p-5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg border ${border.default} hover:border-[#ff6b35]/50 transition-all`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-semibold mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {disbursement.owner_name || 'Owner'}
                    </h4>
                    <p className={`text-xs ${text.inactive}`}>{disbursement.property_count || 0} properties</p>
                  </div>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                    {disbursement.status.toUpperCase()}
                  </span>
                </div>

                <div className="mb-4">
                  <p className={`text-sm ${text.muted} mb-1`}>Disbursement Amount</p>
                  <p className="text-3xl font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {formatCurrency(disbursement.amount)}
                  </p>
                </div>

                <div className={`flex items-center gap-2 text-sm ${text.muted} mb-4`}>
                  <Clock className="w-4 h-4" />
                  <span>Scheduled: {formatDisplayDate(disbursement.scheduled_date)}</span>
                </div>

                <button
                  onClick={() => handleProcessDisbursement(disbursement.id)}
                  disabled={processingDisbursement === disbursement.id}
                  className="w-full py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  {processingDisbursement === disbursement.id ? 'Processing...' : 'Process Now'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Methods Info - Gated by Premium (integrated_accounting) */}
      <FeatureGate
        feature="integrated_accounting"
        hasAccess={integratedAccounting.hasAccess}
        loading={integratedAccounting.loading}
        variant="inline"
      >
        <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-start gap-6">
            <div className="p-4 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-xl">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                INTEGRATED ACCOUNTING & PAYMENT OPTIONS
              </h3>
              <p className={`${text.secondary} mb-4`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                Accept payments via credit card, debit card, ACH, bank transfer, and check. Automated rent collection with auto-pay enrollment reduces late payments by 94%. Integrated accounting automatically categorizes income, tracks expenses, and generates financial reports.
              </p>
              {stats && (
                <div className="grid grid-cols-5 gap-4">
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {stats.collection_rate}%
                    </p>
                    <p className={`text-xs ${text.inactive}`}>Collection Rate</p>
                  </div>
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {stats.auto_pay_enrolled}%
                    </p>
                    <p className={`text-xs ${text.inactive}`}>Auto-Pay Enrolled</p>
                  </div>
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {stats.avg_collection_time}
                    </p>
                    <p className={`text-xs ${text.inactive}`}>Days to Collect</p>
                  </div>
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {formatCurrencyCompact(stats.collected_this_month)}
                    </p>
                    <p className={`text-xs ${text.inactive}`}>Monthly Revenue</p>
                  </div>
                  <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                    <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      100%
                    </p>
                    <p className={`text-xs ${text.inactive}`}>Automated</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </FeatureGate>

      {/* Pending Payment Details Modal */}
      {selectedPendingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedPendingPayment(null)}
          />
          <div
            className={`relative w-full max-w-lg ${
              isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white'
            } border ${border.default} rounded-xl shadow-2xl`}
          >
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                PAYMENT DETAILS
              </h3>
              <button
                onClick={() => setSelectedPendingPayment(null)}
                className={`p-2 ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
                aria-label="Close details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${text.muted}`}>Tenant</span>
                <span className={text.primary}>{selectedPendingPayment.tenant}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${text.muted}`}>Email</span>
                <span className={text.primary}>{selectedPendingPayment.tenantEmail || 'No email on file'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${text.muted}`}>Property</span>
                <span className={text.primary}>
                  {selectedPendingPayment.property}{selectedPendingPayment.unit ? ` #${selectedPendingPayment.unit}` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${text.muted}`}>Amount Due</span>
                <span className="text-lg font-semibold text-red-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {formatCurrency(selectedPendingPayment.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${text.muted}`}>Due Date</span>
                <span className={text.primary}>{formatDisplayDate(selectedPendingPayment.dueDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${text.muted}`}>Days Overdue</span>
                <span className={text.primary}>{selectedPendingPayment.daysOverdue}</span>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleSendReminder(selectedPendingPayment)}
                  disabled={!selectedPendingPayment.tenantEmail}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  Send Reminder
                </button>
                <button
                  onClick={() => setSelectedPendingPayment(null)}
                  className={`px-3 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg text-sm transition-colors`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
