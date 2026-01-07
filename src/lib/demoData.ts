/**
 * Demo Data Seeder
 * Creates sample data for development and testing
 */

import { supabase } from './supabaseClient';
import { getCurrentAccountId, getCurrentUser } from './api/client';

export async function seedDemoData() {
  try {
    const accountId = await getCurrentAccountId();
    const user = await getCurrentUser();

    if (!accountId || !user) {
      throw new Error('User must be logged in to seed data');
    }

    console.log('[Demo Data] Starting seed for account:', accountId);

    // 1. Create Properties
    const properties = await seedProperties(accountId);
    console.log('[Demo Data] Created properties:', properties.length);

    // 2. Create Units
    const units = await seedUnits(accountId, properties);
    console.log('[Demo Data] Created units:', units.length);

    // 3. Create Tenants & Leases
    const tenants = await seedTenantsAndLeases(accountId, user.id, units);
    console.log('[Demo Data] Created tenants:', tenants.length);

    // 4. Create Rental Applications
    const applications = await seedRentalApplications(accountId, units);
    console.log('[Demo Data] Created applications:', applications.length);

    // 5. Create Maintenance Requests
    const maintenanceRequests = await seedMaintenanceRequests(accountId, user.id, units, properties);
    console.log('[Demo Data] Created maintenance requests:', maintenanceRequests.length);

    // 6. Create Payments
    const payments = await seedPayments(accountId, tenants);
    console.log('[Demo Data] Created payments:', payments.length);

    // 7. Create Showings
    const showings = await seedShowings(accountId, units);
    console.log('[Demo Data] Created showings:', showings.length);

    // 8. Create Messages
    const messages = await seedMessages(accountId, user.id);
    console.log('[Demo Data] Created messages:', messages.length);

    // 9. Create HVAC Filter Subscriptions
    const hvacSubs = await seedHVACFilterSubscriptions(accountId, units);
    console.log('[Demo Data] Created HVAC subscriptions:', hvacSubs.length);

    console.log('[Demo Data] ✅ Seed completed successfully!');

    return {
      success: true,
      message: 'Demo data created successfully!',
      counts: {
        properties: properties.length,
        units: units.length,
        tenants: tenants.length,
        applications: applications.length,
        maintenance: maintenanceRequests.length,
        payments: payments.length,
        showings: showings.length,
        messages: messages.length,
        hvacSubscriptions: hvacSubs.length,
      },
    };
  } catch (error: any) {
    console.error('[Demo Data] Error seeding data:', error);
    return {
      success: false,
      message: error.message || 'Failed to seed demo data',
      error,
    };
  }
}

async function seedProperties(accountId: string) {
  const properties = [
    {
      account_id: accountId,
      name: 'Sunset Villa',
      address1: '123 Sunset Blvd',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90028',
      property_type: 'residential',
      year_built: 2015,
      total_units: 24,
    },
    {
      account_id: accountId,
      name: 'Oak Park',
      address1: '456 Oak Street',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
      property_type: 'residential',
      year_built: 2010,
      total_units: 18,
    },
    {
      account_id: accountId,
      name: 'Downtown Loft',
      address1: '789 Main Avenue',
      city: 'San Diego',
      state: 'CA',
      zip: '92101',
      property_type: 'mixed',
      year_built: 2020,
      total_units: 32,
    },
  ];

  const { data, error } = await supabase
    .from('properties')
    .insert(properties)
    .select();

  if (error) throw error;
  return data || [];
}

async function seedUnits(accountId: string, properties: any[]) {
  const units = [];

  for (const property of properties) {
    const unitCount = property.name === 'Sunset Villa' ? 5 : property.name === 'Oak Park' ? 4 : 6;

    for (let i = 1; i <= unitCount; i++) {
      units.push({
        account_id: accountId,
        property_id: property.id,
        unit_number: `${i < 100 ? (i < 10 ? '00' : '0') : ''}${i}`,
        floor_number: Math.ceil(i / 4),
        bedrooms: i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
        bathrooms: i % 3 === 0 ? 2 : i % 2 === 0 ? 1.5 : 1,
        sqft: 800 + (i * 50),
        rent_amount: 1500 + (i * 100),
        deposit_amount: 2000,
        status: i > unitCount - 2 ? 'vacant' : 'occupied',
        hvac_filter_size: '16x20x1',
      });
    }
  }

  const { data, error } = await supabase
    .from('units')
    .insert(units)
    .select();

  if (error) throw error;
  return data || [];
}

