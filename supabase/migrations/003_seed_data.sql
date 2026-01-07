-- =========================================
-- SEED DATA for Demo/Development
-- =========================================
-- This creates a complete demo account with:
-- - 1 Account (Demo Portfolio - Basic plan)
-- - 1 Property (Sunset Apartments)
-- - 2 Units (101 and 102)
-- - 1 Tenant (with active lease on Unit 101)
-- - 1 Vendor (HVAC specialist)
-- - 1 Maintenance Request (HVAC issue)
-- - 1 Payment (rent payment)
-- - Sample messages and notifications
--
-- NOTE: You must create auth.users first in Supabase Auth UI,
-- then update the user_id variables below with real UUIDs.
-- =========================================

do $$
declare
  -- REPLACE THESE WITH REAL AUTH.USERS IDS FROM SUPABASE AUTH
  v_owner_user_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;  -- Replace with real owner user ID
  v_tenant_user_id uuid := '00000000-0000-0000-0000-000000000002'::uuid; -- Replace with real tenant user ID
  v_vendor_user_id uuid := '00000000-0000-0000-0000-000000000003'::uuid; -- Replace with real vendor user ID

  -- Generated IDs (will be captured during inserts)
  v_account_id uuid;
  v_property_id uuid;
  v_unit_101_id uuid;
  v_unit_102_id uuid;
  v_lease_id uuid;
  v_tenant_profile_id uuid;
  v_vendor_profile_id uuid;
  v_maintenance_request_id uuid;
  v_payment_id uuid;
