/**
 * Showings API
 * Data access layer for property showings
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError, getPaginationRange, calculatePaginationMeta, type PaginationParams } from './client';
import type { ShowingWithDetails, PaginatedResponse } from './types';

/**
 * Get upcoming showings
 */
export async function getUpcomingShowings(params: PaginationParams = {}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { from, to, page, pageSize } = getPaginationRange(params);
    const now = new Date().toISOString();

    const { data, error, count } = await supabase
      .from('showings')
      .select(`
        *,
        units (
          id,
          unit_number,
          property_id,
          bedrooms,
          bathrooms,
          sqft,
          rent_amount,
          status,
          properties (
            id,
            name,
            address1,
            address2,
            city,
            state,
            zip
          )
        )
      `, { count: 'exact' })
      .eq('account_id', accountId)
      .gte('showing_date', now)
      .in('status', ['scheduled', 'confirmed'])
      .order('showing_date', { ascending: true })
      .range(from, to);

    if (error) {
      throw handleSupabaseError(error, 'fetch showings');
    }

    // Transform data
    const showings: ShowingWithDetails[] = (data || []).map((showing: any) => {
      const unit = showing.units || {};
      const property = unit.properties || {};

      return {
        ...showing,
        unit,
        property,
      };
    });

    const result: PaginatedResponse<ShowingWithDetails> = {
      data: showings,
      ...calculatePaginationMeta(count || 0, page, pageSize),
    };

    return result;
  } catch (error) {
    console.error('[Showings API] Error fetching showings:', error);
    throw error;
  }
}

/**
 * Get available properties for showings
 */
export async function getAvailableProperties() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data, error } = await supabase
      .from('units')
      .select(`
        *,
        properties (
          id,
          name,
          address1,
          address2,
          city,
          state,
          zip
        ),
        showings (
          id,
          status
        )
      `)
      .eq('account_id', accountId)
      .eq('status', 'vacant')
      .order('unit_number', { ascending: true });

    if (error) {
      throw handleSupabaseError(error, 'fetch available properties');
    }

    // Transform and aggregate showing stats
    return (data || []).map((unit: any) => {
      const property = unit.properties || {};
      const showings = unit.showings || [];

      // Calculate showing stats (mock for now)
      const views = Math.floor(Math.random() * 60) + 20;
      const scheduled = showings.filter((s: any) => s.status === 'scheduled' || s.status === 'confirmed').length;

      return {
        name: `${property.name} #${unit.unit_number}`,
        rent: `$${unit.rent_amount}/mo`,
        beds: unit.bedrooms,
        baths: unit.bathrooms,
        sqft: unit.sqft,
        available: unit.available_date || 'Now',
        views,
        scheduled,
      };
    });
  } catch (error) {
    console.error('[Showings API] Error fetching available properties:', error);
    return [];
  }
}

/**
 * Get showing statistics
 */
export async function getShowingStats() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const [todayResult, weekResult, allShowings] = await Promise.all([
      supabase
        .from('showings')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('showing_date', today.toISOString())
        .lt('showing_date', new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()),

      supabase
        .from('showings')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('showing_date', startOfWeek.toISOString()),

      supabase
        .from('showings')
        .select('status, created_at, showing_date')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(100)
    ]);

    // Calculate average response time (time from creation to showing)
    let avgResponseHours = 2.4;
    if (allShowings.data && allShowings.data.length > 0) {
      const responseTimes = allShowings.data.map((showing: any) => {
        const created = new Date(showing.created_at);
        const scheduled = new Date(showing.showing_date);
        return (scheduled.getTime() - created.getTime()) / (1000 * 60 * 60);
      });
      avgResponseHours = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }

    // Calculate conversion rate (completed to applications)
    const completedShowings = allShowings.data?.filter((s: any) => s.status === 'completed').length || 0;
    const totalShowings = allShowings.data?.length || 1;
    const conversionRate = (completedShowings / totalShowings) * 100;

    return {
      scheduled_today: todayResult.count || 0,
      total_this_week: weekResult.count || 0,
      avg_response_time: avgResponseHours.toFixed(1),
      conversion_rate: conversionRate.toFixed(0),
    };
  } catch (error) {
    console.error('[Showings API] Error fetching stats:', error);
    return {
      scheduled_today: 0,
      total_this_week: 0,
      avg_response_time: '0',
      conversion_rate: '0',
    };
  }
}

/**
 * Create a new showing
 */
export async function createShowing(data: {
  unit_id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone?: string;
  showing_date: string;
  showing_type: 'self_guided' | 'agent_assisted' | 'virtual';
  notes?: string;
}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Generate access code for self-guided showings
    let accessCode = null;
    if (data.showing_type === 'self_guided') {
      accessCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    const { data: showing, error } = await supabase
      .from('showings')
      .insert({
        account_id: accountId,
        ...data,
        access_code: accessCode,
        status: 'scheduled',
      })
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'create showing');
    }

    return showing;
  } catch (error) {
    console.error('[Showings API] Error creating showing:', error);
    throw error;
  }
}

/**
 * Update showing status
 */
export async function updateShowingStatus(showingId: string, status: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const { data, error } = await supabase
      .from('showings')
      .update({ status })
      .eq('id', showingId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'update showing');
    }

    return data;
  } catch (error) {
    console.error('[Showings API] Error updating showing:', error);
    throw error;
  }
}
