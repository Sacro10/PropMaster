import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';
import { sendGmailMessage } from './gmailService';

function formatPropertyAddress(property: any) {
  if (!property) return '';
  const parts = [property.address1, property.address2].filter(Boolean);
  const cityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(' ');
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(', ');
}

function isMissingTable(error: any, tableName?: string) {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : '';
  if (error.code === '42P01') return true;
  if (!tableName) return message.includes('does not exist');
  return message.includes(`"${tableName}"`) && message.includes('does not exist');
}

export interface Showing {
  id: string;
  unitId: string;
  propertyId: string;
  showingDate: string;
  scheduledDate?: string; // Legacy field
  duration: number;
  status: string;
  showingType: 'self_guided' | 'agent_assisted' | 'virtual';
  agentName: string | null;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string | null;
  prospectName?: string; // Legacy field
  prospectEmail?: string; // Legacy field
  prospectPhone?: string; // Legacy field
  accessCode: string | null;
  accessCodeExpiresAt: string | null;
  reminderSentAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
  showingDate: string;
  duration?: number;
  showingType: 'self_guided' | 'agent_assisted' | 'virtual';
  visitorName: string;
  visitorEmail: string;
  visitorPhone?: string;
  agentName?: string;
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

  const applyFilters = (query: any) => {
    if (status) {
      const statusList = status
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (statusList.length > 1) {
        query = query.in('status', statusList);
      } else if (statusList.length === 1) {
        query = query.eq('status', statusList[0]);
      }
    }
    if (unitId) query = query.eq('unit_id', unitId);
    if (propertyId) query = query.eq('property_id', propertyId);
    if (startDate) query = query.gte('scheduled_at', startDate);
    if (endDate) query = query.lte('scheduled_at', endDate);

    query = query.order('scheduled_at', { ascending: true });
    query = query.range(offset, offset + limit - 1);
    return query;
  };

  let query = applyFilters(
    supabase
      .from('showings')
      .select(
      `
        *,
        unit:units!inner(unit_number, rent_amount),
        property:properties!inner(name, address1, address2, city, state, zip),
        showing_outcomes(*)
      `,
        { count: 'exact' }
      )
      .eq('account_id', accountId)
  );

  let { data, error, count } = await query;

