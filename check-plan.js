#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orgefuaujqiluulzhzeg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjcwOCwiZXhwIjoyMDgzMzcyNzA4fQ.ycG37inQesKufMZ_sUhk_WwCjDna8LfMORe6XOCnu9Q';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkPlan() {
  console.log('🔍 Checking account plan and features...\n');
  
  // Get all accounts
  const { data: accounts, error: accError } = await supabase
    .from('accounts')
    .select('id, name, plan');

  if (accError) {
    console.error('❌ Error:', accError);
    return;
  }

  console.log(`Found ${accounts.length} accounts\n`);
  
  for (const account of accounts) {
    console.log(`Account: ${account.name} (${account.id})`);
    console.log(`  Plan: ${account.plan}`);
    
    // Check account features
    const { data: features, error: featError } = await supabase
      .from('account_features')
      .select('feature_code, enabled')
      .eq('account_id', account.id);
    
    if (featError) {
      console.log(`  ❌ Error getting features:`, featError.message);
    } else {
      console.log(`  Features (${features.length}):`);
      features.forEach(f => {
        if (f.enabled && (f.feature_code.includes('showing') || f.feature_code.includes('electronic'))) {
          console.log(`    ✅ ${f.feature_code}: ${f.enabled}`);
        }
      });
    }
    console.log('');
  }
}

checkPlan().catch(console.error);
