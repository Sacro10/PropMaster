--- Sample Notifications for Testing
-- Add these sample notifications to test the notification system
-- Automatically uses the first account and first user from your database

INSERT INTO notifications (id, account_id, user_id, type, title, message, action_url, is_read, created_at)
SELECT
  gen_random_uuid(),
  (SELECT id FROM accounts LIMIT 1) AS account_id,
  (SELECT id FROM auth.users LIMIT 1) AS user_id,
  notif.type,
  notif.title,
  notif.message,
  notif.action_url,
  notif.is_read,
  notif.created_at
FROM (
  VALUES
    -- Payment notifications
    ('payment_received', 'Payment Received', 'Rent payment of $1,200 received from Unit 101', '/app/rent', false, NOW() - INTERVAL '5 minutes'),
    ('payment_due', 'Rent Payment Due', 'Rent payment for Unit 103 is due in 3 days ($1,500)', '/app/rent', false, NOW() - INTERVAL '1 hour'),

    -- Maintenance notifications
    ('maintenance_update', 'Maintenance Request Updated', 'AC repair for Unit 203 has been scheduled for tomorrow', '/app/maintenance', false, NOW() - INTERVAL '2 hours'),
    ('maintenance_update', 'Maintenance Completed', 'Bathroom light fixture replacement completed in Unit 102', '/app/maintenance', true, NOW() - INTERVAL '1 day'),

    -- Message notifications
    ('message', 'New Message from Tenant', 'Jennifer Martinez sent you a message about Unit 201', '/app/communication', false, NOW() - INTERVAL '30 minutes'),

    -- Lease notifications
    ('lease_expiring', 'Lease Expiring Soon', 'Lease for Unit 102 expires in 30 days', '/app/tenants', false, NOW() - INTERVAL '3 hours'),

    -- System notification
    ('system', 'System Update', 'New features added: Enhanced analytics dashboard', '/app/dashboard', true, NOW() - INTERVAL '2 days'),

    -- Announcement
    ('announcement', 'Welcome to PropMaster!', 'Thank you for choosing PropMaster for your property management needs', '/app/dashboard', true, NOW() - INTERVAL '5 days')
) AS notif(type, title, message, action_url, is_read, created_at);

SELECT 'Sample notifications created successfully!' AS status,
       (SELECT COUNT(*) FROM notifications) AS total_notifications,
       (SELECT COUNT(*) FROM notifications WHERE is_read = false) AS unread_notifications;
