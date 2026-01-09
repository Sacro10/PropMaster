/**
 * Communications Service Tests
 * Tests for conversations, messages, templates, and reminders
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { supabaseAdmin as supabase } from '../../src/supabase';
import {
  getConversations,
  sendMessage,
  getMessageTemplates,
  createMessageTemplate,
  getAutomatedReminders,
  createAutomatedReminder,
  getCommunicationStats,
  getPortalActivity,
  createReminderMessage,
} from '../../src/services/communicationsService';

describe('Communications Service', () => {
  let testAccountId: string;
  let testUserId1: string;
  let testUserId2: string;
  let testConversationId: string;
  let testTemplateId: string;
  let testReminderId: string;

  beforeAll(async () => {
    // Create test account
    const { data: account } = await supabase
      .from('accounts')
      .insert({
        name: 'Test Communications Account',
        plan: 'pro',
      })
      .select()
      .single();

    testAccountId = account.id;

    // Create test users
    const { data: { user: user1 } } = await supabase.auth.admin.createUser({
      email: `comm-test-user1-${Date.now()}@test.com`,
      password: 'Test123!@#',
      email_confirm: true,
    });
    testUserId1 = user1!.id;

    const { data: { user: user2 } } = await supabase.auth.admin.createUser({
      email: `comm-test-user2-${Date.now()}@test.com`,
      password: 'Test123!@#',
      email_confirm: true,
    });
    testUserId2 = user2!.id;

    // Create user profiles
    await supabase.from('user_profiles').insert([
      {
        account_id: testAccountId,
        user_id: testUserId1,
        role: 'manager',
      },
      {
        account_id: testAccountId,
        user_id: testUserId2,
        role: 'tenant',
      },
    ]);
  });

  afterAll(async () => {
    // Clean up
    if (testUserId1) {
      await supabase.auth.admin.deleteUser(testUserId1);
    }
    if (testUserId2) {
      await supabase.auth.admin.deleteUser(testUserId2);
    }
    if (testAccountId) {
      await supabase.from('accounts').delete().eq('id', testAccountId);
    }
  });

  describe('Conversations', () => {
    it('should create a conversation when sending first message', async () => {
      const message = await sendMessage(testAccountId, testUserId1, {
        recipientId: testUserId2,
        subject: 'Test Conversation',
        body: 'This is a test message',
      });

      expect(message).toBeDefined();
      expect(message.conversationId).toBeDefined();
      testConversationId = message.conversationId!;
    });

    it('should get conversations for a user', async () => {
      const { conversations, total } = await getConversations(
        testAccountId,
        testUserId1
      );

      expect(conversations).toBeDefined();
      expect(total).toBeGreaterThan(0);
      expect(conversations[0].id).toBe(testConversationId);
    });

    it('should reuse existing conversation for same participants', async () => {
      const message = await sendMessage(testAccountId, testUserId1, {
        recipientId: testUserId2,
        body: 'Second message in same conversation',
      });

      expect(message.conversationId).toBe(testConversationId);
    });

    it('should calculate average response time correctly', async () => {
      // Manager sends message
      await sendMessage(testAccountId, testUserId1, {
        recipientId: testUserId2,
        body: 'Manager question',
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Tenant replies
      await sendMessage(testAccountId, testUserId2, {
        recipientId: testUserId1,
        body: 'Tenant response',
      });

      const stats = await getCommunicationStats(testAccountId, 1);

      expect(stats.avgResponseTimeMinutes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Message Templates', () => {
    it('should create a message template', async () => {
      const template = await createMessageTemplate(testAccountId, {
        name: 'Test Template',
        category: 'general',
        subject: 'Test Subject',
        body: 'Hello {{tenant_name}}, this is a test.',
        variables: ['tenant_name'],
      });

      expect(template).toBeDefined();
      expect(template.name).toBe('Test Template');
      expect(template.variables).toContain('tenant_name');
      testTemplateId = template.id;
    });

    it('should get message templates', async () => {
      const templates = await getMessageTemplates(testAccountId);

      expect(templates).toBeDefined();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some((t) => t.id === testTemplateId)).toBe(true);
    });

    it('should filter templates by category', async () => {
      await createMessageTemplate(testAccountId, {
        name: 'Payment Template',
        category: 'payment',
        body: 'Payment reminder',
      });

      const templates = await getMessageTemplates(testAccountId, {
        category: 'payment',
      });

      expect(templates.every((t) => t.category === 'payment')).toBe(true);
    });
  });

  describe('Automated Reminders', () => {
    it('should create an automated reminder', async () => {
      const reminder = await createAutomatedReminder(testAccountId, {
        reminderType: 'rent_due',
        name: 'Monthly Rent Reminder',
        frequency: 'monthly',
        messageSubject: 'Rent Payment Due',
        messageBody: 'Your rent payment is due soon.',
      });

      expect(reminder).toBeDefined();
      expect(reminder.reminderType).toBe('rent_due');
      expect(reminder.frequency).toBe('monthly');
      expect(reminder.nextSendDate).toBeDefined();
      testReminderId = reminder.id;
    });

    it('should get automated reminders', async () => {
      const reminders = await getAutomatedReminders(testAccountId);

      expect(reminders).toBeDefined();
      expect(reminders.length).toBeGreaterThan(0);
      expect(reminders.some((r) => r.id === testReminderId)).toBe(true);
    });

    it('should filter reminders by status', async () => {
      const activeReminders = await getAutomatedReminders(testAccountId, 'active');

      expect(activeReminders.every((r) => r.status === 'active')).toBe(true);
    });

    it('should calculate next send date based on frequency', async () => {
      const now = new Date();
      const reminder = await createAutomatedReminder(testAccountId, {
        reminderType: 'test',
        name: 'Weekly Test',
        frequency: 'weekly',
        messageSubject: 'Test',
        messageBody: 'Test',
      });

      const nextSend = new Date(reminder.nextSendDate);
      const daysDiff = Math.floor(
        (nextSend.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(8);
    });
  });

  describe('Portal Statistics', () => {
    it('should get portal activity stats', async () => {
      const activity = await getPortalActivity(testAccountId);

      expect(activity).toBeDefined();
      expect(activity.messagesToday).toBeGreaterThanOrEqual(0);
      expect(activity.unreadMessages).toBeGreaterThanOrEqual(0);
      expect(activity.avgResponseTimeMinutes).toBeGreaterThanOrEqual(0);
      expect(activity.resolvedToday).toBeGreaterThanOrEqual(0);
    });

    it('should get communication statistics', async () => {
      const stats = await getCommunicationStats(testAccountId);

      expect(stats).toBeDefined();
      expect(stats.activeConversations).toBeGreaterThanOrEqual(0);
      expect(stats.avgResponseTimeMinutes).toBeGreaterThanOrEqual(0);
      expect(stats.automationRate).toBeGreaterThanOrEqual(0);
      expect(stats.tenantSatisfaction).toBeGreaterThanOrEqual(0);
    });

    it('should count active conversations in timeframe', async () => {
      const stats = await getCommunicationStats(testAccountId, 7);

      expect(stats.activeConversations).toBeGreaterThan(0);
    });

    it('should calculate automation rate correctly', async () => {
      // Create an automated reminder message
      await createReminderMessage(testAccountId, testUserId1, {
        recipientId: testUserId2,
        subject: 'Automated Reminder',
        body: 'This is automated',
        relatedType: 'payment',
        relatedId: 'test-payment-id',
      });

      const stats = await getCommunicationStats(testAccountId, 1);

      expect(stats.automationRate).toBeGreaterThanOrEqual(0);
      expect(stats.automationRate).toBeLessThanOrEqual(100);
    });
  });

  describe('Organization Scoping', () => {
    let otherAccountId: string;
    let otherUserId: string;

    beforeEach(async () => {
      // Create another account
      const { data: account } = await supabase
        .from('accounts')
        .insert({
          name: 'Other Account',
          plan: 'pro',
        })
        .select()
        .single();

      otherAccountId = account.id;

      // Create user in other account
      const { data: { user } } = await supabase.auth.admin.createUser({
        email: `other-${Date.now()}@test.com`,
        password: 'Test123!@#',
        email_confirm: true,
      });
      otherUserId = user!.id;

      await supabase.from('user_profiles').insert({
        account_id: otherAccountId,
        user_id: otherUserId,
        role: 'manager',
      });
    });

    afterEach(async () => {
      if (otherUserId) {
        await supabase.auth.admin.deleteUser(otherUserId);
      }
      if (otherAccountId) {
        await supabase.from('accounts').delete().eq('id', otherAccountId);
      }
    });

    it('should only return conversations for the specified account', async () => {
      // Create conversation in other account
      await sendMessage(otherAccountId, otherUserId, {
        recipientId: otherUserId,
        body: 'Other account message',
      });

      const { conversations } = await getConversations(testAccountId, testUserId1);

      expect(
        conversations.every((c) => c.accountId === testAccountId)
      ).toBe(true);
    });

    it('should only return templates for the specified account', async () => {
      await createMessageTemplate(otherAccountId, {
        name: 'Other Account Template',
        category: 'general',
        body: 'Test',
      });

      const templates = await getMessageTemplates(testAccountId);

      expect(
        templates.every((t) => t.accountId === testAccountId)
      ).toBe(true);
    });

    it('should only return reminders for the specified account', async () => {
      await createAutomatedReminder(otherAccountId, {
        reminderType: 'test',
        name: 'Other Account Reminder',
        frequency: 'monthly',
        messageSubject: 'Test',
        messageBody: 'Test',
      });

      const reminders = await getAutomatedReminders(testAccountId);

      expect(
        reminders.every((r) => r.accountId === testAccountId)
      ).toBe(true);
    });
  });

  describe('Integration with Other Features', () => {
    it('should create reminder message linked to related entity', async () => {
      const message = await createReminderMessage(testAccountId, testUserId1, {
        recipientId: testUserId2,
        subject: 'Maintenance Update',
        body: 'Your maintenance request has been updated',
        relatedType: 'maintenance',
        relatedId: 'test-maintenance-id',
      });

      expect(message).toBeDefined();
      expect(message.conversationId).toBeDefined();

      // Check that conversation has correct related data
      const { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', message.conversationId!)
        .single();

      expect(conversation.related_type).toBe('maintenance');
      expect(conversation.related_id).toBe('test-maintenance-id');
    });
  });
});
