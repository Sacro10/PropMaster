/**
 * Unit tests for Activity Service
 * Verifies filtering and querying of activity events
 */

import { getActivityEvents, getActivityStats } from '../../src/services/activityService';

// Mock Supabase client
jest.mock('../../src/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin as supabase } from '../../src/supabase';

describe('Activity Service - Event Filtering', () => {
  const mockAccountId = 'test-account-123';
  const mockSupabase = supabase as jest.Mocked<typeof supabase>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActivityEvents', () => {
    it('should filter by event type', async () => {
      const mockEvents = [
        {
          id: '1',
          account_id: mockAccountId,
          event_type: 'payment_received',
          summary: 'Payment received',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          account_id: mockAccountId,
          event_type: 'maintenance_created',
          summary: 'Maintenance request created',
          created_at: new Date().toISOString(),
        },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockEvents.filter(e => e.event_type === 'payment_received'),
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      const result = await getActivityEvents(mockAccountId, {
        eventType: 'payment_received',
        limit: 50,
        offset: 0,
      });

      expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
      expect(mockChain.eq).toHaveBeenCalledWith('event_type', 'payment_received');
      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe('payment_received');
    });

    it('should filter by date range', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      await getActivityEvents(mockAccountId, {
        startDate,
        endDate,
        limit: 50,
        offset: 0,
      });

      expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
      expect(mockChain.gte).toHaveBeenCalledWith('created_at', startDate);
      expect(mockChain.lte).toHaveBeenCalledWith('created_at', endDate);
    });

    it('should apply pagination correctly', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      await getActivityEvents(mockAccountId, {
        limit: 20,
        offset: 40,
      });

      expect(mockChain.range).toHaveBeenCalledWith(40, 59); // offset to offset + limit - 1
    });

    it('should filter by entity type', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      await getActivityEvents(mockAccountId, {
        entityType: 'maintenance_request',
        limit: 50,
        offset: 0,
      });

      expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
      expect(mockChain.eq).toHaveBeenCalledWith('entity_type', 'maintenance_request');
    });

    it('should filter by user ID', async () => {
      const userId = 'user-123';

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      await getActivityEvents(mockAccountId, {
        userId,
        limit: 50,
        offset: 0,
      });

      expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
      expect(mockChain.eq).toHaveBeenCalledWith('user_id', userId);
    });

    it('should always scope to account_id', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      await getActivityEvents(mockAccountId, {
        limit: 10,
        offset: 0,
      });

      // Verify account_id scoping
      expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
    });

    it('should order results by created_at descending', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      await getActivityEvents(mockAccountId, {
        limit: 50,
        offset: 0,
      });

      expect(mockChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('getActivityStats', () => {
    it('should calculate event type distribution', async () => {
      const mockEvents = [
        { event_type: 'payment_received' },
        { event_type: 'payment_received' },
        { event_type: 'maintenance_created' },
        { event_type: 'tenant_added' },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({
          data: mockEvents,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      const result = await getActivityStats(mockAccountId);

      expect(result.eventsByType).toBeDefined();
      expect(result.eventsByType['payment_received']).toBe(2);
      expect(result.eventsByType['maintenance_created']).toBe(1);
      expect(result.eventsByType['tenant_added']).toBe(1);
    });

    it('should respect date range filters', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      await getActivityStats(mockAccountId, startDate, endDate);

      expect(mockChain.gte).toHaveBeenCalledWith('created_at', startDate);
      expect(mockChain.lte).toHaveBeenCalledWith('created_at', endDate);
    });

    it('should calculate total event count', async () => {
      const mockEvents = [
        { id: '1', event_type: 'payment_received' },
        { id: '2', event_type: 'maintenance_created' },
        { id: '3', event_type: 'tenant_added' },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({
          data: mockEvents,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      const result = await getActivityStats(mockAccountId);

      expect(result.totalEvents).toBe(3);
    });

    it('should scope stats to account_id', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain as any);

      await getActivityStats(mockAccountId);

      expect(mockChain.eq).toHaveBeenCalledWith('account_id', mockAccountId);
    });
  });
});
