-- Check which tables exist in the database
SELECT
  table_name,
  table_type
FROM
  information_schema.tables
WHERE
  table_schema = 'public'
  AND table_name IN (
    'accounts',
    'activity_events',
    'hvac_delivery_batches',
    'message_templates',
    'automated_reminders',
    'reminder_schedules',
    'reminder_runs',
    'reminder_logs',
    'showings'
  )
ORDER BY
  table_name;
