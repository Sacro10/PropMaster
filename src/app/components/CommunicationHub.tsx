import { useEffect, useRef, useState } from 'react';
import { FileText, MessageSquare, Search, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useHasFeature } from '../hooks/usePlanGating';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { FeatureGate } from './UpgradeCTA';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import { getGmailStatus, syncGmailInbox } from '../../lib/api/integrations';
import { getCurrentAccountId } from '../../lib/api/client';
import { supabase } from '../../lib/supabaseClient';
import {
  useCommunicationNotifications,
  useRecentMessages,
  usePortalActivity,
  useMessageSuggestion,
  useSendMessage,
} from '../../lib/hooks/useCommunications';
import { useTenants } from '../../lib/hooks/useTenants';
import { formatRelativeTime } from '../../lib/utils/dateHelpers';

type PhotoSection = {
  label: string;
  urls: string[];
};

type AttachmentPreview = {
  url: string;
  fileName: string;
  isImage: boolean;
  contentType?: string | null;
  size?: number | null;
};

type RecipientOption = {
  id: string;
  label: string;
  description: string;
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function isLikelyImageUrl(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.includes('/storage/') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif')
  );
}

function normalizeAttachmentPreviews(attachments: any): AttachmentPreview[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  const seen = new Set<string>();

  return attachments
    .map((item) => {
      const directUrl = typeof item === 'string' ? item : null;
      const objectItem = typeof item === 'object' && item ? item : null;
      const url = directUrl || objectItem?.url || objectItem?.publicUrl || null;

      if (!url || seen.has(url)) {
        return null;
      }
      seen.add(url);

      const fallbackName = url.split('/').pop()?.split('?')[0] || 'Attachment';
      const fileName =
        objectItem?.fileName ||
        objectItem?.file_name ||
        objectItem?.name ||
        fallbackName;

      return {
        url,
        fileName,
        isImage: isLikelyImageUrl(url),
      };
    })
    .filter((item): item is AttachmentPreview => Boolean(item));
}

function parseMessageForDisplay(message: string, attachments: any) {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const photoSections: PhotoSection[] = [];
  const textLines: string[] = [];
  const fileAttachments: AttachmentPreview[] = [];
  let currentSectionLabel: string | null = null;
  const attachmentPreviews = normalizeAttachmentPreviews(attachments);

  const ensureSection = (label: string) => {
    let section = photoSections.find((item) => item.label === label);
    if (!section) {
      section = { label, urls: [] };
      photoSections.push(section);
    }
    return section;
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^(.*photos?):$/i);
    if (sectionMatch) {
      currentSectionLabel = sectionMatch[1];
      textLines.push(line);
      continue;
    }

    const bulletUrlMatch = line.match(/^-\s*(https?:\/\/\S+)$/i);
    const inlineUrlMatch = line.match(/(https?:\/\/\S+)/i);
    const url = bulletUrlMatch?.[1] || inlineUrlMatch?.[1] || null;

    if (url && isLikelyImageUrl(url)) {
      const sectionLabel = currentSectionLabel || 'Photos';
      const section = ensureSection(sectionLabel);
      if (!section.urls.includes(url)) {
        section.urls.push(url);
      }
      continue;
    }

    textLines.push(line);
  }

  attachmentPreviews.forEach((attachment) => {
    if (attachment.isImage) {
      const section = ensureSection('Attachments');
      if (!section.urls.includes(attachment.url)) {
        section.urls.push(attachment.url);
      }
      return;
    }

    fileAttachments.push(attachment);
  });

  const previewText =
    textLines.join(' ') ||
    (attachmentPreviews.length > 0
      ? `${attachmentPreviews.length} attachment${attachmentPreviews.length === 1 ? '' : 's'}`
      : '');

  return {
    text: textLines.join('\n'),
    previewText,
    photoSections,
    fileAttachments,
  };
}

