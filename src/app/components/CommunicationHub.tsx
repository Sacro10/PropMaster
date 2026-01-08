import { MessageSquare, Bell, Search, CircleCheck, Clock, RefreshCw } from 'lucide-react';
import { useHasFeature } from '../hooks/usePlanGating';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { FeatureGate } from './UpgradeCTA';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import {
  useRecentMessages,
  useMessageTemplates,
  useAutomatedReminders,
  usePortalActivity,
  useCommunicationStats,
} from '../../lib/hooks/useCommunications';
import { formatRelativeTime } from '../../lib/utils/dateHelpers';

export function CommunicationHub() {
  const { isDark, text, border } = useThemeStyles();

  // Feature checks for plan gating - Communication hub requires Pro
  const communicationHub = useHasFeature('communication_hub');

  // Fetch data
  const { data: messages, loading: messagesLoading, error: messagesError, refetch: refetchMessages } = useRecentMessages();
  const { data: templates, loading: templatesLoading } = useMessageTemplates();
  const { data: reminders, loading: remindersLoading } = useAutomatedReminders();
  const { data: portalActivity, loading: activityLoading } = usePortalActivity();
  const { data: stats, loading: statsLoading } = useCommunicationStats();

  // Show loading state
  if (messagesLoading || statsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (messagesError) {
    return <ErrorState error={messagesError} retry={refetchMessages} />;
  }

  // Prepare stats display
  const communicationStatsDisplay = stats ? [
    { label: 'Active Conversations', value: stats.active_conversations.toString(), change: '+12' },
    { label: 'Avg. Response Time', value: `${stats.avg_response_time_minutes} min`, change: '-24%' },
    { label: 'Automation Rate', value: `${stats.automation_rate}%`, change: '+8%' },
    { label: 'Tenant Satisfaction', value: `${stats.tenant_satisfaction}%`, change: '+3%' },
  ] : [];

  // Transform messages into conversation format
  const conversations = messages.map((msg) => {
    const propertyDisplay = msg.unit_number
      ? `${msg.property_name || 'Unknown'} #${msg.unit_number}`
      : msg.property_name || 'General';

    return {
      id: msg.id,
      tenant: msg.sender_name || 'Unknown',
      property: propertyDisplay,
      lastMessage: msg.body.substring(0, 60) + (msg.body.length > 60 ? '...' : ''),
      time: formatRelativeTime(msg.created_at),
      unread: msg.is_read ? 0 : 1,
      status: msg.is_read ? 'resolved' : 'active',
    };
  });

  return (
    <FeatureGate
      feature="communication_hub"
      hasAccess={communicationHub.hasAccess}
      loading={communicationHub.loading}
      variant="inline"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            COMMUNICATION PORTAL
          </h2>
          <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Tenant communication portal with automated reminders
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetchMessages}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform">
            + New Message
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6">
        {communicationStatsDisplay.map((stat, index) => (
          <div
            key={index}
            className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6 hover:border-[#ff6b35]/50 transition-all`}
          >
            <p className={`text-sm ${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {stat.label}
            </p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {stat.value}
              </p>
              <span className="text-sm text-emerald-400">{stat.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Conversations */}
        <div className="col-span-2 bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              CONVERSATIONS
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50"
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {conversations.map((conversation, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-all border border-transparent hover:border-white/10 cursor-pointer group"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-full flex items-center justify-center font-semibold">
                      {conversation.tenant.split(' ').map(n => n[0]).join('')}
                    </div>
                    {conversation.unread > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#ff6b35] rounded-full flex items-center justify-center text-xs font-bold">
                        {conversation.unread}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                        {conversation.tenant}
                      </p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          conversation.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-white/20 text-white/60'
                        }`}
                      >
                        {conversation.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-white/50 mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {conversation.property}
                    </p>
                    <p className="text-sm text-white/70" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {conversation.lastMessage}
                    </p>
                  </div>
                </div>

                <div className="text-right ml-4">
                  <p className="text-xs text-white/40 mb-2">{conversation.time}</p>
                  <button className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded text-xs font-medium transition-opacity">
                    Reply
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors">
            View All Conversations
          </button>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Quick Templates */}
          <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <h3 className="text-xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              QUICK TEMPLATES
            </h3>

            <div className="space-y-3">
              {quickTemplates.map((template, index) => (
                <button
                  key={index}
                  className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-all border border-white/10 hover:border-[#ff6b35]/50 text-left group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {template.name}
                    </p>
                    <span className="text-xs text-white/40">{template.uses} uses</span>
                  </div>
                  <p className="text-xs text-white/50">{template.category}</p>
                </button>
              ))}
            </div>

            <button className="w-full mt-4 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform">
              Create Template
            </button>
          </div>

          {/* Communication Stats */}
          <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <h3 className="text-xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              PORTAL ACTIVITY
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Messages Today</span>
                <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>34</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Unread Messages</span>
                <span className="text-lg font-bold text-[#ff6b35]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>7</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Avg. Response</span>
                <span className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>18min</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Resolved Today</span>
                <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>12</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Automated Reminders */}
      <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-lg">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                AUTOMATED REMINDERS
              </h3>
              <p className="text-sm text-white/50">Schedule and manage automated tenant communications</p>
            </div>
          </div>
          <button className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform">
            + New Reminder
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {automatedReminders.map((reminder, index) => (
            <div
              key={index}
              className="p-5 bg-white/5 rounded-lg border border-white/10 hover:border-[#ff6b35]/50 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <h4 className="font-semibold" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {reminder.type}
                </h4>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                  {reminder.status.toUpperCase()}
                </span>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Recipients</span>
                  <span className="font-medium">{reminder.recipients}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Frequency</span>
                  <span className="font-medium">{reminder.frequency}</span>
                </div>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-blue-400 font-medium">Next Send</span>
                </div>
                <p className="text-sm text-white/70">{reminder.nextSend}</p>
              </div>

              <button className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                Edit Schedule
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Communication Features */}
      <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
        <div className="flex items-start gap-6">
          <div className="p-4 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-xl">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              COMPREHENSIVE COMMUNICATION PLATFORM
            </h3>
            <p className="text-white/70 mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Built-in messaging system with automated reminders for rent payments, lease renewals, maintenance updates, and property inspections. Smart templates and AI-powered responses reduce communication time by 78%. All conversations are automatically logged and searchable.
            </p>
            <div className="grid grid-cols-5 gap-4">
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  78%
                </p>
                <p className="text-xs text-white/50">Automation Rate</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  18min
                </p>
                <p className="text-xs text-white/50">Avg. Response</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  96%
                </p>
                <p className="text-xs text-white/50">Satisfaction</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  24/7
                </p>
                <p className="text-xs text-white/50">Portal Access</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  142
                </p>
                <p className="text-xs text-white/50">Active Tenants</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </FeatureGate>
  );
}
