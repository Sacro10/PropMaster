import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDatabaseIssues() {
  try {
    const accountId = 'ad20ed72-b46d-44f4-837c-0b7594465418';
    
    console.log('🔧 Starting database cleanup and fixes...\n');

    // 1. CREATE TENANT PROFILES FOR MISSING LEASES
    console.log('📝 Creating tenant profiles for leases without profiles...\n');
    
    const { data: allLeases } = await supabase
      .from('leases')
      .select('id, tenant_user_id, rent, unit_id, status')
      .eq('account_id', accountId)
      .eq('status', 'active');

    const { data: existingProfiles } = await supabase
      .from('tenant_profiles')
      .select('user_id')
      .eq('account_id', accountId);

    const existingUserIds = new Set(existingProfiles?.map(p => p.user_id) || []);
    const leasesNeedingProfiles = allLeases?.filter(l => !existingUserIds.has(l.tenant_user_id)) || [];

    console.log(`Found ${leasesNeedingProfiles.length} leases without tenant profiles`);

    const tenantNames = [
      'Emma Wilson', 'James Martinez', 'Olivia Davis', 'Liam Anderson', 'Sophia Garcia',
      'Noah Rodriguez', 'Isabella Lopez', 'Mason Hernandez', 'Ava Gonzalez', 'Ethan Thomas',
      'Mia Jackson', 'Lucas White', 'Charlotte Harris', 'Benjamin Martin', 'Amelia Thompson',
      'William Moore', 'Harper Taylor', 'Alexander Lee', 'Evelyn Harris', 'Daniel Clark',
      'Abigail Lewis', 'Matthew Robinson', 'Emily Walker', 'Joseph Hall', 'Elizabeth Allen',
      'David Young', 'Sofia King', 'Jackson Wright', 'Avery Scott', 'Samuel Green',
      'Ella Baker', 'Sebastian Adams', 'Scarlett Nelson'
    ];

    for (let i = 0; i < leasesNeedingProfiles.length; i++) {
      const lease = leasesNeedingProfiles[i];
      const name = tenantNames[i] || `Tenant ${i + 4}`;
      const firstName = name.split(' ')[0].toLowerCase();
      const lastName = name.split(' ')[1].toLowerCase();
      
      // Generate realistic data
      const creditScore = 600 + Math.floor(Math.random() * 200);
      const rent = lease.rent || 1800;
      const incomeMultiplier = 2.5 + Math.random() * 1.5;
      const monthlyIncome = Math.round(rent * incomeMultiplier);
      
      // Calculate risk score
      const creditNormalized = Math.round(((creditScore - 300) / 550) * 100);
      const incomeRatio = monthlyIncome / rent;
      const incomeScore = incomeRatio >= 3 ? 100 : incomeRatio >= 2.5 ? 90 : 80;
      const backgroundScore = 90;
      const employmentScore = 80;
      
      const aiRiskScore = Math.min(100, Math.max(0, Math.round(
        (creditNormalized * 0.4) + 
        (incomeScore * 0.3) + 
        (backgroundScore * 0.2) + 
        (employmentScore * 0.1)
      )));

      const { error } = await supabase
        .from('tenant_profiles')
        .insert({
          account_id: accountId,
          user_id: lease.tenant_user_id,
          full_name: name,
          email: `${firstName}.${lastName}@example.com`,
          phone: `555-${String(1000 + i).padStart(4, '0')}`,
          credit_score: creditScore,
          monthly_income: monthlyIncome,
          background_check_status: 'approved',
          employment_status: ['employed', 'self-employed', 'employed'][i % 3],
          ai_risk_score: aiRiskScore
        });

      if (error) {
        console.error(`  ❌ Error creating profile for ${name}:`, error.message);
      } else {
        console.log(`  ✅ Created ${name} - Risk: ${aiRiskScore}`);
      }
    }

    // 2. CLEAN UP DUPLICATE PROPERTIES
    console.log('\n🏢 Cleaning up duplicate properties...\n');
    
    const { data: properties } = await supabase
      .from('properties')
      .select('id, name')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true });

    const propertyMap = new Map();
    const duplicatesToDelete = [];

    properties?.forEach(prop => {
      if (propertyMap.has(prop.name)) {
        duplicatesToDelete.push(prop.id);
      } else {
        propertyMap.set(prop.name, prop.id);
      }
    });

    if (duplicatesToDelete.length > 0) {
      console.log(`Found ${duplicatesToDelete.length} duplicate properties to remove`);
      
      // Move units from duplicate properties to the original
      for (const dupId of duplicatesToDelete) {
        const dupName = properties.find(p => p.id === dupId)?.name;
        const originalId = propertyMap.get(dupName);
        
        const { data: unitsToMove } = await supabase
          .from('units')
          .select('id')
          .eq('property_id', dupId);

        if (unitsToMove && unitsToMove.length > 0) {
          await supabase
            .from('units')
            .update({ property_id: originalId })
            .eq('property_id', dupId);
          
          console.log(`  ↔️  Moved ${unitsToMove.length} units from duplicate ${dupName}`);
        }

        const { error } = await supabase
          .from('properties')
          .delete()
          .eq('id', dupId);

        if (!error) {
          console.log(`  ✅ Deleted duplicate ${dupName}`);
        }
      }
    } else {
      console.log('No duplicate properties found');
    }

    // 3. FIX UNIT AVAILABILITY
    console.log('\n🏠 Fixing unit availability status...\n');
    
    const { data: units } = await supabase
      .from('units')
      .select('id')
      .eq('account_id', accountId);

    const { data: leasedUnits } = await supabase
      .from('leases')
      .select('unit_id')
      .eq('account_id', accountId)
      .eq('status', 'active');

    const leasedUnitIds = new Set(leasedUnits?.map(l => l.unit_id) || []);
    
    let occupiedCount = 0;
    let availableCount = 0;

    for (const unit of units || []) {
      const shouldBeOccupied = leasedUnitIds.has(unit.id);
      const newStatus = shouldBeOccupied ? 'occupied' : 'available';
      
      await supabase
        .from('units')
        .update({ status: newStatus })
        .eq('id', unit.id);

      if (shouldBeOccupied) {
        occupiedCount++;
      } else {
        availableCount++;
      }
    }

    console.log(`  ✅ Updated ${occupiedCount} units to occupied`);
    console.log(`  ✅ Updated ${availableCount} units to available`);

    console.log('\n✨ Database cleanup complete!\n');
    
    // Final summary
    const { data: finalProfiles } = await supabase
      .from('tenant_profiles')
      .select('id')
      .eq('account_id', accountId);

    const { data: finalProperties } = await supabase
      .from('properties')
      .select('id, name')
      .eq('account_id', accountId);

    const { data: finalUnits } = await supabase
      .from('units')
      .select('status')
      .eq('account_id', accountId);

    console.log('📊 Final Summary:');
    console.log(`   - ${finalProfiles?.length || 0} tenant profiles with risk scores`);
    console.log(`   - ${finalProperties?.length || 0} unique properties`);
    console.log(`   - ${finalUnits?.filter(u => u.status === 'occupied').length || 0} occupied units`);
    console.log(`   - ${finalUnits?.filter(u => u.status === 'available').length || 0} available units`);

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

fixDatabaseIssues();
