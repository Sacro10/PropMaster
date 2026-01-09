/**
 * Seed Demo Data Script
 * Generates realistic demo data for the Property Management App
 *
 * Usage: npx ts-node server/src/scripts/seedDemoData.ts
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper function to generate random date within range
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Helper function to pick random item from array
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Main seed function
 */
async function seedDemoData(accountId: string) {
  console.log('🌱 Starting to seed demo data...\n');

  try {
    // 1. Create Properties
    console.log('📍 Creating properties...');
    const properties = [
      {
        account_id: accountId,
        name: 'Sunset Villa',
        address1: '123 Sunset Boulevard',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90028',
        property_type: 'residential',
        year_built: 2015,
        total_units: 24,
        purchase_price: 4500000,
        current_value: 5200000,
      },
      {
        account_id: accountId,
        name: 'Oak Park Apartments',
        address1: '456 Oak Street',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        property_type: 'residential',
        year_built: 2010,
        total_units: 18,
        purchase_price: 3200000,
        current_value: 3800000,
      },
      {
        account_id: accountId,
        name: 'Downtown Loft',
        address1: '789 Main Street',
        city: 'Seattle',
        state: 'WA',
        zip: '98101',
        property_type: 'mixed',
        year_built: 2018,
        total_units: 12,
        purchase_price: 2800000,
        current_value: 3100000,
      },
      {
        account_id: accountId,
        name: 'Riverside Condos',
        address1: '321 River Road',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        property_type: 'residential',
        year_built: 2020,
        total_units: 8,
        purchase_price: 1800000,
        current_value: 2000000,
      },
    ];

    const { data: createdProperties, error: propError } = await supabase
      .from('properties')
      .insert(properties)
      .select();

    if (propError) throw propError;
    console.log(`✅ Created ${createdProperties.length} properties\n`);

    // 2. Create Units
    console.log('🏠 Creating units...');
    const units: any[] = [];
    const unitConfigs = [
      { beds: 0, baths: 1, sqft: 450, rent: 1200, type: 'studio' },
      { beds: 1, baths: 1, sqft: 650, rent: 1500, type: '1br' },
      { beds: 2, baths: 1, sqft: 850, rent: 1900, type: '2br' },
      { beds: 2, baths: 2, sqft: 1050, rent: 2300, type: '2br/2ba' },
      { beds: 3, baths: 2, sqft: 1250, rent: 2800, type: '3br' },
    ];

    for (const property of createdProperties) {
      for (let i = 1; i <= property.total_units; i++) {
        const config = randomItem(unitConfigs);
        const isOccupied = Math.random() > 0.15; // 85% occupancy

        units.push({
          account_id: accountId,
          property_id: property.id,
          unit_number: String(i).padStart(3, '0'),
          bedrooms: config.beds,
          bathrooms: config.baths,
          sqft: config.sqft + Math.floor(Math.random() * 100),
          rent_amount: config.rent + (Math.random() * 200 - 100),
          deposit_amount: config.rent,
          status: isOccupied ? 'occupied' : 'vacant',
          hvac_filter_size: randomItem(['16x20x1', '16x25x1', '20x20x1', '20x25x1']),
        });
      }
    }

    const { data: createdUnits, error: unitsError } = await supabase
      .from('units')
      .insert(units)
      .select();

    if (unitsError) throw unitsError;
    console.log(`✅ Created ${createdUnits.length} units\n`);

    // 3. Create Tenant Users and Profiles
    console.log('👥 Creating tenant users...');
    const tenantNames = [
      'Sarah Johnson', 'Michael Chen', 'Emily Rodriguez', 'David Williams',
      'Jessica Martinez', 'James Taylor', 'Lisa Anderson', 'Robert Brown',
      'Maria Garcia', 'Christopher Lee', 'Amanda White', 'Daniel Harris',
    ];

    const tenantUsers: any[] = [];
    for (let i = 0; i < Math.min(tenantNames.length, createdUnits.filter(u => u.status === 'occupied').length); i++) {
      const email = `tenant${i + 1}@example.com`;
      const password = 'DemoPass123!';

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        console.warn(`⚠️  Could not create user ${email}: ${authError.message}`);
        continue;
      }

      tenantUsers.push({
        id: authData.user.id,
        name: tenantNames[i],
        email,
      });

      // Add to account_members
      await supabase.from('account_members').insert({
        account_id: accountId,
        user_id: authData.user.id,
        role: 'tenant',
        joined_at: new Date().toISOString(),
      });
    }

    console.log(`✅ Created ${tenantUsers.length} tenant users\n`);

    // 4. Create Leases
    console.log('📄 Creating leases...');
    const occupiedUnits = createdUnits.filter(u => u.status === 'occupied');
    const leases: any[] = [];

    for (let i = 0; i < Math.min(tenantUsers.length, occupiedUnits.length); i++) {
      const unit = occupiedUnits[i];
      const tenant = tenantUsers[i];
      const startDate = randomDate(new Date('2024-01-01'), new Date('2025-06-01'));
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);

      leases.push({
        account_id: accountId,
        unit_id: unit.id,
        tenant_user_id: tenant.id,
        lease_start: startDate.toISOString().split('T')[0],
        lease_end: endDate.toISOString().split('T')[0],
        rent: unit.rent_amount,
        deposit: unit.deposit_amount,
        status: 'active',
        move_in_date: startDate.toISOString().split('T')[0],
      });
    }

    const { data: createdLeases, error: leasesError } = await supabase
      .from('leases')
      .insert(leases)
      .select();

    if (leasesError) throw leasesError;
    console.log(`✅ Created ${createdLeases.length} leases\n`);

    // 5. Create Payments
    console.log('💳 Creating payments...');
    const payments: any[] = [];
    const currentDate = new Date();

    for (const lease of createdLeases) {
      // Create 6 months of payment history
      for (let i = 0; i < 6; i++) {
        const dueDate = new Date(currentDate);
        dueDate.setMonth(dueDate.getMonth() - i);
        dueDate.setDate(1);

        const isPaid = Math.random() > 0.1; // 90% payment rate
        const paidDate = new Date(dueDate);
        paidDate.setDate(paidDate.getDate() + Math.floor(Math.random() * 10));

        payments.push({
          account_id: accountId,
          lease_id: lease.id,
          tenant_user_id: lease.tenant_user_id,
          unit_id: lease.unit_id,
          amount: lease.rent,
          payment_type: 'rent',
          due_date: dueDate.toISOString().split('T')[0],
          paid_at: isPaid ? paidDate.toISOString() : null,
          status: isPaid ? 'paid' : 'pending',
          payment_method: isPaid ? randomItem(['stripe', 'ach', 'check']) : 'manual',
        });
      }
    }

    const { error: paymentsError } = await supabase
      .from('payments')
      .insert(payments);

    if (paymentsError) throw paymentsError;
    console.log(`✅ Created ${payments.length} payment records\n`);

    // 6. Create Maintenance Requests
    console.log('🔧 Creating maintenance requests...');
    const categories = ['hvac', 'plumbing', 'electrical', 'appliance', 'general'];
    const priorities = ['low', 'normal', 'high', 'emergency'];
    const statuses = ['submitted', 'reviewed', 'assigned', 'in_progress', 'completed'];

    const maintenanceRequests: any[] = [];

    for (let i = 0; i < 30; i++) {
      const lease = randomItem(createdLeases);
      const category = randomItem(categories);
      const priority = randomItem(priorities);
      const status = randomItem(statuses);
      const createdAt = randomDate(new Date('2025-12-01'), new Date());

      maintenanceRequests.push({
        account_id: accountId,
        unit_id: lease.unit_id,
        created_by_user_id: lease.tenant_user_id,
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} issue in unit`,
        description: `Tenant reported ${category} problem that needs attention.`,
        category,
        priority,
        status,
        entry_allowed: Math.random() > 0.5,
        requested_at: createdAt.toISOString(),
        created_at: createdAt.toISOString(),
      });
    }

    const { error: maintenanceError } = await supabase
      .from('maintenance_requests')
      .insert(maintenanceRequests);

    if (maintenanceError) throw maintenanceError;
    console.log(`✅ Created ${maintenanceRequests.length} maintenance requests\n`);

    // 7. Create Showings
    console.log('🔑 Creating showings...');
    const vacantUnits = createdUnits.filter(u => u.status === 'vacant');
    const showings: any[] = [];

    for (let i = 0; i < Math.min(20, vacantUnits.length * 3); i++) {
      const unit = randomItem(vacantUnits);
      const scheduledDate = randomDate(new Date(), new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

      showings.push({
        account_id: accountId,
        property_id: unit.property_id,
        unit_id: unit.id,
        scheduled_at: scheduledDate.toISOString(),
        applicant_name: `Prospect ${i + 1}`,
        applicant_email: `prospect${i + 1}@example.com`,
        applicant_phone: `555-0${String(i).padStart(3, '0')}`,
        status: randomItem(['scheduled', 'confirmed', 'completed', 'cancelled']),
        access_method: randomItem(['lockbox', 'smartlock', 'self_guided']),
        access_code: Math.floor(1000 + Math.random() * 9000).toString(),
      });
    }

    const { error: showingsError } = await supabase
      .from('showings')
      .insert(showings);

    if (showingsError) throw showingsError;
    console.log(`✅ Created ${showings.length} showings\n`);

    // 8. Create HVAC Filter Subscriptions
    console.log('🌬️  Creating HVAC filter subscriptions...');
    const subscriptions: any[] = [];

    for (const unit of occupiedUnits.slice(0, Math.floor(occupiedUnits.length * 0.6))) {
      subscriptions.push({
        account_id: accountId,
        unit_id: unit.id,
        filter_size: unit.hvac_filter_size,
        filter_type: randomItem(['standard', 'pleated', 'hepa']),
        frequency: randomItem(['monthly', 'bimonthly', 'quarterly']),
        next_delivery_date: randomDate(new Date(), new Date(Date.now() + 60 * 24 * 60 * 60 * 1000))
          .toISOString()
          .split('T')[0],
        status: 'active',
      });
    }

    const { error: subsError } = await supabase
      .from('hvac_filter_subscriptions')
      .insert(subscriptions);

    if (subsError) throw subsError;
    console.log(`✅ Created ${subscriptions.length} HVAC filter subscriptions\n`);

    // 9. Create Messages
    console.log('💬 Creating messages...');
    const messages: any[] = [];

    // Get admin user (account owner)
    const { data: adminMember } = await supabase
      .from('account_members')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('role', 'owner')
      .single();

    if (adminMember) {
      for (let i = 0; i < Math.min(15, tenantUsers.length * 2); i++) {
        const tenant = randomItem(tenantUsers);
        const fromTenant = Math.random() > 0.5;
        const createdAt = randomDate(new Date('2026-01-01'), new Date());

        messages.push({
          account_id: accountId,
          from_user_id: fromTenant ? tenant.id : adminMember.user_id,
          to_user_id: fromTenant ? adminMember.user_id : tenant.id,
          subject: randomItem([
            'Rent Payment Question',
            'Maintenance Follow-up',
            'Lease Renewal',
            'Parking Question',
            'General Inquiry',
          ]),
          body: 'This is a sample message for demonstration purposes.',
          is_read: Math.random() > 0.3,
          created_at: createdAt.toISOString(),
        });
      }

      const { error: messagesError } = await supabase
        .from('messages')
        .insert(messages);

      if (messagesError) throw messagesError;
      console.log(`✅ Created ${messages.length} messages\n`);
    }

    // 10. Create Owner Disbursements
    console.log('💰 Creating owner disbursements...');
    const disbursements: any[] = [];

    for (let i = 0; i < 6; i++) {
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - i - 1);
      periodStart.setDate(1);

      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(0);

      const totalRent = payments
        .filter(p => p.status === 'paid' && new Date(p.due_date) >= periodStart && new Date(p.due_date) <= periodEnd)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const managementFee = totalRent * 0.08;
      const netAmount = totalRent - managementFee;

      disbursements.push({
        account_id: accountId,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        status: 'completed',
        amount: netAmount,
        total_rent_collected: totalRent,
        total_expenses: 0,
        management_fee: managementFee,
        net_amount: netAmount,
        disbursed_at: periodEnd.toISOString(),
      });
    }

    const { error: disbError } = await supabase
      .from('owner_disbursements')
      .insert(disbursements);

    if (disbError) throw disbError;
    console.log(`✅ Created ${disbursements.length} owner disbursements\n`);

    console.log('🎉 Seed data creation complete!\n');
    console.log('📊 Summary:');
    console.log(`   - ${createdProperties.length} properties`);
    console.log(`   - ${createdUnits.length} units`);
    console.log(`   - ${tenantUsers.length} tenants`);
    console.log(`   - ${createdLeases.length} active leases`);
    console.log(`   - ${payments.length} payment records`);
    console.log(`   - ${maintenanceRequests.length} maintenance requests`);
    console.log(`   - ${showings.length} showings`);
    console.log(`   - ${subscriptions.length} HVAC subscriptions`);
    console.log(`   - ${messages.length} messages`);
    console.log(`   - ${disbursements.length} disbursements`);

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('Property Management App - Demo Data Seeder\n');

  // Get account ID from command line or prompt
  const accountId = process.argv[2];

  if (!accountId) {
    console.error('❌ Please provide an account ID as an argument');
    console.error('Usage: npx ts-node server/src/scripts/seedDemoData.ts <account-id>');
    process.exit(1);
  }

  // Verify account exists
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, name, plan')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    console.error(`❌ Account ${accountId} not found`);
    process.exit(1);
  }

  console.log(`📋 Account: ${account.name} (${account.plan})`);
  console.log(`🆔 Account ID: ${accountId}\n`);

  // Confirm before proceeding
  console.log('⚠️  This will create demo data for the account.');
  console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  await seedDemoData(accountId);

  console.log('\n✨ All done! Your demo data is ready to use.');
  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
