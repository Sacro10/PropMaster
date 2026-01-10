/**
 * React hooks for communications management
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/communicationsClient';

export function useRecentMessages() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getConversations({ limit: 10 });
      setData(result.conversations || []);
      setTotal(result.total);
    } catch (err) {
      console.error('[useRecentMessages] Error fetching messages:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, total, refetch: fetchData };
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
      setSuggestion(result.suggestion || '');
      setProvider(result.provider);
      return { success: true, data: result };
    } catch (err) {
      console.error('[useMessageSuggestion] Error generating suggestion:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setSuggestion('');
    setProvider(null);
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
