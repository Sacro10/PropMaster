/**
 * Helper script to get account ID from the database
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function getAccountId() {
  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, name, plan, created_at')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw error;

    if (!accounts || accounts.length === 0) {
      console.log('❌ No accounts found in the database.');
      console.log('\nℹ️  You need to create an account first by:');
      console.log('   1. Sign up in the app at http://localhost:5173/signup');
      console.log('   2. Or create an account directly in Supabase dashboard');
      process.exit(1);
    }

    console.log('\n📋 Available Accounts:\n');
    accounts.forEach((account, index) => {
      console.log(`${index + 1}. ${account.name}`);
      console.log(`   ID: ${account.id}`);
      console.log(`   Plan: ${account.plan}`);
      console.log(`   Created: ${new Date(account.created_at).toLocaleDateString()}`);
      console.log('');
    });

    console.log('💡 To seed data for an account, run:');
    console.log(`   npx ts-node server/src/scripts/seedDemoData.ts ${accounts[0].id}`);
    console.log('');

    return accounts[0].id;
  } catch (error) {
    console.error('❌ Error fetching accounts:', error);
    process.exit(1);
  }
}

getAccountId();
