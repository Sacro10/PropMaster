import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkAndPopulateTenantData() {
  try {
    console.log('🔍 Checking tenant data...\n');

    // Get all active leases
    const { data: leases, error: leasesError } = await supabase
      .from('leases')
      .select('*')
      .in('status', ['active', 'pending']);

    if (leasesError) {
      console.error('Error fetching leases:', leasesError);
      return;
    }

    console.log(`Found ${leases?.length || 0} active leases\n`);

    if (!leases || leases.length === 0) {
      console.log('❌ No active leases found. Cannot populate tenant data.');
      return;
    }

    // Get tenant profiles for these users
    const tenantUserIds = leases.map(l => l.tenant_user_id).filter(Boolean);
    const { data: profiles, error: profilesError } = await supabase
      .from('tenant_profiles')
      .select('*')
      .in('user_id', tenantUserIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return;
    }

    // Create a map of user_id to profile
    const profileMap = new Map();
    (profiles || []).forEach(p => profileMap.set(p.user_id, p));

    // Check each tenant's data
    const tenantsNeedingData = [];
    for (const lease of leases) {
      const profile = profileMap.get(lease.tenant_user_id);
      
      const missingFields = [];
      if (!profile?.credit_score) missingFields.push('credit_score');
      if (!profile?.monthly_income) missingFields.push('monthly_income');
      if (!profile?.background_check_status) missingFields.push('background_check_status');
      if (!profile?.employment_status) missingFields.push('employment_status');

      if (missingFields.length > 0 || !profile) {
        tenantsNeedingData.push({
          lease,
          profile,
          user_id: lease.tenant_user_id,
          missingFields
        });
      }
    }

    console.log(`📊 Tenants needing data: ${tenantsNeedingData.length}\n`);

    if (tenantsNeedingData.length === 0) {
      console.log('✅ All tenants have complete data!');
      return;
    }

    // Populate missing data
    console.log('📝 Adding sample data to tenant profiles...\n');

    for (let i = 0; i < tenantsNeedingData.length; i++) {
      const { lease, profile, user_id, missingFields } = tenantsNeedingData[i];
      
      console.log(`Tenant ${i + 1}/${tenantsNeedingData.length}:`);
      console.log(`  User ID: ${user_id}`);
      console.log(`  Missing: ${missingFields.join(', ')}`);

      // Generate sample data
      const rent = lease.rent || 1500;
      const sampleData = {
        credit_score: 650 + Math.floor(Math.random() * 150), // 650-800
        monthly_income: rent * (2.5 + Math.random() * 1.5), // 2.5x-4x rent
        background_check_status: ['approved', 'approved', 'approved', 'pending'][Math.floor(Math.random() * 4)],
        employment_status: ['employed', 'self-employed', 'employed'][Math.floor(Math.random() * 3)]
      };

      // Calculate AI risk score based on the data
      const creditNormalized = Math.round(((sampleData.credit_score - 300) / 550) * 100);
      const incomeRatio = sampleData.monthly_income / rent;
      const incomeScore = incomeRatio >= 3 ? 100 : incomeRatio >= 2.5 ? 90 : 80;
      const backgroundScore = sampleData.background_check_status === 'approved' ? 90 : 60;
      const employmentScore = 80;
      
      const ai_risk_score = Math.round(
        (creditNormalized * 0.4) + 
        (incomeScore * 0.3) + 
        (backgroundScore * 0.2) + 
        (employmentScore * 0.1)
      );

      sampleData.ai_risk_score = Math.min(Math.max(ai_risk_score, 0), 100);

      if (profile) {
        // Update existing profile
        const { error } = await supabase
          .from('tenant_profiles')
          .update(sampleData)
          .eq('user_id', user_id);

        if (error) {
          console.error(`  ❌ Error updating: ${error.message}`);
        } else {
          console.log(`  ✅ Updated with risk score: ${sampleData.ai_risk_score}`);
        }
      } else {
        // Get account_id from lease
        const { data: leaseData } = await supabase
          .from('leases')
          .select('account_id')
          .eq('id', lease.id)
          .single();

        // Create new profile
        const { error } = await supabase
          .from('tenant_profiles')
          .insert({
            user_id,
            account_id: leaseData?.account_id || lease.account_id,
            ...sampleData
          });

        if (error) {
          console.error(`  ❌ Error creating: ${error.message}`);
        } else {
          console.log(`  ✅ Created with risk score: ${sampleData.ai_risk_score}`);
        }
      }
    }

    console.log('\n✅ Done! Tenant data has been populated.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAndPopulateTenantData();
