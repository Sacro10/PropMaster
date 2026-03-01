/**
 * React hooks for communications management
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/communicationsClient';
import { supabase } from '../supabaseClient';

export interface CommunicationNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url?: string | null;
  payload?: {
    conversationId?: string;
    maintenanceRequestId?: string;
    senderId?: string;
  } | null;
  is_read: boolean;
  created_at: string;
}

export function useRecentMessages() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getConversations({ limit: pageSize, offset: 0 });
      setData(result.conversations || []);
      setTotal(result.total);
    } catch (err) {
      console.error('[useRecentMessages] Error fetching messages:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    if (total && data.length >= total) return;
    try {
      setLoadingMore(true);
      const result = await api.getConversations({ limit: pageSize, offset: data.length });
      const next = result.conversations || [];
      setData((prev) => {
        const seen = new Set(prev.map((item: any) => item.id));
        const merged = [...prev];
        for (const item of next) {
          if (!seen.has(item.id)) {
            merged.push(item);
          }
        }
        return merged;
      });
      setTotal(result.total);
    } catch (err) {
      console.error('[useRecentMessages] Error loading more messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [data.length, loadingMore, pageSize, total]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    loadingMore,
    error,
    total,
    hasMore: data.length < total,
    refetch: fetchData,
    loadMore,
  };
}

export function useCommunicationNotifications() {
  const [data, setData] = useState<CommunicationNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult.user?.id;
      if (!userId) {
        setData([]);
        return;
      }

      const { data: notifications, error: notificationsError } = await supabase
        .from('notifications')
        .select('id, type, title, message, action_url, payload, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(8);

      if (notificationsError) {
        throw notificationsError;
      }

      setData((notifications || []) as CommunicationNotification[]);
    } catch (err) {
      console.error('[useCommunicationNotifications] Error fetching notifications:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      setData((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: true }
            : notification
        )
      );
    } catch (err) {
      console.error('[useCommunicationNotifications] Error marking notification as read:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData, markRead };
}

export function useMessageTemplates() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getMessageTemplates();
      setData(result);
    } catch (err) {
      console.error('[useMessageTemplates] Error fetching templates:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useConversationMessages(conversationId?: string | null) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!conversationId) {
      setData([]);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.getConversationMessages(conversationId, 100);
      setData(result || []);
    } catch (err) {
      console.error('[useConversationMessages] Error fetching conversation messages:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useAutomatedReminders() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getAutomatedReminders();
      setData(result);
    } catch (err) {
      console.error('[useAutomatedReminders] Error fetching reminders:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function usePortalActivity() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getPortalActivity();
      setData(result);
    } catch (err) {
      console.error('[usePortalActivity] Error fetching portal activity:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useCommunicationStats() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getCommunicationStats();
      setData(result);
    } catch (err) {
      console.error('[useCommunicationStats] Error fetching communication stats:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useSendMessage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const send = useCallback(async (messageData: {
    recipientId: string;
    subject?: string;
    body: string;
    conversationId?: string;
    propertyId?: string;
    unitId?: string;
    maintenanceRequestId?: string;
    attachments?: Array<{
      url: string;
      fileName: string;
      contentType?: string | null;
      size?: number | null;
    }>;
  }) => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.sendMessage(messageData);
      return { success: true, data: result };
    } catch (err) {
      console.error('[useSendMessage] Error sending message:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { send, loading, error };
}

export function useMarkMessageAsRead() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const markAsRead = useCallback(async (messageId: string) => {
    try {
      setLoading(true);
      setError(null);
      await api.markMessageAsRead(messageId);
      return { success: true };
    } catch (err) {
      console.error('[useMarkMessageAsRead] Error marking message as read:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { markAsRead, loading, error };
}

export function useMessageSuggestion() {
  const [suggestion, setSuggestion] = useState<string>('');
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generate = useCallback(async (conversationId: string, intent?: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.generateMessageSuggestion({ conversationId, intent });
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.suggestion?.trim()) {
        throw new Error('AI did not return a suggestion.');
      }
      setSuggestion(result.suggestion || '');
      setProvider(result.provider);
      return { success: true, data: result };
    } catch (err) {
      console.error('[useMessageSuggestion] Error generating suggestion:', err);
      setError(err as Error);
      setSuggestion('');
      setProvider(null);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setSuggestion('');
    setProvider(null);
    setError(null);
  }, []);

  return {
    suggestion,
    provider,
    loading,
    error,
    generate,
    clear,
  };
}

export function useCreateReminder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (reminderData: {
    reminderType: string;
    name: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
    customSchedule?: string;
    templateId?: string;
    messageSubject: string;
    messageBody: string;
    recipientFilter?: Record<string, any>;
  }) => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.createAutomatedReminder(reminderData);
      return { success: true, data: result };
    } catch (err) {
      console.error('[useCreateReminder] Error creating reminder:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}

export function useUpdateReminder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const update = useCallback(async (
    reminderId: string,
    reminderData: {
      name?: string;
      frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
      customSchedule?: string | null;
      templateId?: string | null;
      messageSubject?: string;
      messageBody?: string;
      recipientFilter?: Record<string, any>;
      status?: 'active' | 'paused' | 'inactive';
    }
  ) => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.updateAutomatedReminder(reminderId, reminderData);
      return { success: true, data: result };
    } catch (err) {
      console.error('[useUpdateReminder] Error updating reminder:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { update, loading, error };
}

export function useCreateMessageTemplate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (templateData: {
    name: string;
    category: 'payment' | 'maintenance' | 'lease' | 'onboarding' | 'general';
    subject?: string;
    body: string;
    variables?: string[];
  }) => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.createMessageTemplate(templateData);
      return { success: true, data: result };
    } catch (err) {
      console.error('[useCreateMessageTemplate] Error creating template:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}
