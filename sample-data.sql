-- Sample Data for Property Management Automation App
-- Run this in Supabase SQL Editor after running supabase-schema.sql
-- This creates realistic sample data for testing and development

-- Ensure UUID extensions are loaded
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CREATE SAMPLE ACCOUNTS
-- ============================================================================

-- Note: You'll need to create auth.users manually in Supabase Auth UI first
-- For this sample, we'll use placeholder UUIDs that you should replace with real auth user IDs

-- Sample Account 1: Sunshine Properties LLC
INSERT INTO accounts (id, name, plan, subscription_status, max_properties, max_units, billing_email)
VALUES
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'Sunshine Properties LLC', 'premium', 'active', 100, 500, 'billing@sunshineprops.com'),
  ('a2222222-2222-2222-2222-222222222222'::uuid, 'Urban Living Management', 'pro', 'active', 50, 200, 'admin@urbanliving.com'),
  ('a3333333-3333-3333-3333-333333333333'::uuid, 'Small Landlord Co', 'basic', 'active', 10, 50, 'owner@smalllandlord.com');

-- ============================================================================
-- 2. CREATE SAMPLE PROPERTIES
-- ============================================================================

INSERT INTO properties (id, account_id, name, address1, city, state, zip, property_type, year_built, total_units, purchase_price, current_value)
VALUES
  -- Sunshine Properties
  ('p1111111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Sunset Apartments', '123 Main Street', 'Austin', 'TX', '78701', 'residential', 2018, 12, 2500000, 2800000),
  ('p1111111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Downtown Plaza', '456 Commerce Ave', 'Austin', 'TX', '78702', 'commercial', 2015, 8, 3200000, 3500000),
  ('p1111111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Riverside Condos', '789 River Road', 'Austin', 'TX', '78704', 'residential', 2020, 24, 4800000, 5200000),

  -- Urban Living Management
  ('p2222222-1111-1111-1111-111111111111'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid, 'Metro Tower', '100 Urban Street', 'Houston', 'TX', '77001', 'residential', 2019, 30, 6000000, 6500000),
  ('p2222222-2222-2222-2222-222222222222'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid, 'Parkside Villas', '200 Park Lane', 'Houston', 'TX', '77002', 'residential', 2017, 16, 3400000, 3600000),

  -- Small Landlord Co
  ('p3333333-1111-1111-1111-111111111111'::uuid, 'a3333333-3333-3333-3333-333333333333'::uuid, 'Family Duplex', '50 Oak Street', 'Dallas', 'TX', '75201', 'residential', 2010, 2, 450000, 520000);

-- ============================================================================
-- 3. CREATE SAMPLE UNITS
-- ============================================================================

