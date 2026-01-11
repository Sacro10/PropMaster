#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://orgefuaujqiluulzhzeg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjcwOCwiZXhwIjoyMDgzMzcyNzA4fQ.ycG37inQesKufMZ_sUhk_WwCjDna8LfMORe6XOCnu9Q';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'public' }
});

async function runSQL() {
  console.log('📝 Creating plan gating RPC functions...\n');
  
  const sql = readFileSync('fix-plan-gating.sql', 'utf-8');
  
  // Split by semicolon and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    if (statement.length < 10) continue;
    
    try {
      console.log('Executing statement...');
      const { data, error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        console.error('❌ Error:', error.message);
        // Try alternative method
        console.log('Trying alternative method...');
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ query: statement }),
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error('❌ HTTP Error:', response.status, text.substring(0, 200));
        }
      } else {
        console.log('✅ Success');
      }
    } catch (err) {
      console.error('❌ Exception:', err.message);
    }
  }
  
  console.log('\n✅ Done!');
}

runSQL().catch(console.error);
