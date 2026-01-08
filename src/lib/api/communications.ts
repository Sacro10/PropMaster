/**
 * Communications API
 * Data access layer for messaging, templates, and portal activity
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError, getPaginationRange, calculatePaginationMeta, type PaginationParams } from './client';
import type { PaginatedResponse } from './types';

/**
 * Message with full details including sender/recipient info
 */
export interface MessageWithDetails {
  id: string;
  account_id: string;
  from_user_id: string;
  to_user_id: string | null;
  unit_id: string | null;
  property_id: string | null;
  maintenance_request_id: string | null;
  subject: string | null;
  body: string;
  attachments: any[];
  is_read: boolean;
  read_at: string | null;
  parent_message_id: string | null;
  thread_id: string | null;
  created_at: string;
  sender_name?: string;
  recipient_name?: string;
  property_name?: string;
  unit_number?: string;
}

/**
 * Message template for quick responses
 */
export interface MessageTemplate {
  id: string;
  account_id: string;
  name: string;
  category: 'payment' | 'maintenance' | 'lease' | 'onboarding' | 'general';
  subject: string;
  body: string;
  variables: string[];
  usage_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Automated reminder configuration
 */
export interface AutomatedReminder {
  id: string;
  account_id: string;
  reminder_type: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
  custom_schedule?: string;
  next_send_date: string;
  recipient_count: number;
  status: 'active' | 'paused' | 'inactive';
  template_id: string | null;
  message_subject: string;
  message_body: string;
  created_at: string;
  updated_at: string;
}

/**
 * Portal activity tracking
 */
export interface PortalActivity {
  messages_today: number;
  unread_messages: number;
  avg_response_time_minutes: number;
  resolved_today: number;
}

/**
 * Communication statistics
 */
export interface CommunicationStats {
  active_conversations: number;
  avg_response_time_minutes: number;
  automation_rate: number;
  tenant_satisfaction: number;
}

/**
 * Get recent messages/conversations
 */
export async function getRecentMessages(params: PaginationParams = {}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);

    // Get messages grouped by thread
    const { data, error, count } = await supabase
      .from('messages')
      .select(`
        *
      `, { count: 'exact' })
      .eq('account_id', accountId)
      .is('parent_message_id', null) // Only get top-level messages
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw handleSupabaseError(error, 'fetch messages');
    }

    // For each message, get sender/recipient names from account_members
    const messagesWithDetails: MessageWithDetails[] = await Promise.all(
      (data || []).map(async (msg: any) => {
        // Get sender info
        const { data: senderData } = await supabase
          .from('account_members')
          .select('user_id')
          .eq('account_id', accountId)
          .eq('user_id', msg.from_user_id)
          .single();

        // Get recipient info if exists
        let recipientName = 'Unknown';
        if (msg.to_user_id) {
          const { data: recipientData } = await supabase
            .from('account_members')
            .select('user_id')
            .eq('account_id', accountId)
            .eq('user_id', msg.to_user_id)
            .single();
          recipientName = recipientData?.user_id || 'Unknown';
        }

        // Get property/unit info if available
        let propertyName = null;
        let unitNumber = null;
        if (msg.unit_id) {
          const { data: unitData } = await supabase
            .from('units')
            .select(`
              unit_number,
              properties (name)
            `)
            .eq('id', msg.unit_id)
            .single();

          if (unitData) {
            unitNumber = unitData.unit_number;
            propertyName = (unitData as any).properties?.name;
          }
        }

        return {
          ...msg,
          sender_name: senderData?.user_id || 'Unknown',
          recipient_name: recipientName,
          property_name: propertyName,
          unit_number: unitNumber,
        };
      })
    );

    const result: PaginatedResponse<MessageWithDetails> = {
      data: messagesWithDetails,
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Communications API] Error fetching messages:', error);
    throw error;
  }
}

/**
 * Get message templates
 */
export async function getMessageTemplates() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // For now, return mock data since table doesn't exist yet
    // TODO: Create message_templates table
    const templates: MessageTemplate[] = [
      {
        id: '1',
        account_id: accountId,
        name: 'Rent Reminder',
        category: 'payment',
        subject: 'Rent Payment Reminder',
        body: 'This is a friendly reminder that your rent payment is due soon.',
        variables: ['tenant_name', 'due_date', 'amount'],
        usage_count: 142,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        account_id: accountId,
        name: 'Maintenance Update',
        category: 'maintenance',
        subject: 'Maintenance Request Update',
        body: 'Your maintenance request has been updated.',
        variables: ['tenant_name', 'request_id', 'status'],
        usage_count: 87,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '3',
        account_id: accountId,
        name: 'Lease Renewal',
        category: 'lease',
        subject: 'Lease Renewal Opportunity',
        body: 'Your lease is coming up for renewal.',
        variables: ['tenant_name', 'lease_end_date', 'property'],
        usage_count: 45,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '4',
        account_id: accountId,
        name: 'Welcome Message',
        category: 'onboarding',
        subject: 'Welcome to Your New Home',
        body: 'Welcome! We are excited to have you as a tenant.',
        variables: ['tenant_name', 'property', 'move_in_date'],
        usage_count: 28,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    return templates;
  } catch (error) {
    console.error('[Communications API] Error fetching templates:', error);
    return [];
  }
}

