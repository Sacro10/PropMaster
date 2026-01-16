import { X, User, DollarSign, Briefcase, MapPin, Calendar, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatCurrency } from '../../lib/utils/currencyHelpers';
import { formatDisplayDate } from '../../lib/utils/dateHelpers';

interface ApplicationDetailModalProps {
  application: any;
  onClose: () => void;
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string, reason?: string) => Promise<void>;
  isProcessing?: boolean;
}

export function ApplicationDetailModal({
  application,
  onClose,
  onApprove,
  onReject,
  isProcessing = false,
}: ApplicationDetailModalProps) {
  const { isDark, bg, text, border } = useThemeStyles();

  if (!application) return null;

  const applicationData = application.application_data || application.applicationData || {};
  const fallbackName = `${application.firstName || application.first_name || ''} ${application.lastName || application.last_name || ''}`.trim();
  const fullName =
    application.full_name ||
    application.fullName ||
    applicationData.fullName ||
    fallbackName ||
    'Unknown Applicant';
  const moveInDate =
    application.moveInDate ||
    application.move_in_date ||
    application.desired_move_in_date ||
    null;
  const currentEmployer =
    application.currentEmployer ||
    application.current_employer ||
    application.employer ||
    applicationData.currentEmployer ||
    applicationData.current_employer ||
    'N/A';
  const currentAddress =
    application.currentAddress ||
    application.current_address ||
    applicationData.currentAddress ||
    applicationData.current_address ||
    'N/A';

  const screening = application.screeningResult || application.screening_result;
  const riskScore = screening?.riskScore || screening?.risk_score || 0;
  const creditScore = screening?.creditScore || screening?.credit_score || 0;
  const riskLevel =
    screening?.riskLevel ||
    screening?.risk_level ||
    screening?.raw_data?.risk_level ||
    null;
  const recommendation =
    screening?.recommendation ||
    screening?.raw_data?.recommendation ||
    screening?.recommendations ||
    null;
  const notes =
    screening?.notes ||
    screening?.raw_data?.notes ||
    null;
  const reasons =
    screening?.reasons ||
    screening?.raw_data?.reasons ||
    screening?.riskFactors ||
    screening?.risk_factors ||
    [];
  const isActionable = ['pending', 'submitted'].includes(application.status);

  const handleApprove = async () => {
    if (onApprove && !isProcessing) {
      await onApprove(application.id);
      onClose();
    }
  };

  const handleReject = async () => {
    if (onReject && !isProcessing) {
      const reason = window.prompt('Reason for rejection (optional):');
      await onReject(application.id, reason || undefined);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto ${
          isDark ? 'bg-[#0f1523]' : 'bg-white'
        } rounded-xl shadow-2xl border ${border.default}`}
      >
        {/* Header */}
        <div className={`sticky top-0 flex items-center justify-between p-6 border-b ${border.default} ${bg.secondary}`}>
          <div>
            <h2 className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              APPLICATION REVIEW
            </h2>
            <p className={`${text.muted} mt-1`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {fullName}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Applicant Info */}
          <div>
            <h3 className="text-xl font-bold mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              APPLICANT INFORMATION
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Full Name</p>
                </div>
                <p className="font-medium">
                  {fullName}
                </p>
              </div>

              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Email</p>
                </div>
                <p className="font-medium">{application.email}</p>
              </div>

              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Phone</p>
                </div>
                <p className="font-medium">{application.phone || 'N/A'}</p>
              </div>

              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Move-in Date</p>
                </div>
                <p className="font-medium">
                  {moveInDate ? formatDisplayDate(moveInDate) : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Property Info */}
          <div>
            <h3 className="text-xl font-bold mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              PROPERTY DETAILS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Property</p>
                </div>
                <p className="font-medium">{application.property?.name || 'N/A'}</p>
              </div>

              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Unit</p>
                </div>
                <p className="font-medium">#{application.unit?.unitNumber || application.unit?.unit_number || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Financial Info */}
          <div>
            <h3 className="text-xl font-bold mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              FINANCIAL INFORMATION
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Monthly Income</p>
                </div>
                <p className="text-xl font-bold text-emerald-400">
                  {formatCurrency(application.monthlyIncome || application.monthly_income || 0)}
                </p>
              </div>

              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Current Employer</p>
                </div>
                <p className="font-medium">{currentEmployer}</p>
              </div>

              <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-[#ff6b35]" />
                  <p className={`text-sm ${text.muted}`}>Current Address</p>
                </div>
                <p className="font-medium text-sm">{currentAddress}</p>
              </div>
            </div>
          </div>

          {/* Screening Results */}
          {screening && (
            <div>
              <h3 className="text-xl font-bold mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                SCREENING RESULTS
              </h3>
              <div className="space-y-4">
                {/* Risk Score */}
                <div className={`p-6 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-gradient-to-br from-gray-50 to-white'} rounded-lg border ${border.default}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className={`text-sm ${text.muted} mb-1`}>AI Risk Score</p>
                      <p className="text-4xl font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                        {riskScore}/100
                      </p>
                      {riskLevel && (
                        <p className={`text-xs ${text.muted} mt-2`}>
                          Risk Level: <span className="font-semibold text-white">{riskLevel}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={`text-sm ${text.muted} mb-1`}>Credit Score</p>
                      <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                        {creditScore}
                      </p>
                    </div>
                  </div>
                  <div className={`w-full h-2 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                    <div
                      className={`h-full bg-gradient-to-r ${
                        riskScore >= 85 ? 'from-emerald-400 to-emerald-500' :
                        riskScore >= 70 ? 'from-amber-400 to-amber-500' :
                        'from-red-400 to-red-500'
                      }`}
                      style={{ width: `${riskScore}%` }}
                    />
                  </div>
                </div>

                {/* Screening Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <div className="flex items-center gap-2 mb-2">
                      {screening.backgroundCheckStatus === 'clear' || screening.background_check_status === 'clear' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-400" />
                      )}
                      <p className={`text-sm ${text.muted}`}>Background Check</p>
                    </div>
                    <p className="font-medium capitalize">
                      {screening.backgroundCheckStatus || screening.background_check_status || 'Pending'}
                    </p>
                  </div>

                  <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <div className="flex items-center gap-2 mb-2">
                      {screening.incomeVerificationStatus === 'verified' || screening.income_verification_status === 'verified' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                      <p className={`text-sm ${text.muted}`}>Income Verification</p>
                    </div>
                    <p className="font-medium capitalize">
                      {screening.incomeVerificationStatus || screening.income_verification_status || 'Pending'}
                    </p>
                  </div>

                  <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <div className="flex items-center gap-2 mb-2">
                      {!(screening.evictionHistory || screening.eviction_history) ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                      <p className={`text-sm ${text.muted}`}>Eviction History</p>
                    </div>
                    <p className="font-medium">
                      {(screening.evictionHistory || screening.eviction_history) ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>

                {/* Recommendations */}
                {recommendation && (
                  <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg border-l-4 ${
                    riskScore >= 85 ? 'border-emerald-400' :
                    riskScore >= 70 ? 'border-amber-400' :
                    'border-red-400'
                  }`}>
                    <p className={`text-sm ${text.muted} mb-2`}>Recommendation</p>
                    <p className="font-medium">{recommendation}</p>
                  </div>
                )}

                {/* Risk Factors */}
                {Array.isArray(reasons) && reasons.length > 0 && (
                  <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <p className={`text-sm ${text.muted} mb-3`}>Risk Factors</p>
                    <div className="flex flex-wrap gap-2">
                      {reasons.map((factor: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-medium"
                        >
                          {factor.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {notes && (
                  <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <p className={`text-sm ${text.muted} mb-2`}>Screening Notes</p>
                    <p className="text-sm">{notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`sticky bottom-0 flex items-center justify-end gap-3 p-6 border-t ${border.default} ${bg.secondary}`}>
          <button
            onClick={onClose}
            className={`px-6 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg font-medium transition-colors`}
            disabled={isProcessing}
          >
            Close
          </button>
          {onReject && (
            <button
              onClick={handleReject}
              className={`px-6 py-3 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg font-medium transition-colors disabled:opacity-50`}
              disabled={isProcessing || !isActionable}
            >
              {isProcessing ? 'Processing...' : 'Reject'}
            </button>
          )}
          {onApprove && (
            <button
              onClick={handleApprove}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isProcessing || !isActionable}
            >
              {isProcessing ? 'Approving...' : 'Approve Application'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
