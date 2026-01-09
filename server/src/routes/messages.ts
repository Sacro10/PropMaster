import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import {
  getConversations,
  getConversationMessages,
  sendMessage,
  markMessageAsRead,
  getMessageTemplates,
  createMessageTemplate,
  getReminderSchedules,
  createReminderSchedule,
} from '../services/messagesService';

const router = Router();

/**
 * GET /api/messages/conversations
 * List conversations
 */
router.get(
  '/conversations',
  authenticate,
  Permissions.readMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
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
 * GET /api/messages/conversations/:id
 * Get messages in a conversation
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

      const messages = await getConversationMessages(req.user.accountId, req.params.id);
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
 * POST /api/messages/send
 * Send a message
 */
router.post(
  '/send',
  authenticate,
  Permissions.createMessages,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const data = {
        recipientId: req.body.recipientId,
        subject: req.body.subject,
        body: req.body.body,
        conversationId: req.body.conversationId,
        propertyId: req.body.propertyId,
        unitId: req.body.unitId,
      };

      if (!data.recipientId || !data.body) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['recipientId', 'body'],
        });
        return;
      }

      const message = await sendMessage(req.user.accountId, req.user.id, data);
      res.status(201).json(message);
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
 * PATCH /api/messages/:id/read
 * Mark message as read
 */
router.patch('/:id/read', authenticate, Permissions.readMessages, async (req: AuthRequest, res) => {
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
});

/**
 * GET /api/messages/templates
 * Get message templates
 */
router.get('/templates', authenticate, Permissions.readMessages, async (req: AuthRequest, res) => {
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
});

/**
 * POST /api/messages/templates
 * Create message template
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

      const data = {
        name: req.body.name,
        category: req.body.category,
        subject: req.body.subject,
        body: req.body.body,
        variables: req.body.variables,
      };

      if (!data.name || !data.category || !data.body) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['name', 'category', 'body'],
        });
        return;
      }

      const template = await createMessageTemplate(req.user.accountId, data);
      res.status(201).json(template);
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
 * GET /api/messages/reminders
 * Get reminder schedules
 */
router.get('/reminders', authenticate, Permissions.readMessages, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const isActive = req.query.isActive === 'true';
    const reminders = await getReminderSchedules(req.user.accountId, isActive);
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
 * POST /api/messages/reminders
 * Create reminder schedule
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

      const data = {
        name: req.body.name,
        reminderType: req.body.reminderType,
        templateId: req.body.templateId,
        frequency: req.body.frequency,
        customCron: req.body.customCron,
        recipientFilter: req.body.recipientFilter,
      };

      if (!data.name || !data.reminderType || !data.frequency) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['name', 'reminderType', 'frequency'],
        });
        return;
      }

      const reminder = await createReminderSchedule(req.user.accountId, data);
      res.status(201).json(reminder);
    } catch (error) {
      console.error('Create reminder error:', error);
      res.status(500).json({
        error: 'Failed to create reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
