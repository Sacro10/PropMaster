import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const accountId = 'ad20ed72-b46d-44f4-837c-0b7594465418';
  
  // Get all profiles
  const { data: profiles } = await supabase
    .from('tenant_profiles')
    .select('id, user_id, full_name, ai_risk_score')
    .eq('account_id', accountId);
  
  console.log('All profiles:');
  profiles?.forEach(p => console.log(`  ${p.full_name}: ${p.user_id} -> Risk=${p.ai_risk_score}`));
  
  // Get all leases
  const { data: leases } = await supabase
    .from('leases')
    .select('id, tenant_user_id, status, unit_id')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(3);
  
  console.log('\nFirst 3 active leases:');
  leases?.forEach(l => console.log(`  Lease ${l.id.slice(0,8)}...: ${l.tenant_user_id}`));
  
  // Now actually update them
  if (profiles && leases && profiles.length >= 3 && leases.length >= 3) {
    console.log('\nUpdating leases...');
    for (let i = 0; i < 3; i++) {
      const { error } = await supabase
        .from('leases')
        .update({ tenant_user_id: profiles[i].user_id })
        .eq('id', leases[i].id);
      
      if (!error) {
        console.log(`  ✅ Lease ${i+1} -> ${profiles[i].full_name}`);
      } else {
        console.error(`  ❌ Error:`, error.message);
      }
    }
    
    // Verify
    console.log('\nVerifying...');
    const { data: updated } = await supabase
      .from('leases')
      .select(`
        id,
        tenant_user_id,
        units!inner(unit_number)
      `)
      .eq('account_id', accountId)
      .eq('status', 'active')
      .in('tenant_user_id', profiles.map(p => p.user_id));
    
    console.log(`\n✅ Found ${updated?.length} updated leases with tenant profiles`);
  }
})();
