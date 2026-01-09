import { supabase } from '../supabase';
import { logActivityEvent } from './activityService';

export interface Showing {
  id: string;
  unitId: string;
  propertyId: string;
  scheduledDate: string;
  duration: number;
  status: string;
  agentName: string | null;
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  accessCode: string | null;
  notes: string | null;
  createdAt: string;
  unit?: {
    unitNumber: string;
    rentAmount: number;
  };
  property?: {
    name: string;
    address: string;
  };
  outcome?: ShowingOutcome;
}

export interface ShowingOutcome {
  id: string;
  showingId: string;
  outcome: string;
  feedbackRating: number | null;
  feedbackText: string | null;
  nextSteps: string | null;
  followUpDate: string | null;
  createdAt: string;
}

export interface CreateShowingData {
  unitId: string;
  scheduledDate: string;
  duration: number;
  agentName?: string;
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  notes?: string;
}

/**
 * Get all showings
 */
export async function getShowings(
  accountId: string,
  filters?: {
    status?: string;
    unitId?: string;
    propertyId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ showings: Showing[]; total: number }> {
  const {
    status,
    unitId,
    propertyId,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = filters || {};

  let query = supabase
    .from('showings')
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address),
      showing_outcomes(*)
    `,
      { count: 'exact' }
    )
    .eq('account_id', accountId);

  if (status) query = query.eq('status', status);
  if (unitId) query = query.eq('unit_id', unitId);
  if (propertyId) query = query.eq('property_id', propertyId);
  if (startDate) query = query.gte('scheduled_date', startDate);
  if (endDate) query = query.lte('scheduled_date', endDate);

  query = query.order('scheduled_date', { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const showings: Showing[] =
    data?.map((s: any) => ({
      id: s.id,
      unitId: s.unit_id,
      propertyId: s.property_id,
      scheduledDate: s.scheduled_date,
      duration: s.duration,
      status: s.status,
      agentName: s.agent_name,
      prospectName: s.prospect_name,
      prospectEmail: s.prospect_email,
      prospectPhone: s.prospect_phone,
      accessCode: s.access_code,
      notes: s.notes,
      createdAt: s.created_at,
      unit: s.unit
        ? {
            unitNumber: s.unit.unit_number,
            rentAmount: Number(s.unit.rent_amount),
          }
        : undefined,
      property: s.property
        ? { name: s.property.name, address: s.property.address }
        : undefined,
      outcome:
        s.showing_outcomes && s.showing_outcomes.length > 0
          ? {
              id: s.showing_outcomes[0].id,
              showingId: s.showing_outcomes[0].showing_id,
              outcome: s.showing_outcomes[0].outcome,
              feedbackRating: s.showing_outcomes[0].feedback_rating,
              feedbackText: s.showing_outcomes[0].feedback_text,
              nextSteps: s.showing_outcomes[0].next_steps,
              followUpDate: s.showing_outcomes[0].follow_up_date,
              createdAt: s.showing_outcomes[0].created_at,
            }
          : undefined,
    })) || [];

  return { showings, total: count || 0 };
}

/**
 * Create a new showing
 */
export async function createShowing(
  accountId: string,
  userId: string,
  data: CreateShowingData
): Promise<Showing> {
  // Verify unit belongs to account
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('property_id')
    .eq('id', data.unitId)
    .single();

  if (unitError || !unit) {
    throw new Error('Unit not found');
  }

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('id')
    .eq('id', unit.property_id)
    .eq('account_id', accountId)
    .single();

  if (propertyError || !property) {
    throw new Error('Unit does not belong to your account');
  }

  // Generate random access code
  const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data: showing, error } = await supabase
    .from('showings')
    .insert({
      account_id: accountId,
      unit_id: data.unitId,
      property_id: unit.property_id,
      scheduled_date: data.scheduledDate,
      duration: data.duration,
      status: 'scheduled',
      agent_name: data.agentName,
      prospect_name: data.prospectName,
      prospect_email: data.prospectEmail,
      prospect_phone: data.prospectPhone,
      access_code: accessCode,
      notes: data.notes,
    })
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address)
    `
    )
    .single();

  if (error) throw error;

  await logActivityEvent(
    accountId,
    userId,
    'showing_scheduled',
    `Showing scheduled for ${data.prospectName}`,
    {
      entityType: 'showing',
      entityId: showing.id,
    }
  );

  return {
    id: showing.id,
    unitId: showing.unit_id,
    propertyId: showing.property_id,
    scheduledDate: showing.scheduled_date,
    duration: showing.duration,
    status: showing.status,
    agentName: showing.agent_name,
    prospectName: showing.prospect_name,
    prospectEmail: showing.prospect_email,
    prospectPhone: showing.prospect_phone,
    accessCode: showing.access_code,
    notes: showing.notes,
    createdAt: showing.created_at,
    unit: showing.unit
      ? {
          unitNumber: showing.unit.unit_number,
          rentAmount: Number(showing.unit.rent_amount),
        }
      : undefined,
    property: showing.property
      ? { name: showing.property.name, address: showing.property.address }
      : undefined,
  };
}

/**
 * Update showing status
 */
export async function updateShowingStatus(
  accountId: string,
  userId: string,
  showingId: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from('showings')
    .update({ status })
    .eq('id', showingId)
    .eq('account_id', accountId);

  if (error) throw error;

  await logActivityEvent(
    accountId,
    userId,
    status === 'completed' ? 'showing_completed' : 'showing_cancelled',
    `Showing ${status}`,
    {
      entityType: 'showing',
      entityId: showingId,
    }
  );
}

/**
 * Record showing outcome
 */
export async function recordShowingOutcome(
  accountId: string,
  userId: string,
  showingId: string,
  outcome: {
    outcome: string;
    feedbackRating?: number;
    feedbackText?: string;
    nextSteps?: string;
    followUpDate?: string;
  }
): Promise<ShowingOutcome> {
  // Verify showing belongs to account
  const { data: showing } = await supabase
    .from('showings')
    .select('id')
    .eq('id', showingId)
    .eq('account_id', accountId)
    .single();

  if (!showing) {
    throw new Error('Showing not found');
  }

  const { data, error } = await supabase
    .from('showing_outcomes')
    .insert({
      account_id: accountId,
      showing_id: showingId,
      outcome: outcome.outcome,
      feedback_rating: outcome.feedbackRating,
      feedback_text: outcome.feedbackText,
      next_steps: outcome.nextSteps,
      follow_up_date: outcome.followUpDate,
    })
    .select()
    .single();

  if (error) throw error;

  await logActivityEvent(accountId, userId, 'showing_outcome_recorded', `Showing outcome recorded: ${outcome.outcome}`, {
    entityType: 'showing',
    entityId: showingId,
    metadata: { outcome: outcome.outcome },
  });

  return {
    id: data.id,
    showingId: data.showing_id,
    outcome: data.outcome,
    feedbackRating: data.feedback_rating,
    feedbackText: data.feedback_text,
    nextSteps: data.next_steps,
    followUpDate: data.follow_up_date,
    createdAt: data.created_at,
  };
}
