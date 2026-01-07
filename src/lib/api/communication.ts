/**
 * Communication API
 * Data access layer for messages and notifications
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, getCurrentUser, handleSupabaseError, getPaginationRange, calculatePaginationMeta, type PaginationParams } from './client';
import type { MessageWithDetails, Notification, PaginatedResponse } from './types';

/**
 * Get conversations (messages grouped by thread)
 */
export async function getConversations(params: PaginationParams = {}) {
  try {
    const accountId = await getCurrentAccountId();
    const user = await getCurrentUser();

    if (!accountId || !user) {
      throw new Error('No account or user found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);

    // Get recent messages where user is sender or recipient
    const { data, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('account_id', accountId)
      .or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`)
      .is('parent_message_id', null) // Only root messages
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw handleSupabaseError(error, 'fetch conversations');
    }

    // Transform to conversation format
    const conversations: MessageWithDetails[] = (data || []).map((msg: any) => ({
      ...msg,
      sender_name: null, // TODO: Join with user profile
      recipient_name: null, // TODO: Join with user profile
      reply_count: 0, // TODO: Count replies
    }));

    const result: PaginatedResponse<MessageWithDetails> = {
      data: conversations,
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Communication API] Error fetching conversations:', error);
    throw error;
  }
}

/**
 * Get unread message count
 */
export async function getUnreadCount() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return 0;
    }

    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', user.id)
      .eq('is_read', false);

    if (error) {
      throw handleSupabaseError(error, 'fetch unread count');
    }

    return count || 0;
  } catch (error) {
    console.error('[Communication API] Error fetching unread count:', error);
    return 0;
  }
}

/**
 * Mark message as read
 */
export async function markMessageAsRead(messageId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('No user found');
    }

    const { data, error } = await supabase
      .from('messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('recipient_user_id', user.id)
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'mark message as read');
    }

    return data;
  } catch (error) {
    console.error('[Communication API] Error marking message as read:', error);
    throw error;
  }
}

/**
 * Send a new message
 */
export async function sendMessage(data: {
  recipient_user_id: string;
  subject?: string;
  body: string;
  parent_message_id?: string;
}) {
  try {
    const accountId = await getCurrentAccountId();
    const user = await getCurrentUser();

    if (!accountId || !user) {
      throw new Error('No account or user found');
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        account_id: accountId,
        sender_user_id: user.id,
        recipient_user_id: data.recipient_user_id,
        subject: data.subject || null,
        body: data.body,
        parent_message_id: data.parent_message_id || null,
      })
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'send message');
    }

    return message;
  } catch (error) {
    console.error('[Communication API] Error sending message:', error);
    throw error;
  }
}

/**
 * Get notifications
 */
export async function getNotifications(params: PaginationParams = {}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('No user found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);

    const { data, error, count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw handleSupabaseError(error, 'fetch notifications');
    }

    const result: PaginatedResponse<Notification> = {
      data: data || [],
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Communication API] Error fetching notifications:', error);
    throw error;
  }
}

/**
 * Get communication statistics
 */
export async function getCommunicationStats() {
  try {
    const accountId = await getCurrentAccountId();
    const user = await getCurrentUser();

    if (!accountId || !user) {
      throw new Error('No account or user found');
    }

    const [activeConversations, recentMessages] = await Promise.all([
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .is('parent_message_id', null),

      supabase
        .from('messages')
        .select('created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(100)
    ]);

    // Calculate average response time (simplified)
    const avgResponseTime = 18; // minutes

    // Automation rate (placeholder)
    const automationRate = 78;

    // Tenant satisfaction (placeholder)
    const tenantSatisfaction = 96;

    return {
      active_conversations: activeConversations.count || 0,
      avg_response_time: avgResponseTime,
      automation_rate: automationRate,
      tenant_satisfaction: tenantSatisfaction,
    };
  } catch (error) {
    console.error('[Communication API] Error fetching stats:', error);
    return {
      active_conversations: 0,
      avg_response_time: 0,
      automation_rate: 0,
      tenant_satisfaction: 0,
    };
  }
}

/**
 * Get automated reminders (mock data for now)
 */
export async function getAutomatedReminders() {
  // TODO: Implement actual automated reminders table
  return [
    {
      type: 'Rent Due',
      recipients: 142,
      nextSend: 'Tomorrow, 9:00 AM',
      frequency: 'Monthly',
      status: 'active',
    },
    {
      type: 'Lease Renewal',
      recipients: 15,
      nextSend: 'Jan 10, 2026',
      frequency: 'Custom',
      status: 'active',
    },
    {
      type: 'HVAC Filter Delivery',
      recipients: 89,
      nextSend: 'Jan 13, 2026',
      frequency: 'Monthly',
      status: 'active',
    },
    {
      type: 'Property Inspection',
      recipients: 8,
      nextSend: 'Jan 12, 2026',
      frequency: 'Quarterly',
      status: 'active',
    },
  ];
}
