#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orgefuaujqiluulzhzeg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjcwOCwiZXhwIjoyMDgzMzcyNzA4fQ.ycG37inQesKufMZ_sUhk_WwCjDna8LfMORe6XOCnu9Q';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkPermissions() {
  console.log('🔍 Checking user permissions...\n');
  
  // Get users
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email, role, account_id');

  if (userError) {
    console.error('❌ Error:', userError);
    return;
  }

  console.log(`Found ${users.length} users\n`);
  
  for (const user of users.slice(0, 3)) {
    console.log(`User: ${user.email}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Account ID: ${user.account_id}`);
    
    // Check role permissions for showings
    const { data: perms } = await supabase
      .from('role_permissions')
      .select('*')
      .or(`role.eq.${user.role},role.eq.*`)
      .or(`resource.eq.showings,resource.eq.*`)
      .or(`action.eq.read,action.eq.*`);
    
    console.log(`  Showings read permissions:`, perms);
    console.log('');
  }
  
  // Check if role_permissions table exists
  const { data: allPerms, error: permError } = await supabase
    .from('role_permissions')
    .select('*')
    .limit(10);

  if (permError) {
    console.error('\n❌ Error checking role_permissions:', permError);
    console.log('ℹ️  The role_permissions table might not exist');
  } else {
    console.log(`\n✅ Found ${allPerms.length} role permissions (showing first 10)`);
    allPerms.forEach(p => {
      console.log(`  - ${p.role} can ${p.action} ${p.resource}: ${p.allowed}`);
    });
  }
}

checkPermissions().catch(console.error);
