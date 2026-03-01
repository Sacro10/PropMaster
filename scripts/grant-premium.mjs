import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/grant-premium.mjs <email>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in env.');
  console.error('Tip: node --env-file .env scripts/grant-premium.mjs <email>');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data: userResult, error: userError } = await supabase.auth.admin.getUserByEmail(email);
if (userError) {
  console.error('Failed to lookup user by email:', userError.message);
  process.exit(1);
}

const user = userResult?.user;
if (!user) {
  console.error(`No user found for email: ${email}`);
  process.exit(1);
}

const { data: memberships, error: membershipError } = await supabase
  .from('account_members')
  .select('account_id')
  .eq('user_id', user.id);

if (membershipError) {
  console.error('Failed to fetch account memberships:', membershipError.message);
  process.exit(1);
}

if (!memberships || memberships.length === 0) {
  console.error(`User ${email} has no account memberships.`);
  process.exit(1);
}

const accountIds = [...new Set(memberships.map((m) => m.account_id))];

const { error: accountUpdateError } = await supabase
  .from('accounts')
  .update({
    plan: 'premium',
    max_units: 999999,
    max_properties: 999999,
    updated_at: new Date().toISOString(),
  })
  .in('id', accountIds);

if (accountUpdateError) {
  console.error('Failed to update account plan:', accountUpdateError.message);
  process.exit(1);
}

const { error: profileUpsertError } = await supabase
  .from('user_profiles')
  .upsert(
    {
      id: user.id,
      email: user.email || email,
      subscription_tier: 'premium',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

if (profileUpsertError) {
  console.error('Failed to update user profile tier:', profileUpsertError.message);
  process.exit(1);
}

console.log(`Granted premium to ${email} on accounts: ${accountIds.join(', ')}`);
