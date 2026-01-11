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

    // 2. Create Owner Entities + Property Ownership
    console.log('🏢 Creating owner entities...');
    const ownerEntities = [
      {
        account_id: accountId,
        name: 'Harbor Capital',
        email: 'owners@harborcapital.com',
        entity_type: 'llc',
        disbursement_method: 'ach',
        disbursement_schedule: 'monthly',
        disbursement_day: 1,
        management_fee_percentage: 8,
        is_active: true,
      },
      {
        account_id: accountId,
        name: 'Lakeside Holdings',
        email: 'finance@lakesideholdings.com',
        entity_type: 'corporation',
        disbursement_method: 'check',
        disbursement_schedule: 'monthly',
        disbursement_day: 1,
        management_fee_percentage: 10,
        is_active: true,
      },
    ];

    const { data: createdOwners, error: ownersError } = await supabase
      .from('owner_entities')
      .insert(ownerEntities)
      .select();

    if (ownersError) throw ownersError;
    console.log(`✅ Created ${createdOwners.length} owner entities\n`);

    console.log('🔗 Linking owners to properties...');
    const propertyOwners = createdProperties.map((property, index) => ({
      account_id: accountId,
      property_id: property.id,
      owner_id: createdOwners[index % createdOwners.length].id,
      ownership_percentage: 100,
    }));

    const { error: propertyOwnersError } = await supabase
      .from('property_owners')
      .insert(propertyOwners);

    if (propertyOwnersError) throw propertyOwnersError;
    console.log(`✅ Linked ${propertyOwners.length} property ownership records\n`);

    // 3. Create Units
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

      // Try to create auth user, or get existing one
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        // User already exists - try to get their ID
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === email);
        
        if (existingUser) {
          tenantUsers.push({
            id: existingUser.id,
            name: tenantNames[i],
            email,
          });
          console.log(`ℹ️  Using existing user ${email}`);
        } else {
          console.warn(`⚠️  Could not find or create user ${email}`);
        }
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

    console.log(`✅ Found/created ${tenantUsers.length} tenant users\n`);

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
    const unitPropertyMap = new Map(createdUnits.map((unit) => [unit.id, unit.property_id]));

    // Use leases if available, otherwise use occupied units directly
    const maintenanceUnits = createdLeases.length > 0 
      ? createdLeases.map(l => ({ unit_id: l.unit_id, user_id: l.tenant_user_id }))
      : occupiedUnits.slice(0, 20).map(u => ({ unit_id: u.id, user_id: tenantUsers[0]?.id || null }));

    for (let i = 0; i < 30 && maintenanceUnits.length > 0; i++) {
      const unitData = randomItem(maintenanceUnits);
      const category = randomItem(categories);
      const priority = randomItem(priorities);
      const status = randomItem(statuses);
      const createdAt = randomDate(new Date('2025-12-01'), new Date());
      const estimatedCost = Number((50 + Math.random() * 450).toFixed(2));
      const isCompleted = status === 'completed';
      const completedAt = isCompleted
        ? new Date(createdAt.getTime() + Math.floor(Math.random() * 7) * 24 * 60 * 60 * 1000)
        : null;

      maintenanceRequests.push({
        account_id: accountId,
        property_id: unitPropertyMap.get(unitData.unit_id) || null,
        unit_id: unitData.unit_id,
        created_by_user_id: unitData.user_id,
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} issue in unit`,
        description: `Tenant reported ${category} problem that needs attention.`,
        category,
        priority,
        status,
        entry_allowed: Math.random() > 0.5,
        requested_at: createdAt.toISOString(),
        created_at: createdAt.toISOString(),
        estimated_cost: isCompleted ? null : estimatedCost,
        actual_cost: isCompleted ? Number((estimatedCost * (0.8 + Math.random() * 0.6)).toFixed(2)) : null,
        completed_at: completedAt ? completedAt.toISOString() : null,
      });
    }

    const { data: createdMaintenance, error: maintenanceError } = await supabase
      .from('maintenance_requests')
      .insert(maintenanceRequests)
      .select();

    if (maintenanceError) throw maintenanceError;
    console.log(`✅ Created ${maintenanceRequests.length} maintenance requests\n`);

    // 6b. Create Expense Categories + Expenses for completed maintenance
    console.log('🧾 Creating expense categories and expenses...');
    const categoryNames = categories.map((name) => `${name.charAt(0).toUpperCase() + name.slice(1)}`);

    const { data: expenseCategories, error: categoryError } = await supabase
      .from('expense_categories')
      .upsert(
        categoryNames.map((name) => ({
          account_id: accountId,
          name,
          description: 'Seeded for analytics breakdown',
          tax_deductible: true,
        })),
        { onConflict: 'account_id,name' }
      )
      .select();

    if (categoryError) throw categoryError;

    const categoryMap = new Map(
      (expenseCategories || []).map((category: any) => [category.name.toLowerCase(), category.id])
    );

    const expenses: any[] = (createdMaintenance || [])
      .filter((request: any) => request.actual_cost || request.estimated_cost)
      .map((request: any) => ({
        account_id: accountId,
        property_id: request.property_id || null,
        unit_id: request.unit_id,
        category_id: categoryMap.get(String(request.category || 'general').toLowerCase()) || null,
        maintenance_request_id: request.id,
        amount: Number(request.actual_cost ?? request.estimated_cost),
        expense_date: request.completed_at
          ? request.completed_at.split('T')[0]
          : request.created_at.split('T')[0],
        description: request.title,
        payment_method: randomItem(['manual', 'check', 'ach']),
      }));

    if (expenses.length > 0) {
      const { error: expenseError } = await supabase
        .from('expenses')
        .insert(expenses);

      if (expenseError) throw expenseError;
    }
    console.log(`✅ Created ${expenses.length} expenses\n`);

    // 7. Create Showings
    console.log('🔑 Creating showings...');
    const vacantUnits = createdUnits.filter(u => u.status === 'vacant');
    const showings: any[] = [];

    // Create showings for vacant units or any units if none vacant
    const showingUnits = vacantUnits.length > 0 ? vacantUnits : createdUnits.slice(0, 10);
    
    for (let i = 0; i < Math.min(20, showingUnits.length * 3); i++) {
      const unit = randomItem(showingUnits);
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

    if (showings.length > 0) {
      const { error: showingsError } = await supabase
        .from('showings')
        .insert(showings);

      if (showingsError) throw showingsError;
    }
    console.log(`✅ Created ${showings.length} showings\n`);

    // 8. Create HVAC Filter Subscriptions
    console.log('🌬️  Creating HVAC filter subscriptions...');
    const subscriptions: any[] = [];

    // Use occupied units or any units if none occupied
    const hvacUnits = occupiedUnits.length > 0 ? occupiedUnits : createdUnits;
    
    for (const unit of hvacUnits.slice(0, Math.floor(hvacUnits.length * 0.6))) {
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

    if (subscriptions.length > 0) {
      const { error: subsError } = await supabase
        .from('hvac_filter_subscriptions')
        .insert(subscriptions);

      if (subsError) throw subsError;
    }
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

    if (adminMember && tenantUsers.length > 0) {
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

      if (messages.length > 0) {
        const { error: messagesError } = await supabase
          .from('messages')
          .insert(messages);

        if (messagesError) console.warn('⚠️  Messages error:', messagesError.message);
      }
      console.log(`✅ Created ${messages.length} messages\n`);
    } else {
      console.log('⚠️  Skipping messages (no admin or tenant users)\n');
    }

    // 10. Create Tenant Profiles
    console.log('👤 Creating tenant profiles...');
    const tenantProfiles: any[] = [];

    for (let i = 0; i < tenantUsers.length; i++) {
      const tenant = tenantUsers[i];
      const creditScore = Math.floor(600 + Math.random() * 200);
      const monthlyIncome = 3500 + Math.floor(Math.random() * 4500);
      const employmentStatus = randomItem(['employed', 'employed', 'self_employed', 'employed']);
      
      // AI risk score based on credit score and income (realistic correlation)
      let aiRiskScore = 50;
      if (creditScore >= 750 && monthlyIncome >= 5000) {
        aiRiskScore = Math.floor(85 + Math.random() * 15); // 85-100
      } else if (creditScore >= 700) {
        aiRiskScore = Math.floor(75 + Math.random() * 15); // 75-90
      } else if (creditScore >= 650) {
        aiRiskScore = Math.floor(60 + Math.random() * 20); // 60-80
      } else {
        aiRiskScore = Math.floor(40 + Math.random() * 30); // 40-70
      }

      // Background check should mostly align with AI score for realistic accuracy
      let backgroundStatus;
      if (aiRiskScore >= 75) {
        backgroundStatus = Math.random() < 0.9 ? 'approved' : 'pending'; // 90% match
      } else if (aiRiskScore >= 60) {
        backgroundStatus = Math.random() < 0.7 ? 'approved' : 'pending'; // 70% match  
      } else {
        backgroundStatus = Math.random() < 0.3 ? 'approved' : 'rejected'; // 30% match
      }

      tenantProfiles.push({
        account_id: accountId,
        user_id: tenant.id,
        full_name: tenant.name,
        email: tenant.email,
        phone: `555-${String(100 + i).padStart(4, '0')}`,
        ai_risk_score: aiRiskScore,
        background_check_status: backgroundStatus,
        credit_score: creditScore,
        monthly_income: monthlyIncome,
        employment_status: employmentStatus,
        employer: randomItem(['Tech Corp', 'City Hospital', 'Local Bank', 'Retail Inc', 'Services LLC', 'Startup Inc']),
        emergency_contact_name: `Emergency Contact ${i + 1}`,
        emergency_contact_phone: `555-${String(200 + i).padStart(4, '0')}`,
      });
    }

    if (tenantProfiles.length > 0) {
      const { error: profilesError } = await supabase
        .from('tenant_profiles')
        .upsert(tenantProfiles, { onConflict: 'user_id' });

      if (profilesError) console.warn('⚠️  Tenant profiles warning:', profilesError.message);
    }
    console.log(`✅ Created ${tenantProfiles.length} tenant profiles\n`);

    // 11. Create Rental Applications
    console.log('📝 Creating rental applications...');
    const applications: any[] = [];
    const applicantNames = [
      'Alex Thompson', 'Jamie Wilson', 'Morgan Davis', 'Taylor Smith',
      'Jordan Lee', 'Casey Brown', 'Riley Johnson', 'Quinn Martinez'
    ];

    for (let i = 0; i < 15; i++) {
      const unit = randomItem(showingUnits);
      const property = createdProperties.find(p => p.id === unit.property_id);
      const createdAt = randomDate(new Date('2025-12-01'), new Date());
      const monthlyIncome = 4000 + Math.floor(Math.random() * 6000);
      const creditScore = 600 + Math.floor(Math.random() * 200);
      
      // AI risk score based on income and credit (realistic ML model)
      let aiRiskScore = 50;
      const incomeToRentRatio = monthlyIncome / (unit.rent_amount || 1500);
      
      if (creditScore >= 750 && incomeToRentRatio >= 3.5) {
        aiRiskScore = Math.floor(85 + Math.random() * 15); // 85-100
      } else if (creditScore >= 700 && incomeToRentRatio >= 3) {
        aiRiskScore = Math.floor(75 + Math.random() * 15); // 75-90
      } else if (creditScore >= 650 && incomeToRentRatio >= 2.5) {
        aiRiskScore = Math.floor(60 + Math.random() * 20); // 60-80
      } else {
        aiRiskScore = Math.floor(40 + Math.random() * 30); // 40-70
      }

      // Status should align with AI score for realistic accuracy (85-90%)
      let status;
      if (aiRiskScore >= 80) {
        status = Math.random() < 0.85 ? 'approved' : (Math.random() < 0.5 ? 'under_review' : 'pending');
      } else if (aiRiskScore >= 70) {
        status = Math.random() < 0.6 ? 'approved' : (Math.random() < 0.5 ? 'under_review' : 'pending');
      } else if (aiRiskScore >= 60) {
        status = Math.random() < 0.3 ? 'approved' : (Math.random() < 0.6 ? 'rejected' : 'pending');
      } else {
        status = Math.random() < 0.1 ? 'approved' : (Math.random() < 0.7 ? 'rejected' : 'pending');
      }

      // Calculate reviewed_at based on status
      let reviewedAt = null;
      if (status === 'approved' || status === 'rejected') {
        // Reviewed 2-48 hours after submission (AI makes it faster)
        const reviewHours = 2 + Math.floor(Math.random() * 46);
        reviewedAt = new Date(createdAt.getTime() + reviewHours * 60 * 60 * 1000).toISOString();
      }

      applications.push({
        account_id: accountId,
        property_id: unit.property_id,
        unit_id: unit.id,
        full_name: randomItem(applicantNames) + ` ${i + 1}`,
        email: `applicant${i + 1}@example.com`,
        phone: `555-${String(300 + i).padStart(4, '0')}`,
        current_address: `${100 + i} Previous Street, City, ST 12345`,
        employment_status: randomItem(['employed', 'employed', 'self_employed', 'employed']),
        current_employer: randomItem(['Tech Corp', 'City Hospital', 'Local Bank', 'Retail Inc', 'Services LLC']),
        monthly_income: monthlyIncome,
        credit_score: creditScore,
        ai_risk_score: aiRiskScore,
        background_check_status: aiRiskScore >= 75 ? 'approved' : (aiRiskScore >= 60 ? 'pending' : 'rejected'),
        status: status,
        desired_move_in_date: new Date(Date.now() + (14 + i * 7) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        created_at: createdAt.toISOString(),
        reviewed_at: reviewedAt,
      });
    }

    if (applications.length > 0) {
      const { error: appsError } = await supabase
        .from('rental_applications')
        .insert(applications);

      if (appsError) console.warn('⚠️  Applications warning:', appsError.message);
    }
    console.log(`✅ Created ${applications.length} rental applications\n`);

    // 12. Create Message Templates
    console.log('📋 Creating message templates...');
    const templates = [
      {
        account_id: accountId,
        name: 'Rent Payment Reminder',
        category: 'payment',
        subject: 'Rent Payment Reminder - {{unit_number}}',
        body: 'Dear {{tenant_name}},\n\nThis is a friendly reminder that your rent payment of ${{rent_amount}} is due on {{due_date}}.\n\nPlease submit your payment through the tenant portal.\n\nThank you!',
        variables: ['tenant_name', 'unit_number', 'rent_amount', 'due_date'],
        is_active: true,
      },
      {
        account_id: accountId,
        name: 'Maintenance Update',
        category: 'maintenance',
        subject: 'Maintenance Request Update - {{ticket_number}}',
        body: 'Hello {{tenant_name}},\n\nYour maintenance request ({{ticket_number}}) has been updated.\n\nStatus: {{status}}\nScheduled Date: {{scheduled_date}}\n\nBest regards',
        variables: ['tenant_name', 'ticket_number', 'status', 'scheduled_date'],
        is_active: true,
      },
      {
        account_id: accountId,
        name: 'Lease Renewal Notice',
        category: 'lease',
        subject: 'Lease Renewal Notice - {{property_name}}',
        body: 'Dear {{tenant_name}},\n\nYour lease for {{unit_number}} at {{property_name}} will expire on {{lease_end}}.\n\nPlease let us know if you would like to renew.\n\nThank you!',
        variables: ['tenant_name', 'unit_number', 'property_name', 'lease_end'],
        is_active: true,
      },
      {
        account_id: accountId,
        name: 'Welcome New Tenant',
        category: 'onboarding',
        subject: 'Welcome to {{property_name}}!',
        body: 'Dear {{tenant_name}},\n\nWelcome to your new home at {{property_name}}!\n\nYour move-in date is {{move_in_date}}.\n\nWelcome home!',
        variables: ['tenant_name', 'property_name', 'move_in_date'],
        is_active: true,
      },
      {
        account_id: accountId,
        name: 'Late Payment Notice',
        category: 'payment',
        subject: 'Late Payment Notice - {{unit_number}}',
        body: 'Dear {{tenant_name}},\n\nYour rent payment is now {{days_overdue}} days overdue.\n\nPlease make payment immediately to avoid additional fees.\n\nContact us if you need assistance.',
        variables: ['tenant_name', 'unit_number', 'days_overdue'],
        is_active: true,
      },
    ];

    const { error: templatesError } = await supabase
      .from('message_templates')
      .insert(templates);

    if (templatesError) console.warn('⚠️  Templates warning:', templatesError.message);
    console.log(`✅ Created ${templates.length} message templates\n`);

    // 13. Create Activity Events
    console.log('📊 Creating activity events...');
    const activityEvents: any[] = [];
    const eventTypes = [
      { type: 'payment_received', entity: 'payment', summary: 'Rent payment received' },
      { type: 'maintenance_created', entity: 'maintenance_request', summary: 'New maintenance request submitted' },
      { type: 'maintenance_completed', entity: 'maintenance_request', summary: 'Maintenance request completed' },
      { type: 'showing_scheduled', entity: 'showing', summary: 'Property showing scheduled' },
      { type: 'application_submitted', entity: 'rental_application', summary: 'New rental application received' },
      { type: 'lease_signed', entity: 'lease', summary: 'Lease agreement signed' },
      { type: 'tenant_move_in', entity: 'tenant', summary: 'Tenant moved in' },
      { type: 'payment_late', entity: 'payment', summary: 'Payment marked as late' },
    ];

    for (let i = 0; i < 50; i++) {
      const eventType = randomItem(eventTypes);
      const createdAt = randomDate(new Date('2026-01-01'), new Date());

      activityEvents.push({
        account_id: accountId,
        event_type: eventType.type,
        entity_type: eventType.entity,
        summary: eventType.summary,
        metadata: { auto_generated: true, index: i },
        created_at: createdAt.toISOString(),
      });
    }

    const { error: activityError } = await supabase
      .from('activity_events')
      .insert(activityEvents);

    if (activityError) console.warn('⚠️  Activity events warning:', activityError.message);
    console.log(`✅ Created ${activityEvents.length} activity events\n`);

    // 14. Create Automated Reminders
    console.log('⏰ Creating automated reminders...');
    const reminders = [
      {
        account_id: accountId,
        reminder_type: 'rent_due',
        name: 'Monthly Rent Reminder',
        frequency: 'monthly',
        next_send_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        message_subject: 'Rent Payment Due',
        message_body: 'Your rent payment is due soon. Please ensure payment is made by the due date.',
        status: 'active',
      },
      {
        account_id: accountId,
        reminder_type: 'lease_renewal',
        name: 'Lease Renewal Reminder',
        frequency: 'monthly',
        next_send_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        message_subject: 'Lease Renewal Notice',
        message_body: 'Your lease will be expiring soon. Please contact us to discuss renewal options.',
        status: 'active',
      },
      {
        account_id: accountId,
        reminder_type: 'hvac_filter',
        name: 'HVAC Filter Delivery',
        frequency: 'quarterly',
        next_send_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        message_subject: 'HVAC Filter Delivery',
        message_body: 'Your HVAC filter delivery is scheduled. Please replace filters upon receipt.',
        status: 'active',
      },
    ];

    const { error: remindersError } = await supabase
      .from('automated_reminders')
      .insert(reminders);

    if (remindersError) console.warn('⚠️  Reminders warning:', remindersError.message);
    console.log(`✅ Created ${reminders.length} automated reminders\n`);

    // 15. Create Owner Disbursements
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

      const owner = createdOwners[i % createdOwners.length];
      const status = i < 2 ? 'pending' : 'completed';

      disbursements.push({
        account_id: accountId,
        owner_id: owner.id,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        status,
        amount: netAmount,
        total_rent_collected: totalRent,
        total_expenses: 0,
        management_fee: managementFee,
        net_amount: netAmount,
        disbursed_at: status === 'completed' ? periodEnd.toISOString() : null,
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
    console.log(`   - ${tenantProfiles.length} tenant profiles`);
    console.log(`   - ${createdLeases.length} active leases`);
    console.log(`   - ${payments.length} payment records`);
    console.log(`   - ${maintenanceRequests.length} maintenance requests`);
    console.log(`   - ${showings.length} showings`);
    console.log(`   - ${applications.length} rental applications`);
    console.log(`   - ${subscriptions.length} HVAC subscriptions`);
    console.log(`   - ${messages.length} messages`);
    console.log(`   - ${templates.length} message templates`);
    console.log(`   - ${activityEvents.length} activity events`);
    console.log(`   - ${reminders.length} automated reminders`);
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
