import { Key, Clock, CircleCheck, Calendar, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useHasFeature } from '../hooks/usePlanGating';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { FeatureGate } from './UpgradeCTA';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import {
  useUpcomingShowings,
  useAvailableProperties,
  useShowingStats,
} from '../../lib/hooks/useShowings';
import { sendShowingReminder } from '../../lib/api/showings';
import { formatRelativeTime } from '../../lib/utils/dateHelpers';
import { ScheduleShowingModal } from './ScheduleShowingModal';
import { getGmailConnectUrl, getGmailStatus } from '../../lib/api/integrations';

export function PropertyShowings() {
  const { isDark, text, border } = useThemeStyles();
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | undefined>(undefined);
  const [selectedShowing, setSelectedShowing] = useState<any | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string | null } | null>(null);

  // Feature checks for plan gating - Electronic showings require Premium
  const electronicShowings = useHasFeature('electronic_showings');

  // Fetch data
  const { data: showings, loading: showingsLoading, error: showingsError, refetch: refetchShowings } = useUpcomingShowings();
  const { data: availableProperties, loading: propertiesLoading } = useAvailableProperties();
  const { data: stats, loading: statsLoading } = useShowingStats();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const gmailResult = searchParams.get('gmail');
    if (gmailResult) {
      if (gmailResult === 'connected') {
        alert('Gmail connected successfully!');
      } else if (gmailResult === 'error') {
        alert('Gmail connection failed. Please try again.');
      }
      searchParams.delete('gmail');
      const newUrl = `${window.location.pathname}?${searchParams.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await getGmailStatus();
        setGmailStatus(status);
      } catch (error) {
        console.error('Failed to load Gmail status:', error);
      }
    };
    loadStatus();
  }, []);

  // Handle sending reminder
  const handleSendReminder = async (showingId: string) => {
    try {
      setSendingReminder(showingId);
      await sendShowingReminder(showingId);
      // Refetch to update reminder_sent_at
      await refetchShowings();
      alert('Reminder sent successfully!');
    } catch (error) {
      console.error('Error sending reminder:', error);
      const code = (error as Error & { code?: string }).code;
      if (code === 'GMAIL_NOT_CONNECTED') {
        alert('Please connect Gmail before sending reminders.');
      } else {
        alert('Failed to send reminder. Please try again.');
      }
    } finally {
      setSendingReminder(null);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const url = await getGmailConnectUrl();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to start Gmail OAuth:', error);
      alert('Failed to connect Gmail. Please try again.');
    }
  };

  // Handle opening modal for scheduling
  const handleOpenModal = (unitId?: string) => {
    setSelectedUnitId(unitId);
    setIsModalOpen(true);
  };

  // Handle closing modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUnitId(undefined);
  };

  // Handle successful showing creation
  const handleShowingSuccess = () => {
    refetchShowings();
  };

  const handleOpenDetails = (showing: any) => {
    setSelectedShowing(showing);
  };

  const handleCloseDetails = () => {
    setSelectedShowing(null);
  };

  // Transform available properties for modal
  const modalUnits = availableProperties.map((prop) => ({
    id: prop.id,
    name: prop.name,
    rent: prop.rent,
    beds: prop.beds,
    baths: prop.baths,
  }));

  // Show loading state
  if (showingsLoading || statsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (showingsError) {
    return <ErrorState error={showingsError} retry={refetchShowings} />;
  }

  // Prepare stats display
  const showingStatsDisplay = stats ? [
    { label: 'Scheduled Today', value: stats.scheduled_today.toString() },
    { label: 'Total This Week', value: stats.total_this_week.toString() },
    { label: 'Avg. Response Time', value: `${stats.avg_response_time} hrs` },
    { label: 'Conversion Rate', value: `${stats.conversion_rate}%` },
  ] : [];

  return (
    <FeatureGate
      feature="electronic_showings"
      hasAccess={electronicShowings.hasAccess}
      loading={electronicShowings.loading}
      variant="inline"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              ELECTRONIC PROPERTY SHOWINGS
            </h2>
            <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Quick and easy 24/7 online access for property viewings
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refetchShowings}
              className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {gmailStatus && !gmailStatus.connected && (
              <button
                onClick={handleConnectGmail}
                className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                Connect Gmail
              </button>
            )}
            <button
              onClick={() => handleOpenModal()}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              + Schedule Showing
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6">
          {showingStatsDisplay.map((stat, index) => (
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
          {/* Upcoming Showings */}
          <div className={`col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              UPCOMING SHOWINGS
            </h3>

            {showings.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-white/20" />
                <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No upcoming showings scheduled
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {showings.map((showing) => {
                  const property = showing.property;
                  const unit = showing.unit;
                  const propertyName = property?.name || 'Unknown Property';
                  const unitNumber = unit?.unit_number || '';
                  const fullName = unitNumber ? `${propertyName} #${unitNumber}` : propertyName;

                  return (
                    <div
                      key={showing.id}
                      className={`p-5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg border ${border.default} hover:border-[#ff6b35]/50 transition-all`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h4 className="font-semibold text-lg" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                              {fullName}
                            </h4>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                showing.status === 'confirmed'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : showing.status === 'completed'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              {showing.status.toUpperCase()}
                            </span>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                showing.showing_type === 'self_guided'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : showing.showing_type === 'virtual'
                                  ? 'bg-purple-500/20 text-purple-400'
                                  : 'bg-indigo-500/20 text-indigo-400'
                              }`}
                            >
                              {showing.showing_type.replace('_', '-').toUpperCase()}
                            </span>
                          </div>
                          <div className={`flex items-center gap-4 text-sm ${text.secondary}`}>
                            <span className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              {new Date(showing.showing_date).toLocaleString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                            <span>•</span>
                            <span>Visitor: {showing.visitor_name}</span>
                          </div>
                        </div>
                      </div>

                      <div className={`flex items-center justify-between p-3 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg border ${border.default}`}>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-lg">
                            <Key className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className={`text-xs ${text.inactive} mb-1`}>Access Code</p>
                            <p className="font-mono font-semibold text-[#ff6b35]">
                              {showing.access_code || '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                              onClick={() => handleSendReminder(showing.id)}
                              disabled={sendingReminder === showing.id}
                              className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                              style={{ fontFamily: 'Work Sans, sans-serif' }}
                            >
                              {sendingReminder === showing.id ? 'Sending...' : 'Send Reminder'}
                            </button>
                            <button
                              onClick={() => handleOpenDetails(showing)}
                              className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg text-sm transition-colors`}
                              style={{ fontFamily: 'Work Sans, sans-serif' }}
                            >
                              Details
                            </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* 24/7 Access */}
            <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-lg">
                  <Key className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  24/7 ACCESS
                </h3>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-emerald-400 font-medium text-sm">System Online</span>
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  </div>
                  <p className={`text-xs ${text.secondary}`}>
                    Self-guided showings available 24/7
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CircleCheck className="w-5 h-5 text-emerald-400" />
                    <span className={`text-sm ${text.secondary}`}>Smart Lock Integration</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CircleCheck className="w-5 h-5 text-emerald-400" />
                    <span className={`text-sm ${text.secondary}`}>Automated Access Codes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CircleCheck className="w-5 h-5 text-emerald-400" />
                    <span className={`text-sm ${text.secondary}`}>Instant Scheduling</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CircleCheck className="w-5 h-5 text-emerald-400" />
                    <span className={`text-sm ${text.secondary}`}>Real-time Notifications</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
              <h3 className="text-xl mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                SHOWING METRICS
              </h3>
              {stats && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${text.secondary}`}>Today's Showings</span>
                    <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {stats.scheduled_today}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${text.secondary}`}>This Week</span>
                    <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {stats.total_this_week}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${text.secondary}`}>Conversion Rate</span>
                    <span className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {stats.conversion_rate}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${text.secondary}`}>Avg. Response</span>
                    <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {stats.avg_response_time}h
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Available Properties */}
        <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            AVAILABLE PROPERTIES
          </h3>
          {propertiesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className={`text-sm ${text.muted}`}>Loading properties...</p>
              </div>
            </div>
          ) : availableProperties.length === 0 ? (
            <div className="text-center py-12">
              <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                No available properties for showing
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {availableProperties.map((property, index) => (
                <div
                  key={index}
                  className={`p-4 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg border ${border.default} hover:border-[#ff6b35]/50 transition-all group`}
                >
                  <h4 className="font-semibold mb-3" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    {property.name}
                  </h4>

                  <p className="text-xl font-bold text-[#ff6b35] mb-3" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {property.rent}
                  </p>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className={text.muted}>Beds/Baths</span>
                      <span className="font-medium">{property.beds}bd / {property.baths}ba</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={text.muted}>Sq Ft</span>
                      <span className="font-medium">{property.sqft || 'N/A'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={text.muted}>Available</span>
                      <span className="font-medium text-emerald-400">{property.available}</span>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between p-2 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded mb-3`}>
                    <span className={`text-xs ${text.inactive}`}>{property.views} views</span>
                    <span className={`text-xs ${text.inactive}`}>{property.scheduled} scheduled</span>
                  </div>

                  <button
                    onClick={() => handleOpenModal(property.id)}
                    className="w-full py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                  >
                    Schedule Showing
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Showing Modal */}
      <ScheduleShowingModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleShowingSuccess}
        preSelectedUnitId={selectedUnitId}
        availableUnits={modalUnits}
      />

      {/* Showing Details Modal */}
      {selectedShowing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleCloseDetails}
          />
          <div
            className={`relative w-full max-w-2xl ${
              isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white'
            } border ${border.default} rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                SHOWING DETAILS
              </h2>
              <button
                onClick={handleCloseDetails}
                className={`px-4 py-2 ${
                  isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'
                } rounded-lg text-sm transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                Close
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className={`text-xs ${text.inactive}`}>Property</p>
                <p className={`text-lg ${text.primary}`}>
                  {selectedShowing.property?.name || 'Unknown Property'}
                  {selectedShowing.unit?.unit_number ? ` #${selectedShowing.unit.unit_number}` : ''}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={`text-xs ${text.inactive}`}>Status</p>
                  <p className={text.primary}>{selectedShowing.status}</p>
                </div>
                <div>
                  <p className={`text-xs ${text.inactive}`}>Type</p>
                  <p className={text.primary}>{selectedShowing.showing_type}</p>
                </div>
                <div>
                  <p className={`text-xs ${text.inactive}`}>Date</p>
                  <p className={text.primary}>
                    {new Date(selectedShowing.showing_date).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${text.inactive}`}>Access Code</p>
                  <p className={`font-mono ${text.primary}`}>
                    {selectedShowing.access_code || '—'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={`text-xs ${text.inactive}`}>Visitor</p>
                  <p className={text.primary}>{selectedShowing.visitor_name}</p>
                </div>
                <div>
                  <p className={`text-xs ${text.inactive}`}>Email</p>
                  <p className={text.primary}>{selectedShowing.visitor_email}</p>
                </div>
                <div>
                  <p className={`text-xs ${text.inactive}`}>Phone</p>
                  <p className={text.primary}>{selectedShowing.visitor_phone || '—'}</p>
                </div>
              </div>
              {selectedShowing.notes && (
                <div>
                  <p className={`text-xs ${text.inactive}`}>Notes</p>
                  <p className={text.primary}>{selectedShowing.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </FeatureGate>
  );
}
