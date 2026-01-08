/**
 * React hooks for communications management
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getRecentMessages,
  getMessageTemplates,
  getAutomatedReminders,
  getPortalActivity,
  getCommunicationStats,
  sendMessage,
  markMessageAsRead,
  type MessageWithDetails,
  type MessageTemplate,
  type AutomatedReminder,
  type PortalActivity,
  type CommunicationStats,
  type PaginatedResponse,
} from '../api/communications';

export function useRecentMessages() {
  const [data, setData] = useState<MessageWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getRecentMessages();
      setData(result.data);
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
  const [data, setData] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getMessageTemplates();
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
  const [data, setData] = useState<AutomatedReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getAutomatedReminders();
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
  const [data, setData] = useState<PortalActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getPortalActivity();
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
  const [data, setData] = useState<CommunicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getCommunicationStats();
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
    to_user_id: string;
    subject?: string;
    body: string;
    unit_id?: string;
    property_id?: string;
    maintenance_request_id?: string;
    parent_message_id?: string;
    thread_id?: string;
  }) => {
    try {
      setLoading(true);
      setError(null);
      const result = await sendMessage(messageData);
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
      await markMessageAsRead(messageId);
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