export function CommunicationHub() {
  const { isDark, text, border } = useThemeStyles();
  const location = useLocation();

  // Feature checks for plan gating - Communication hub requires Pro
  const communicationHub = useHasFeature('communication_hub');

  // Fetch data
  const {
    data: messages,
    loading: messagesLoading,
    loadingMore: messagesLoadingMore,
    error: messagesError,
    hasMore: hasMoreMessages,
    refetch: refetchMessages,
    loadMore: loadMoreMessages,
  } = useRecentMessages();
  const { refetch: refetchNotifications } = useCommunicationNotifications();
  const {
    data: portalActivity,
    loading: activityLoading,
    refetch: refetchPortalActivity,
  } = usePortalActivity();
  const {
    suggestion,
    provider,
    loading: suggestionLoading,
    error: suggestionError,
    generate: generateSuggestion,
    clear: clearSuggestion,
  } = useMessageSuggestion();
  const { send: sendMessage, loading: sendingMessage, error: sendError } = useSendMessage();
  const { data: tenants, loading: tenantsLoading } = useTenants();

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'new' | 'reply'>('new');
  const [replyConversationId, setReplyConversationId] = useState<string | null>(null);
  const [composerRecipientId, setComposerRecipientId] = useState('');
  const [composerSubject, setComposerSubject] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<AttachmentPreview[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [vendorRecipients, setVendorRecipients] = useState<RecipientOption[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const requestedConversationId = new URLSearchParams(location.search).get('conversation');

  useEffect(() => {
    let isActive = true;

    const syncInbox = async () => {
      try {
        const status = await getGmailStatus();
        if (!isActive || !status?.connected) return;
        await syncGmailInbox();
        if (isActive) {
          await Promise.allSettled([
            refetchMessages(),
            refetchNotifications(),
            refetchPortalActivity(),
          ]);
        }
      } catch (error) {
        console.warn('[CommunicationHub] Gmail sync skipped:', error);
      }
    };

    syncInbox();
    return () => {
      isActive = false;
    };
  }, [refetchMessages, refetchNotifications, refetchPortalActivity]);

  useEffect(() => {
    let isActive = true;

    const loadVendorRecipients = async () => {
      try {
        const accountId = await getCurrentAccountId();
        if (!accountId) {
          if (isActive) {
            setVendorRecipients([]);
          }
          return;
        }

        const { data, error } = await supabase
          .from('vendor_profiles')
          .select('user_id, business_name, email')
          .eq('account_id', accountId);

        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        const options = (data || [])
          .map((vendor: any) => {
            const businessName = String(vendor.business_name || '').trim();
            const email = String(vendor.email || '').trim();

            if (!vendor.user_id || !businessName) {
              return null;
            }

            return {
              id: vendor.user_id as string,
              label: businessName,
              description: email || 'Vendor',
            };
          })
          .filter((option): option is RecipientOption => Boolean(option));

        setVendorRecipients(options);
      } catch (error) {
        console.error('[CommunicationHub] Failed to load vendor recipients:', error);
        if (isActive) {
          setVendorRecipients([]);
        }
      }
    };

    loadVendorRecipients();

    return () => {
      isActive = false;
    };
  }, []);

  // Transform messages into conversation format
  const safeMessages = Array.isArray(messages) ? messages : [];
  const conversations = safeMessages.map((msg) => {
    const body = typeof (msg as any).body === 'string'
      ? (msg as any).body
      : typeof (msg as any).lastMessage === 'string'
        ? (msg as any).lastMessage
        : '';
    const subject = typeof (msg as any).subject === 'string' ? (msg as any).subject : '';
    const createdAt = (msg as any).created_at || (msg as any).createdAt || (msg as any).lastMessageAt || new Date().toISOString();
    const participantName =
      (msg as any).participant_name ||
      (msg as any).sender_name ||
      (msg as any).senderName ||
      (msg as any).tenant_name ||
      (msg as any).tenant ||
      'Contact';
    const propertyName = (msg as any).property_name || (msg as any).propertyName || (msg as any).property || 'General';
    const unitNumber = (msg as any).unit_number || (msg as any).unitNumber || (msg as any).unit || '';
    const propertyDisplay = unitNumber ? `${propertyName} #${unitNumber}` : propertyName;
    const unreadCount = typeof (msg as any).unreadCount === 'number'
      ? (msg as any).unreadCount
      : Number((msg as any).unread_messages ?? ((msg as any).is_read === false ? 1 : 0));
    const status = (msg as any).status || (unreadCount > 0 ? 'active' : 'resolved');
    const rawMessageText = (body || subject || 'No message').toString();
    const parsed = parseMessageForDisplay(rawMessageText, (msg as any).lastMessageAttachments);
    const previewSource = parsed.previewText || 'Photo update';
    const previewText = previewSource.substring(0, 60) + (previewSource.length > 60 ? '...' : '');
    const recipientId = ((msg as any).otherParticipantId ||
      (msg as any).other_participant_id ||
      (msg as any).recipientId ||
      (msg as any).recipient_id ||
      '') as string;
    const relatedType = ((msg as any).relatedType || (msg as any).related_type || '').toString();
    const relatedId = ((msg as any).relatedId || (msg as any).related_id || '').toString();
    const maintenanceRequestId =
      ((msg as any).maintenanceRequestId ||
        (msg as any).maintenance_request_id ||
        (relatedType === 'maintenance' ? relatedId : '')) as string;

    return {
      id: (msg as any).id,
      tenant: participantName,
      property: propertyDisplay,
      lastMessage: previewText,
      fullLastMessage: rawMessageText,
      parsedMessage: parsed,
      time: formatRelativeTime(createdAt),
      lastActivityAt: createdAt,
      unread: unreadCount || 0,
      status,
      recipientId,
      maintenanceRequestId: maintenanceRequestId || '',
      subject,
    };
  });

  const normalizedPortalActivity = portalActivity ? {
    activeConversations: Number((portalActivity as any).active_conversations ?? (portalActivity as any).activeConversations ?? 0),
    messagesToday: Number((portalActivity as any).messages_today ?? (portalActivity as any).messagesToday ?? 0),
    unreadMessages: Number((portalActivity as any).unread_messages ?? (portalActivity as any).unreadMessages ?? 0),
    avgResponseTimeMinutes: Number((portalActivity as any).avg_response_time_minutes ?? (portalActivity as any).avgResponseTimeMinutes ?? 0),
    resolvedToday: Number((portalActivity as any).resolved_today ?? (portalActivity as any).resolvedToday ?? 0),
  } : {
    activeConversations: 0,
    messagesToday: 0,
    unreadMessages: 0,
    avgResponseTimeMinutes: 0,
    resolvedToday: 0,
  };

  const primaryConversationId = conversations[0]?.id;
  const activeConversationId = selectedConversationId || primaryConversationId;
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
  const activeConversations = normalizedPortalActivity.activeConversations;
  const messagesToday = normalizedPortalActivity.messagesToday;
  const avgResponseDisplay = `${Number(normalizedPortalActivity.avgResponseTimeMinutes.toFixed(1))} min`;
  const tenantRecipientOptions = tenants
    .map((tenant) => {
      const name = tenant.full_name?.trim() || tenant.email?.trim() || 'Unnamed tenant';
      const propertyName = tenant.property?.name?.trim() || 'No property';
      const unitLabel = tenant.unit?.unit_number?.trim()
        ? `Unit ${tenant.unit.unit_number}`
        : 'No unit';

      return {
        id: tenant.user_id,
        label: name,
        description: `${propertyName} • ${unitLabel}`,
      };
    });
  const conversationRecipientOptions = conversations
    .filter((conversation) => conversation.recipientId)
    .map((conversation) => ({
      id: conversation.recipientId,
      label: conversation.tenant,
      description: conversation.property || 'Conversation',
    }));
  const recipientOptions = [...tenantRecipientOptions, ...vendorRecipients, ...conversationRecipientOptions]
    .filter((recipient): recipient is RecipientOption => Boolean(recipient?.id))
    .filter((recipient, index, array) => array.findIndex((item) => item.id === recipient.id) === index);

  const resolveRecipientId = (conversationId: string | null) => {
    if (!conversationId) return '';
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return '';
    return conversation.recipientId || '';
  };

  const replyConversation = replyConversationId
    ? conversations.find((item) => item.id === replyConversationId) || null
    : null;
  const lockedReplyRecipientId = replyConversation?.recipientId || '';

  const resetComposerDraft = () => {
    setComposerRecipientId('');
    setComposerSubject('');
    setComposerBody('');
    setComposerAttachments([]);
    setUploadingAttachments(false);
    setComposerError(null);
    clearSuggestion();
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  };

  const selectConversation = (conversationId: string, options?: { preserveSubject?: boolean }) => {
    setSelectedConversationId(conversationId);
    const conversation = conversations.find((item) => item.id === conversationId);
    if (composerMode === 'reply' && replyConversationId === conversationId) {
      setComposerRecipientId(resolveRecipientId(conversationId));
      setComposerError(null);
    }
    if (
      composerMode === 'reply' &&
      replyConversationId === conversationId &&
      !options?.preserveSubject &&
      !composerSubject.trim() &&
      conversation?.subject
    ) {
      setComposerSubject(`Re: ${conversation.subject}`);
    }
  };

  const handleReplyToConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    setSelectedConversationId(conversationId);
    setComposerMode('reply');
    setReplyConversationId(conversationId);
    setComposerRecipientId(conversation.recipientId || '');
    setComposerSubject(conversation.subject ? `Re: ${conversation.subject}` : '');
    setComposerBody('');
    setComposerAttachments([]);
    setComposerError(null);
    clearSuggestion();
    setComposerOpen(true);
  };

  useEffect(() => {
    if (!requestedConversationId) return;
    const exists = conversations.some((item) => item.id === requestedConversationId);
    if (!exists) return;
    selectConversation(requestedConversationId);
  }, [requestedConversationId, conversations]);

  const handleRecipientChange = (recipientId: string) => {
    if (composerMode === 'reply') {
      return;
    }
    setComposerRecipientId(recipientId);
    setComposerError(null);

    const selectedRecipientId = resolveRecipientId(selectedConversationId || null);
    if (selectedConversationId && selectedRecipientId !== recipientId) {
      setSelectedConversationId(null);
    }
  };

  const handleGenerateReply = async () => {
    const conversationId = composerMode === 'reply'
      ? replyConversationId || activeConversationId
      : activeConversationId;

    if (!conversationId) {
      setComposerError('Select a conversation before generating an AI reply.');
      return;
    }
    setComposerError(null);
    const result = await generateSuggestion(conversationId);
    if (result.success && result.data?.suggestion) {
      setComposerBody(result.data.suggestion);
    }
  };

  const openComposer = () => {
    resetComposerDraft();
    setComposerMode('new');
    setReplyConversationId(null);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setComposerMode('new');
    setReplyConversationId(null);
    resetComposerDraft();
  };

  const handleComposerFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      setUploadingAttachments(true);
      setComposerError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const signResponse = await fetch(`${API_BASE}/api/communications/uploads/sign`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
            }),
          });

          if (!signResponse.ok) {
            const payload = await signResponse.json().catch(() => null);
            throw new Error(payload?.error || 'Failed to create upload URL');
          }

          const signed = await signResponse.json() as {
            bucket: string;
            path: string;
            token: string;
            publicUrl: string;
          };

          const { error: uploadError } = await supabase.storage
            .from(signed.bucket)
            .uploadToSignedUrl(signed.path, signed.token, file);

          if (uploadError) {
            throw uploadError;
          }

          return {
            url: signed.publicUrl,
            fileName: file.name,
            isImage: file.type.startsWith('image/'),
            contentType: file.type || null,
            size: file.size || null,
          };
        })
      );

      setComposerAttachments((prev) => [...prev, ...uploadedFiles]);
    } catch (error) {
      console.error('[CommunicationHub] Attachment upload failed:', error);
      setComposerError(error instanceof Error ? error.message : 'Failed to upload attachment.');
    } finally {
      setUploadingAttachments(false);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
    }
  };

  const removeComposerAttachment = (url: string) => {
    setComposerAttachments((prev) => prev.filter((attachment) => attachment.url !== url));
  };

  const handleSendMessage = async () => {
    const replyRecipientId = composerMode === 'reply' ? lockedReplyRecipientId : '';
    const recipientId = (replyRecipientId || composerRecipientId).trim();
    const conversationId = composerMode === 'reply' ? replyConversationId || undefined : undefined;
    const sourceConversation =
      conversations.find((item) => item.id === conversationId) ||
      activeConversation ||
      null;
    const maintenanceRequestId = sourceConversation?.maintenanceRequestId || undefined;

    if (!recipientId) {
      setComposerError('Recipient is required.');
      return;
    }
    if (!composerBody.trim() && composerAttachments.length === 0) {
      setComposerError('Message body or attachment is required.');
      return;
    }

    setComposerError(null);
    const result = await sendMessage({
      recipientId,
      subject: composerSubject.trim() || undefined,
      body: composerBody.trim() || `Shared ${composerAttachments.length} attachment${composerAttachments.length === 1 ? '' : 's'}.`,
      conversationId,
      maintenanceRequestId,
      attachments: composerAttachments.map((attachment) => ({
        url: attachment.url,
        fileName: attachment.fileName,
        contentType: attachment.contentType || null,
        size: attachment.size || null,
      })),
    });

    if (result.success) {
      closeComposer();
      await Promise.allSettled([
        refetchMessages(),
        refetchNotifications(),
        refetchPortalActivity(),
      ]);
    }
  };

  const communicationStatsDisplay = [
    { label: 'Active Conversations', value: activeConversations.toString() },
    { label: 'Avg. Response Time', value: avgResponseDisplay },
    { label: 'Messages Today', value: messagesToday.toString() },
  ];
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

  // Keep these returns after all hooks so hook order never changes between renders.
  if (messagesLoading || activityLoading) {
    return <LoadingPage />;
  }

  if (messagesError) {
    return <ErrorState error={messagesError} retry={refetchMessages} />;
  }

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
	            Tenant communication portal
	          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              void Promise.allSettled([
                refetchMessages(),
                refetchNotifications(),
                refetchPortalActivity(),
              ]);
            }}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
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
                {composerMode === 'reply' ? 'REPLY MESSAGE' : 'NEW MESSAGE'}
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
                {composerMode === 'reply' && replyConversation ? (
                  <div className={`mt-2 w-full px-4 py-3 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg`}>
                    <p className="text-sm font-medium" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {replyConversation.tenant}
                    </p>
                    <p className={`mt-1 text-xs ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      Replying in the existing conversation for {replyConversation.property}.
                    </p>
                  </div>
                ) : (
                  <select
                    value={composerRecipientId}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    className={`mt-2 w-full px-4 py-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
                  >
                    <option value="">
                      {tenantsLoading ? 'Loading recipients...' : 'Select recipient'}
                    </option>
                    {recipientOptions.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.label} - {tenant.description}
                      </option>
                    ))}
                  </select>
                )}
                {composerMode === 'reply' && replyConversation && (
                  <p className={`mt-2 text-xs ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    Reply will be sent directly to the original sender.
                  </p>
                )}
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
                <div className="flex items-center justify-between">
                  <label className={`text-xs uppercase ${text.inactive}`}>AI Reply</label>
                  {provider && <span className={`text-[11px] ${text.inactive}`}>{provider}</span>}
                </div>
                <div className={`mt-2 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-3 border ${border.default}`}>
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
                  <p className="text-xs text-red-400 mt-2">{suggestionError.message}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={handleGenerateReply}
                    className="flex-1 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
                    disabled={suggestionLoading || !(composerMode === 'reply' ? replyConversationId : activeConversationId)}
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
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className={`text-xs uppercase ${text.inactive}`}>Attachments</label>
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={uploadingAttachments}
                    className={`px-3 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {uploadingAttachments ? 'Uploading...' : 'Upload Files'}
                  </button>
                </div>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleComposerFileSelection}
                />
                {composerAttachments.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {composerAttachments.map((attachment) => (
                      <div
                        key={attachment.url}
                        className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${border.default} ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#ff6b35] flex-shrink-0" />
                          <span className={`text-sm truncate ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            {attachment.fileName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeComposerAttachment(attachment.url)}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`mt-2 text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    Upload documents or images to share with the selected recipient.
                  </p>
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
              <div />
              <button
                onClick={handleSendMessage}
                className="px-6 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
                disabled={sendingMessage || (!composerBody.trim() && composerAttachments.length === 0)}
              >
                {sendingMessage ? 'Sending...' : composerMode === 'reply' ? 'Send Reply' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
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
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Conversations */}
        <div className={`xl:col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
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
                  selectConversation(conversation.id, { preserveSubject: true });
                }}
                className={`flex items-center justify-between p-4 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-all border ${
                  selectedConversationId === conversation.id ? 'border-[#ff6b35]/70' : border.default
                } hover:border-[#ff6b35]/50 cursor-pointer group`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-full flex items-center justify-center font-semibold">
                      {conversation.tenant
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    {conversation.unread > 0 && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#ff6b35] rounded-full border-2 border-white/80" />
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
                    <p className={`text-sm ${text.secondary} whitespace-pre-wrap break-words`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {conversation.fullLastMessage}
                    </p>
                    {Array.isArray(conversation.parsedMessage?.photoSections) && conversation.parsedMessage.photoSections.length > 0 && (
                      <div className="mt-3 space-y-3">
                        {conversation.parsedMessage.photoSections.map((section: PhotoSection) => (
                          <div key={`${conversation.id}-${section.label}`} className="space-y-2">
                            <p className={`text-xs font-semibold ${text.muted}`}>{section.label}</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {section.urls.map((url) => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className={`block rounded-lg overflow-hidden border ${border.default} ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}
                                >
                                  <img
                                    src={url}
                                    alt={section.label}
                                    className="w-full h-28 object-cover"
                                    loading="lazy"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(conversation.parsedMessage?.fileAttachments) && conversation.parsedMessage.fileAttachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className={`text-xs font-semibold ${text.muted}`}>Attachments</p>
                        <div className="space-y-2">
                          {conversation.parsedMessage.fileAttachments.map((attachment: AttachmentPreview) => (
                            <a
                              key={attachment.url}
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className={`flex items-center gap-3 rounded-lg border ${border.default} px-3 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                            >
                              <FileText className="w-4 h-4 text-[#ff6b35] flex-shrink-0" />
                              <span className={`text-sm ${text.secondary} truncate`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                                {attachment.fileName}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right ml-4">
                  <p className={`text-xs ${text.inactive} mb-2`}>{conversation.time}</p>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleReplyToConversation(conversation.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded text-xs font-medium transition-opacity"
                  >
                    Reply
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}

          <button
            onClick={loadMoreMessages}
            disabled={!hasMoreMessages || messagesLoadingMore}
            className={`w-full mt-4 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {messagesLoadingMore ? 'Loading...' : hasMoreMessages ? 'View More Conversations' : 'All Conversations Loaded'}
          </button>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Portal Activity */}
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              PORTAL ACTIVITY
            </h3>
            {activityLoading ? (
              <div className="text-center py-4">
                <div className={`w-6 h-6 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin mx-auto`} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${text.secondary}`}>Messages Today</span>
                  <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{messagesToday}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${text.secondary}`}>Avg. Response</span>
                  <span className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{avgResponseDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${text.secondary}`}>Resolved Today</span>
                  <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{normalizedPortalActivity.resolvedToday}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      </div>
    </FeatureGate>
  );
}