async function seedTenantsAndLeases(accountId: string, userId: string, units: any[]) {
  const tenants = [];
  const occupiedUnits = units.filter(u => u.status === 'occupied');

  const tenantNames = [
    'Sarah Johnson',
    'Michael Chen',
    'Emily Rodriguez',
    'David Williams',
    'Jessica Martinez',
    'Robert Lee',
    'Amanda White',
    'James Brown',
    'Lisa Davis',
    'Thomas Wilson',
  ];

  for (let i = 0; i < Math.min(occupiedUnits.length, tenantNames.length); i++) {
    const unit = occupiedUnits[i];

    // Create tenant profile
    const { data: tenantData } = await supabase
      .from('tenant_profiles')
      .insert({
        account_id: accountId,
        user_id: userId, // Using current user for simplicity
        full_name: tenantNames[i],
        phone: `555-${(1000 + i).toString().substring(1)}`,
        email: `${tenantNames[i].toLowerCase().replace(' ', '.')}@example.com`,
        employer: i % 3 === 0 ? 'Tech Corp' : i % 2 === 0 ? 'Finance Inc' : 'Healthcare LLC',
        employment_status: 'employed',
        monthly_income: 4000 + (i * 500),
        credit_score: 650 + (i * 10),
        background_check_status: 'approved',
        ai_risk_score: 85 + i,
      })
      .select()
      .single();

    if (tenantData) {
      // Create lease
      const leaseStart = new Date();
      leaseStart.setMonth(leaseStart.getMonth() - (i * 2));
      const leaseEnd = new Date(leaseStart);
      leaseEnd.setFullYear(leaseEnd.getFullYear() + 1);

      await supabase
        .from('leases')
        .insert({
          account_id: accountId,
          unit_id: unit.id,
          tenant_user_id: userId,
          lease_start: leaseStart.toISOString().split('T')[0],
          lease_end: leaseEnd.toISOString().split('T')[0],
          rent: unit.rent_amount,
          deposit: unit.deposit_amount,
          status: 'active',
          renewal_status: i % 3 === 0 ? 'pending' : 'accepted',
        });

      tenants.push(tenantData);
    }
  }

  return tenants;
}

