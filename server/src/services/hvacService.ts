import { supabase } from '../supabase';

export interface HVACEnrollment {
  id: string;
  unitId: string;
  frequency: string;
  filterSize: string;
  nextDeliveryDate: string;
  status: string;
  createdAt: string;
  unit?: {
    unitNumber: string;
    property: {
      name: string;
      address: string;
    };
  };
}

export interface HVACDeliverySchedule {
  id: string;
  enrollmentId: string;
  scheduledDate: string;
  deliveredDate: string | null;
  status: string;
  trackingNumber: string | null;
  batchId: string | null;
}

export interface HVACDeliveryBatch {
  id: string;
  batchNumber: string;
  deliveryDate: string;
  totalUnits: number;
  totalFilters: number;
  status: string;
  carrier: string | null;
  trackingNumbers: string[];
  createdAt: string;
}

export interface HVACProgramSummary {
  totalEnrollments: number;
  activeEnrollments: number;
  upcomingDeliveries: number;
  deliveriesThisMonth: number;
  filtersSentThisMonth: number;
  nextBatchDate: string | null;
}

/**
 * Get HVAC program summary
 */
export async function getHVACProgramSummary(
  accountId: string
): Promise<HVACProgramSummary> {
  // Get enrollments
  const { data: enrollments } = await supabase
    .from('hvac_program_enrollments')
    .select('id, status')
    .eq('account_id', accountId);

  const totalEnrollments = enrollments?.length || 0;
  const activeEnrollments =
    enrollments?.filter((e) => e.status === 'active').length || 0;

  // Get upcoming deliveries (next 30 days)
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const { data: upcomingSchedules } = await supabase
    .from('hvac_delivery_schedules')
    .select('*, enrollment:hvac_program_enrollments!inner(account_id)')
    .eq('enrollment.account_id', accountId)
    .eq('status', 'scheduled')
    .gte('scheduled_date', now.toISOString().split('T')[0])
    .lte('scheduled_date', thirtyDaysFromNow.toISOString().split('T')[0]);

  const upcomingDeliveries = upcomingSchedules?.length || 0;

  // Get deliveries this month
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: monthDeliveries } = await supabase
    .from('hvac_delivery_schedules')
    .select('*, enrollment:hvac_program_enrollments!inner(account_id)')
    .eq('enrollment.account_id', accountId)
    .eq('status', 'delivered')
    .gte('delivered_date', currentMonthStart.toISOString().split('T')[0]);

  const deliveriesThisMonth = monthDeliveries?.length || 0;

  // Get next batch date
  const { data: nextBatch } = await supabase
    .from('hvac_delivery_batches')
    .select('delivery_date')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .order('delivery_date', { ascending: true })
    .limit(1)
    .single();

  return {
    totalEnrollments,
    activeEnrollments,
    upcomingDeliveries,
    deliveriesThisMonth,
    filtersSentThisMonth: deliveriesThisMonth, // 1 filter per delivery
    nextBatchDate: nextBatch?.delivery_date || null,
  };
}

/**
 * Get all HVAC enrollments
 */
