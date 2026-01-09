-- =====================================================
-- RENT COLLECTION SEED DATA
-- Add sample payment data for testing
-- =====================================================

DO $$
DECLARE
  v_account_id UUID;
  v_owner_entity_id UUID;
  v_lease_id UUID;
  v_tenant_user_id UUID;
  v_unit_id UUID;
  v_property_id UUID;
  v_payment_id UUID;
  i INT;
BEGIN
  -- Get the demo account (assuming it exists from previous migrations)
  SELECT id INTO v_account_id
  FROM accounts
  WHERE name = 'Acme Property Management'
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE NOTICE 'Demo account not found, skipping seed data';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding rent collection data for account: %', v_account_id;

  -- =====================================================
  -- CREATE OWNER ENTITY
  -- =====================================================

  INSERT INTO owner_entities (
    account_id,
    name,
    email,
    phone,
    entity_type,
    disbursement_method,
    disbursement_schedule,
    disbursement_day,
    management_fee_percentage,
    bank_account_last4,
    is_active
  )
  VALUES (
    v_account_id,
    'ABC Property Investors LLC',
    'owners@abcpropertyinvestors.com',
    '555-0123',
    'llc',
    'ach',
    'monthly',
    15,
    10.00,
    '4567',
    TRUE
  )
  RETURNING id INTO v_owner_entity_id;

  -- Link properties to owner
  INSERT INTO property_owners (property_id, owner_id, ownership_percentage)
  SELECT id, v_owner_entity_id, 100.00
  FROM properties
  WHERE account_id = v_account_id
  LIMIT 3;

  RAISE NOTICE 'Created owner entity: %', v_owner_entity_id;

  -- =====================================================
  -- CREATE REALISTIC PAYMENT DATA
  -- =====================================================

  -- Get a sample lease and tenant
  SELECT l.id, l.tenant_user_id, l.unit_id, u.property_id
  INTO v_lease_id, v_tenant_user_id, v_unit_id, v_property_id
  FROM leases l
  JOIN units u ON l.unit_id = u.id
  WHERE l.account_id = v_account_id
    AND l.status = 'active'
  LIMIT 1;

  IF v_lease_id IS NOT NULL THEN
    -- Create payments for last 6 months
    FOR i IN 0..5 LOOP
      -- Paid rent (on time)
      INSERT INTO payments (
        account_id,
        lease_id,
        tenant_user_id,
        unit_id,
        amount,
        payment_type,
        due_date,
        paid_at,
        status,
        payment_method,
        auto_pay_enabled
      )
      VALUES (
        v_account_id,
        v_lease_id,
        v_tenant_user_id,
        v_unit_id,
        1800.00 + (i * 10), -- Slight variation
        'rent',
        (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' * i + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
        (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' * i + INTERVAL '1 day')::TIMESTAMPTZ,
        'paid',
        'stripe',
        TRUE
      );
    END LOOP;

    -- Create current month's payment (pending)
    INSERT INTO payments (
      account_id,
      lease_id,
      tenant_user_id,
      unit_id,
      amount,
      payment_type,
      due_date,
      status,
      payment_method,
      auto_pay_enabled
    )
    VALUES (
      v_account_id,
      v_lease_id,
      v_tenant_user_id,
      v_unit_id,
      1850.00,
      'rent',
      (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
      'pending',
      'stripe',
      TRUE
    );

    RAISE NOTICE 'Created payment history for lease: %', v_lease_id;
  END IF;

  -- Create additional payments for other leases
  FOR v_lease_id, v_tenant_user_id, v_unit_id IN
    SELECT l.id, l.tenant_user_id, l.unit_id
    FROM leases l
    WHERE l.account_id = v_account_id
      AND l.status = 'active'
    LIMIT 5
    OFFSET 1
  LOOP
    -- Last month's payment (paid)
    INSERT INTO payments (
      account_id,
      lease_id,
      tenant_user_id,
      unit_id,
      amount,
      payment_type,
      due_date,
      paid_at,
      status,
      payment_method,
      auto_pay_enabled
    )
    VALUES (
      v_account_id,
      v_lease_id,
      v_tenant_user_id,
      v_unit_id,
      1500.00 + (random() * 500)::INT,
      'rent',
      (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::DATE,
      (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '2 days')::TIMESTAMPTZ,
      'paid',
      CASE (random() * 3)::INT
        WHEN 0 THEN 'stripe'
        WHEN 1 THEN 'ach'
        WHEN 2 THEN 'check'
        ELSE 'manual'
      END,
      (random() > 0.3)
    );

    -- Current month (some pending, some overdue)
    IF random() > 0.4 THEN
      INSERT INTO payments (
        account_id,
        lease_id,
        tenant_user_id,
        unit_id,
        amount,
        payment_type,
        due_date,
        status,
        payment_method,
        auto_pay_enabled
      )
      VALUES (
        v_account_id,
        v_lease_id,
        v_tenant_user_id,
        v_unit_id,
        1500.00 + (random() * 500)::INT,
        'rent',
        (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
        'pending',
        'stripe',
        (random() > 0.3)
      );
    ELSE
      -- Overdue payment (due 10 days ago)
      INSERT INTO payments (
        account_id,
        lease_id,
        tenant_user_id,
        unit_id,
        amount,
        payment_type,
        due_date,
        status,
        payment_method,
        late_fee_assessed,
        auto_pay_enabled
      )
      VALUES (
        v_account_id,
        v_lease_id,
        v_tenant_user_id,
        v_unit_id,
        1500.00 + (random() * 500)::INT,
        'rent',
        (CURRENT_DATE - INTERVAL '10 days')::DATE,
        'late',
        'manual',
        50.00,
        FALSE
      );
    END IF;
  END LOOP;

  RAISE NOTICE 'Created additional payment records';

  -- =====================================================
  -- CREATE PENDING DISBURSEMENT
  -- =====================================================

  -- Calculate last month's disbursement
  INSERT INTO owner_disbursements (
    account_id,
    owner_id,
    amount,
    period_start,
    period_end,
    status,
    payment_method,
    total_rent_collected,
    total_expenses,
    management_fee,
    net_amount,
    breakdown
  )
  SELECT
    v_account_id,
    v_owner_entity_id,
    0, -- Will be calculated
    (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE,
    (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::DATE,
    'pending',
    'ach',
    COALESCE(SUM(p.amount), 0),
    0, -- No expenses for now
    COALESCE(SUM(p.amount), 0) * 0.10, -- 10% management fee
    COALESCE(SUM(p.amount), 0) * 0.90,
    jsonb_build_object(
      'property_count', 3,
      'payment_count', COUNT(p.id)
    )
  FROM payments p
  WHERE p.account_id = v_account_id
    AND p.status = 'paid'
    AND p.payment_type = 'rent'
    AND p.paid_at >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')
    AND p.paid_at < DATE_TRUNC('month', CURRENT_DATE);

  -- Update amount field to match net_amount
  UPDATE owner_disbursements
  SET amount = net_amount
  WHERE account_id = v_account_id AND owner_id = v_owner_entity_id;

  RAISE NOTICE 'Created pending disbursement';

  -- =====================================================
  -- UPDATE LEASES WITH AUTO-PAY
  -- =====================================================

  UPDATE leases
  SET 
    auto_pay_enabled = TRUE,
    preferred_payment_day = 1
  WHERE account_id = v_account_id
    AND status = 'active'
    AND random() > 0.2; -- 80% have auto-pay enabled

  RAISE NOTICE 'Updated leases with auto-pay settings';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error seeding rent collection data: %', SQLERRM;
END $$;

-- =====================================================
-- VERIFY DATA
-- =====================================================

DO $$
DECLARE
  v_payment_count INT;
  v_owner_count INT;
  v_disbursement_count INT;
BEGIN
  SELECT COUNT(*) INTO v_payment_count FROM payments;
  SELECT COUNT(*) INTO v_owner_count FROM owner_entities;
  SELECT COUNT(*) INTO v_disbursement_count FROM owner_disbursements;

  RAISE NOTICE 'Seed data summary:';
  RAISE NOTICE '  - Total payments: %', v_payment_count;
  RAISE NOTICE '  - Total owner entities: %', v_owner_count;
  RAISE NOTICE '  - Total disbursements: %', v_disbursement_count;
END $$;
