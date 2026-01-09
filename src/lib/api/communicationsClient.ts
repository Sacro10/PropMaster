/**
 * Communications API Client
 * Uses backend API routes for communications features
 */

/// <reference types="vite/client" />

import { supabase } from '../supabaseClient';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Helper to make authenticated API requests
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }

  const response = await fetch(`${API_BASE}/api${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    // Check if response is HTML (error page) instead of JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.error('[Communications API] Received HTML instead of JSON - API may not be running');
      throw new Error('API server is not available');
    }
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API request failed: ${response.statusText}`);
  }

  return response.json();
}

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

export interface MessageSuggestion {
  suggestion: string;
  provider: string | null;
}

// =========================================
// CONVERSATIONS
// =========================================

export async function getConversations(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ conversations: Conversation[]; total: number }> {
  try {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const query = queryParams.toString();
    return await apiRequest(`/communications/conversations${query ? `?${query}` : ''}`);
  } catch (error) {
    console.error('[Communications API] Error fetching conversations:', error);
    return { conversations: [], total: 0 };
  }
}

export async function getConversation(id: string): Promise<Conversation> {
  return apiRequest(`/communications/conversations/${id}`);
}

export async function getConversationMessages(
  conversationId: string,
  limit?: number
): Promise<Message[]> {
  const query = limit ? `?limit=${limit}` : '';
  return apiRequest(`/communications/conversations/${conversationId}/messages${query}`);
}

export async function updateConversationStatus(
  conversationId: string,
  status: 'active' | 'resolved' | 'archived'
): Promise<void> {
  await apiRequest(`/communications/conversations/${conversationId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// =========================================
// MESSAGES
// =========================================

export async function sendMessage(data: {
  recipientId: string;
  subject?: string;
  body: string;
  conversationId?: string;
  propertyId?: string;
  unitId?: string;
}): Promise<Message> {
  return apiRequest('/communications/messages', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  await apiRequest(`/communications/messages/${messageId}/read`, {
    method: 'PUT',
  });
}

export async function sendReminderMessage(data: {
  recipientId: string;
  subject: string;
  body: string;
  relatedType: 'lease' | 'maintenance' | 'showing' | 'payment';
  relatedId: string;
  propertyId?: string;
  unitId?: string;
}): Promise<Message> {
  return apiRequest('/communications/send-reminder', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function generateMessageSuggestion(data: {
  conversationId: string;
  intent?: string;
}): Promise<MessageSuggestion> {
  return apiRequest('/communications/suggestions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// =========================================
// TEMPLATES
// =========================================

export async function getMessageTemplates(params?: {
  category?: string;
  isActive?: boolean;
}): Promise<MessageTemplate[]> {
  try {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());

    const query = queryParams.toString();
    return await apiRequest(`/communications/templates${query ? `?${query}` : ''}`);
  } catch (error) {
    console.error('[Communications API] Error fetching templates:', error);
    return [];
  }
}

export async function createMessageTemplate(data: {
  name: string;
  category: 'payment' | 'maintenance' | 'lease' | 'onboarding' | 'general';
  subject?: string;
  body: string;
  variables?: string[];
}): Promise<MessageTemplate> {
  return apiRequest('/communications/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMessageTemplate(
  templateId: string,
  data: Partial<MessageTemplate>
): Promise<MessageTemplate> {
  return apiRequest(`/communications/templates/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteMessageTemplate(templateId: string): Promise<void> {
  await apiRequest(`/communications/templates/${templateId}`, {
    method: 'DELETE',
  });
}

// =========================================
// AUTOMATED REMINDERS
// =========================================

export async function getAutomatedReminders(
  status?: 'active' | 'paused' | 'inactive'
): Promise<AutomatedReminder[]> {
  try {
    const query = status ? `?status=${status}` : '';
    return await apiRequest(`/communications/reminders${query}`);
  } catch (error) {
    console.error('[Communications API] Error fetching reminders:', error);
    return [];
  }
}

export async function createAutomatedReminder(data: {
  reminderType: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
  customSchedule?: string;
  templateId?: string;
  messageSubject: string;
  messageBody: string;
  recipientFilter?: Record<string, any>;
}): Promise<AutomatedReminder> {
  return apiRequest('/communications/reminders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAutomatedReminder(
  reminderId: string,
  data: Partial<AutomatedReminder>
): Promise<AutomatedReminder> {
  return apiRequest(`/communications/reminders/${reminderId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAutomatedReminder(reminderId: string): Promise<void> {
  await apiRequest(`/communications/reminders/${reminderId}`, {
    method: 'DELETE',
  });
}

// =========================================
// STATISTICS
// =========================================

export async function getCommunicationStats(
  timeframeDays?: number
): Promise<CommunicationStats> {
  try {
    const query = timeframeDays ? `?days=${timeframeDays}` : '';
    return await apiRequest(`/communications/stats${query}`);
  } catch (error) {
    console.error('[Communications API] Error fetching stats:', error);
    return {
      activeConversations: 0,
      avgResponseTimeMinutes: 0,
      automationRate: 0,
      tenantSatisfaction: 0,
    };
  }
}

export async function getPortalActivity(): Promise<PortalActivity> {
  try {
    return await apiRequest('/communications/activity');
  } catch (error) {
    console.error('[Communications API] Error fetching portal activity:', error);
    return {
      messagesToday: 0,
      unreadMessages: 0,
      avgResponseTimeMinutes: 0,
      resolvedToday: 0,
    };
  }
}