begin

  -- =========================================
  -- 1) CREATE DEMO ACCOUNT
  -- =========================================

  insert into accounts (name, plan, billing_email, max_properties, max_units, is_active)
  values (
    'Demo Portfolio LLC',
    'basic',
    'billing@demoportfolio.com',
    10,
    100,
    true
  )
  returning id into v_account_id;

  raise notice 'Created account: %', v_account_id;

  -- =========================================
  -- 2) CREATE ACCOUNT MEMBERS
  -- =========================================

  -- Owner
  insert into account_members (account_id, user_id, role, joined_at, is_active)
  values (
    v_account_id,
    v_owner_user_id,
    'owner',
    now(),
    true
  );

  -- Tenant (will be added to lease later)
  insert into account_members (account_id, user_id, role, joined_at, is_active)
  values (
    v_account_id,
    v_tenant_user_id,
    'tenant',
    now(),
    true
  );

  -- Vendor
  insert into account_members (account_id, user_id, role, joined_at, is_active)
  values (
    v_account_id,
    v_vendor_user_id,
    'vendor',
    now(),
    true
  );

  raise notice 'Created account members for owner, tenant, and vendor';

  -- =========================================
  -- 3) CREATE PROPERTY
  -- =========================================

  insert into properties (
    account_id,
    name,
    address1,
    address2,
    city,
    state,
    zip,
    property_type,
    year_built,
    total_units,
    purchase_price,
    current_value,
    manager_user_id
  )
  values (
    v_account_id,
    'Sunset Apartments',
    '123 Main Street',
    null,
    'Austin',
    'TX',
    '78701',
    'residential',
    2015,
    2,
    500000.00,
    600000.00,
    v_owner_user_id
  )
  returning id into v_property_id;

  raise notice 'Created property: %', v_property_id;

  -- =========================================
  -- 4) CREATE UNITS
  -- =========================================

  -- Unit 101 (will be occupied)
  insert into units (
    account_id,
    property_id,
    unit_number,
    floor_number,
    bedrooms,
    bathrooms,
    sqft,
    rent_amount,
    deposit_amount,
    status,
    hvac_filter_size,
    features
  )
  values (
    v_account_id,
    v_property_id,
    '101',
    1,
    2,
    2.0,
    1100,
    1800.00,
    1800.00,
    'occupied',
    '16x25x1',
    '["parking","balcony","dishwasher","washer_dryer"]'::jsonb
  )
  returning id into v_unit_101_id;

  -- Unit 102 (vacant)
  insert into units (
    account_id,
    property_id,
    unit_number,
    floor_number,
    bedrooms,
    bathrooms,
    sqft,
    rent_amount,
    deposit_amount,
    status,
    available_date,
    hvac_filter_size,
    features
  )
  values (
    v_account_id,
    v_property_id,
    '102',
    1,
    1,
    1.0,
    850,
    1400.00,
    1400.00,
    'vacant',
    current_date + interval '15 days',
    '16x20x1',
    '["parking","dishwasher"]'::jsonb
  )
  returning id into v_unit_102_id;

  raise notice 'Created units: % and %', v_unit_101_id, v_unit_102_id;

  -- =========================================
  -- 5) CREATE TENANT PROFILE
  -- =========================================

  insert into tenant_profiles (
    account_id,
    user_id,
    full_name,
    phone,
    email,
    emergency_contact_name,
    emergency_contact_phone,
    employer,
    employment_status,
    monthly_income,
    credit_score,
    background_check_status,
    ai_risk_score,
    move_in_date
  )
  values (
    v_account_id,
    v_tenant_user_id,
    'Sarah Johnson',
    '555-0123',
    'sarah.johnson@example.com',
    'Mike Johnson',
    '555-0124',
    'Tech Corp',
    'employed',
    5500.00,
    720,
    'approved',
    95,
    current_date - interval '6 months'
  )
  returning id into v_tenant_profile_id;

  raise notice 'Created tenant profile: %', v_tenant_profile_id;

  -- =========================================
  -- 6) CREATE LEASE FOR UNIT 101
  -- =========================================

  insert into leases (
    account_id,
    unit_id,
    tenant_user_id,
    lease_start,
    lease_end,
    rent,
    deposit,
    pet_deposit,
    parking_fee,
    late_fee_amount,
    grace_period_days,
    status,
    renewal_status,
    move_in_date
  )
  values (
    v_account_id,
    v_unit_101_id,
    v_tenant_user_id,
    current_date - interval '6 months',
    current_date + interval '6 months',
    1800.00,
    1800.00,
    0.00,
    0.00,
    75.00,
    5,
    'active',
    'pending',
    current_date - interval '6 months'
  )
  returning id into v_lease_id;

  raise notice 'Created lease: %', v_lease_id;

  -- =========================================
  -- 7) CREATE VENDOR PROFILE
  -- =========================================

  insert into vendor_profiles (
    account_id,
    user_id,
    business_name,
    phone,
    email,
    address1,
    city,
    state,
    zip,
    license_number,
    avg_rating,
    total_jobs_completed,
    on_time_completion_rate,
    is_active,
    is_verified,
    verified_at,
    preferred_contact_method
  )
  values (
    v_account_id,
    v_vendor_user_id,
    'Cool Air HVAC Services',
    '555-HVAC-01',
    'dispatch@coolair.com',
    '456 Service Road',
    'Austin',
    'TX',
    '78702',
    'HVAC-12345',
    4.8,
    127,
    96.5,
    true,
    true,
    now() - interval '90 days',
    'phone'
  )
  returning id into v_vendor_profile_id;

  raise notice 'Created vendor profile: %', v_vendor_profile_id;

  -- Add vendor services
  insert into vendor_services (account_id, vendor_profile_id, service_type, base_rate, emergency_rate)
  values
    (v_account_id, v_vendor_profile_id, 'hvac', 125.00, 200.00),
    (v_account_id, v_vendor_profile_id, 'appliance', 95.00, 150.00);

  -- Add vendor availability (Mon-Fri, 8am-5pm)
  insert into vendor_availability (account_id, vendor_profile_id, day_of_week, start_time, end_time, is_available, on_call)
  values
    (v_account_id, v_vendor_profile_id, 1, '08:00', '17:00', true, false), -- Monday
    (v_account_id, v_vendor_profile_id, 2, '08:00', '17:00', true, false), -- Tuesday
    (v_account_id, v_vendor_profile_id, 3, '08:00', '17:00', true, false), -- Wednesday
    (v_account_id, v_vendor_profile_id, 4, '08:00', '17:00', true, false), -- Thursday
    (v_account_id, v_vendor_profile_id, 5, '08:00', '17:00', true, false); -- Friday

  raise notice 'Added vendor services and availability';

  -- =========================================
  -- 8) CREATE MAINTENANCE REQUEST
  -- =========================================

  insert into maintenance_requests (
    account_id,
    unit_id,
    property_id,
    created_by_user_id,
    title,
    description,
    category,
    priority,
    status,
    entry_allowed,
    requested_at
  )
  values (
    v_account_id,
    v_unit_101_id,
    v_property_id,
    v_tenant_user_id,
    'Air Conditioning Not Cooling',
    'The AC has been running but not cooling the apartment. Temperature is set to 68°F but room temperature is staying around 78°F. Started noticing this issue yesterday evening.',
    'hvac',
    'high',
    'assigned',
    true,
    now() - interval '2 hours'
  )
  returning id into v_maintenance_request_id;

  raise notice 'Created maintenance request: %', v_maintenance_request_id;

  -- Create maintenance assignment
  insert into maintenance_assignments (
    account_id,
    request_id,
    vendor_profile_id,
    status,
    assigned_at,
    accepted_at
  )
  values (
    v_account_id,
    v_maintenance_request_id,
    v_vendor_profile_id,
    'accepted',
    now() - interval '1 hour',
    now() - interval '45 minutes'
  );

  -- Add maintenance update
  insert into maintenance_updates (
    account_id,
    request_id,
    user_id,
    update_type,
    message
  )
  values (
    v_account_id,
    v_maintenance_request_id,
    v_vendor_user_id,
    'comment',
    'I will be there tomorrow at 10am to diagnose the issue. Please ensure someone is available to grant access.'
  );

  raise notice 'Created maintenance assignment and update';

  -- =========================================
  -- 9) CREATE PAYMENT RECORD
  -- =========================================

  insert into payments (
    account_id,
    lease_id,
    tenant_user_id,
    unit_id,
    amount,
    payment_type,
    due_date,
    paid_at,
    status,
    payment_method
  )
  values (
    v_account_id,
    v_lease_id,
    v_tenant_user_id,
    v_unit_101_id,
    1800.00,
    'rent',
    date_trunc('month', current_date) + interval '1 month' - interval '1 day', -- Last day of current month
    date_trunc('month', current_date) + interval '1 day', -- First day of current month (paid early!)
    'paid',
    'stripe'
  )
  returning id into v_payment_id;

  -- Create next month's payment (pending)
  insert into payments (
    account_id,
    lease_id,
    tenant_user_id,
    unit_id,
    amount,
    payment_type,
    due_date,
    status,
    payment_method
  )
  values (
    v_account_id,
    v_lease_id,
    v_tenant_user_id,
    v_unit_101_id,
    1800.00,
    'rent',
    date_trunc('month', current_date) + interval '2 months' - interval '1 day', -- Last day of next month
    'pending',
    'stripe'
  );

  raise notice 'Created payment records';

  -- =========================================
  -- 10) CREATE MESSAGES
  -- =========================================

  insert into messages (
    account_id,
    from_user_id,
    to_user_id,
    unit_id,
    subject,
    body
  )
  values (
    v_account_id,
    v_owner_user_id,
    v_tenant_user_id,
    v_unit_101_id,
    'Welcome to Sunset Apartments!',
    'Hi Sarah, welcome to your new home! If you have any questions or concerns, please don''t hesitate to reach out. We''re here to help make your stay comfortable.'
  );

  insert into messages (
    account_id,
    from_user_id,
    to_user_id,
    unit_id,
    subject,
    body,
    is_read,
    read_at
  )
  values (
    v_account_id,
    v_tenant_user_id,
    v_owner_user_id,
    v_unit_101_id,
    'Re: Welcome to Sunset Apartments!',
    'Thank you! I love the apartment. I just submitted a maintenance request for the AC.',
    true,
    now() - interval '1 hour'
  );

  raise notice 'Created messages';

  -- =========================================
  -- 11) CREATE NOTIFICATIONS
  -- =========================================

  -- Notification for owner about payment received
  insert into notifications (
    account_id,
    user_id,
    type,
    title,
    message,
    action_url,
    related_entity_type,
    related_entity_id,
    payload,
    sent_via_email
  )
  values (
    v_account_id,
    v_owner_user_id,
    'payment_received',
    'Payment Received',
    'Rent payment of $1,800.00 received from Sarah Johnson for Unit 101',
    '/app/rent',
    'payment',
    v_payment_id,
    jsonb_build_object(
      'amount', 1800.00,
      'tenant_name', 'Sarah Johnson',
      'unit_number', '101'
    ),
    true
  );

  -- Notification for tenant about maintenance update
  insert into notifications (
    account_id,
    user_id,
    type,
    title,
    message,
    action_url,
    related_entity_type,
    related_entity_id,
    payload,
    is_read
  )
  values (
    v_account_id,
    v_tenant_user_id,
    'maintenance_update',
    'Maintenance Update',
    'Your HVAC maintenance request has been assigned to Cool Air HVAC Services',
    '/app/maintenance',
    'maintenance_request',
    v_maintenance_request_id,
    jsonb_build_object(
      'vendor_name', 'Cool Air HVAC Services',
      'scheduled_time', 'Tomorrow at 10am'
    ),
    false
  );

  raise notice 'Created notifications';

  -- =========================================
  -- 12) CREATE HVAC FILTER SUBSCRIPTION
  -- =========================================

  declare
    v_hvac_sub_id uuid;
  begin
    insert into hvac_filter_subscriptions (
      account_id,
      unit_id,
      filter_size,
      filter_type,
      quantity,
      frequency,
      next_delivery_date,
      status
    )
    values (
      v_account_id,
      v_unit_101_id,
      '16x25x1',
      'pleated',
      2,
      'monthly',
      current_date + interval '15 days',
      'active'
    )
    returning id into v_hvac_sub_id;

    -- Create upcoming delivery
    insert into hvac_filter_deliveries (
      account_id,
      subscription_id,
      scheduled_for,
      status,
      carrier
    )
    values (
      v_account_id,
      v_hvac_sub_id,
      current_date + interval '15 days',
      'scheduled',
      'USPS'
    );

    raise notice 'Created HVAC filter subscription and delivery';
  end;

  -- =========================================
  -- 13) CREATE SAMPLE SHOWING (for Unit 102)
  -- =========================================

  insert into showings (
    account_id,
    property_id,
    unit_id,
    scheduled_at,
    duration_minutes,
    applicant_name,
    applicant_email,
    applicant_phone,
    status,
    access_method,
    access_code
  )
  values (
    v_account_id,
    v_property_id,
    v_unit_102_id,
    current_date + interval '3 days' + interval '14 hours', -- 2pm, 3 days from now
    30,
    'Michael Chen',
    'mchen@example.com',
    '555-0199',
    'scheduled',
    'lockbox',
    '1234'
  );

  raise notice 'Created showing for Unit 102';

  -- =========================================
  -- 14) CREATE AUDIT LOG ENTRY
  -- =========================================

  insert into audit_log (
    account_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    changes,
    metadata
  )
  values (
    v_account_id,
    v_owner_user_id,
    'account',
    v_account_id,
    'create',
    jsonb_build_object('plan', 'basic'),
    jsonb_build_object('source', 'seed_data', 'timestamp', now())
  );

  raise notice 'Created audit log entry';

  -- =========================================
  -- SUMMARY
  -- =========================================

  raise notice '========================================';
  raise notice 'SEED DATA COMPLETE!';
  raise notice '========================================';
  raise notice 'Account ID: %', v_account_id;
  raise notice 'Property ID: %', v_property_id;
  raise notice 'Unit 101 ID: %', v_unit_101_id;
  raise notice 'Unit 102 ID: %', v_unit_102_id;
  raise notice 'Lease ID: %', v_lease_id;
  raise notice 'Maintenance Request ID: %', v_maintenance_request_id;
  raise notice '========================================';
  raise notice 'Demo Data Created:';
  raise notice '- 1 Account (Demo Portfolio - Basic Plan)';
  raise notice '- 3 Users (Owner, Tenant, Vendor)';
  raise notice '- 1 Property (Sunset Apartments)';
  raise notice '- 2 Units (101 occupied, 102 vacant)';
  raise notice '- 1 Active Lease';
  raise notice '- 1 Tenant Profile';
  raise notice '- 1 Vendor Profile with Services';
  raise notice '- 1 Maintenance Request (HVAC)';
  raise notice '- 2 Payment Records';
  raise notice '- 2 Messages';
  raise notice '- 2 Notifications';
  raise notice '- 1 HVAC Filter Subscription';
  raise notice '- 1 Property Showing';
  raise notice '========================================';

end $$;
