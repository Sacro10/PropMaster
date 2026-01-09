/**
 * Communications API Routes
 * Handles conversations, messages, templates, and reminders
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import {
  getConversations,
  getConversation,
  getConversationMessages,
  sendMessage,
  markMessageAsRead,
  updateConversationStatus,
  getMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  getAutomatedReminders,
  createAutomatedReminder,
  updateAutomatedReminder,
  deleteAutomatedReminder,
  getCommunicationStats,
  getPortalActivity,
  createReminderMessage,
} from '../services/communicationsService';

const router = Router();

// =========================================
// CONVERSATIONS
// =========================================

/**
 * GET /api/communications/conversations
 * List conversations
 */
router.get(
  '/conversations',
  authenticate,
  Permissions.readMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId || !req.user?.id) {
        res.status(400).json({ error: 'Account ID and User ID required' });
        return;
      }

      const filters = {
        status: req.query.status as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const result = await getConversations(req.user.accountId, req.user.id, filters);
      res.json(result);
    } catch (error) {
      console.error('Get conversations error:', error);
      res.status(500).json({
        error: 'Failed to fetch conversations',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/communications/conversations/:id
 * Get a specific conversation
 */
router.get(
  '/conversations/:id',
  authenticate,
  Permissions.readMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const conversation = await getConversation(req.user.accountId, req.params.id);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.json(conversation);
    } catch (error) {
      console.error('Get conversation error:', error);
      res.status(500).json({
        error: 'Failed to fetch conversation',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PUT /api/communications/conversations/:id/status
 * Update conversation status
 */
router.put(
  '/conversations/:id/status',
  authenticate,
  Permissions.updateMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const { status } = req.body;
      if (!['active', 'resolved', 'archived'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      await updateConversationStatus(req.user.accountId, req.params.id, status);
      res.json({ success: true });
    } catch (error) {
      console.error('Update conversation status error:', error);
      res.status(500).json({
        error: 'Failed to update conversation status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// =========================================
// MESSAGES
// =========================================

/**
 * GET /api/communications/conversations/:id/messages
 * Get messages in a conversation
 */
router.get(
  '/conversations/:id/messages',
  authenticate,
  Permissions.readMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const messages = await getConversationMessages(
        req.user.accountId,
        req.params.id,
        limit
      );

      res.json(messages);
    } catch (error) {
      console.error('Get conversation messages error:', error);
      res.status(500).json({
        error: 'Failed to fetch messages',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/communications/messages
 * Send a message
 */
router.post(
  '/messages',
  authenticate,
  Permissions.createMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId || !req.user?.id) {
        res.status(400).json({ error: 'Account ID and User ID required' });
        return;
      }

      const { recipientId, subject, body, conversationId, propertyId, unitId } =
        req.body;

      if (!recipientId || !body) {
        res.status(400).json({ error: 'Recipient ID and body are required' });
        return;
      }

      const message = await sendMessage(req.user.accountId, req.user.id, {
        recipientId,
        subject,
        body,
        conversationId,
        propertyId,
        unitId,
      });

      res.json(message);
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({
        error: 'Failed to send message',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PUT /api/communications/messages/:id/read
 * Mark a message as read
 */
router.put(
  '/messages/:id/read',
  authenticate,
  Permissions.updateMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      await markMessageAsRead(req.user.accountId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Mark message as read error:', error);
      res.status(500).json({
        error: 'Failed to mark message as read',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/communications/send-reminder
 * Send a reminder message from other features (Rent/Showings/Maintenance)
 */
router.post(
  '/send-reminder',
  authenticate,
  Permissions.createMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId || !req.user?.id) {
        res.status(400).json({ error: 'Account ID and User ID required' });
        return;
      }

      const { recipientId, subject, body, relatedType, relatedId, propertyId, unitId } =
        req.body;

      if (!recipientId || !subject || !body || !relatedType || !relatedId) {
        res.status(400).json({
          error: 'Recipient, subject, body, relatedType, and relatedId are required',
        });
        return;
      }

      const message = await createReminderMessage(req.user.accountId, req.user.id, {
        recipientId,
        subject,
        body,
        relatedType,
        relatedId,
        propertyId,
        unitId,
      });

      res.json(message);
    } catch (error) {
      console.error('Send reminder error:', error);
      res.status(500).json({
        error: 'Failed to send reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// =========================================
// TEMPLATES
// =========================================

/**
 * GET /api/communications/templates
 * List message templates
 */
router.get(
  '/templates',
  authenticate,
  Permissions.readMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const filters = {
        category: req.query.category as string,
        isActive: req.query.isActive === 'true',
      };

      const templates = await getMessageTemplates(req.user.accountId, filters);
      res.json(templates);
    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        error: 'Failed to fetch templates',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/communications/templates
 * Create a message template
 */
router.post(
  '/templates',
  authenticate,
  Permissions.createMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const { name, category, subject, body, variables } = req.body;

      if (!name || !category || !body) {
        res.status(400).json({ error: 'Name, category, and body are required' });
        return;
      }

      const template = await createMessageTemplate(req.user.accountId, {
        name,
        category,
        subject,
        body,
        variables,
      });

      res.json(template);
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({
        error: 'Failed to create template',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PUT /api/communications/templates/:id
 * Update a message template
 */
router.put(
  '/templates/:id',
  authenticate,
  Permissions.updateMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const { name, category, subject, body, variables, isActive } = req.body;

      const template = await updateMessageTemplate(
        req.user.accountId,
        req.params.id,
        {
          name,
          category,
          subject,
          body,
          variables,
          isActive,
        }
      );

      res.json(template);
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({
        error: 'Failed to update template',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * DELETE /api/communications/templates/:id
 * Delete a message template
 */
router.delete(
  '/templates/:id',
  authenticate,
  Permissions.deleteMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      await deleteMessageTemplate(req.user.accountId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({
        error: 'Failed to delete template',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// =========================================
// AUTOMATED REMINDERS
// =========================================

/**
 * GET /api/communications/reminders
 * List automated reminders
 */
router.get('/reminders', authenticate, Permissions.readMessages, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const status = req.query.status as 'active' | 'paused' | 'inactive' | undefined;
    const reminders = await getAutomatedReminders(req.user.accountId, status);
    res.json(reminders);
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({
      error: 'Failed to fetch reminders',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/communications/reminders
 * Create an automated reminder
 */
router.post(
  '/reminders',
  authenticate,
  Permissions.createMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const {
        reminderType,
        name,
        frequency,
        customSchedule,
        templateId,
        messageSubject,
        messageBody,
        recipientFilter,
      } = req.body;

      if (!reminderType || !name || !frequency || !messageSubject || !messageBody) {
        res.status(400).json({
          error: 'Reminder type, name, frequency, subject, and body are required',
        });
        return;
      }

      const reminder = await createAutomatedReminder(req.user.accountId, {
        reminderType,
        name,
        frequency,
        customSchedule,
        templateId,
        messageSubject,
        messageBody,
        recipientFilter,
      });

      res.json(reminder);
    } catch (error) {
      console.error('Create reminder error:', error);
      res.status(500).json({
        error: 'Failed to create reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PUT /api/communications/reminders/:id
 * Update an automated reminder
 */
router.put(
  '/reminders/:id',
  authenticate,
  Permissions.updateMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const reminder = await updateAutomatedReminder(
        req.user.accountId,
        req.params.id,
        req.body
      );

      res.json(reminder);
    } catch (error) {
      console.error('Update reminder error:', error);
      res.status(500).json({
        error: 'Failed to update reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * DELETE /api/communications/reminders/:id
 * Delete an automated reminder
 */
router.delete(
  '/reminders/:id',
  authenticate,
  Permissions.deleteMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      await deleteAutomatedReminder(req.user.accountId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete reminder error:', error);
      res.status(500).json({
        error: 'Failed to delete reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// =========================================
// STATISTICS
// =========================================

/**
 * GET /api/communications/stats
 * Get communication statistics
 */
router.get('/stats', authenticate, Permissions.readMessages, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const timeframeDays = req.query.days ? parseInt(req.query.days as string) : 30;
    const stats = await getCommunicationStats(req.user.accountId, timeframeDays);
    res.json(stats);
  } catch (error) {
    console.error('Get communication stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/communications/activity
 * Get portal activity
 */
router.get('/activity', authenticate, Permissions.readMessages, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const activity = await getPortalActivity(req.user.accountId);
    res.json(activity);
  } catch (error) {
    console.error('Get portal activity error:', error);
    res.status(500).json({
      error: 'Failed to fetch activity',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    }
  }
);

export default router;
