-- =========================================
-- Communication Portal Enhancement
-- =========================================
-- This migration adds:
-- - Conversations table for thread management
-- - Message templates for quick responses
-- - Automated reminders configuration
-- - Satisfaction tracking (CSAT scores)
-- - Outbound message tracking

-- =========================================
-- 1) CONVERSATIONS
-- =========================================

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  
  -- Conversation context
  subject text,
  participants uuid[] not null default '{}',
  
  -- Related entities
  property_id uuid references properties(id) on delete set null,
  unit_id uuid references units(id) on delete set null,
  related_type text check (related_type in ('lease', 'maintenance', 'showing', 'payment', 'general')),
  related_id uuid,
  
  -- Status
  status text not null default 'active' check (status in ('active', 'resolved', 'archived')),
  
  -- Timestamps
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_conversations_account on conversations(account_id);
create index idx_conversations_status on conversations(account_id, status);
create index idx_conversations_participants on conversations using gin(participants);
create index idx_conversations_last_message on conversations(account_id, last_message_at desc);

-- Update messages table to link to conversations
alter table messages add column if not exists conversation_id uuid references conversations(id) on delete set null;
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

-- =========================================
-- 2) MESSAGE TEMPLATES
-- =========================================

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  
  -- Template info
  name text not null,
  category text not null check (category in ('payment', 'maintenance', 'lease', 'onboarding', 'general')),
  
  -- Content
  subject text,
  body text not null,
  
  -- Variables that can be replaced (e.g., {{tenant_name}}, {{property_address}})
  variables text[] default '{}',
  
  -- Usage tracking
  usage_count int not null default 0,
  
  -- Status
  is_active boolean not null default true,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_templates_account on message_templates(account_id);
create index idx_templates_category on message_templates(account_id, category, is_active);

-- =========================================
-- 3) AUTOMATED REMINDERS
-- =========================================

create table if not exists automated_reminders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  
  -- Reminder configuration
  reminder_type text not null check (reminder_type in ('rent_due', 'lease_renewal', 'hvac_filter', 'property_inspection', 'custom')),
  name text not null,
  
  -- Scheduling
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'custom')),
  custom_schedule text, -- cron expression for custom frequency
  
  -- Timing
  next_send_date timestamptz not null,
  last_sent_date timestamptz,
  
  -- Template
  template_id uuid references message_templates(id) on delete set null,
  message_subject text not null,
  message_body text not null,
  
  -- Recipients (filter criteria in JSON)
  recipient_filter jsonb default '{}'::jsonb,
  recipient_count int not null default 0,
  
  -- Status
  status text not null default 'active' check (status in ('active', 'paused', 'inactive')),
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_reminders_account on automated_reminders(account_id);
create index idx_reminders_next_send on automated_reminders(account_id, status, next_send_date);

-- =========================================
-- 4) REMINDER EXECUTION LOGS
-- =========================================

create table if not exists reminder_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  reminder_id uuid not null references automated_reminders(id) on delete cascade,
  
  -- Execution details
  executed_at timestamptz not null default now(),
  recipients_count int not null default 0,
  messages_sent int not null default 0,
  messages_failed int not null default 0,
  
  -- Status
  status text not null check (status in ('success', 'partial', 'failed')),
  error_message text,
  
  -- Execution metadata
  execution_duration_ms int,
  
  created_at timestamptz not null default now()
);

create index idx_reminder_logs_reminder on reminder_logs(reminder_id, executed_at desc);
create index idx_reminder_logs_account on reminder_logs(account_id, executed_at desc);

-- =========================================
-- 5) OUTBOUND MESSAGES
-- =========================================

create table if not exists outbound_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  
  -- Message details
  message_id uuid references messages(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  reminder_id uuid references automated_reminders(id) on delete set null,
  
  -- Recipient
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text,
  recipient_phone text,
  
  -- Content
  subject text,
  body text not null,
  
  -- Delivery channels
  channel text not null check (channel in ('email', 'sms', 'push', 'in_app')),
  
  -- Status
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  
  -- Provider details (email service, SMS gateway, etc.)
  provider text,
  provider_message_id text,
  provider_response jsonb,
  
  -- Timestamps
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  
  -- Error tracking
  error_message text,
  retry_count int not null default 0,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_outbound_account on outbound_messages(account_id);
create index idx_outbound_status on outbound_messages(account_id, status);
create index idx_outbound_recipient on outbound_messages(recipient_user_id);
create index idx_outbound_message on outbound_messages(message_id);

-- =========================================
-- 6) CONVERSATION SATISFACTION
-- =========================================

