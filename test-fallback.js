#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orgefuaujqiluulzhzeg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3OTY3MDgsImV4cCI6MjA4MzM3MjcwOH0.zmyhfXpctbya9vXUpPay-j96NkExVYJPFVdp3uIqr5I';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testFallback() {
  console.log('🔍 Testing plan fallback...\n');
  
  // Sign in
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'nibabenjamen64@gmail.com',
    password: 'changeme123',
  });
  
  if (error) {
    console.error('❌ Sign in error:', error);
    return;
  }
  
  console.log('✅ Signed in as:', data.user.email);
  console.log('User ID:', data.user.id);
  
  // Get user's account via account_members
  const { data: member, error: memberError } = await supabase
    .from('account_members')
    .select('account_id, accounts(plan)')
    .eq('user_id', data.user.id)
    .single();
  
  if (memberError) {
    console.error('❌ Error getting member:', memberError);
    return;
  }
  
  console.log('\n✅ Account member found:');
  console.log('Account ID:', member.account_id);
  console.log('Plan:', (member.accounts as any)?.plan);
  
  // Test RPC (should fail)
  console.log('\n🔍 Testing RPC (should fail)...');
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_check_feature', {
    p_feature_key: 'electronic_showings',
  });
  
  if (rpcError) {
    console.log('✅ RPC failed as expected:', rpcError.message);
  } else {
    console.log('⚠️  RPC succeeded (unexpected):', rpcData);
  }
}

testFallback().catch(console.error);
