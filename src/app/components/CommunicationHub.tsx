import { useRef, useState } from 'react';
import { MessageSquare, Bell, Search, CircleCheck, Clock, RefreshCw, Trash2 } from 'lucide-react';
import { useHasFeature } from '../hooks/usePlanGating';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { FeatureGate } from './UpgradeCTA';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import { useTenants } from '../../lib/hooks/useTenants';
import {
  useRecentMessages,
  useMessageTemplates,
  useAutomatedReminders,
  usePortalActivity,
  useCommunicationStats,
  useMessageSuggestion,
  useSendMessage,
  useCreateMessageTemplate,
} from '../../lib/hooks/useCommunications';
import { formatRelativeTime } from '../../lib/utils/dateHelpers';
import { NewReminderModal } from './NewReminderModal';
import { deleteAutomatedReminder } from '../../lib/api/communicationsClient';

export function CommunicationHub() {
  const { isDark, text, border } = useThemeStyles();

  // Feature checks for plan gating - Communication hub requires Pro
  const communicationHub = useHasFeature('communication_hub');

  // Fetch data
  const { data: messages, loading: messagesLoading, error: messagesError, refetch: refetchMessages } = useRecentMessages();
  const { data: templates, loading: templatesLoading, refetch: refetchTemplates } = useMessageTemplates();
  const { data: reminders, loading: remindersLoading, refetch: refetchReminders } = useAutomatedReminders();
  const { data: portalActivity, loading: activityLoading } = usePortalActivity();
  const { data: stats, loading: statsLoading } = useCommunicationStats();
  const { data: tenants, loading: tenantsLoading } = useTenants();
  const {
    suggestion,
    provider,
    loading: suggestionLoading,
    error: suggestionError,
    generate: generateSuggestion,
    clear: clearSuggestion,
  } = useMessageSuggestion();
  const { send: sendMessage, loading: sendingMessage, error: sendError } = useSendMessage();
  const {
    create: createTemplate,
    loading: creatingTemplate,
    error: createTemplateError,
  } = useCreateMessageTemplate();

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerRecipientId, setComposerRecipientId] = useState('');
  const [composerSubject, setComposerSubject] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<any | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState<'payment' | 'maintenance' | 'lease' | 'onboarding' | 'general'>('general');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateVariables, setTemplateVariables] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [deletingReminderId, setDeletingReminderId] = useState<string | null>(null);
  const aiPanelRef = useRef<HTMLDivElement | null>(null);

  // Show loading state
  if (messagesLoading || statsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (messagesError) {
    return <ErrorState error={messagesError} retry={refetchMessages} />;
  }

  // Prepare stats display
  const normalizedStats = stats ? {
    activeConversations: Number((stats as any).active_conversations ?? (stats as any).activeConversations ?? 0),
    avgResponseTimeMinutes: Number((stats as any).avg_response_time_minutes ?? (stats as any).avgResponseTimeMinutes ?? 0),
    automationRate: Number((stats as any).automation_rate ?? (stats as any).automationRate ?? 0),
    tenantSatisfaction: Number((stats as any).tenant_satisfaction ?? (stats as any).tenantSatisfaction ?? 0),
  } : null;

  const communicationStatsDisplay = normalizedStats ? [
    { label: 'Active Conversations', value: normalizedStats.activeConversations.toString(), change: '0%' },
    { label: 'Avg. Response Time', value: `${normalizedStats.avgResponseTimeMinutes} min`, change: '0%' },
    { label: 'Automation Rate', value: `${normalizedStats.automationRate}%`, change: '0%' },
    { label: 'Tenant Satisfaction', value: `${normalizedStats.tenantSatisfaction}%`, change: '0%' },
  ] : [];

  // Transform messages into conversation format
  const conversations = messages.map((msg) => {
    const body = typeof (msg as any).body === 'string'
      ? (msg as any).body
      : typeof (msg as any).lastMessage === 'string'
        ? (msg as any).lastMessage
        : '';
    const subject = typeof (msg as any).subject === 'string' ? (msg as any).subject : '';
    const createdAt = (msg as any).created_at || (msg as any).createdAt || (msg as any).lastMessageAt || new Date().toISOString();
    const tenant = (msg as any).sender_name || (msg as any).senderName || (msg as any).tenant_name || (msg as any).tenant || 'Tenant';
    const propertyName = (msg as any).property_name || (msg as any).propertyName || (msg as any).property || 'General';
    const unitNumber = (msg as any).unit_number || (msg as any).unitNumber || (msg as any).unit || '';
    const propertyDisplay = unitNumber ? `${propertyName} #${unitNumber}` : propertyName;
    const unreadCount = typeof (msg as any).unreadCount === 'number'
      ? (msg as any).unreadCount
      : Number((msg as any).unread_messages ?? ((msg as any).is_read === false ? 1 : 0));
    const status = (msg as any).status || (unreadCount > 0 ? 'active' : 'resolved');
    const lastMessageText = (body || subject || 'No message').toString();

    return {
      id: (msg as any).id,
      tenant,
      property: propertyDisplay,
      lastMessage: lastMessageText.substring(0, 60) + (lastMessageText.length > 60 ? '...' : ''),
      time: formatRelativeTime(createdAt),
      unread: unreadCount || 0,
      status,
    };
  });

  const primaryConversationId = conversations[0]?.id;
  const activeConversationId = selectedConversationId || primaryConversationId;

  const resolveRecipientId = (conversationId: string | null) => {
    if (!conversationId) return '';
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return '';
    const tenantName = conversation.tenant?.trim();
    if (!tenantName) return '';
    const normalized = tenantName.toLowerCase();
    const match = (tenants || []).find((tenant) => {
      const name = (tenant.full_name || '').trim().toLowerCase();
      const email = (tenant.email || '').trim().toLowerCase();
      return (
        (name && (name === normalized || name.includes(normalized) || normalized.includes(name))) ||
        (email && email.includes(normalized))
      );
    });
    return match?.user_id || '';
  };

  const buildFallbackDraft = () => (
    'Thanks for reaching out. I received your message and will follow up shortly.'
  );

  const handleAiDraft = async () => {
    setComposerOpen(true);
    if (!activeConversationId) {
      clearSuggestion();
      setComposerBody((prev) => prev.trim() || buildFallbackDraft());
      return;
    }
    const result = await generateSuggestion(activeConversationId);
    if (result.success && result.data?.suggestion) {
      setComposerBody(result.data.suggestion);
    } else {
      setComposerBody((prev) => prev.trim() || buildFallbackDraft());
    }
    aiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const openComposer = () => {
    setComposerOpen(true);
    if (!composerRecipientId.trim()) {
      const resolvedRecipientId = resolveRecipientId(selectedConversationId);
      if (resolvedRecipientId) {
        setComposerRecipientId(resolvedRecipientId);
        const conversation = conversations.find((item) => item.id === selectedConversationId);
        if (conversation?.tenant) {
          setRecipientSearch(conversation.tenant);
        }
      }
    }
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setComposerRecipientId('');
    setComposerSubject('');
    setComposerBody('');
    setComposerError(null);
    setRecipientSearch('');
  };

  const openTemplateModal = () => {
    setTemplateModalOpen(true);
    setTemplateError(null);
  };

  const closeTemplateModal = () => {
    setTemplateModalOpen(false);
    setTemplateName('');
    setTemplateCategory('general');
    setTemplateSubject('');
    setTemplateBody('');
    setTemplateVariables('');
    setTemplateError(null);
  };

  const handleCreateTemplate = async () => {
    if (!templateName.trim() || !templateBody.trim()) {
      setTemplateError('Template name and body are required.');
      return;
    }

    const variables = templateVariables
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    setTemplateError(null);
    const result = await createTemplate({
      name: templateName.trim(),
      category: templateCategory,
      subject: templateSubject.trim() || undefined,
      body: templateBody.trim(),
      variables: variables.length ? variables : undefined,
    });

    if (result.success) {
      closeTemplateModal();
      refetchTemplates();
    }
  };

  const handleSendMessage = async () => {
    if (!composerRecipientId.trim() && !composerBody.trim()) {
      setComposerError('Recipient and message are required.');
      return;
    }
    if (!composerRecipientId.trim()) {
      setComposerError('Recipient is required.');
      return;
    }
    if (!composerBody.trim()) {
      setComposerError('Message body is required.');
      return;
    }

    setComposerError(null);
    const result = await sendMessage({
      recipientId: composerRecipientId.trim(),
      subject: composerSubject.trim() || undefined,
      body: composerBody.trim(),
    });

    if (result.success) {
      closeComposer();
      refetchMessages();
    }
  };

  const normalizedReminders = reminders.map((reminder) => {
    const reminderType = reminder.reminderType ?? (reminder as any).reminder_type ?? reminder.name ?? 'Reminder';
    const recipientCount = reminder.recipientCount ?? (reminder as any).recipient_count ?? 0;
    const nextSendDate = reminder.nextSendDate ?? (reminder as any).next_send_date ?? null;
    const status = reminder.status ?? (reminder as any).status ?? 'active';
    const frequency = reminder.frequency ?? (reminder as any).frequency ?? 'monthly';

    return {
      raw: reminder,
      id: reminder.id,
      reminderType,
      recipientCount,
      nextSendDate,
      status,
      frequency,
    };
  });

  const handleDeleteReminder = async (reminder: any) => {
    const name = reminder?.reminderType || reminder?.name || 'this reminder';
    const confirmed = confirm(`Delete ${name}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeletingReminderId(reminder.id);
      await deleteAutomatedReminder(reminder.id);
      await refetchReminders();
    } catch (error) {
      console.error('Failed to delete reminder:', error);
      alert('Failed to delete reminder. Please try again.');
    } finally {
      setDeletingReminderId(null);
    }
  };

  const filteredConversations = conversations.filter((conversation) => {
    const term = conversationSearch.trim().toLowerCase();
    if (!term) return true;
    const haystack = [
      conversation.tenant,
      conversation.property,
      conversation.lastMessage,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
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
          <button
            onClick={handleAiDraft}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors text-sm font-medium`}
          >
            AI Draft
          </button>
          <button
            onClick={openComposer}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + New Message
          </button>
        </div>
      </div>

      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeComposer}
          />
          <div
            className={`${isDark ? 'bg-[#0f1523]' : 'bg-white'} relative z-10 w-full max-w-2xl rounded-2xl border ${border.default} shadow-xl`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                NEW MESSAGE
              </h3>
              <button
                onClick={closeComposer}
                className={`px-3 py-1 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm`}
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className={`text-xs uppercase ${text.inactive}`}>Recipient</label>
                <div className="mt-2 space-y-2">
                  <input
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder="Search tenants by name or email"
                    className={`w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                  />
                  <select
                    value={composerRecipientId}
                    onChange={(e) => setComposerRecipientId(e.target.value)}
                    className={`w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                    disabled={tenantsLoading}
                  >
                    <option value="">Select a tenant</option>
                    {(tenants || [])
                      .filter((tenant) => {
                        const term = recipientSearch.trim().toLowerCase();
                        if (!term) return true;
                        const name = (tenant.full_name || '').toLowerCase();
                        const email = (tenant.email || '').toLowerCase();
                        return name.includes(term) || email.includes(term);
                      })
                      .map((tenant) => (
                        <option key={tenant.user_id} value={tenant.user_id}>
                          {tenant.full_name || 'Unnamed'} {tenant.email ? `(${tenant.email})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={`text-xs uppercase ${text.inactive}`}>Subject (optional)</label>
                <input
                  value={composerSubject}
                  onChange={(e) => setComposerSubject(e.target.value)}
                  placeholder="Subject"
                  className={`mt-2 w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                />
              </div>
              <div>
                <label className={`text-xs uppercase ${text.inactive}`}>Message</label>
                <textarea
                  value={composerBody}
                  onChange={(e) => setComposerBody(e.target.value)}
                  rows={6}
                  placeholder="Write your message..."
                  className={`mt-2 w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                />
                {suggestion && (
                  <button
                    onClick={() => setComposerBody(suggestion)}
                    className={`mt-2 text-xs ${text.inactive} hover:text-[#ff6b35]`}
                  >
                    Use AI draft
                  </button>
                )}
              </div>
              {composerError && (
                <p className="text-xs text-red-400">{composerError}</p>
              )}
              {sendError && (
                <p className="text-xs text-red-400">{sendError.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
              <button
                onClick={handleAiDraft}
                className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm`}
              >
                AI Draft
              </button>
              <button
                onClick={handleSendMessage}
                className="px-6 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
                disabled={sendingMessage || !composerRecipientId.trim() || !composerBody.trim()}
              >
                {sendingMessage ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {templateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeTemplateModal}
          />
          <div
            className={`${isDark ? 'bg-[#0f1523]' : 'bg-white'} relative z-10 w-full max-w-2xl rounded-2xl border ${border.default} shadow-xl`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                CREATE TEMPLATE
              </h3>
              <button
                onClick={closeTemplateModal}
                className={`px-3 py-1 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm`}
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className={`text-xs uppercase ${text.inactive}`}>Template Name</label>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Friendly name"
                  className={`mt-2 w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                />
              </div>
              <div>
                <label className={`text-xs uppercase ${text.inactive}`}>Category</label>
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value as typeof templateCategory)}
                  className={`mt-2 w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                >
                  <option value="general">General</option>
                  <option value="payment">Payment</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="lease">Lease</option>
                  <option value="onboarding">Onboarding</option>
                </select>
              </div>
              <div>
                <label className={`text-xs uppercase ${text.inactive}`}>Subject (optional)</label>
                <input
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  placeholder="Subject line"
                  className={`mt-2 w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                />
              </div>
              <div>
                <label className={`text-xs uppercase ${text.inactive}`}>Message Body</label>
                <textarea
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  rows={6}
                  placeholder="Write your template..."
                  className={`mt-2 w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                />
              </div>
              <div>
                <label className={`text-xs uppercase ${text.inactive}`}>Variables (optional)</label>
                <input
                  value={templateVariables}
                  onChange={(e) => setTemplateVariables(e.target.value)}
                  placeholder="tenant_name, property_name"
                  className={`mt-2 w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                />
              </div>
              {templateError && (
                <p className="text-xs text-red-400">{templateError}</p>
              )}
              {createTemplateError && (
                <p className="text-xs text-red-400">{createTemplateError.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
              <p className={`text-xs ${text.inactive}`}>Templates are available in Quick Templates.</p>
              <button
                onClick={handleCreateTemplate}
                className="px-6 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
                disabled={creatingTemplate || !templateName.trim() || !templateBody.trim()}
              >
                {creatingTemplate ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className={`col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              CONVERSATIONS
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${text.inactive}`} />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={conversationSearch}
                  onChange={(e) => setConversationSearch(e.target.value)}
                  className={`pl-10 pr-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>
            </div>
          </div>

          {filteredConversations.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className={`w-12 h-12 mx-auto mb-4 ${text.inactive}`} />
              <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                {conversationSearch.trim() ? 'No matching conversations' : 'No conversations yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  const resolvedRecipientId = resolveRecipientId(conversation.id);
                  if (resolvedRecipientId) {
                    setComposerRecipientId(resolvedRecipientId);
                    setRecipientSearch(conversation.tenant);
                    setComposerError(null);
                  }
                }}
                className={`flex items-center justify-between p-4 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-all border ${
                  selectedConversationId === conversation.id ? 'border-[#ff6b35]/70' : border.default
                } hover:border-[#ff6b35]/50 cursor-pointer group`}
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
                            : isDark ? 'bg-white/20 text-white/60' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {conversation.status.toUpperCase()}
                      </span>
                    </div>
                    <p className={`text-sm ${text.muted} mb-1`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {conversation.property}
                    </p>
                    <p className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {conversation.lastMessage}
                    </p>
                  </div>
                </div>

                <div className="text-right ml-4">
                  <p className={`text-xs ${text.inactive} mb-2`}>{conversation.time}</p>
                  <button className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded text-xs font-medium transition-opacity">
                    Reply
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}

          <button className={`w-full mt-4 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm font-medium transition-colors`}>
            View All Conversations
          </button>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* AI Draft Reply */}
          <div
            ref={aiPanelRef}
            className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                AI DRAFT REPLY
              </h3>
              {provider && <span className={`text-xs ${text.inactive}`}>{provider}</span>}
            </div>
            {activeConversationId ? (
              <>
                <div className={`${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-3 mb-3 border ${border.default}`}>
                  {suggestionLoading ? (
                    <p className={`text-sm ${text.muted}`}>Generating suggestion...</p>
                  ) : suggestion ? (
                    <p className={`text-sm ${text.secondary}`}>{suggestion}</p>
                  ) : (
                    <p className={`text-sm ${text.muted}`}>
                      Generate a reply suggestion for the selected conversation.
                    </p>
                  )}
                </div>
                {suggestionError && (
                  <p className="text-xs text-red-400 mb-3">{suggestionError.message}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (activeConversationId) {
                        generateSuggestion(activeConversationId);
                      }
                    }}
                    className="flex-1 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
                    disabled={suggestionLoading}
                  >
                    Generate Reply
                  </button>
                  <button
                    onClick={clearSuggestion}
                    className={`px-3 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm transition-colors`}
                  >
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <p className={`text-sm ${text.muted}`}>No conversations yet.</p>
            )}
          </div>

          {/* Quick Templates */}
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              QUICK TEMPLATES
            </h3>

            {templatesLoading ? (
              <div className="text-center py-4">
                <div className={`w-6 h-6 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto`} />
              </div>
            ) : templates.length === 0 ? (
              <p className={`text-sm ${text.muted} text-center py-4`}>No templates yet</p>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    className={`w-full p-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-all border ${border.default} hover:border-[#ff6b35]/50 text-left group`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                        {template.name}
                      </p>
                      <span className={`text-xs ${text.inactive}`}>{template.usage_count} uses</span>
                    </div>
                    <p className={`text-xs ${text.muted}`}>{template.category}</p>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={openTemplateModal}
              className="w-full mt-4 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
            >
              Create Template
            </button>
          </div>

          {/* Portal Activity */}
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              PORTAL ACTIVITY
            </h3>
            {activityLoading ? (
              <div className="text-center py-4">
                <div className={`w-6 h-6 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto`} />
              </div>
            ) : portalActivity && (
              <div className="space-y-4">
                {(() => {
                  const normalizedActivity = {
                    messagesToday: Number((portalActivity as any).messages_today ?? (portalActivity as any).messagesToday ?? 0),
                    unreadMessages: Number((portalActivity as any).unread_messages ?? (portalActivity as any).unreadMessages ?? 0),
                    avgResponseTimeMinutes: Number((portalActivity as any).avg_response_time_minutes ?? (portalActivity as any).avgResponseTimeMinutes ?? 0),
                    resolvedToday: Number((portalActivity as any).resolved_today ?? (portalActivity as any).resolvedToday ?? 0),
                  };
                  return (
                    <>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${text.secondary}`}>Messages Today</span>
                  <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{normalizedActivity.messagesToday}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${text.secondary}`}>Unread Messages</span>
                  <span className="text-lg font-bold text-[#ff6b35]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{normalizedActivity.unreadMessages}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${text.secondary}`}>Avg. Response</span>
                  <span className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{normalizedActivity.avgResponseTimeMinutes}min</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${text.secondary}`}>Resolved Today</span>
                  <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{normalizedActivity.resolvedToday}</span>
                </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Automated Reminders */}
      <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-lg">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                REMINDERS
              </h3>
              <p className={`text-sm ${text.muted}`}>Schedule and manage automated tenant communications</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingReminder(null);
              setReminderModalOpen(true);
            }}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + New Reminder
          </button>
        </div>

        {remindersLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className={`w-8 h-8 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto mb-2`} />
              <p className={`text-sm ${text.muted}`}>Loading reminders...</p>
            </div>
          </div>
        ) : normalizedReminders.length === 0 ? (
          <div className="text-center py-12">
            <Bell className={`w-12 h-12 mx-auto mb-4 ${text.inactive}`} />
            <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              No reminders configured
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {normalizedReminders.map((reminder) => (
              <div
                key={reminder.id}
                className={`p-5 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg border ${border.default} hover:border-[#ff6b35]/50 transition-all`}
              >
                <div className="flex items-start justify-between mb-4">
                  <h4 className="font-semibold" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    {reminder.reminderType}
                  </h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    reminder.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {reminder.status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className={text.muted}>Recipients</span>
                    <span className="font-medium">{reminder.recipientCount}</span>
                  </div>
                  {reminder.recipientCount === 0 && (
                    <p className="text-xs text-amber-500">No recipients with email on file</p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className={text.muted}>Frequency</span>
                    <span className="font-medium capitalize">{reminder.frequency}</span>
                  </div>
                </div>

                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-xs text-blue-400 font-medium">Next Send</span>
                  </div>
                  <p className={`text-sm ${text.secondary}`}>
                    {(() => {
                      const nextSend = reminder.nextSendDate ? new Date(reminder.nextSendDate) : null;
                      if (!nextSend || Number.isNaN(nextSend.getTime())) {
                        return 'Not scheduled';
                      }
                      return nextSend.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                    })()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingReminder(reminder.raw);
                      setReminderModalOpen(true);
                    }}
                    className={`flex-1 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm transition-colors`}
                  >
                    Edit Schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteReminder(reminder)}
                    disabled={deletingReminderId === reminder.id}
                    className={`p-2 rounded-lg transition-colors ${
                      isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'
                    } ${deletingReminderId === reminder.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Delete reminder"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Communication Features */}
      <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
        <div className="flex items-start gap-6">
          <div className="p-4 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-xl">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              COMPREHENSIVE COMMUNICATION PLATFORM
            </h3>
            <p className={`${text.secondary} mb-4`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Built-in messaging system with automated reminders for rent payments, lease renewals, maintenance updates, and property inspections. Smart templates and AI-powered responses reduce communication time by 78%. All conversations are automatically logged and searchable.
            </p>
            <div className="grid grid-cols-5 gap-4">
              <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {normalizedStats?.automationRate || 78}%
                </p>
                <p className={`text-xs ${text.muted}`}>Automation Rate</p>
              </div>
              <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {normalizedStats?.avgResponseTimeMinutes || 18}min
                </p>
                <p className={`text-xs ${text.muted}`}>Avg. Response</p>
              </div>
              <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {normalizedStats?.tenantSatisfaction || 96}%
                </p>
                <p className={`text-xs ${text.muted}`}>Satisfaction</p>
              </div>
              <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  24/7
                </p>
                <p className={`text-xs ${text.muted}`}>Portal Access</p>
              </div>
              <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                <p className="text-2xl font-bold text-emerald-400 mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {normalizedStats?.activeConversations || 142}
                </p>
                <p className={`text-xs ${text.muted}`}>Active Tenants</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* New Reminder Modal */}
      <NewReminderModal
        isOpen={reminderModalOpen}
        onClose={() => {
          setReminderModalOpen(false);
          setEditingReminder(null);
        }}
        onSuccess={() => {
          refetchReminders();
          setEditingReminder(null);
        }}
        reminder={editingReminder}
        tenants={tenants}
        templates={templates}
      />
    </FeatureGate>
  );
}