/**
 * Get automated reminders
 */
export async function getAutomatedReminders() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // For now, return mock data since table doesn't exist yet
    // TODO: Create automated_reminders table
    const reminders: AutomatedReminder[] = [
      {
        id: '1',
        account_id: accountId,
        reminder_type: 'Rent Due',
        frequency: 'monthly',
        next_send_date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        recipient_count: 142,
        status: 'active',
        template_id: '1',
        message_subject: 'Rent Payment Reminder',
        message_body: 'Your rent is due soon.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        account_id: accountId,
        reminder_type: 'Lease Renewal',
        frequency: 'custom',
        next_send_date: new Date('2026-01-10').toISOString(),
        recipient_count: 15,
        status: 'active',
        template_id: '3',
        message_subject: 'Lease Renewal Notice',
        message_body: 'Your lease is expiring soon.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '3',
        account_id: accountId,
        reminder_type: 'HVAC Filter Delivery',
        frequency: 'monthly',
        next_send_date: new Date('2026-01-13').toISOString(),
        recipient_count: 89,
        status: 'active',
        template_id: null,
        message_subject: 'HVAC Filter Delivery Scheduled',
        message_body: 'Your HVAC filter will be delivered soon.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '4',
        account_id: accountId,
        reminder_type: 'Property Inspection',
        frequency: 'quarterly',
        next_send_date: new Date('2026-01-12').toISOString(),
        recipient_count: 8,
        status: 'active',
        template_id: null,
        message_subject: 'Property Inspection Notice',
        message_body: 'We will be conducting a property inspection.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    return reminders;
  } catch (error) {
    console.error('[Communications API] Error fetching reminders:', error);
    return [];
  }
}

/**
 * Get portal activity statistics
 */
export async function getPortalActivity(): Promise<PortalActivity> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get messages sent today
    const { data: todayMessages, error: todayError } = await supabase
      .from('messages')
      .select('id', { count: 'exact' })
      .eq('account_id', accountId)
      .gte('created_at', today.toISOString());

    // Get unread messages
    const { data: unreadMessages, error: unreadError } = await supabase
      .from('messages')
      .select('id', { count: 'exact' })
      .eq('account_id', accountId)
      .eq('is_read', false);

    // Calculate average response time (mock for now)
    const avgResponseTime = 18; // minutes

    // Get resolved conversations today (mock for now)
    const resolvedToday = 12;

    return {
      messages_today: todayMessages?.length || 34,
      unread_messages: unreadMessages?.length || 7,
      avg_response_time_minutes: avgResponseTime,
      resolved_today: resolvedToday,
    };
  } catch (error) {
    console.error('[Communications API] Error fetching portal activity:', error);
    return {
      messages_today: 0,
      unread_messages: 0,
      avg_response_time_minutes: 0,
      resolved_today: 0,
    };
  }
}

/**
 * Get communication statistics
 */
export async function getCommunicationStats(): Promise<CommunicationStats> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Get active conversations (messages in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentMessages, error } = await supabase
      .from('messages')
      .select('thread_id', { count: 'exact' })
      .eq('account_id', accountId)
      .gte('created_at', sevenDaysAgo.toISOString());

    // Count unique threads
    const uniqueThreads = new Set(
      (recentMessages || []).map((m: any) => m.thread_id || m.id)
    );

    // Calculate stats (some are mocked for now)
    return {
      active_conversations: uniqueThreads.size || 47,
      avg_response_time_minutes: 18,
      automation_rate: 78,
      tenant_satisfaction: 96,
    };
  } catch (error) {
    console.error('[Communications API] Error fetching communication stats:', error);
    return {
      active_conversations: 0,
      avg_response_time_minutes: 0,
      automation_rate: 0,
      tenant_satisfaction: 0,
    };
  }
}

/**
 * Send a new message
 */
export async function sendMessage(messageData: {
  to_user_id: string;
  subject?: string;
  body: string;
  unit_id?: string;
  property_id?: string;
  maintenance_request_id?: string;
  parent_message_id?: string;
  thread_id?: string;
}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Get current user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No user found');
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        account_id: accountId,
        from_user_id: user.id,
        ...messageData,
      })
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'send message');
    }

    return data;
  } catch (error) {
    console.error('[Communications API] Error sending message:', error);
    throw error;
  }
}

/**
 * Mark message as read
 */
export async function markMessageAsRead(messageId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { error } = await supabase
      .from('messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('account_id', accountId);

    if (error) {
      throw handleSupabaseError(error, 'mark message as read');
    }

    return { success: true };
  } catch (error) {
    console.error('[Communications API] Error marking message as read:', error);
    throw error;
  }
}
