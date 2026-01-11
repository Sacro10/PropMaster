#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orgefuaujqiluulzhzeg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjcwOCwiZXhwIjoyMDgzMzcyNzA4fQ.ycG37inQesKufMZ_sUhk_WwCjDna8LfMORe6XOCnu9Q';

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

async function checkShowings() {
  console.log('🔍 Checking showings in database...\n');
  
  // Get all showings
  const { data: showings, error } = await supabase
    .from('showings')
    .select(`
      id,
      account_id,
      unit_id,
      property_id,
      showing_date,
      scheduled_at,
      showing_type,
      visitor_name,
      status,
      created_at,
      units (
        id,
        unit_number,
        properties (
          id,
          name
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`Found ${showings.length} showings\n`);
  
  showings.slice(0, 10).forEach((showing, i) => {
    console.log(`${i + 1}. ${showing.visitor_name || 'Unknown'}`);
    console.log(`   Property: ${showing.units?.properties?.name || 'N/A'} #${showing.units?.unit_number || 'N/A'}`);
    console.log(`   showing_date: ${showing.showing_date}`);
    console.log(`   scheduled_at: ${showing.scheduled_at}`);
    console.log(`   Status: ${showing.status}`);
    console.log(`   Type: ${showing.showing_type}`);
    console.log('');
  });

  // Check accounts
  console.log('\n🔍 Checking accounts...\n');
  const { data: accounts, error: accountError } = await supabase
    .from('accounts')
    .select('id, business_name');

  if (accountError) {
    console.error('❌ Error:', accountError);
    return;
  }

  console.log(`Found ${accounts.length} accounts:`);
  accounts.forEach(acc => {
    console.log(`  - ${acc.business_name} (${acc.id})`);
  });
}

checkShowings().catch(console.error);