create table if not exists conversation_satisfaction (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  
  -- Satisfaction score
  rating int check (rating in (1, -1)), -- 1 = thumbs up, -1 = thumbs down
  
  -- Feedback
  feedback_text text,
  
  -- Who rated
  rated_by_user_id uuid not null references auth.users(id) on delete cascade,
  
  -- Timestamp
  rated_at timestamptz not null default now(),
  
  unique(conversation_id, rated_by_user_id)
);

create index idx_satisfaction_account on conversation_satisfaction(account_id);
create index idx_satisfaction_conversation on conversation_satisfaction(conversation_id);
create index idx_satisfaction_rating on conversation_satisfaction(account_id, rated_at desc);

-- =========================================
-- 7) FUNCTIONS FOR STATS CALCULATION
-- =========================================

-- Function to calculate average response time
create or replace function calculate_avg_response_time(p_account_id uuid, p_days int default 30)
returns numeric as $$
declare
  v_avg_minutes numeric;
begin
  -- Calculate average time between tenant message and manager reply
  with tenant_messages as (
    select 
      m.id,
      m.conversation_id,
      m.created_at,
      m.from_user_id,
      u.role
    from messages m
    join auth.users u on u.id = m.from_user_id
    where m.account_id = p_account_id
      and m.created_at >= now() - interval '1 day' * p_days
      and u.role = 'tenant'
  ),
  manager_replies as (
    select 
      m.id,
      m.conversation_id,
      m.created_at,
      m.from_user_id,
      u.role
    from messages m
    join auth.users u on u.id = m.from_user_id
    where m.account_id = p_account_id
      and m.created_at >= now() - interval '1 day' * p_days
      and u.role in ('owner', 'manager', 'staff')
  ),
  response_times as (
    select 
      tm.conversation_id,
      tm.created_at as tenant_msg_time,
      min(mr.created_at) as manager_reply_time,
      extract(epoch from (min(mr.created_at) - tm.created_at)) / 60.0 as response_minutes
    from tenant_messages tm
    join manager_replies mr on mr.conversation_id = tm.conversation_id 
      and mr.created_at > tm.created_at
    group by tm.id, tm.conversation_id, tm.created_at
  )
  select round(avg(response_minutes), 1)
  into v_avg_minutes
  from response_times;
  
  return coalesce(v_avg_minutes, 0);
end;
$$ language plpgsql;

-- Function to update conversation's last_message_at
create or replace function update_conversation_last_message()
returns trigger as $$
begin
  if NEW.conversation_id is not null then
    update conversations
    set last_message_at = NEW.created_at,
        updated_at = now()
    where id = NEW.conversation_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger messages_update_conversation
  after insert on messages
  for each row
  execute function update_conversation_last_message();

-- =========================================
-- 8) RLS POLICIES
-- =========================================

alter table conversations enable row level security;
alter table message_templates enable row level security;
alter table automated_reminders enable row level security;
alter table reminder_logs enable row level security;
alter table outbound_messages enable row level security;
alter table conversation_satisfaction enable row level security;

-- Conversations: Users can see conversations they're part of
create policy "conversations_select_participant"
on conversations for select
using (
  account_id in (select account_id from user_profiles where user_id = auth.uid())
  and auth.uid() = any(participants)
);

-- Conversations: Staff can insert
create policy "conversations_insert_staff"
on conversations for insert
with check (
  account_id in (
    select account_id from user_profiles 
    where user_id = auth.uid() 
    and role in ('owner', 'manager', 'staff')
  )
);

-- Conversations: Staff can update
create policy "conversations_update_staff"
on conversations for update
using (
  account_id in (
    select account_id from user_profiles 
    where user_id = auth.uid() 
    and role in ('owner', 'manager', 'staff')
  )
);

-- Message Templates: View active templates
create policy "templates_select_member"
on message_templates for select
using (
  account_id in (select account_id from user_profiles where user_id = auth.uid())
  and is_active = true
);

-- Message Templates: Staff can manage
create policy "templates_all_staff"
on message_templates for all
using (
  account_id in (
    select account_id from user_profiles 
    where user_id = auth.uid() 
    and role in ('owner', 'manager', 'staff')
  )
);

-- Automated Reminders: Staff only
create policy "reminders_all_staff"
on automated_reminders for all
using (
  account_id in (
    select account_id from user_profiles 
    where user_id = auth.uid() 
    and role in ('owner', 'manager', 'staff')
  )
);

-- Reminder Logs: Staff can view
create policy "reminder_logs_select_staff"
on reminder_logs for select
using (
  account_id in (
    select account_id from user_profiles 
    where user_id = auth.uid() 
    and role in ('owner', 'manager', 'staff')
  )
);

