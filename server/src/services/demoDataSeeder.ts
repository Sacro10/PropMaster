/**
 * Demo Data Seeder
 * Generates realistic sample data for new accounts
 */

import { supabaseAdmin as supabase } from '../supabase';

export interface SeedOptions {
  accountId: string;
  numProperties?: number;
  numTenants?: number;
  numApplications?: number;
  numMaintenanceRequests?: number;
  numPayments?: number;
  numShowings?: number;
  includeMessages?: boolean;
}

/**
 * Seed an account with demo data
 */
export async function seedDemoData(options: SeedOptions): Promise<void> {
  const {
    accountId,
    numProperties = 3,
    numTenants = 15,
    numApplications = 5,
    numMaintenanceRequests = 8,
    numPayments = 20,
    numShowings = 4,
    includeMessages = true,
  } = options;

  console.log(`[Seeder] Starting demo data generation for account ${accountId}`);

  try {
    // 1. Create properties
    const properties = await seedProperties(accountId, numProperties);
    console.log(`[Seeder] Created ${properties.length} properties`);

    // 2. Create units across properties
    const units = await seedUnits(accountId, properties);
    console.log(`[Seeder] Created ${units.length} units`);

    // 3. Create tenants and leases
    const tenants = await seedTenants(accountId, units.slice(0, numTenants));
    console.log(`[Seeder] Created ${tenants.length} tenants`);

    // 4. Create rental applications
    const applications = await seedApplications(accountId, properties, numApplications);
    console.log(`[Seeder] Created ${applications.length} applications`);

    // 5. Create maintenance requests
    const requests = await seedMaintenanceRequests(accountId, units, numMaintenanceRequests);
    console.log(`[Seeder] Created ${requests.length} maintenance requests`);

    // 6. Create payment history
    const payments = await seedPayments(accountId, tenants, numPayments);
    console.log(`[Seeder] Created ${payments.length} payments`);

    // 7. Create property showings
    const showings = await seedShowings(accountId, properties, units, numShowings);
    console.log(`[Seeder] Created ${showings.length} showings`);

    // 8. Create messages and conversations (optional)
    if (includeMessages) {
      const messages = await seedMessages(accountId, tenants.slice(0, 5));
      console.log(`[Seeder] Created ${messages.length} messages`);
    }

    // 9. Create activity events
    await seedActivityEvents(accountId);
    console.log(`[Seeder] Created activity events`);

    console.log(`[Seeder] ✅ Demo data generation complete for account ${accountId}`);
  } catch (error) {
    console.error('[Seeder] Error generating demo data:', error);
    throw error;
  }
}

async function seedProperties(accountId: string, count: number) {
  const properties = [
    {
      account_id: accountId,
      name: 'Sunset Apartments',
      address1: '123 Sunset Blvd',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90028',
      total_units: 24,
      occupied_units: 20,
      property_type: 'apartment',
      year_built: 2015,
      status: 'active',
    },
    {
      account_id: accountId,
      name: 'Downtown Lofts',
      address1: '456 Main Street',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
      total_units: 12,
      occupied_units: 10,
      property_type: 'loft',
      year_built: 2018,
      status: 'active',
    },
    {
      account_id: accountId,
      name: 'Riverside Condos',
      address1: '789 River Road',
      city: 'Sacramento',
      state: 'CA',
      zip: '95814',
      total_units: 18,
      occupied_units: 15,
      property_type: 'condo',
      year_built: 2020,
      status: 'active',
    },
  ];

  const { data } = await supabase
    .from('properties')
    .insert(properties.slice(0, count))
    .select();

  return data || [];
}

async function seedUnits(accountId: string, properties: any[]) {
  const units = [];
  
  for (const property of properties) {
    for (let i = 1; i <= property.total_units; i++) {
      const bedrooms = i % 3 === 0 ? 2 : i % 2 === 0 ? 1 : 0; // Studio, 1BR, 2BR mix
      const bathrooms = bedrooms === 2 ? 2 : bedrooms === 1 ? 1 : 1;
      const sqft = bedrooms === 2 ? 950 : bedrooms === 1 ? 650 : 450;
      const rentAmount = bedrooms === 2 ? 2200 : bedrooms === 1 ? 1600 : 1200;
      
      units.push({
        account_id: accountId,
        property_id: property.id,
        unit_number: `${Math.floor(i / 10)}${i % 10 || 0}${Math.floor(Math.random() * 10)}`,
        bedrooms,
        bathrooms,
        sqft,
        rent_amount: rentAmount,
        status: i <= property.occupied_units ? 'occupied' : 'vacant',
      });
    }
  }

  const { data } = await supabase
    .from('units')
    .insert(units)
    .select();

  return data || [];
}

