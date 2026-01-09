-- Sample Notifications for Testing
-- Add these sample notifications to test the notification system
-- Automatically uses the first user from auth.users table

INSERT INTO notifications (id, account_id, user_id, type, title, message, action_url, is_read, created_at)
VALUES
  -- Payment notifications
  ('a0000001-0001-0001-0001-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   (SELECT id FROM auth.users LIMIT 1),
   'payment_received',
   'Payment Received',
   'Rent payment of $1,200 received from Unit 101',
   '/app/rent',
   false,
   NOW() - INTERVAL '5 minutes'),

  ('a0000001-0001-0001-0001-000000000002'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   (SELECT id FROM auth.users LIMIT 1),
   'payment_due',
   'Rent Payment Due',
   'Rent payment for Unit 103 is due in 3 days ($1,500)',
   '/app/rent',
   false,
   NOW() - INTERVAL '1 hour'),

  -- Maintenance notifications
  ('a0000001-0001-0001-0001-000000000003'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   (SELECT id FROM auth.users LIMIT 1),
   'maintenance_update',
   'Maintenance Request Updated',
   'AC repair for Unit 203 has been scheduled for tomorrow',
   '/app/maintenance',
   false,
   NOW() - INTERVAL '2 hours'),

  ('a0000001-0001-0001-0001-000000000004'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   (SELECT id FROM auth.users LIMIT 1),
   'maintenance_update',
   'Maintenance Completed',
   'Bathroom light fixture replacement completed in Unit 102',
   '/app/maintenance',
   true,
   NOW() - INTERVAL '1 day'),

  -- Message notifications
  ('a0000001-0001-0001-0001-000000000005'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   (SELECT id FROM auth.users LIMIT 1),
   'message',
   'New Message from Tenant',
   'Jennifer Martinez sent you a message about Unit 201',
   '/app/communication',
   false,
   NOW() - INTERVAL '30 minutes'),

  -- Lease notifications
  ('a0000001-0001-0001-0001-000000000006'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   (SELECT id FROM auth.users LIMIT 1),
   'lease_expiring',
   'Lease Expiring Soon',
   'Lease for Unit 102 expires in 30 days',
   '/app/tenants',
   false,
   NOW() - INTERVAL '3 hours'),

  -- System notification
  ('a0000001-0001-0001-0001-000000000007'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   (SELECT id FROM auth.users LIMIT 1),
   'system',
   'System Update',
   'New features added: Enhanced analytics dashboard',
   '/app/dashboard',
   true,
   NOW() - INTERVAL '2 days'),

  -- Announcement
  ('a0000001-0001-0001-0001-000000000008'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   (SELECT id FROM auth.users LIMIT 1),
   'announcement',
   'Welcome to PropMaster!',
   'Thank you for choosing PropMaster for your property management needs',
   '/app/dashboard',
   true,
   NOW() - INTERVAL '5 days');

SELECT 'Sample notifications created successfully!' AS status,
       (SELECT COUNT(*) FROM notifications) AS total_notifications,
       (SELECT COUNT(*) FROM notifications WHERE is_read = false) AS unread_notifications;
