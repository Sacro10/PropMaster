import { supabaseAdmin as supabase } from '../supabase';

export interface Conversation {
  id: string;
  subject: string | null;
  participants: string[];
  propertyId: string | null;
  unitId: string | null;
  relatedType: string | null;
  relatedId: string | null;
  status: string;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string | null;
  senderId: string;
  recipientId: string;
  subject: string | null;
  body: string;
  isRead: boolean;
  createdAt: string;
  senderName?: string;
  recipientName?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  subject: string | null;
  body: string;
  variables: string[];
  usageCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface ReminderSchedule {
  id: string;
  name: string;
  reminderType: string;
  templateId: string | null;
  frequency: string;
  customCron: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  isActive: boolean;
  recipientFilter: Record<string, any>;
  createdAt: string;
}

/**
 * Get conversations
 */
export async function getConversations(
  accountId: string,
  userId: string,
  filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ conversations: Conversation[]; total: number }> {
  const { status, limit = 50, offset = 0 } = filters || {};

  let query = supabase
    .from('conversations')
    .select('*', { count: 'exact' })
    .eq('account_id', accountId)
    .contains('participants', [userId]);

  if (status) query = query.eq('status', status);

  query = query.order('last_message_at', { ascending: false, nullsFirst: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    conversations: data || [],
    total: count || 0,
  };
}

/**
 * Get messages in a conversation
 */
export async function getConversationMessages(
  accountId: string,
  conversationId: string,
  limit = 100
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  return data || [];
}

/**
 * Send a message
 */
export async function sendMessage(
  accountId: string,
  senderId: string,
  data: {
    recipientId: string;
    subject?: string;
    body: string;
    conversationId?: string;
    propertyId?: string;
    unitId?: string;
  }
): Promise<Message> {
  // If no conversation ID, create or find existing conversation
  let conversationId = data.conversationId;

  if (!conversationId) {
    // Try to find existing conversation between these participants
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .contains('participants', [senderId, data.recipientId])
      .single();

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          account_id: accountId,
          subject: data.subject,
          participants: [senderId, data.recipientId],
          property_id: data.propertyId,
          unit_id: data.unitId,
          status: 'active',
        })
        .select()
        .single();

      if (convError) throw convError;
      conversationId = newConv.id;
    }
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      sender_id: senderId,
      recipient_id: data.recipientId,
      subject: data.subject,
      body: data.body,
      is_read: false,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: message.id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    recipientId: message.recipient_id,
    subject: message.subject,
    body: message.body,
    isRead: message.is_read,
    createdAt: message.created_at,
  };
}

/**
 * Mark message as read
 */
export async function markMessageAsRead(
  accountId: string,
  messageId: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('id', messageId)
    .eq('account_id', accountId);

  if (error) throw error;
}

/**
 * Get message templates
 */
export async function getMessageTemplates(
  accountId: string,
  filters?: {
    category?: string;
    isActive?: boolean;
  }
): Promise<MessageTemplate[]> {
  let query = supabase
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId);

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.isActive !== undefined) query = query.eq('is_active', filters.isActive);

  query = query.order('name');

  const { data, error } = await query;

  if (error) throw error;

  return (
    data?.map((t: any) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      subject: t.subject,
      body: t.body,
      variables: t.variables || [],
      usageCount: t.usage_count,
      isActive: t.is_active,
      createdAt: t.created_at,
    })) || []
  );
}

/**
 * Create message template
 */
export async function createMessageTemplate(
  accountId: string,
  data: {
    name: string;
    category: string;
    subject?: string;
    body: string;
    variables?: string[];
  }
): Promise<MessageTemplate> {
  const { data: template, error } = await supabase
    .from('message_templates')
    .insert({
      account_id: accountId,
      name: data.name,
      category: data.category,
      subject: data.subject,
      body: data.body,
      variables: data.variables || [],
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: template.id,
    name: template.name,
    category: template.category,
    subject: template.subject,
    body: template.body,
    variables: template.variables || [],
    usageCount: template.usage_count,
    isActive: template.is_active,
    createdAt: template.created_at,
  };
}

/**
 * Get reminder schedules
 */
export async function getReminderSchedules(
  accountId: string,
  isActive?: boolean
): Promise<ReminderSchedule[]> {
  let query = supabase
    .from('reminder_schedules')
    .select('*')
    .eq('account_id', accountId);

  if (isActive !== undefined) query = query.eq('is_active', isActive);

  query = query.order('name');

  const { data, error } = await query;

  if (error) throw error;

  return (
    data?.map((r: any) => ({
      id: r.id,
      name: r.name,
      reminderType: r.reminder_type,
      templateId: r.template_id,
      frequency: r.frequency,
      customCron: r.custom_cron,
      nextRunAt: r.next_run_at,
      lastRunAt: r.last_run_at,
      isActive: r.is_active,
      recipientFilter: r.recipient_filter || {},
      createdAt: r.created_at,
    })) || []
  );
}

/**
 * Create reminder schedule
 */
export async function createReminderSchedule(
  accountId: string,
  data: {
    name: string;
    reminderType: string;
    templateId?: string;
    frequency: string;
    customCron?: string;
    recipientFilter?: Record<string, any>;
  }
): Promise<ReminderSchedule> {
  // Calculate next run date based on frequency
  const now = new Date();
  let nextRunAt = new Date(now);

  if (data.frequency === 'daily') {
    nextRunAt.setDate(nextRunAt.getDate() + 1);
  } else if (data.frequency === 'weekly') {
    nextRunAt.setDate(nextRunAt.getDate() + 7);
  } else if (data.frequency === 'monthly') {
    nextRunAt.setMonth(nextRunAt.getMonth() + 1);
  } else if (data.frequency === 'quarterly') {
    nextRunAt.setMonth(nextRunAt.getMonth() + 3);
  }

  const { data: schedule, error } = await supabase
    .from('reminder_schedules')
    .insert({
      account_id: accountId,
      name: data.name,
      reminder_type: data.reminderType,
      template_id: data.templateId,
      frequency: data.frequency,
      custom_cron: data.customCron,
      next_run_at: nextRunAt.toISOString(),
      recipient_filter: data.recipientFilter || {},
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: schedule.id,
    name: schedule.name,
    reminderType: schedule.reminder_type,
    templateId: schedule.template_id,
    frequency: schedule.frequency,
    customCron: schedule.custom_cron,
    nextRunAt: schedule.next_run_at,
    lastRunAt: schedule.last_run_at,
    isActive: schedule.is_active,
    recipientFilter: schedule.recipient_filter || {},
    createdAt: schedule.created_at,
  };
}
