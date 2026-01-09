/**
 * Communications Service
 * Handles conversations, messages, templates, reminders, and stats
 */

import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';
import { AiDisabledError, generateText, getAiStatus } from './aiClient';

// =========================================
// TYPES
// =========================================

export interface Conversation {
  id: string;
  accountId: string;
  subject: string | null;
  participants: string[];
  propertyId: string | null;
  unitId: string | null;
  relatedType: string | null;
  relatedId: string | null;
  status: 'active' | 'resolved' | 'archived';
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  unreadCount?: number;
}

export interface Message {
  id: string;
  accountId: string;
  conversationId: string | null;
  fromUserId: string;
  toUserId: string | null;
  subject: string | null;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  senderName?: string;
  recipientName?: string;
}

export interface MessageTemplate {
  id: string;
  accountId: string;
  name: string;
  category: 'payment' | 'maintenance' | 'lease' | 'onboarding' | 'general';
  subject: string | null;
  body: string;
  variables: string[];
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AutomatedReminder {
  id: string;
  accountId: string;
  reminderType: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
  customSchedule: string | null;
  nextSendDate: string;
  lastSentDate: string | null;
  templateId: string | null;
  messageSubject: string;
  messageBody: string;
  recipientFilter: Record<string, any>;
  recipientCount: number;
  status: 'active' | 'paused' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ReminderLog {
  id: string;
  accountId: string;
  reminderId: string;
  executedAt: string;
  recipientsCount: number;
  messagesSent: number;
  messagesFailed: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage: string | null;
  executionDurationMs: number | null;
}

export interface OutboundMessage {
  id: string;
  accountId: string;
  messageId: string | null;
  conversationId: string | null;
  reminderId: string | null;
  recipientUserId: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  subject: string | null;
  body: string;
  channel: 'email' | 'sms' | 'push' | 'in_app';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  provider: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface CommunicationStats {
  activeConversations: number;
  avgResponseTimeMinutes: number;
  automationRate: number;
  tenantSatisfaction: number;
}

export interface PortalActivity {
  messagesToday: number;
  unreadMessages: number;
  avgResponseTimeMinutes: number;
  resolvedToday: number;
}

// =========================================
// CONVERSATIONS
// =========================================

/**
 * Get conversations for an account
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

  query = query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  // Get last message and unread count for each conversation
  const conversationsWithDetails = await Promise.all(
    (data || []).map(async (conv: any) => {
      // Get last message
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('body')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Count unread messages for this user
      const { count: unreadCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('to_user_id', userId)
        .eq('is_read', false);

      return {
        id: conv.id,
        accountId: conv.account_id,
        subject: conv.subject,
        participants: conv.participants,
        propertyId: conv.property_id,
        unitId: conv.unit_id,
        relatedType: conv.related_type,
        relatedId: conv.related_id,
        status: conv.status,
        lastMessageAt: conv.last_message_at,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        lastMessage: lastMsg?.body || null,
        unreadCount: unreadCount || 0,
      };
    })
  );

  return {
    conversations: conversationsWithDetails,
    total: count || 0,
  };
}

/**
 * Get a single conversation
 */
export async function getConversation(
  accountId: string,
  conversationId: string
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .single();

  if (error) return null;

  return {
    id: data.id,
    accountId: data.account_id,
    subject: data.subject,
    participants: data.participants,
    propertyId: data.property_id,
    unitId: data.unit_id,
    relatedType: data.related_type,
    relatedId: data.related_id,
    status: data.status,
    lastMessageAt: data.last_message_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Create or get existing conversation
 */
export async function getOrCreateConversation(
  accountId: string,
  data: {
    participants: string[];
    subject?: string;
    propertyId?: string;
    unitId?: string;
    relatedType?: string;
    relatedId?: string;
  }
): Promise<string> {
  // Try to find existing conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .contains('participants', data.participants)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) return existing.id;

  // Create new conversation
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      account_id: accountId,
      participants: data.participants,
      subject: data.subject,
      property_id: data.propertyId,
      unit_id: data.unitId,
      related_type: data.relatedType,
      related_id: data.relatedId,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw error;

  return newConv.id;
}

/**
 * Update conversation status
 */
export async function updateConversationStatus(
  accountId: string,
  conversationId: string,
  status: 'active' | 'resolved' | 'archived'
): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('account_id', accountId);

  if (error) throw error;
}

// =========================================
// MESSAGES
// =========================================

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
    .select(`
      *,
      from_user:from_user_id(id, email, raw_user_meta_data),
      to_user:to_user_id(id, email, raw_user_meta_data)
    `)
    .eq('conversation_id', conversationId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (
    data?.map((m: any) => ({
      id: m.id,
      accountId: m.account_id,
      conversationId: m.conversation_id,
      fromUserId: m.from_user_id,
      toUserId: m.to_user_id,
      subject: m.subject,
      body: m.body,
      isRead: m.is_read,
      readAt: m.read_at,
      createdAt: m.created_at,
      senderName:
        m.from_user?.raw_user_meta_data?.full_name || m.from_user?.email || 'Unknown',
      recipientName:
        m.to_user?.raw_user_meta_data?.full_name || m.to_user?.email || 'Unknown',
    })) || []
  );
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
  // Get or create conversation
  let conversationId = data.conversationId;
  if (!conversationId) {
    conversationId = await getOrCreateConversation(accountId, {
      participants: [senderId, data.recipientId],
      subject: data.subject,
      propertyId: data.propertyId,
      unitId: data.unitId,
    });
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      from_user_id: senderId,
      to_user_id: data.recipientId,
      subject: data.subject,
      body: data.body,
      is_read: false,
    })
    .select()
    .single();

  if (error) throw error;

  // Create activity event
  await logActivityEvent(
    accountId,
    senderId,
    'message_sent',
    `Sent message: ${data.subject || 'No subject'}`,
    {
      entityType: 'message',
      entityId: message.id,
      metadata: {
        conversationId,
        recipientId: data.recipientId,
      },
    }
  );

  return {
    id: message.id,
    accountId: message.account_id,
    conversationId: message.conversation_id,
    fromUserId: message.from_user_id,
    toUserId: message.to_user_id,
    subject: message.subject,
    body: message.body,
    isRead: message.is_read,
    readAt: message.read_at,
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
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('account_id', accountId);

  if (error) throw error;
}

// =========================================
// TEMPLATES
// =========================================

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
      accountId: t.account_id,
      name: t.name,
      category: t.category,
      subject: t.subject,
      body: t.body,
      variables: t.variables || [],
      usageCount: t.usage_count,
      isActive: t.is_active,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
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
    category: 'payment' | 'maintenance' | 'lease' | 'onboarding' | 'general';
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
    accountId: template.account_id,
    name: template.name,
    category: template.category,
    subject: template.subject,
    body: template.body,
    variables: template.variables || [],
    usageCount: template.usage_count,
    isActive: template.is_active,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

/**
 * Update message template
 */
export async function updateMessageTemplate(
  accountId: string,
  templateId: string,
  data: Partial<{
    name: string;
    category: string;
    subject: string;
    body: string;
    variables: string[];
    isActive: boolean;
  }>
): Promise<MessageTemplate> {
  const updateData: any = { updated_at: new Date().toISOString() };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.subject !== undefined) updateData.subject = data.subject;
  if (data.body !== undefined) updateData.body = data.body;
  if (data.variables !== undefined) updateData.variables = data.variables;
  if (data.isActive !== undefined) updateData.is_active = data.isActive;

  const { data: template, error } = await supabase
    .from('message_templates')
    .update(updateData)
    .eq('id', templateId)
    .eq('account_id', accountId)
    .select()
    .single();

  if (error) throw error;

  return {
    id: template.id,
    accountId: template.account_id,
    name: template.name,
    category: template.category,
    subject: template.subject,
    body: template.body,
    variables: template.variables || [],
    usageCount: template.usage_count,
    isActive: template.is_active,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

/**
 * Delete message template
 */
export async function deleteMessageTemplate(
  accountId: string,
  templateId: string
): Promise<void> {
  const { error } = await supabase
    .from('message_templates')
    .delete()
    .eq('id', templateId)
    .eq('account_id', accountId);

  if (error) throw error;
}

/**
 * Increment template usage count
 */
export async function incrementTemplateUsage(
  accountId: string,
  templateId: string
): Promise<void> {
  const { error } = await supabase.rpc('increment_template_usage', {
    p_template_id: templateId,
    p_account_id: accountId,
  });

  // If function doesn't exist, do manual increment
  if (error?.code === '42883') {
    const { data: template } = await supabase
      .from('message_templates')
      .select('usage_count')
      .eq('id', templateId)
      .single();

    await supabase
      .from('message_templates')
      .update({ usage_count: (template?.usage_count || 0) + 1 })
      .eq('id', templateId);
  } else if (error) {
    throw error;
  }
}

// =========================================
// AUTOMATED REMINDERS
// =========================================

/**
 * Get automated reminders
 */
export async function getAutomatedReminders(
  accountId: string,
  status?: 'active' | 'paused' | 'inactive'
): Promise<AutomatedReminder[]> {
  let query = supabase
    .from('automated_reminders')
    .select('*')
    .eq('account_id', accountId);

  if (status) query = query.eq('status', status);

  query = query.order('name');

  const { data, error } = await query;

  if (error) throw error;

  return (
    data?.map((r: any) => ({
      id: r.id,
      accountId: r.account_id,
      reminderType: r.reminder_type,
      name: r.name,
      frequency: r.frequency,
      customSchedule: r.custom_schedule,
      nextSendDate: r.next_send_date,
      lastSentDate: r.last_sent_date,
      templateId: r.template_id,
      messageSubject: r.message_subject,
      messageBody: r.message_body,
      recipientFilter: r.recipient_filter || {},
      recipientCount: r.recipient_count,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) || []
  );
}

/**
 * Create automated reminder
 */
export async function createAutomatedReminder(
  accountId: string,
  data: {
    reminderType: string;
    name: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
    customSchedule?: string;
    templateId?: string;
    messageSubject: string;
    messageBody: string;
    recipientFilter?: Record<string, any>;
  }
): Promise<AutomatedReminder> {
  // Calculate next send date
  const nextSendDate = calculateNextSendDate(data.frequency, data.customSchedule);

  const { data: reminder, error } = await supabase
    .from('automated_reminders')
    .insert({
      account_id: accountId,
      reminder_type: data.reminderType,
      name: data.name,
      frequency: data.frequency,
      custom_schedule: data.customSchedule,
      next_send_date: nextSendDate,
      template_id: data.templateId,
      message_subject: data.messageSubject,
      message_body: data.messageBody,
      recipient_filter: data.recipientFilter || {},
      recipient_count: 0,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: reminder.id,
    accountId: reminder.account_id,
    reminderType: reminder.reminder_type,
    name: reminder.name,
    frequency: reminder.frequency,
    customSchedule: reminder.custom_schedule,
    nextSendDate: reminder.next_send_date,
    lastSentDate: reminder.last_sent_date,
    templateId: reminder.template_id,
    messageSubject: reminder.message_subject,
    messageBody: reminder.message_body,
    recipientFilter: reminder.recipient_filter || {},
    recipientCount: reminder.recipient_count,
    status: reminder.status,
    createdAt: reminder.created_at,
    updatedAt: reminder.updated_at,
  };
}

/**
 * Update automated reminder
 */
export async function updateAutomatedReminder(
  accountId: string,
  reminderId: string,
  data: Partial<AutomatedReminder>
): Promise<AutomatedReminder> {
  const updateData: any = { updated_at: new Date().toISOString() };

  if (data.name) updateData.name = data.name;
  if (data.frequency) updateData.frequency = data.frequency;
  if (data.customSchedule) updateData.custom_schedule = data.customSchedule;
  if (data.messageSubject) updateData.message_subject = data.messageSubject;
  if (data.messageBody) updateData.message_body = data.messageBody;
  if (data.recipientFilter) updateData.recipient_filter = data.recipientFilter;
  if (data.status) updateData.status = data.status;

  // Recalculate next send date if frequency changed
  if (data.frequency || data.customSchedule) {
    updateData.next_send_date = calculateNextSendDate(
      data.frequency || 'monthly',
      data.customSchedule || undefined
    );
  }

  const { data: reminder, error } = await supabase
    .from('automated_reminders')
    .update(updateData)
    .eq('id', reminderId)
    .eq('account_id', accountId)
    .select()
    .single();

  if (error) throw error;

  return {
    id: reminder.id,
    accountId: reminder.account_id,
    reminderType: reminder.reminder_type,
    name: reminder.name,
    frequency: reminder.frequency,
    customSchedule: reminder.custom_schedule,
    nextSendDate: reminder.next_send_date,
    lastSentDate: reminder.last_sent_date,
    templateId: reminder.template_id,
    messageSubject: reminder.message_subject,
    messageBody: reminder.message_body,
    recipientFilter: reminder.recipient_filter || {},
    recipientCount: reminder.recipient_count,
    status: reminder.status,
    createdAt: reminder.created_at,
    updatedAt: reminder.updated_at,
  };
}

/**
 * Delete automated reminder
 */
export async function deleteAutomatedReminder(
  accountId: string,
  reminderId: string
): Promise<void> {
  const { error } = await supabase
    .from('automated_reminders')
    .delete()
    .eq('id', reminderId)
    .eq('account_id', accountId);

  if (error) throw error;
}

/**
 * Calculate next send date based on frequency
 */
function calculateNextSendDate(
  frequency: string,
  customSchedule?: string
): string {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'custom':
      // TODO: Parse cron expression if needed
      next.setDate(next.getDate() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

// =========================================
// STATISTICS
// =========================================

/**
 * Get communication statistics
 */
export async function getCommunicationStats(
  accountId: string,
  timeframeDays: number = 30
): Promise<CommunicationStats> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

  // Active conversations
  const { count: activeConversations } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'active')
    .gte('last_message_at', cutoffDate.toISOString());

  // Calculate average response time using the database function
  const { data: avgResponseData } = await supabase.rpc(
    'calculate_avg_response_time',
    {
      p_account_id: accountId,
      p_days: timeframeDays,
    }
  );

  // Automation rate: automated messages / total messages
  const { count: totalMessages } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', cutoffDate.toISOString());

  const { count: automatedMessages } = await supabase
    .from('outbound_messages')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .not('reminder_id', 'is', null)
    .gte('created_at', cutoffDate.toISOString());

  const automationRate =
    totalMessages && totalMessages > 0
      ? Math.round(((automatedMessages || 0) / totalMessages) * 100)
      : 0;

  // Tenant satisfaction: thumbs up / (thumbs up + thumbs down)
  const { data: satisfactionData } = await supabase
    .from('conversation_satisfaction')
    .select('rating')
    .eq('account_id', accountId)
    .gte('rated_at', cutoffDate.toISOString());

  let tenantSatisfaction = 0;
  if (satisfactionData && satisfactionData.length > 0) {
    const positiveRatings = satisfactionData.filter((r) => r.rating === 1).length;
    tenantSatisfaction = Math.round((positiveRatings / satisfactionData.length) * 100);
  }

  return {
    activeConversations: activeConversations || 0,
    avgResponseTimeMinutes: Math.round(avgResponseData || 0),
    automationRate,
    tenantSatisfaction,
  };
}

/**
 * Get portal activity stats
 */
export async function getPortalActivity(accountId: string): Promise<PortalActivity> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Messages today
  const { count: messagesToday } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', today.toISOString());

  // Unread messages
  const { count: unreadMessages } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('is_read', false);

  // Average response time (last 7 days)
  const { data: avgResponseData } = await supabase.rpc(
    'calculate_avg_response_time',
    {
      p_account_id: accountId,
      p_days: 7,
    }
  );

  // Resolved today
  const { count: resolvedToday } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'resolved')
    .gte('updated_at', today.toISOString());

  return {
    messagesToday: messagesToday || 0,
    unreadMessages: unreadMessages || 0,
    avgResponseTimeMinutes: Math.round(avgResponseData || 0),
    resolvedToday: resolvedToday || 0,
  };
}

// =========================================
// OUTBOUND MESSAGING
// =========================================

/**
 * Send outbound message via specified channel
 */
export async function sendOutboundMessage(
  accountId: string,
  data: {
    recipientUserId: string;
    subject?: string;
    body: string;
    channel: 'email' | 'sms' | 'push' | 'in_app';
    messageId?: string;
    conversationId?: string;
    reminderId?: string;
  }
): Promise<OutboundMessage> {
  // Get recipient details
  const { data: user } = await supabase.auth.admin.getUserById(data.recipientUserId);

  const { data: outbound, error } = await supabase
    .from('outbound_messages')
    .insert({
      account_id: accountId,
      message_id: data.messageId,
      conversation_id: data.conversationId,
      reminder_id: data.reminderId,
      recipient_user_id: data.recipientUserId,
      recipient_email: user?.user?.email,
      recipient_phone: user?.user?.user_metadata?.phone,
      subject: data.subject,
      body: data.body,
      channel: data.channel,
      status: 'pending',
      retry_count: 0,
    })
    .select()
    .single();

  if (error) throw error;

  // TODO: Integrate with actual email/SMS provider
  // For now, mark as sent immediately (stub)
  await supabase
    .from('outbound_messages')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider: 'stub',
    })
    .eq('id', outbound.id);

  return {
    id: outbound.id,
    accountId: outbound.account_id,
    messageId: outbound.message_id,
    conversationId: outbound.conversation_id,
    reminderId: outbound.reminder_id,
    recipientUserId: outbound.recipient_user_id,
    recipientEmail: outbound.recipient_email,
    recipientPhone: outbound.recipient_phone,
    subject: outbound.subject,
    body: outbound.body,
    channel: outbound.channel,
    status: 'sent',
    provider: 'stub',
    providerMessageId: null,
    sentAt: new Date().toISOString(),
    deliveredAt: null,
    failedAt: null,
    errorMessage: null,
    retryCount: 0,
  };
}

/**
 * Create a "Send Reminder" message for other features
 */
export async function createReminderMessage(
  accountId: string,
  senderId: string,
  data: {
    recipientId: string;
    subject: string;
    body: string;
    relatedType: 'lease' | 'maintenance' | 'showing' | 'payment';
    relatedId: string;
    propertyId?: string;
    unitId?: string;
  }
): Promise<Message> {
  // Create or get conversation
  const conversationId = await getOrCreateConversation(accountId, {
    participants: [senderId, data.recipientId],
    subject: data.subject,
    propertyId: data.propertyId,
    unitId: data.unitId,
    relatedType: data.relatedType,
    relatedId: data.relatedId,
  });

  // Send message
  const message = await sendMessage(accountId, senderId, {
    recipientId: data.recipientId,
    subject: data.subject,
    body: data.body,
    conversationId,
  });

  // Send outbound notification
  await sendOutboundMessage(accountId, {
    recipientUserId: data.recipientId,
    subject: data.subject,
    body: data.body,
    channel: 'email',
    messageId: message.id,
    conversationId,
  });

  return message;
}

/**
 * Generate an AI draft reply for a conversation
 */
export async function generateMessageSuggestion(
  accountId: string,
  userId: string,
  data: {
    conversationId: string;
    intent?: string;
  }
): Promise<{ suggestion: string; provider: string | null }> {
  const { data: messages } = await supabase
    .from('messages')
    .select('id, subject, body, from_user_id, to_user_id, created_at')
    .eq('account_id', accountId)
    .eq('conversation_id', data.conversationId)
    .order('created_at', { ascending: false })
    .limit(10);

  const aiStatus = getAiStatus();

  try {
    const suggestion = await generateText(
      'Draft a concise, professional reply based on the conversation. Keep it under 120 words.',
      {
        intent: data.intent || 'general_reply',
        userId,
        conversationId: data.conversationId,
        recentMessages: (messages || []).map((message) => ({
          subject: message.subject,
          body: message.body,
          fromUserId: message.from_user_id,
          toUserId: message.to_user_id,
          createdAt: message.created_at,
        })),
      }
    );

    return { suggestion, provider: aiStatus.provider };
  } catch (error) {
    if (!(error instanceof AiDisabledError)) {
      console.warn('[Communications] AI suggestion failed:', error);
    }
    return { suggestion: '', provider: aiStatus.provider };
  }
}