-- Sunset Apartments (12 units)
INSERT INTO units (id, account_id, property_id, unit_number, floor_number, bedrooms, bathrooms, sqft, rent_amount, deposit_amount, status, hvac_filter_size)
VALUES
  ('u1111111-0101-0101-0101-010101010101'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, '101', 1, 1, 1.0, 650, 1200, 1200, 'occupied', '16x25x1'),
  ('u1111111-0102-0102-0102-010201020102'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, '102', 1, 1, 1.0, 650, 1200, 1200, 'occupied', '16x25x1'),
  ('u1111111-0103-0103-0103-010301030103'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, '103', 1, 2, 1.5, 900, 1500, 1500, 'occupied', '20x25x1'),
  ('u1111111-0201-0201-0201-020102010201'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, '201', 2, 1, 1.0, 650, 1250, 1250, 'vacant', '16x25x1'),
  ('u1111111-0202-0202-0202-020202020202'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, '202', 2, 2, 2.0, 950, 1600, 1600, 'occupied', '20x25x1'),
  ('u1111111-0203-0203-0203-020302030203'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, '203', 2, 2, 2.0, 950, 1600, 1600, 'maintenance', '20x25x1'),

  -- Downtown Plaza (8 commercial units)
  ('u1111112-0101-0101-0101-010101010101'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-2222-2222-2222-222222222222'::uuid, 'Suite 101', 1, 0, 1.0, 1200, 3500, 7000, 'occupied', '20x20x1'),
  ('u1111112-0102-0102-0102-010201020102'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-2222-2222-2222-222222222222'::uuid, 'Suite 102', 1, 0, 2.0, 1800, 4200, 8400, 'occupied', '20x25x1'),
  ('u1111112-0201-0201-0201-020102010201'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-2222-2222-2222-222222222222'::uuid, 'Suite 201', 2, 0, 1.0, 1200, 3500, 7000, 'vacant', '20x20x1'),

  -- Riverside Condos (4 sample units)
  ('u1111113-0101-0101-0101-010101010101'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-3333-3333-3333-333333333333'::uuid, 'A101', 1, 2, 2.0, 1100, 1800, 1800, 'occupied', '20x25x1'),
  ('u1111113-0102-0102-0102-010201020102'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-3333-3333-3333-333333333333'::uuid, 'A102', 1, 3, 2.5, 1400, 2200, 2200, 'occupied', '20x25x1'),

  -- Metro Tower (4 sample units)
  ('u2222221-0101-0101-0101-010101010101'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid, 'p2222222-1111-1111-1111-111111111111'::uuid, '1001', 10, 2, 2.0, 1000, 1900, 1900, 'occupied', '20x25x1'),
  ('u2222221-0102-0102-0102-010201020102'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid, 'p2222222-1111-1111-1111-111111111111'::uuid, '1002', 10, 1, 1.0, 750, 1400, 1400, 'vacant', '16x25x1'),

  -- Family Duplex (2 units)
  ('u3333331-0001-0001-0001-000100010001'::uuid, 'a3333333-3333-3333-3333-333333333333'::uuid, 'p3333333-1111-1111-1111-111111111111'::uuid, 'Unit A', 1, 2, 2.0, 1200, 1350, 1350, 'occupied', '20x25x1'),
  ('u3333331-0002-0002-0002-000200020002'::uuid, 'a3333333-3333-3333-3333-333333333333'::uuid, 'p3333333-1111-1111-1111-111111111111'::uuid, 'Unit B', 1, 2, 2.0, 1200, 1350, 1350, 'vacant', '20x25x1');

-- ============================================================================
-- 4. CREATE SAMPLE VENDOR PROFILES
-- ============================================================================

INSERT INTO vendor_profiles (id, account_id, company_name, contact_name, phone, email, category, rating, is_active)
VALUES
  ('v1111111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Quick Fix Plumbing', 'John Smith', '512-555-0100', 'john@quickfixplumbing.com', 'plumbing', 4.8, true),
  ('v1111111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Elite Electric LLC', 'Sarah Johnson', '512-555-0200', 'sarah@eliteelectric.com', 'electrical', 4.9, true),
  ('v1111111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Cool Air HVAC', 'Mike Davis', '512-555-0300', 'mike@coolairhvac.com', 'hvac', 4.7, true),
  ('v1111111-4444-4444-4444-444444444444'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Pro Painters Inc', 'Lisa Brown', '512-555-0400', 'lisa@propainters.com', 'painting', 4.6, true),
  ('v2222222-1111-1111-1111-111111111111'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid, 'Houston Handyman Services', 'Tom Wilson', '713-555-0100', 'tom@houstonhandyman.com', 'general', 4.5, true);

-- ============================================================================
-- 5. CREATE SAMPLE MAINTENANCE REQUESTS
-- ============================================================================

INSERT INTO maintenance_requests (id, account_id, property_id, unit_id, title, description, category, priority, status, created_at)
VALUES
  ('m1111111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0101-0101-0101-010101010101'::uuid,
   'Leaking kitchen faucet', 'The kitchen faucet has been dripping for 3 days. Seems to be getting worse.',
   'plumbing', 'medium', 'open', NOW() - INTERVAL '2 days'),

  ('m1111111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0203-0203-0203-020302030203'::uuid,
   'AC not cooling properly', 'Air conditioner runs but room stays warm. Filter was changed last month.',
   'hvac', 'high', 'in_progress', NOW() - INTERVAL '1 day'),

  ('m1111111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0102-0102-0102-010201020102'::uuid,
   'Light fixture not working', 'Bathroom light fixture stopped working. May need new bulb or could be electrical issue.',
   'electrical', 'low', 'completed', NOW() - INTERVAL '5 days'),

  ('m2222222-1111-1111-1111-111111111111'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid, 'p2222222-1111-1111-1111-111111111111'::uuid, 'u2222221-0101-0101-0101-010101010101'::uuid,
   'Dishwasher not draining', 'Water pools at bottom after cycle completes. May be clogged drain.',
   'appliance', 'medium', 'open', NOW() - INTERVAL '3 hours');

-- ============================================================================
-- 6. CREATE SAMPLE MAINTENANCE ASSIGNMENTS
-- ============================================================================

INSERT INTO maintenance_assignments (id, account_id, maintenance_request_id, vendor_profile_id, assigned_date, scheduled_date, status)
VALUES
  ('ma111111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'm1111111-1111-1111-1111-111111111111'::uuid,
   'v1111111-1111-1111-1111-111111111111'::uuid, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 'scheduled'),

  ('ma111111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'm1111111-2222-2222-2222-222222222222'::uuid,
   'v1111111-3333-3333-3333-333333333333'::uuid, NOW() - INTERVAL '1 day', NOW(), 'in_progress'),

  ('ma111111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'm1111111-3333-3333-3333-333333333333'::uuid,
   'v1111111-2222-2222-2222-222222222222'::uuid, NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', 'completed');

-- ============================================================================
-- 7. CREATE SAMPLE PAYMENTS
-- ============================================================================

INSERT INTO payments (id, account_id, property_id, unit_id, payment_type, amount, status, payment_method, payment_date, due_date, description)
VALUES
  -- Current month rent payments
  ('pay11111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0101-0101-0101-010101010101'::uuid,
   'rent', 1200.00, 'completed', 'ach', DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '2 days', DATE_TRUNC('month', CURRENT_DATE), 'January 2026 Rent - Unit 101'),

  ('pay11111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0102-0102-0102-010201020102'::uuid,
   'rent', 1200.00, 'completed', 'credit_card', DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 day', DATE_TRUNC('month', CURRENT_DATE), 'January 2026 Rent - Unit 102'),

  ('pay11111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0103-0103-0103-010301030103'::uuid,
   'rent', 1500.00, 'pending', 'ach', NULL, DATE_TRUNC('month', CURRENT_DATE), 'January 2026 Rent - Unit 103'),

  ('pay11111-4444-4444-4444-444444444444'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0202-0202-0202-020202020202'::uuid,
   'rent', 1600.00, 'completed', 'ach', DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '3 days', DATE_TRUNC('month', CURRENT_DATE), 'January 2026 Rent - Unit 202'),

  -- Previous month payments
  ('pay11111-5555-5555-5555-555555555555'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0101-0101-0101-010101010101'::uuid,
   'rent', 1200.00, 'completed', 'ach', DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '28 days', DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month', 'December 2025 Rent - Unit 101'),

  -- Late payment
  ('pay11111-6666-6666-6666-666666666666'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0103-0103-0103-010301030103'::uuid,
   'late_fee', 50.00, 'completed', 'credit_card', DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '6 days', DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days', 'Late fee - January 2026'),

  -- Commercial rent
  ('pay11112-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-2222-2222-2222-222222222222'::uuid, 'u1111112-0101-0101-0101-010101010101'::uuid,
   'rent', 3500.00, 'completed', 'check', DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 day', DATE_TRUNC('month', CURRENT_DATE), 'January 2026 Rent - Suite 101');

-- ============================================================================
-- 8. CREATE SAMPLE EXPENSES
-- ============================================================================

INSERT INTO expense_categories (id, account_id, name, description, tax_deductible)
VALUES
  ('ec111111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Maintenance & Repairs', 'General property maintenance and repairs', true),
  ('ec111111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Utilities', 'Water, electric, gas, trash', true),
  ('ec111111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Property Tax', 'Annual property taxes', true),
  ('ec111111-4444-4444-4444-444444444444'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Insurance', 'Property and liability insurance', true),
  ('ec111111-5555-5555-5555-555555555555'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Supplies', 'Cleaning supplies, small tools, etc', true);

INSERT INTO expenses (id, account_id, property_id, category_id, vendor_profile_id, maintenance_request_id, amount, expense_date, description, payment_method)
VALUES
  ('exp11111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid,
   'ec111111-1111-1111-1111-111111111111'::uuid, 'v1111111-2222-2222-2222-222222222222'::uuid, 'm1111111-3333-3333-3333-333333333333'::uuid,
   75.00, NOW() - INTERVAL '4 days', 'Replaced bathroom light fixture', 'check'),

  ('exp11111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid,
   'ec111111-2222-2222-2222-222222222222'::uuid, NULL, NULL,
   450.00, NOW() - INTERVAL '10 days', 'Monthly water bill for Sunset Apartments', 'ach'),

  ('exp11111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid,
   'ec111111-5555-5555-5555-555555555555'::uuid, NULL, NULL,
   120.00, NOW() - INTERVAL '15 days', 'Cleaning supplies and equipment', 'credit_card');

-- ============================================================================
-- 9. CREATE SAMPLE SHOWINGS
-- ============================================================================

INSERT INTO showings (id, account_id, property_id, unit_id, scheduled_date, duration_minutes, status, visitor_name, visitor_email, visitor_phone, notes)
VALUES
  ('show1111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0201-0201-0201-020102010201'::uuid,
   NOW() + INTERVAL '2 days' + INTERVAL '2 hours', 30, 'scheduled', 'Jennifer Martinez', 'jennifer.m@email.com', '512-555-9001', 'First time renter, interested in 1BR'),

  ('show1111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0201-0201-0201-020102010201'::uuid,
   NOW() + INTERVAL '3 days' + INTERVAL '4 hours', 30, 'scheduled', 'David Kim', 'dkim@email.com', '512-555-9002', 'Moving from California'),

  ('show1111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p3333333-1111-1111-1111-111111111111'::uuid, 'u3333331-0002-0002-0002-000200020002'::uuid,
   NOW() - INTERVAL '2 days', 30, 'completed', 'Robert Taylor', 'rtaylor@email.com', '214-555-9003', 'Very interested, will apply'),

  ('show2222-1111-1111-1111-111111111111'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid, 'p2222222-1111-1111-1111-111111111111'::uuid, 'u2222221-0102-0102-0102-010201020102'::uuid,
   NOW() + INTERVAL '1 day' + INTERVAL '10 hours', 45, 'scheduled', 'Amanda Chen', 'achen@email.com', '713-555-9004', 'Prequalified, ready to move');

-- ============================================================================
-- 10. CREATE SAMPLE RENTAL APPLICATIONS
-- ============================================================================

INSERT INTO rental_applications (id, account_id, property_id, unit_id, applicant_name, applicant_email, applicant_phone,
  current_address, employment_status, employer_name, monthly_income, status, application_date, move_in_date)
VALUES
  ('app11111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0201-0201-0201-020102010201'::uuid,
   'Robert Taylor', 'rtaylor@email.com', '214-555-9003', '123 Old Street, Dallas, TX 75201',
   'employed', 'Tech Corp Inc', 4500.00, 'under_review', NOW() - INTERVAL '1 day', CURRENT_DATE + INTERVAL '30 days'),

  ('app11111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'p1111111-2222-2222-2222-222222222222'::uuid, 'u1111112-0201-0201-0201-020102010201'::uuid,
   'Maria Garcia', 'mgarcia@email.com', '512-555-9005', '456 Previous Ave, Austin, TX 78703',
   'employed', 'Design Studio LLC', 5200.00, 'approved', NOW() - INTERVAL '5 days', CURRENT_DATE + INTERVAL '15 days'),

  ('app22222-1111-1111-1111-111111111111'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid, 'p2222222-1111-1111-1111-111111111111'::uuid, 'u2222221-0102-0102-0102-010201020102'::uuid,
   'Amanda Chen', 'achen@email.com', '713-555-9004', '789 Current Blvd, Houston, TX 77003',
   'employed', 'Medical Center', 6500.00, 'pending', NOW() - INTERVAL '2 hours', CURRENT_DATE + INTERVAL '45 days');

-- ============================================================================
-- 11. CREATE SAMPLE HVAC SUBSCRIPTIONS
-- ============================================================================

INSERT INTO hvac_filter_subscriptions (id, account_id, unit_id, filter_size, filter_type, frequency, next_delivery_date, status)
VALUES
  ('hvac1111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0101-0101-0101-010101010101'::uuid,
   '16x25x1', 'standard', 'quarterly', CURRENT_DATE + INTERVAL '2 months', 'active'),

  ('hvac1111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0102-0102-0102-010201020102'::uuid,
   '16x25x1', 'standard', 'quarterly', CURRENT_DATE + INTERVAL '2 months', 'active'),

  ('hvac1111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0103-0103-0103-010301030103'::uuid,
   '20x25x1', 'pleated', 'quarterly', CURRENT_DATE + INTERVAL '2 months', 'active'),

  ('hvac1111-4444-4444-4444-444444444444'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'u1111111-0202-0202-0202-020202020202'::uuid,
   '20x25x1', 'allergen', 'quarterly', CURRENT_DATE + INTERVAL '2 months', 'active');

-- ============================================================================
-- 12. CREATE SAMPLE MESSAGE TEMPLATES
-- ============================================================================

INSERT INTO message_templates (id, account_id, name, category, subject, body, variables)
VALUES
  ('tmpl1111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Rent Payment Reminder', 'payment',
   'Rent Payment Reminder - {{unit_number}}',
   'Dear {{tenant_name}},\n\nThis is a friendly reminder that your rent payment of ${{rent_amount}} for {{unit_number}} is due on {{due_date}}.\n\nPlease submit your payment through the tenant portal or contact us if you have any questions.\n\nThank you!',
   ARRAY['tenant_name', 'unit_number', 'rent_amount', 'due_date']),

  ('tmpl1111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Maintenance Update', 'maintenance',
   'Maintenance Request Update - {{ticket_number}}',
   'Hello {{tenant_name}},\n\nYour maintenance request ({{ticket_number}}) has been updated.\n\nStatus: {{status}}\nScheduled Date: {{scheduled_date}}\n\nOur technician will contact you before arrival.\n\nBest regards',
   ARRAY['tenant_name', 'ticket_number', 'status', 'scheduled_date']),

  ('tmpl1111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'Welcome New Tenant', 'onboarding',
   'Welcome to {{property_name}}!',
   'Dear {{tenant_name}},\n\nWelcome to {{property_name}}! We are excited to have you as our new tenant in {{unit_number}}.\n\nYour move-in date is {{move_in_date}}. Please find attached important documents including your lease agreement and property guidelines.\n\nIf you have any questions, please don''t hesitate to reach out.\n\nWelcome home!',
   ARRAY['tenant_name', 'property_name', 'unit_number', 'move_in_date']);

-- ============================================================================
-- 13. CREATE SAMPLE ACTIVITY EVENTS
-- ============================================================================

INSERT INTO activity_events (id, account_id, event_type, entity_type, entity_id, summary, metadata)
VALUES
  ('evt11111-1111-1111-1111-111111111111'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'payment_received', 'payment', 'pay11111-1111-1111-1111-111111111111'::uuid,
   'Rent payment received for Unit 101', '{"amount": 1200, "method": "ach", "unit": "101"}'::jsonb),

  ('evt11111-2222-2222-2222-222222222222'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'maintenance_created', 'maintenance_request', 'm1111111-1111-1111-1111-111111111111'::uuid,
   'New maintenance request: Leaking kitchen faucet', '{"priority": "medium", "category": "plumbing", "unit": "101"}'::jsonb),

  ('evt11111-3333-3333-3333-333333333333'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'showing_scheduled', 'showing', 'show1111-1111-1111-1111-111111111111'::uuid,
   'Showing scheduled with Jennifer Martinez', '{"unit": "201", "date": "2026-01-11"}'::jsonb),

  ('evt11111-4444-4444-4444-444444444444'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid, 'application_submitted', 'rental_application', 'app11111-1111-1111-1111-111111111111'::uuid,
   'Application received from Robert Taylor', '{"unit": "201", "monthly_income": 4500}'::jsonb);

-- ============================================================================
-- SAMPLE DATA COMPLETE
-- ============================================================================

SELECT 'Sample data created successfully!' AS status,
       (SELECT COUNT(*) FROM accounts) AS accounts_count,
       (SELECT COUNT(*) FROM properties) AS properties_count,
       (SELECT COUNT(*) FROM units) AS units_count,
       (SELECT COUNT(*) FROM maintenance_requests) AS maintenance_count,
       (SELECT COUNT(*) FROM payments) AS payments_count,
       (SELECT COUNT(*) FROM showings) AS showings_count;
