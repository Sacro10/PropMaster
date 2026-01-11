#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orgefuaujqiluulzhzeg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3OTY3MDgsImV4cCI6MjA4MzM3MjcwOH0.zmyhfXpctbya9vXUpPay-j96NkExVYJPFVdp3uIqr5I';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAPI() {
  console.log('🔍 Testing Showings API...\n');
  
  // First, get the user's account
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    console.log('❌ Not authenticated. Trying to sign in...\n');
    
    // Try to sign in (you need to provide credentials)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'nibabenjamen64@gmail.com',
      password: 'changeme123',
    });
    
    if (error) {
      console.error('❌ Sign in error:', error);
      return;
    }
    
    console.log('✅ Signed in as:', data.user.email);
  } else {
    console.log('✅ Already authenticated as:', user.email);
  }
  
  // Now test the API endpoint
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    console.error('❌ No session found');
    return;
  }
  
  const API_BASE = 'http://localhost:3001';
  
  console.log('\n📡 Calling /api/showings?status=scheduled,confirmed&limit=50...\n');
  
  const response = await fetch(`${API_BASE}/api/showings?status=scheduled,confirmed&limit=50`, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
  
  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));
  
  if (!response.ok) {
    const text = await response.text();
    console.error('❌ Error response:', text.substring(0, 500));
    return;
  }
  
  const result = await response.json();
  console.log('\n✅ API Response:');
  console.log('Total showings:', result.total);
  console.log('Showings array length:', result.showings?.length || 0);
  
  if (result.showings && result.showings.length > 0) {
    console.log('\nFirst showing:');
    console.log(JSON.stringify(result.showings[0], null, 2));
  } else {
    console.log('\n⚠️  No showings returned!');
  }
}

testAPI().catch(console.error);
