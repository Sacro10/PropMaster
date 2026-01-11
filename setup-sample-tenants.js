import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Using service role for admin access
);

async function setupSampleTenants() {
  try {
    console.log('🔍 Setting up sample tenant data...\n');

    // Get existing users
    const { data: usersData } = await supabase.auth.admin.listUsers();
    const tenantUsers = usersData.users.filter(u => u.email.includes('tenant')).slice(0, 3);
    
    if (tenantUsers.length < 3) {
      console.error('❌ Need at least 3 tenant users in the database');
      return;
    }

    console.log(`✅ Found ${tenantUsers.length} tenant users\n`);

    // First, check if we have an account
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name')
      .limit(1);

    let accountId;
    if (!accounts || accounts.length === 0) {
      console.log('Creating demo account...');
      const { data: newAccount, error: accError } = await supabase
        .from('accounts')
        .insert({
          name: 'Demo Property Management',
          plan: 'premium',
          subscription_status: 'active'
        })
        .select()
        .single();

      if (accError) {
        console.error('Error creating account:', accError);
        return;
      }
      accountId = newAccount.id;
      console.log(`✅ Created account: ${accountId}\n`);
    } else {
      accountId = accounts[0].id;
      console.log(`✅ Using account: ${accounts[0].name} (${accountId})\n`);
    }

    // Create property
    const { data: existingProps } = await supabase
      .from('properties')
      .select('id, name')
      .eq('account_id', accountId)
      .limit(1);

    let propertyId;
    if (!existingProps || existingProps.length === 0) {
      console.log('Creating property...');
      const { data: newProp, error: propError } = await supabase
        .from('properties')
        .insert({
          account_id: accountId,
          name: 'Sunset Apartments',
          address1: '123 Main Street',
          city: 'San Francisco',
          state: 'CA',
          zip: '94102',
          property_type: 'apartment',
          units_count: 10
        })
        .select()
        .single();

      if (propError) {
        console.error('Error:', propError);
        return;
      }
      propertyId = newProp.id;
      console.log(`✅ Created: ${newProp.name}\n`);
    } else {
      propertyId = existingProps[0].id;
      console.log(`✅ Using property: ${existingProps[0].name}\n`);
    }

    // Create units
    const unitData = [
      { unit_number: '101', bedrooms: 2, bathrooms: 1, sqft: 850, rent_amount: 2200 },
      { unit_number: '102', bedrooms: 1, bathrooms: 1, sqft: 650, rent_amount: 1800 },
      { unit_number: '103', bedrooms: 2, bathrooms: 2, sqft: 950, rent_amount: 2500 }
    ];

    console.log('Creating units...');
    const units = [];
    for (const unit of unitData) {
      const { data: existingUnit } = await supabase
        .from('units')
        .select('id')
        .eq('property_id', propertyId)
        .eq('unit_number', unit.unit_number)
        .single();

      if (existingUnit) {
        units.push({ ...existingUnit, ...unit });
        console.log(`  Using existing unit ${unit.unit_number}`);
      } else {
        const { data: newUnit, error } = await supabase
          .from('units')
          .insert({
            ...unit,
            property_id: propertyId,
            account_id: accountId,
            status: 'occupied'
          })
          .select()
          .single();

        if (error) {
          console.error(`  Error creating unit ${unit.unit_number}:`, error);
        } else {
          units.push(newUnit);
          console.log(`  ✅ Created unit ${unit.unit_number}`);
        }
      }
    }
    console.log();

    // Create tenants
    const tenantData = [
      {
        name: 'John Smith',
        email: 'john.smith@example.com',
        phone: '555-0101',
        credit_score: 750,
        monthly_income: 6500,
        background_check_status: 'approved',
        employment_status: 'employed'
      },
      {
        name: 'Sarah Johnson',
        email: 'sarah.j@example.com',
        phone: '555-0102',
        credit_score: 680,
        monthly_income: 5200,
        background_check_status: 'approved',
        employment_status: 'self-employed'
      },
      {
        name: 'Michael Chen',
        email: 'mchen@example.com',
        phone: '555-0103',
        credit_score: 720,
        monthly_income: 7800,
        background_check_status: 'approved',
        employment_status: 'employed'
      }
    ];

    console.log('Creating tenant profiles and leases...\n');
    for (let i = 0; i < Math.min(tenantData.length, units.length); i++) {
      const tenant = tenantData[i];
      const unit = units[i];

      console.log(`${i + 1}. ${tenant.name} (Unit ${unit.unit_number})`);

      // Use actual tenant user
      const tenantUserId = tenantUsers[i].id;

      // Calculate AI risk score
      const creditNormalized = Math.round(((tenant.credit_score - 300) / 550) * 100);
      const incomeRatio = tenant.monthly_income / unit.rent_amount;
      const incomeScore = incomeRatio >= 3 ? 100 : incomeRatio >= 2.5 ? 90 : 80;
      const backgroundScore = 90;
      const employmentScore = 80;
      
      const ai_risk_score = Math.min(100, Math.max(0, Math.round(
        (creditNormalized * 0.4) + 
        (incomeScore * 0.3) + 
        (backgroundScore * 0.2) + 
        (employmentScore * 0.1)
      )));

      // Create tenant profile
      const { data: profile, error: profileError } = await supabase
        .from('tenant_profiles')
        .insert({
          account_id: accountId,
          user_id: tenantUserId,
          full_name: tenant.name,
          email: tenant.email,
          phone: tenant.phone,
          credit_score: tenant.credit_score,
          monthly_income: tenant.monthly_income,
          background_check_status: tenant.background_check_status,
          employment_status: tenant.employment_status,
          ai_risk_score: ai_risk_score
        })
        .select()
        .single();

      if (profileError) {
        console.error(`   ❌ Profile error: ${profileError.message}`);
        continue;
      }

      // Create lease
      const now = new Date();
      const leaseStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const leaseEnd = new Date(leaseStart);
      leaseEnd.setFullYear(leaseEnd.getFullYear() + 1);

      const { error: leaseError } = await supabase
        .from('leases')
        .insert({
          account_id: accountId,
          unit_id: unit.id,
          tenant_user_id: tenantUserId,
          lease_start: leaseStart.toISOString().split('T')[0],
          lease_end: leaseEnd.toISOString().split('T')[0],
          rent: unit.rent_amount,
          deposit: unit.rent_amount * 1.5,
          status: 'active'
        });

      if (leaseError) {
        console.error(`   ❌ Lease error: ${leaseError.message}`);
      } else {
        console.log(`   ✅ Risk Score: ${ai_risk_score} | Income Ratio: ${incomeRatio.toFixed(2)}x | Credit: ${tenant.credit_score}`);
      }
    }

    console.log('\n✅ All sample data created successfully!');
    console.log('\nYou can now refresh the tenant page to see the risk scores.');

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

setupSampleTenants();
