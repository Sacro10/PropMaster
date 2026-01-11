import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orgefuaujqiluulzhzeg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3OTY3MDgsImV4cCI6MjA4MzM3MjcwOH0.zmyhfXpctbya9vXUpPay-j96NkExVYJPFVdp3uIqr5I';

const email = process.env.EMAIL;
const password = process.env.PASSWORD;

if (!email || !password) {
  console.error('Missing EMAIL or PASSWORD env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const run = async () => {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    throw new Error(`Auth failed: ${authError.message}`);
  }

  const userId = authData.user.id;
  console.log('Signed in as:', authData.user.email);

  const { data: membership, error: membershipError } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', userId)
    .single();

  if (membershipError || !membership?.account_id) {
    throw new Error(membershipError?.message || 'No account membership found');
  }

  const accountId = membership.account_id;
  console.log('Account ID:', accountId);

  const { data: units, error: unitsError } = await supabase
    .from('units')
    .select('id, property_id')
    .eq('account_id', accountId)
    .limit(1);

  if (unitsError || !units?.length) {
    throw new Error(unitsError?.message || 'No units found');
  }

  const unit = units[0];
  const requestTitle = `Test Request ${Date.now()}`;

  const { data: createdRequest, error: requestError } = await supabase
    .from('maintenance_requests')
    .insert({
      account_id: accountId,
      created_by_user_id: userId,
      unit_id: unit.id,
      property_id: unit.property_id,
      title: requestTitle,
      description: 'Test request from verification script.',
      category: 'general',
      priority: 'normal',
    })
    .select('id, title')
    .single();

  if (requestError) {
    throw new Error(`Maintenance request insert failed: ${requestError.message}`);
  }

  console.log('Maintenance request created:', createdRequest.id);

  const vendorPayload = {
    account_id: accountId,
    user_id: userId,
    business_name: `Test Vendor ${Date.now()}`,
    contact_name: 'Test Contact',
    phone: '555-0101',
    email: `vendor+${Date.now()}@example.com`,
    address1: '123 Test St',
    city: 'Testville',
    state: 'TX',
    zip: '78701',
    is_active: true,
  };

  let vendorInsert = await supabase
    .from('vendor_profiles')
    .insert(vendorPayload)
    .select('id, business_name')
    .single();

  if (vendorInsert.error?.code === '42703') {
    delete vendorPayload.contact_name;
    vendorInsert = await supabase
      .from('vendor_profiles')
      .insert(vendorPayload)
      .select('id, business_name')
      .single();
  }

  if (vendorInsert.error) {
    throw new Error(`Vendor insert failed: ${vendorInsert.error.message}`);
  }

  const createdVendor = vendorInsert.data;
  console.log('Vendor created:', createdVendor.id);

  let servicesInsert = await supabase
    .from('vendor_services')
    .insert([{ account_id: accountId, vendor_profile_id: createdVendor.id, service_type: 'general' }]);

  if (servicesInsert.error?.code === '42703') {
    servicesInsert = await supabase
      .from('vendor_services')
      .insert([{ account_id: accountId, vendor_id: createdVendor.id, service_type: 'general' }]);
  }

  if (servicesInsert.error) {
    throw new Error(`Vendor services insert failed: ${servicesInsert.error.message}`);
  }

  console.log('Vendor services created');

  const { error: deleteRequestError } = await supabase
    .from('maintenance_requests')
    .delete()
    .eq('id', createdRequest.id);

  if (deleteRequestError) {
    console.error('Failed to delete maintenance request:', deleteRequestError.message);
  } else {
    console.log('Maintenance request cleanup: deleted');
  }

  const { error: deleteVendorError } = await supabase
    .from('vendor_profiles')
    .delete()
    .eq('id', createdVendor.id);

  if (deleteVendorError) {
    console.error('Failed to delete vendor:', deleteVendorError.message);
  } else {
    console.log('Vendor cleanup: deleted');
  }

  await supabase.auth.signOut();
};

run().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exit(1);
});