-- Outbound Messages: View own messages
create policy "outbound_select_own"
on outbound_messages for select
using (
  account_id in (select account_id from user_profiles where user_id = auth.uid())
  and (recipient_user_id = auth.uid() or account_id in (
    select account_id from user_profiles 
    where user_id = auth.uid() 
    and role in ('owner', 'manager', 'staff')
  ))
);

-- Satisfaction: Users can rate conversations they're in
create policy "satisfaction_insert_participant"
on conversation_satisfaction for insert
with check (
  rated_by_user_id = auth.uid()
  and conversation_id in (
    select id from conversations 
    where auth.uid() = any(participants)
  )
);

-- Satisfaction: View own ratings
create policy "satisfaction_select_own"
on conversation_satisfaction for select
using (
  rated_by_user_id = auth.uid()
  or account_id in (
    select account_id from user_profiles 
    where user_id = auth.uid() 
    and role in ('owner', 'manager', 'staff')
  )
);

-- =========================================
-- 9) SEED INITIAL DATA
-- =========================================

-- Create default message templates
do $$
declare
  v_account_id uuid;
begin
  -- Get first account (for demo purposes)
  select id into v_account_id from accounts limit 1;
  
  if v_account_id is not null then
    insert into message_templates (account_id, name, category, subject, body, variables) values
    (v_account_id, 'Rent Reminder', 'payment', 'Rent Payment Due', 'Hi {{tenant_name}},\n\nThis is a friendly reminder that your rent payment of ${{rent_amount}} is due on {{due_date}}.\n\nThank you!', ARRAY['tenant_name', 'rent_amount', 'due_date']),
    (v_account_id, 'Maintenance Confirmation', 'maintenance', 'Maintenance Request Received', 'Hi {{tenant_name}},\n\nWe''ve received your maintenance request for {{issue_description}}. We''ll review it and get back to you shortly.\n\nRequest ID: {{request_id}}', ARRAY['tenant_name', 'issue_description', 'request_id']),
    (v_account_id, 'Lease Renewal Offer', 'lease', 'Lease Renewal Available', 'Hi {{tenant_name}},\n\nYour lease is expiring on {{lease_end_date}}. We''d love to have you stay! Please let us know if you''d like to renew.\n\nCurrent rent: ${{current_rent}}', ARRAY['tenant_name', 'lease_end_date', 'current_rent']),
    (v_account_id, 'Welcome Message', 'onboarding', 'Welcome to Your New Home!', 'Hi {{tenant_name}},\n\nWelcome! We''re excited to have you at {{property_address}}. If you need anything, don''t hesitate to reach out.\n\nBest regards,\n{{manager_name}}', ARRAY['tenant_name', 'property_address', 'manager_name']);
    
    -- Create default automated reminders
    insert into automated_reminders (
      account_id, 
      reminder_type, 
      name, 
      frequency, 
      next_send_date, 
      message_subject, 
      message_body, 
      recipient_count
    ) values
    (v_account_id, 'rent_due', 'Monthly Rent Reminder', 'monthly', date_trunc('month', now()) + interval '1 month' - interval '3 days', 'Rent Payment Due Soon', 'Your rent payment is due in 3 days. Please submit your payment to avoid late fees.', 0),
    (v_account_id, 'hvac_filter', 'HVAC Filter Delivery', 'monthly', date_trunc('month', now()) + interval '1 month', 'HVAC Filter Delivery Schedule', 'Your monthly HVAC filter will be delivered soon. Please ensure you replace it to maintain air quality.', 0),
    (v_account_id, 'property_inspection', 'Quarterly Property Inspection', 'quarterly', date_trunc('quarter', now()) + interval '3 months', 'Upcoming Property Inspection', 'We''ll be conducting our quarterly property inspection soon. We''ll contact you to schedule a convenient time.', 0);
  end if;
end $$;

-- Update existing messages to have conversation_id
do $$
declare
  v_msg record;
  v_conv_id uuid;
begin
  for v_msg in 
    select distinct 
      m.account_id,
      m.from_user_id,
      m.to_user_id,
      m.property_id,
      m.unit_id
    from messages m
    where m.conversation_id is null
      and m.to_user_id is not null
  loop
    -- Create conversation for each unique pair
    insert into conversations (account_id, participants, property_id, unit_id, status, created_at)
    values (
      v_msg.account_id,
      ARRAY[v_msg.from_user_id, v_msg.to_user_id],
      v_msg.property_id,
      v_msg.unit_id,
      'active',
      now()
    )
    returning id into v_conv_id;
    
    -- Update messages
    update messages
    set conversation_id = v_conv_id
    where account_id = v_msg.account_id
      and from_user_id = v_msg.from_user_id
      and to_user_id = v_msg.to_user_id
      and conversation_id is null;
  end loop;
end $$;
