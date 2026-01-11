import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function removeUnknownTenants() {
  try {
    console.log('🔍 Finding "Unknown Tenant" records...\n');

    const accountId = 'ad20ed72-b46d-44f4-837c-0b7594465418';

    // Find all tenant profiles with "Unknown Tenant" name
    const { data: unknownTenants, error: findError } = await supabase
      .from('tenant_profiles')
      .select('id, user_id, full_name')
      .eq('account_id', accountId)
      .ilike('full_name', '%Unknown Tenant%');

    if (findError) {
      console.error('Error finding tenants:', findError);
      return;
    }

    if (!unknownTenants || unknownTenants.length === 0) {
      console.log('✅ No "Unknown Tenant" records found!');
      return;
    }

    console.log(`Found ${unknownTenants.length} "Unknown Tenant" record(s):\n`);
    unknownTenants.forEach(t => console.log(`  - ${t.full_name} (${t.id})`));

    const userIds = unknownTenants.map(t => t.user_id).filter(Boolean);
    const profileIds = unknownTenants.map(t => t.id);

    console.log('\n🗑️  Deleting related records...\n');

    // Delete leases (this will cascade to payments if configured)
    if (userIds.length > 0) {
      const { data: deletedLeases, error: leasesError } = await supabase
        .from('leases')
        .delete()
        .eq('account_id', accountId)
        .in('tenant_user_id', userIds)
        .select('id');

      if (leasesError) {
        console.error('  ❌ Error deleting leases:', leasesError.message);
      } else {
        console.log(`  ✅ Deleted ${deletedLeases?.length || 0} leases`);
      }
    }

    // Delete tenant profiles
    const { data: deletedProfiles, error: profilesError } = await supabase
      .from('tenant_profiles')
      .delete()
      .in('id', profileIds)
      .select('id');

    if (profilesError) {
      console.error('  ❌ Error deleting tenant profiles:', profilesError.message);
    } else {
      console.log(`  ✅ Deleted ${deletedProfiles?.length || 0} tenant profiles`);
    }

    console.log('\n✅ Cleanup complete!');

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

removeUnknownTenants();