async function seedTenants(accountId: string, units: any[]) {
  const firstNames = ['John', 'Sarah', 'Michael', 'Emily', 'David', 'Jessica', 'Robert', 'Lisa', 'James', 'Karen'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  
  const tenants = [];
  
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    
    // Create user
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@example.com`;
    
    const { data: { user } } = await supabase.auth.admin.createUser({
      email,
      password: 'DemoPassword123!',
      email_confirm: true,
    });

    if (!user) continue;

    // Create tenant profile
    const { data: tenant } = await supabase
      .from('tenant_profiles')
      .insert({
        account_id: accountId,
        user_id: user.id,
        full_name: `${firstName} ${lastName}`,
        email,
        phone: `555-${String(i).padStart(4, '0')}`,
        monthly_income: 3000 + (i * 500),
        credit_score: 650 + (i * 10),
        background_check_status: 'approved',
      })
      .select()
      .single();

    // Create lease
    const leaseStart = new Date();
    leaseStart.setMonth(leaseStart.getMonth() - Math.floor(Math.random() * 12));
    const leaseEnd = new Date(leaseStart);
    leaseEnd.setFullYear(leaseEnd.getFullYear() + 1);

    await supabase
      .from('leases')
      .insert({
        account_id: accountId,
        unit_id: unit.id,
        tenant_user_id: user.id,
        lease_start: leaseStart.toISOString().split('T')[0],
        lease_end: leaseEnd.toISOString().split('T')[0],
        rent: unit.rent_amount,
        deposit: unit.rent_amount,
        status: 'active',
      });

    tenants.push(tenant);
  }

  return tenants;
}

async function seedApplications(accountId: string, properties: any[], count: number) {
  const applications = [];
  const statuses = ['pending', 'approved', 'rejected'];
  
  for (let i = 0; i < count; i++) {
    const property = properties[i % properties.length];
    
    applications.push({
      account_id: accountId,
      property_id: property.id,
      applicant_name: `Applicant ${i + 1}`,
      email: `applicant${i + 1}@example.com`,
      phone: `555-${String(1000 + i).padStart(4, '0')}`,
      monthly_income: 4000 + (i * 500),
      application_status: statuses[i % statuses.length],
      screening_score: 70 + (i * 5),
    });
  }

  const { data } = await supabase
    .from('rental_applications')
    .insert(applications)
    .select();

  return data || [];
}

async function seedMaintenanceRequests(accountId: string, units: any[], count: number) {
  const titles = [
    'Leaky Faucet',
    'AC Not Working',
    'Broken Window',
    'Clogged Drain',
    'Door Lock Issue',
    'Light Fixture Broken',
    'Noisy Pipes',
    'Heating Problem',
  ];

  const priorities = ['low', 'medium', 'high', 'urgent'];
  const statuses = ['open', 'in_progress', 'completed'];

  const requests = [];

  for (let i = 0; i < count; i++) {
    const unit = units[i % units.length];
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 30));

    requests.push({
      account_id: accountId,
      unit_id: unit.id,
      title: titles[i % titles.length],
      description: `Demo maintenance request for ${titles[i % titles.length].toLowerCase()}`,
      priority: priorities[i % priorities.length],
      status: statuses[i % statuses.length],
      created_at: createdAt.toISOString(),
    });
  }

  const { data } = await supabase
    .from('maintenance_requests')
    .insert(requests)
    .select();

  return data || [];
}

async function seedPayments(accountId: string, tenants: any[], count: number) {
  const payments = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const tenant = tenants[i % tenants.length];
    const paymentDate = new Date(now);
    paymentDate.setMonth(paymentDate.getMonth() - Math.floor(i / tenants.length));

    payments.push({
      account_id: accountId,
      tenant_id: tenant.id,
      amount: 1500 + (Math.floor(i / tenants.length) * 100),
      payment_type: 'rent',
      payment_method: i % 3 === 0 ? 'credit_card' : i % 3 === 1 ? 'ach' : 'check',
      payment_date: paymentDate.toISOString().split('T')[0],
      status: 'completed',
    });
  }

  const { data } = await supabase
    .from('payments')
    .insert(payments)
    .select();

  return data || [];
}

async function seedShowings(accountId: string, properties: any[], units: any[], count: number) {
  const showings = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const property = properties[i % properties.length];
    const unit = units.find(u => u.property_id === property.id && u.status === 'vacant');
    
    if (!unit) continue;

    const scheduledAt = new Date(now);
    scheduledAt.setDate(scheduledAt.getDate() + i + 1);

    showings.push({
      account_id: accountId,
      property_id: property.id,
      unit_id: unit.id,
      scheduled_at: scheduledAt.toISOString(),
      applicant_name: `Prospect ${i + 1}`,
      applicant_email: `prospect${i + 1}@example.com`,
      applicant_phone: `555-${String(2000 + i).padStart(4, '0')}`,
      prospect_name: `Prospect ${i + 1}`,
      prospect_email: `prospect${i + 1}@example.com`,
      prospect_phone: `555-${String(2000 + i).padStart(4, '0')}`,
      status: 'scheduled',
      access_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
    });
  }

  const { data } = await supabase
    .from('showings')
    .insert(showings)
    .select();

  return data || [];
}

async function seedMessages(accountId: string, tenants: any[]) {
  const messages = [];

  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i];
    
    // Create conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .insert({
        account_id: accountId,
        participant_1_id: tenant.user_id,
        subject: `Conversation with ${tenant.full_name}`,
        status: i % 2 === 0 ? 'active' : 'resolved',
      })
      .select()
      .single();

    if (!conversation) continue;

    // Add messages to conversation
    await supabase
      .from('messages')
      .insert([
        {
          account_id: accountId,
          conversation_id: conversation.id,
          sender_id: tenant.user_id,
          body: 'Hi, I have a question about my lease.',
          is_read: true,
        },
        {
          account_id: accountId,
          conversation_id: conversation.id,
          body: 'Sure, how can I help you?',
          is_read: true,
        },
      ]);

    messages.push(conversation);
  }

  return messages;
}

async function seedActivityEvents(accountId: string) {
  const events = [
    {
      account_id: accountId,
      event_type: 'application_approved',
      summary: 'Application approved for John Smith',
    },
    {
      account_id: accountId,
      event_type: 'maintenance_completed',
      summary: 'Maintenance request completed - Leaky Faucet',
    },
    {
      account_id: accountId,
      event_type: 'payment_received',
      summary: 'Payment received from Sarah Johnson - $1,600',
    },
    {
      account_id: accountId,
      event_type: 'showing_scheduled',
      summary: 'Property showing scheduled at Sunset Apartments',
    },
  ];

  await supabase.from('activity_events').insert(events);
}

/**
 * Clear all demo data for an account
 */
export async function clearDemoData(accountId: string): Promise<void> {
  console.log(`[Seeder] Clearing demo data for account ${accountId}`);

  // Delete in reverse order of foreign keys
  await supabase.from('messages').delete().eq('account_id', accountId);
  await supabase.from('conversations').delete().eq('account_id', accountId);
  await supabase.from('activity_events').delete().eq('account_id', accountId);
  await supabase.from('showings').delete().eq('account_id', accountId);
  await supabase.from('payments').delete().eq('account_id', accountId);
  await supabase.from('maintenance_requests').delete().eq('account_id', accountId);
  await supabase.from('rental_applications').delete().eq('account_id', accountId);
  await supabase.from('leases').delete().eq('account_id', accountId);
  
  // Get tenant user IDs before deleting profiles
  const { data: tenants } = await supabase
    .from('tenant_profiles')
    .select('user_id')
    .eq('account_id', accountId);

  await supabase.from('tenant_profiles').delete().eq('account_id', accountId);
  
  // Delete auth users
  if (tenants) {
    for (const tenant of tenants) {
      await supabase.auth.admin.deleteUser(tenant.user_id);
    }
  }

  await supabase.from('units').delete().eq('account_id', accountId);
  await supabase.from('properties').delete().eq('account_id', accountId);

  console.log(`[Seeder] ✅ Demo data cleared for account ${accountId}`);
}