  if (error && isMissingTable(error, 'showing_outcomes')) {
    const fallbackQuery = applyFilters(
      supabase
        .from('showings')
        .select(
          `
          *,
          unit:units!inner(unit_number, rent_amount),
          property:properties!inner(name, address1, address2, city, state, zip)
        `,
          { count: 'exact' }
        )
        .eq('account_id', accountId)
    );
    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (error) throw error;

  const showings: Showing[] =
    data?.map((s: any) => ({
      id: s.id,
      unitId: s.unit_id,
      propertyId: s.property_id,
      showingDate: s.showing_date || s.scheduled_at,
      scheduledDate: s.scheduled_at, // Legacy
      duration: s.duration_minutes || s.duration || 30,
      status: s.status,
      showingType: s.showing_type || 'agent_assisted',
      agentName: s.agent_name,
      visitorName: s.visitor_name || s.applicant_name || s.prospect_name,
      visitorEmail: s.visitor_email || s.applicant_email || s.prospect_email,
      visitorPhone: s.visitor_phone || s.applicant_phone || s.prospect_phone,
      prospectName: s.prospect_name, // Legacy
      prospectEmail: s.prospect_email, // Legacy
      prospectPhone: s.prospect_phone, // Legacy
      accessCode: s.access_code,
      accessCodeExpiresAt: s.access_code_expires_at,
      reminderSentAt: s.reminder_sent_at,
      notes: s.notes,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      unit: s.unit
        ? {
            unitNumber: s.unit.unit_number,
            rentAmount: Number(s.unit.rent_amount),
          }
        : undefined,
      property: s.property
        ? { name: s.property.name, address: formatPropertyAddress(s.property) }
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

  // Generate access code for self-guided showings
  let accessCode = null;
  if (data.showingType === 'self_guided') {
    // Call database function to generate unique code
    const { data: codeData, error: codeError } = await supabase.rpc('generate_showing_access_code');
    if (codeError) {
      console.error('Error generating access code:', codeError);
      // Fallback to simple generation
      accessCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    } else {
      accessCode = codeData;
    }
  }

  const { data: showing, error } = await supabase
    .from('showings')
    .insert({
      account_id: accountId,
      unit_id: data.unitId,
      property_id: unit.property_id,
      showing_date: data.showingDate,
      scheduled_at: data.showingDate, // Keep legacy field in sync
      duration_minutes: data.duration || 30,
      duration: data.duration || 30, // Keep legacy field in sync
      showing_type: data.showingType,
      status: 'scheduled',
      agent_name: data.agentName,
      visitor_name: data.visitorName,
      visitor_email: data.visitorEmail,
      visitor_phone: data.visitorPhone,
      // Also populate legacy fields for backwards compatibility
      applicant_name: data.visitorName,
      applicant_email: data.visitorEmail,
      applicant_phone: data.visitorPhone,
      prospect_name: data.visitorName,
      prospect_email: data.visitorEmail,
      prospect_phone: data.visitorPhone,
      access_code: accessCode,
      notes: data.notes,
    })
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address1, address2, city, state, zip)
    `
    )
    .single();

  if (error) throw error;

  await logActivityEvent(
    accountId,
    userId,
    'showing_scheduled',
    `Showing scheduled for ${data.visitorName}`,
    {
      entityType: 'showing',
      entityId: showing.id,
    }
  );

  return {
    id: showing.id,
    unitId: showing.unit_id,
    propertyId: showing.property_id,
    showingDate: showing.showing_date || showing.scheduled_at,
    scheduledDate: showing.scheduled_at,
    duration: showing.duration_minutes || showing.duration,
    status: showing.status,
    showingType: showing.showing_type,
    agentName: showing.agent_name,
    visitorName: showing.visitor_name,
    visitorEmail: showing.visitor_email,
    visitorPhone: showing.visitor_phone,
    accessCode: showing.access_code,
    accessCodeExpiresAt: showing.access_code_expires_at,
    reminderSentAt: showing.reminder_sent_at,
    notes: showing.notes,
    createdAt: showing.created_at,
    updatedAt: showing.updated_at,
    unit: showing.unit
      ? {
          unitNumber: showing.unit.unit_number,
          rentAmount: Number(showing.unit.rent_amount),
        }
      : undefined,
    property: showing.property
      ? { name: showing.property.name, address: formatPropertyAddress(showing.property) }
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

/**
 * Get showing statistics for an account
 */
export async function getShowingStatistics(accountId: string) {
  // Try to use the view first
  const { data: viewData, error: viewError } = await supabase
    .from('showing_stats_by_account')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!viewError && viewData) {
    return {
      scheduled_today: viewData.scheduled_today || 0,
      total_this_week: viewData.total_this_week || 0,
      avg_response_time: viewData.avg_response_time_hours?.toFixed(1) || '0.0',
      conversion_rate: viewData.conversion_rate_percent?.toFixed(0) || '0',
    };
  }

  // Fallback to manual calculation
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const { data: showings, error } = await supabase
    .from('showings')
    .select('id, status, created_at, scheduled_at, application_submitted')
    .eq('account_id', accountId)
    .gte('scheduled_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

  if (error || !showings) {
    return {
      scheduled_today: 0,
      total_this_week: 0,
      avg_response_time: '0.0',
      conversion_rate: '0',
    };
  }

  const scheduledToday = showings.filter((s) => {
    const showingDate = new Date(s.scheduled_at);
    return showingDate >= today && showingDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
  }).length;

  const totalThisWeek = showings.filter((s) => {
    const showingDate = new Date(s.scheduled_at);
    return showingDate >= startOfWeek;
  }).length;

  // Calculate avg response time (creation to showing date in hours)
  const responseTimes = showings.map((s) => {
    const created = new Date(s.created_at);
    const scheduled = new Date(s.scheduled_at);
    return (scheduled.getTime() - created.getTime()) / (1000 * 60 * 60);
  });

  const avgResponseTime =
    responseTimes.length > 0
      ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1)
      : '0.0';

  // Calculate conversion rate (applications / completed showings)
  const completedShowings = showings.filter(s => s.status === 'completed').length;
  const applications = showings.filter(s => s.application_submitted).length;
  const conversionRate =
    completedShowings > 0
      ? ((applications / completedShowings) * 100).toFixed(0)
      : '0';

  return {
    scheduled_today: scheduledToday,
    total_this_week: totalThisWeek,
    avg_response_time: avgResponseTime,
    conversion_rate: conversionRate,
  };
}

/**
 * Regenerate access code for a showing
 */
export async function regenerateAccessCode(
  accountId: string,
  userId: string,
  showingId: string
): Promise<{ accessCode: string; expiresAt: string }> {
  // Verify showing belongs to account
  const { data: showing, error: showingError } = await supabase
    .from('showings')
    .select('id, showing_type, scheduled_at, duration_minutes')
    .eq('id', showingId)
    .eq('account_id', accountId)
    .single();

  if (showingError || !showing) {
    throw new Error('Showing not found');
  }

  if (showing.showing_type !== 'self_guided') {
    throw new Error('Access codes are only available for self-guided showings');
  }

  // Generate new access code
  const { data: codeData, error: codeError } = await supabase.rpc('generate_showing_access_code');
  const accessCode = codeError
    ? Math.random().toString(36).substring(2, 10).toUpperCase()
    : codeData;

  // Calculate expiration (trigger will also do this, but we return it)
  const showingDate = new Date(showing.scheduled_at);
  const durationMinutes = showing.duration_minutes || 30;
  const expiresAt = new Date(showingDate.getTime() + durationMinutes * 60 * 1000);

  // Update showing
  const { error: updateError } = await supabase
    .from('showings')
    .update({
      access_code: accessCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', showingId)
    .eq('account_id', accountId);

  if (updateError) throw updateError;

  await logActivityEvent(
    accountId,
    userId,
    'showing_access_code_regenerated',
    'Access code regenerated',
    {
      entityType: 'showing',
      entityId: showingId,
    }
  );

  return {
    accessCode,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Send showing reminder
 */
export async function sendShowingReminder(
  accountId: string,
  userId: string,
  showingId: string
): Promise<void> {
  // Verify showing belongs to account
  const { data: showing, error: showingError } = await supabase
    .from('showings')
    .select(`
      id,
      visitor_name,
      visitor_email,
      visitor_phone,
      scheduled_at,
      access_code,
      showing_type,
      unit:units!inner(unit_number),
      property:properties!inner(name, address1, address2, city, state, zip)
    `)
    .eq('id', showingId)
    .eq('account_id', accountId)
    .single();

  if (showingError || !showing) {
    throw new Error('Showing not found');
  }

  // TODO: Implement actual email/SMS sending
  // For now, just log the activity and update the reminder timestamp

  const reminderMessage = `Reminder sent to ${showing.visitor_name} (${showing.visitor_email})`;
  const scheduledAt = showing.scheduled_at;
  const propertyName = (showing as any).property?.name || 'Property';
  const unitNumber = (showing as any).unit?.unit_number ? ` #${(showing as any).unit.unit_number}` : '';
  const subject = `Showing reminder: ${propertyName}${unitNumber}`;
  const body = `Reminder: Your showing is scheduled for ${new Date(scheduledAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} at ${propertyName}${unitNumber}. Access code: ${showing.access_code || 'N/A'}.`;

  await sendGmailMessage({
    accountId,
    userId,
    to: showing.visitor_email,
    subject,
    body,
  });

  // Update reminder_sent_at
  const { error: updateError } = await supabase
    .from('showings')
    .update({
      reminder_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', showingId)
    .eq('account_id', accountId);

  if (updateError) {
    console.error('Error updating reminder timestamp:', updateError);
  }

  try {
    const { data: outbound, error: outboundError } = await supabase
      .from('outbound_messages')
      .insert({
        account_id: accountId,
        recipient_user_id: null,
        recipient_email: showing.visitor_email,
        recipient_phone: showing.visitor_phone,
        subject,
        body,
        channel: 'email',
        status: 'sent',
        retry_count: 0,
        provider: 'gmail',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (outboundError) {
      throw outboundError;
    }

    if (!outbound) {
      return;
    }
  } catch (error) {
    console.error('Error logging outbound message:', error);
  }

  // Log activity
  await logActivityEvent(
    accountId,
    userId,
    'showing_reminder_sent',
    reminderMessage,
    {
      entityType: 'showing',
      entityId: showingId,
      metadata: {
        visitor_name: showing.visitor_name,
        visitor_email: showing.visitor_email,
        showing_date: scheduledAt,
        access_code: showing.access_code,
      },
    }
  );

  console.log('[Showings] Reminder stub:', {
    to: showing.visitor_email,
    phone: showing.visitor_phone,
    showing_date: scheduledAt,
    access_code: showing.access_code,
    property: (showing as any).property?.name,
    unit: (showing as any).unit?.unit_number,
  });
}

export async function markShowingReminderSent(
  accountId: string,
  userId: string,
  showingId: string
): Promise<void> {
  const { data: showing, error: showingError } = await supabase
    .from('showings')
    .select('id, visitor_name, visitor_email')
    .eq('id', showingId)
    .eq('account_id', accountId)
    .single();

  if (showingError || !showing) {
    throw new Error('Showing not found');
  }

  const { error: updateError } = await supabase
    .from('showings')
    .update({
      reminder_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', showingId)
    .eq('account_id', accountId);

  if (updateError) {
    throw updateError;
  }

  await logActivityEvent(
    accountId,
    userId,
    'showing_reminder_sent',
    `Reminder marked as sent to ${showing.visitor_name} (${showing.visitor_email})`,
    {
      entityType: 'showing',
      entityId: showingId,
    }
  );
}

/**
 * Get available units for showings
 */
export async function getAvailableUnits(accountId: string) {
  const { data, error } = await supabase
    .from('units')
    .select(`
      id,
      unit_number,
      bedrooms,
      bathrooms,
      sqft,
      rent_amount,
      status,
      available_date,
      property:properties!inner(
        id,
        name,
        address1,
        address2,
        city,
        state,
        zip
      )
    `)
    .eq('properties.account_id', accountId)
    .eq('status', 'vacant')
    .order('available_date', { ascending: true });

  if (error) throw error;

  return (data || []).map((unit: any) => ({
    id: unit.id,
    unit_number: unit.unit_number,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    sqft: unit.sqft,
    rent_amount: unit.rent_amount,
    available_date: unit.available_date,
    property: unit.property,
  }));
}

/**
 * Expire old access codes (for background job)
 */
export async function expireOldAccessCodes(): Promise<number> {
  const { data, error } = await supabase.rpc('expire_old_access_codes');

  if (error) {
    console.error('Error expiring access codes:', error);
    return 0;
  }

  return data || 0;
}
