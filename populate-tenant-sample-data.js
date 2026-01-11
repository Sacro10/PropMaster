import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function populateSampleData() {
  try {
    console.log('🔍 Checking existing data...\n');

    // Get current user's account
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ No authenticated user found');
      return;
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!account) {
      console.error('❌ No account found');
      return;
    }

    const accountId = account.id;
    console.log(`✅ Found account: ${accountId}\n`);

    // Check if we have properties
    const { data: properties } = await supabase
      .from('properties')
      .select('id, name')
      .eq('account_id', accountId)
      .limit(1);

    let propertyId;
    if (!properties || properties.length === 0) {
      console.log('📝 Creating sample property...');
      const { data: newProperty, error: propError } = await supabase
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
        console.error('Error creating property:', propError);
        return;
      }
      propertyId = newProperty.id;
      console.log(`✅ Created property: ${newProperty.name}\n`);
    } else {
      propertyId = properties[0].id;
      console.log(`✅ Using existing property: ${properties[0].name}\n`);
    }

    // Check if we have units
    const { data: units } = await supabase
      .from('units')
      .select('id, unit_number, rent_amount')
      .eq('property_id', propertyId)
      .limit(3);

    let unitsList = units || [];
    if (unitsList.length === 0) {
      console.log('📝 Creating sample units...');
      const unitsToCreate = [
        { unit_number: '101', bedrooms: 2, bathrooms: 1, sqft: 850, rent_amount: 2200, status: 'occupied' },
        { unit_number: '102', bedrooms: 1, bathrooms: 1, sqft: 650, rent_amount: 1800, status: 'occupied' },
        { unit_number: '103', bedrooms: 2, bathrooms: 2, sqft: 950, rent_amount: 2500, status: 'occupied' }
      ];

      for (const unit of unitsToCreate) {
        const { data: newUnit, error: unitError } = await supabase
          .from('units')
          .insert({
            ...unit,
            property_id: propertyId,
            account_id: accountId
          })
          .select()
          .single();

        if (unitError) {
          console.error('Error creating unit:', unitError);
        } else {
          unitsList.push(newUnit);
          console.log(`  ✅ Created unit ${newUnit.unit_number}`);
        }
      }
      console.log();
    } else {
      console.log(`✅ Using ${unitsList.length} existing units\n`);
    }

    // Create tenant profiles and leases
    console.log('📝 Creating sample tenants...\n');

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

    for (let i = 0; i < Math.min(tenantData.length, unitsList.length); i++) {
      const tenant = tenantData[i];
      const unit = unitsList[i];

      console.log(`Creating tenant ${i + 1}: ${tenant.name}`);

      // Calculate AI risk score
      const creditNormalized = Math.round(((tenant.credit_score - 300) / 550) * 100);
      const incomeRatio = tenant.monthly_income / unit.rent_amount;
      const incomeScore = incomeRatio >= 3 ? 100 : incomeRatio >= 2.5 ? 90 : 80;
      const backgroundScore = tenant.background_check_status === 'approved' ? 90 : 60;
      const employmentScore = 80;
      
      const ai_risk_score = Math.round(
        (creditNormalized * 0.4) + 
        (incomeScore * 0.3) + 
        (backgroundScore * 0.2) + 
        (employmentScore * 0.1)
      );

      // Create tenant profile
      const { data: profile, error: profileError } = await supabase
        .from('tenant_profiles')
        .insert({
          account_id: accountId,
          user_id: user.id, // Using the current user for now
          full_name: tenant.name,
          email: tenant.email,
          phone: tenant.phone,
          credit_score: tenant.credit_score,
          monthly_income: tenant.monthly_income,
          background_check_status: tenant.background_check_status,
          employment_status: tenant.employment_status,
          ai_risk_score: Math.min(Math.max(ai_risk_score, 0), 100)
        })
        .select()
        .single();

      if (profileError) {
        console.error(`  ❌ Error creating profile: ${profileError.message}`);
        continue;
      }

      // Create lease
      const leaseStart = new Date();
      leaseStart.setMonth(leaseStart.getMonth() - Math.floor(Math.random() * 6));
      const leaseEnd = new Date(leaseStart);
      leaseEnd.setFullYear(leaseEnd.getFullYear() + 1);

      const { error: leaseError } = await supabase
        .from('leases')
        .insert({
          account_id: accountId,
          unit_id: unit.id,
          tenant_user_id: user.id,
          lease_start: leaseStart.toISOString().split('T')[0],
          lease_end: leaseEnd.toISOString().split('T')[0],
          rent: unit.rent_amount,
          deposit: unit.rent_amount * 1.5,
          status: 'active',
          renewal_status: 'none'
        });

      if (leaseError) {
        console.error(`  ❌ Error creating lease: ${leaseError.message}`);
      } else {
        console.log(`  ✅ Created with risk score: ${profile.ai_risk_score}`);
      }
    }

    console.log('\n✅ Sample data populated successfully!');

  } catch (error) {
    console.error('Error:', error);
  }
}

populateSampleData();