async function seedRentalApplications(accountId: string, units: any[]) {
  const vacantUnits = units.filter(u => u.status === 'vacant').slice(0, 3);

  const applicants = [
    { name: 'Robert Thompson', email: 'robert.thompson@example.com', income: 75000, credit: 745 },
    { name: 'Amanda Garcia', email: 'amanda.garcia@example.com', income: 68000, credit: 710 },
    { name: 'James Wilson', email: 'james.wilson@example.com', income: 82000, credit: 768 },
  ];

  const applications = vacantUnits.map((unit, i) => ({
    account_id: accountId,
    unit_id: unit.id,
    applicant_name: applicants[i].name,
    applicant_email: applicants[i].email,
    applicant_phone: `555-${(2000 + i).toString().substring(1)}`,
    monthly_income: applicants[i].income,
    credit_score: applicants[i].credit,
    employment_status: 'employed',
    background_check_status: 'clear',
    ai_risk_score: 88 + i,
    application_status: 'pending',
    applied_at: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { data, error } = await supabase
    .from('rental_applications')
    .insert(applications)
    .select();

  if (error) throw error;
  return data || [];
}

async function seedMaintenanceRequests(accountId: string, userId: string, units: any[], properties: any[]) {
  const requests = [
    {
      title: 'HVAC System Not Cooling',
      description: 'Air conditioning unit not cooling properly',
      category: 'hvac',
      priority: 'high',
      status: 'assigned',
    },
    {
      title: 'Leaking Faucet in Kitchen',
      description: 'Kitchen faucet has a persistent leak',
      category: 'plumbing',
      priority: 'normal',
      status: 'scheduled',
    },
    {
      title: 'Broken Window Lock',
      description: 'Window lock mechanism is broken',
      category: 'general',
      priority: 'low',
      status: 'submitted',
    },
    {
      title: 'Electrical Outlet Not Working',
      description: 'Outlet in bedroom stopped working',
      category: 'electrical',
      priority: 'high',
      status: 'in_progress',
    },
    {
      title: 'Smoke Detector Beeping',
      description: 'Smoke detector needs battery replacement',
      category: 'general',
      priority: 'normal',
      status: 'completed',
    },
  ];

  const maintenanceData = requests.map((req, i) => {
    const unit = units[i % units.length];
    const property = properties.find(p => p.id === unit.property_id);

    return {
      account_id: accountId,
      unit_id: unit.id,
      property_id: property.id,
      created_by_user_id: userId,
      requested_at: new Date(Date.now() - (i + 1) * 60 * 60 * 1000).toISOString(),
      ...req,
    };
  });

  const { data, error } = await supabase
    .from('maintenance_requests')
    .insert(maintenanceData)
    .select();

  if (error) throw error;
  return data || [];
}

async function seedPayments(accountId: string, tenants: any[]) {
  const payments = [];

  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i];

    // Create last 3 months of payments
    for (let month = 0; month < 3; month++) {
      const paymentDate = new Date();
      paymentDate.setMonth(paymentDate.getMonth() - month);
      paymentDate.setDate(5);

      payments.push({
        account_id: accountId,
        lease_id: tenant.id, // Using tenant ID as placeholder
        tenant_user_id: tenant.user_id,
        amount: 1500 + (i * 100),
        payment_type: 'rent',
        payment_method: month === 0 ? 'credit_card' : i % 3 === 0 ? 'ach' : 'credit_card',
        payment_status: month > 0 ? 'completed' : i % 5 === 0 ? 'pending' : 'completed',
        payment_date: paymentDate.toISOString(),
        due_date: new Date(paymentDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  const { data, error } = await supabase
    .from('payments')
    .insert(payments)
    .select();

  if (error) throw error;
  return data || [];
}

async function seedShowings(accountId: string, units: any[]) {
  const vacantUnits = units.filter(u => u.status === 'vacant');

  const showings = vacantUnits.slice(0, 4).map((unit, i) => {
    const showingDate = new Date();
    showingDate.setDate(showingDate.getDate() + i);
    showingDate.setHours(10 + (i * 2), 0, 0, 0);

    return {
      account_id: accountId,
      unit_id: unit.id,
      visitor_name: ['Amanda Garcia', 'Robert Thompson', 'Lisa Chen', 'Mark Johnson'][i],
      visitor_email: ['amanda@example.com', 'robert@example.com', 'lisa@example.com', 'mark@example.com'][i],
      visitor_phone: `555-${(3000 + i).toString().substring(1)}`,
      showing_date: showingDate.toISOString(),
      showing_type: i % 2 === 0 ? 'self_guided' : 'agent_assisted',
      status: i === 0 ? 'confirmed' : 'scheduled',
      access_code: i % 2 === 0 ? `CODE${1000 + i}` : null,
    };
  });

  const { data, error } = await supabase
    .from('showings')
    .insert(showings)
    .select();

  if (error) throw error;
  return data || [];
}

async function seedMessages(accountId: string, userId: string) {
  const messages = [
    {
      subject: 'Maintenance Update',
      body: 'Your HVAC maintenance request has been scheduled for tomorrow.',
    },
    {
      subject: 'Rent Reminder',
      body: 'This is a friendly reminder that rent is due on the 1st.',
    },
    {
      subject: 'Lease Renewal',
      body: 'Your lease is expiring soon. Would you like to discuss renewal options?',
    },
  ];

  const messageData = messages.map(msg => ({
    account_id: accountId,
    sender_user_id: userId,
    recipient_user_id: userId, // Self-message for demo
    ...msg,
  }));

  const { data, error } = await supabase
    .from('messages')
    .insert(messageData)
    .select();

  if (error) throw error;
  return data || [];
}

async function seedHVACFilterSubscriptions(accountId: string, units: any[]) {
  const occupiedUnits = units.filter(u => u.status === 'occupied' && u.hvac_filter_size).slice(0, 10);

  const subscriptions = occupiedUnits.map((unit, i) => {
    const nextDelivery = new Date();
    nextDelivery.setDate(nextDelivery.getDate() + (i * 2) + 10);

    return {
      account_id: accountId,
      unit_id: unit.id,
      filter_size: unit.hvac_filter_size,
      delivery_frequency_days: 30,
      next_delivery_date: nextDelivery.toISOString().split('T')[0],
      is_active: true,
    };
  });

  const { data, error } = await supabase
    .from('hvac_filter_subscriptions')
    .insert(subscriptions)
    .select();

  if (error) throw error;
  return data || [];
}

/**
 * Delete all demo data for the current account
 */
export async function deleteDemoData() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    console.log('[Demo Data] Deleting all data for account:', accountId);

    // Delete in reverse order of dependencies
    const tables = [
      'hvac_filter_subscriptions',
      'showings',
      'messages',
      'notifications',
      'payments',
      'owner_disbursements',
      'maintenance_assignments',
      'maintenance_requests',
      'rental_applications',
      'lease_tenants',
      'leases',
      'tenant_profiles',
      'units',
      'properties',
    ];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('account_id', accountId);

      if (error) {
        console.error(`[Demo Data] Error deleting from ${table}:`, error);
      } else {
        console.log(`[Demo Data] Deleted from ${table}`);
      }
    }

    console.log('[Demo Data] ✅ Delete completed successfully!');

    return {
      success: true,
      message: 'All demo data deleted successfully!',
    };
  } catch (error: any) {
    console.error('[Demo Data] Error deleting data:', error);
    return {
      success: false,
      message: error.message || 'Failed to delete demo data',
      error,
    };
  }
}