export async function getHVACEnrollments(
  accountId: string,
  filters?: {
    status?: string;
    unitId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ enrollments: HVACEnrollment[]; total: number }> {
  const { status, unitId, limit = 50, offset = 0 } = filters || {};

  let query = supabase
    .from('hvac_program_enrollments')
    .select(
      `
      *,
      unit:units!inner(
        unit_number,
        property:properties!inner(name, address)
      )
    `,
      { count: 'exact' }
    )
    .eq('account_id', accountId);

  if (status) query = query.eq('status', status);
  if (unitId) query = query.eq('unit_id', unitId);

  query = query.order('created_at', { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const enrollments: HVACEnrollment[] =
    data?.map((e: any) => ({
      id: e.id,
      unitId: e.unit_id,
      frequency: e.frequency,
      filterSize: e.filter_size,
      nextDeliveryDate: e.next_delivery_date,
      status: e.status,
      createdAt: e.created_at,
      unit: e.unit
        ? {
            unitNumber: e.unit.unit_number,
            property: {
              name: e.unit.property.name,
              address: e.unit.property.address,
            },
          }
        : undefined,
    })) || [];

  return { enrollments, total: count || 0 };
}

/**
 * Create HVAC enrollment
 */
export async function createHVACEnrollment(
  accountId: string,
  data: {
    unitId: string;
    frequency: string;
    filterSize: string;
  }
): Promise<HVACEnrollment> {
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

  // Calculate next delivery date based on frequency
  const now = new Date();
  const nextDate = new Date(now);
  if (data.frequency === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + 1);
  } else if (data.frequency === 'quarterly') {
    nextDate.setMonth(nextDate.getMonth() + 3);
  } else if (data.frequency === 'semi_annual') {
    nextDate.setMonth(nextDate.getMonth() + 6);
  }

  const { data: enrollment, error } = await supabase
    .from('hvac_program_enrollments')
    .insert({
      account_id: accountId,
      unit_id: data.unitId,
      frequency: data.frequency,
      filter_size: data.filterSize,
      next_delivery_date: nextDate.toISOString().split('T')[0],
      status: 'active',
    })
    .select(
      `
      *,
      unit:units!inner(
        unit_number,
        property:properties!inner(name, address)
      )
    `
    )
    .single();

  if (error) throw error;

  return {
    id: enrollment.id,
    unitId: enrollment.unit_id,
    frequency: enrollment.frequency,
    filterSize: enrollment.filter_size,
    nextDeliveryDate: enrollment.next_delivery_date,
    status: enrollment.status,
    createdAt: enrollment.created_at,
    unit: enrollment.unit
      ? {
          unitNumber: enrollment.unit.unit_number,
          property: {
            name: enrollment.unit.property.name,
            address: enrollment.unit.property.address,
          },
        }
      : undefined,
  };
}

/**
 * Get delivery batches
 */
export async function getDeliveryBatches(
  accountId: string,
  filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ batches: HVACDeliveryBatch[]; total: number }> {
  const { status, limit = 50, offset = 0 } = filters || {};

  let query = supabase
    .from('hvac_delivery_batches')
    .select('*', { count: 'exact' })
    .eq('account_id', accountId);

  if (status) query = query.eq('status', status);

  query = query.order('delivery_date', { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const batches: HVACDeliveryBatch[] =
    data?.map((b: any) => ({
      id: b.id,
      batchNumber: b.batch_number,
      deliveryDate: b.delivery_date,
      totalUnits: b.total_units,
      totalFilters: b.total_filters,
      status: b.status,
      carrier: b.carrier,
      trackingNumbers: b.tracking_numbers || [],
      createdAt: b.created_at,
    })) || [];

  return { batches, total: count || 0 };
}

/**
 * Mark delivery as delivered
 */
export async function markDeliveryDelivered(
  accountId: string,
  deliveryId: string,
  trackingNumber?: string
): Promise<void> {
  // Verify delivery belongs to account
  const { data: delivery } = await supabase
    .from('hvac_delivery_schedules')
    .select('*, enrollment:hvac_program_enrollments!inner(account_id)')
    .eq('id', deliveryId)
    .eq('enrollment.account_id', accountId)
    .single();

  if (!delivery) {
    throw new Error('Delivery not found');
  }

  const { error } = await supabase
    .from('hvac_delivery_schedules')
    .update({
      status: 'delivered',
      delivered_date: new Date().toISOString().split('T')[0],
      tracking_number: trackingNumber,
    })
    .eq('id', deliveryId);

  if (error) throw error;
}

/**
 * Generate next batch of deliveries
 */
export async function generateDeliveryBatch(
  accountId: string
): Promise<HVACDeliveryBatch> {
  // Get all active enrollments due for delivery
  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const { data: enrollments } = await supabase
    .from('hvac_program_enrollments')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .lte('next_delivery_date', thirtyDaysFromNow.toISOString().split('T')[0]);

  if (!enrollments || enrollments.length === 0) {
    throw new Error('No enrollments due for delivery');
  }

  // Create batch
  const batchNumber = `BATCH-${Date.now()}`;
  const { data: batch, error: batchError } = await supabase
    .from('hvac_delivery_batches')
    .insert({
      account_id: accountId,
      batch_number: batchNumber,
      delivery_date: today.toISOString().split('T')[0],
      total_units: enrollments.length,
      total_filters: enrollments.length,
      status: 'pending',
    })
    .select()
    .single();

  if (batchError) throw batchError;

  // Create delivery schedules for each enrollment
  const schedules = enrollments.map((enrollment) => ({
    enrollment_id: enrollment.id,
    scheduled_date: today.toISOString().split('T')[0],
    status: 'scheduled',
    batch_id: batch.id,
  }));

  const { error: schedulesError } = await supabase
    .from('hvac_delivery_schedules')
    .insert(schedules);

  if (schedulesError) throw schedulesError;

  return {
    id: batch.id,
    batchNumber: batch.batch_number,
    deliveryDate: batch.delivery_date,
    totalUnits: batch.total_units,
    totalFilters: batch.total_filters,
    status: batch.status,
    carrier: batch.carrier,
    trackingNumbers: batch.tracking_numbers || [],
    createdAt: batch.created_at,
  };
}
