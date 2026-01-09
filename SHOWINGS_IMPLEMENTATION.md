# Electronic Property Showings - Implementation Complete

## Overview
The Electronic Property Showings feature is now fully functional with KPI tracking, access code management, reminders, and background jobs.

## Database Schema

### Showings Table Enhancements
Migration: `005_showings_enhancements.sql`

**New Columns:**
- `showing_date` - Timestamp of the showing (replaces scheduled_at)
- `showing_type` - Type: 'self_guided', 'agent_assisted', 'virtual'
- `visitor_name` - Name of person visiting
- `visitor_email` - Email for confirmations/reminders
- `visitor_phone` - Phone for SMS reminders
- `access_code_expires_at` - Automatic expiration timestamp
- `reminder_sent_at` - Track when reminders were sent

**Functions:**
- `generate_showing_access_code()` - Generates unique 8-character alphanumeric codes
- `set_access_code_expiration()` - Trigger to auto-set expiration based on showing end time
- `expire_old_access_codes()` - Batch expire codes past their showing time

**View:**
- `showing_stats_by_account` - Pre-aggregated KPI metrics per account

## API Endpoints

### GET /api/showings
List all showings with filters
- Query params: `status`, `unitId`, `propertyId`, `startDate`, `endDate`, `limit`, `offset`
- Returns: `{ showings: Showing[], total: number }`

### POST /api/showings
Create a new showing
- Body: `{ unitId, showingDate, showingType, visitorName, visitorEmail, visitorPhone?, agentName?, notes? }`
- Returns: Created showing with auto-generated access code (for self-guided)

### PATCH /api/showings/:id/status
Update showing status
- Body: `{ status: 'scheduled'|'confirmed'|'completed'|'cancelled'|'no_show' }`

### GET /api/showings/stats
Get KPI statistics for dashboard
- Returns: `{ scheduled_today, total_this_week, avg_response_time, conversion_rate }`

### GET /api/showings/available-units
Get vacant units available for showing
- Returns: Array of units with property info

### POST /api/showings/:id/regenerate-code
Regenerate access code for a showing
- Returns: `{ accessCode, expiresAt }`
- Only for self-guided showings

### POST /api/showings/:id/send-reminder
Send showing reminder via email/SMS (stubbed)
- Logs activity event and updates `reminder_sent_at`
- Returns: `{ success: true, message }`

## KPI Definitions

### Scheduled Today
Count of showings with `showing_date` on current date and status in ['scheduled', 'confirmed']

### Total This Week
Count of showings with `showing_date` >= start of current week

### Avg Response Time
**Definition:** Average time from showing creation to showing date (in hours)
- Formula: `AVG(showing_date - created_at)` in hours
- Represents how quickly showings are being scheduled after request
- Lower is better (indicates faster response to inquiries)

### Conversion Rate
**Definition:** Percentage of completed showings that resulted in applications
- Formula: `(COUNT applications / COUNT completed showings) * 100`
- Uses `application_submitted` boolean flag on showings table
- Measures effectiveness of showings in converting to applications

## Access Code Management

### Generation
- Unique 8-character alphanumeric codes (uppercase)
- Generated via `generate_showing_access_code()` function
- Checks for uniqueness against non-expired codes
- Only for `showing_type = 'self_guided'`

### Expiration
- Auto-set via trigger: `showing_date + duration_minutes`
- Background job runs every 5 minutes to expire old codes
- Expired codes are set to NULL in database
- Cannot be used after expiration timestamp

### Regeneration
- Available via API endpoint
- Generates new unique code
- Updates expiration timestamp
- Logs activity event

## Background Jobs

### Access Code Expiration Job
- **File:** `server/src/jobs/accessCodeExpirationJob.ts`
- **Interval:** Every 5 minutes
- **Function:** Calls `expire_old_access_codes()` to clean up
- **Logging:** Reports count of expired codes

Registered in `server/src/jobs/index.ts`

## Reminder System

### Send Reminder
When triggered:
1. Verifies showing belongs to account (org scoping)
2. Updates `reminder_sent_at` timestamp
3. Logs `showing_reminder_sent` activity event with metadata:
   - visitor_name
   - visitor_email
   - showing_date
   - access_code
4. Console logs stub details for email/SMS implementation

### Activity Event Metadata
```json
{
  "entityType": "showing",
  "entityId": "showing-uuid",
  "metadata": {
    "visitor_name": "John Doe",
    "visitor_email": "john@example.com",
    "showing_date": "2026-01-10T14:00:00Z",
    "access_code": "ABC12345"
  }
}
```

## Frontend Integration

### PropertyShowings Component
**File:** `src/app/components/PropertyShowings.tsx`

**Features:**
- Real-time KPI cards from `/api/showings/stats`
- Upcoming showings list with access codes
- Send Reminder button (functional)
- 24/7 access status panel
- Available properties grid from `/api/showings/available-units`

**Hooks:**
- `useUpcomingShowings()` - Fetches and auto-refreshes
- `useShowingStats()` - Fetches KPIs
- `useAvailableProperties()` - Fetches vacant units
- `useCreateShowing()` - Create new showing
- `useUpdateShowingStatus()` - Update status

## Testing

### Test Coverage
**File:** `server/__tests__/services/showingsService.test.ts`

**Tests:**
1. ✅ Access code uniqueness
2. ✅ Access code expiry (via background job)
3. ✅ Reminder logs activity event
4. ✅ Organization scoping (verify unit belongs to account)
5. ✅ Self-guided vs agent-assisted showing types
6. ✅ Statistics calculation (manual and view-based)
7. ✅ Available units filtering

**Run tests:**
```bash
cd server
npm test -- showingsService.test.ts
```

## Security

### Organization Scoping
All endpoints verify:
1. User is authenticated (via `authenticate` middleware)
2. Showing/Unit belongs to user's account
3. RLS policies enforce account_id matching

### Permissions
- `Permissions.readShowings` - View showings
- `Permissions.createShowings` - Schedule new showings
- `Permissions.updateShowings` - Change status, regenerate codes, send reminders

## Usage Examples

### Schedule a Self-Guided Showing
```typescript
const showing = await createShowing({
  unit_id: 'unit-uuid',
  showing_date: '2026-01-10T14:00:00Z',
  showing_type: 'self_guided',
  visitor_name: 'Jane Doe',
  visitor_email: 'jane@example.com',
  visitor_phone: '555-1234',
  notes: 'First-time renter'
});

// Returns with access_code: 'ABC12345'
// access_code_expires_at: '2026-01-10T14:30:00Z' (14:00 + 30min default)
```

### Send Reminder
```typescript
await sendShowingReminder(showingId);
// Logs activity event
// Updates reminder_sent_at
// Console logs email/SMS stub
```

### Get Dashboard Stats
```typescript
const stats = await getShowingStats();
// {
//   scheduled_today: 5,
//   total_this_week: 12,
//   avg_response_time: '2.4', // hours
//   conversion_rate: '35' // percent
// }
```

## Future Enhancements

### Email/SMS Integration
Replace stub in `sendShowingReminder()` with:
- SendGrid for email
- Twilio for SMS
- Include access code, property details, directions

### Smart Lock Integration
- Add `lock_id` column to showings
- Integrate with August/Yale/Schlage APIs
- Auto-program codes based on showing schedule
- Revoke codes after expiration

### Analytics
- Conversion funnel: Views → Showings → Applications → Leases
- Popular showing times
- Agent performance metrics
- Property popularity rankings

## Migration Instructions

1. Run database migration:
```bash
supabase migration up
# or
psql -f supabase/migrations/005_showings_enhancements.sql
```

2. Restart backend server to register new job:
```bash
cd server
npm run dev
```

3. Verify job is running:
```
🚀 Starting background jobs...
📋 Registered job: access-code-expiration (interval: 300000ms)
✅ Started 5 background jobs
```

## Troubleshooting

### Access codes not expiring
- Check job is enabled in logs
- Verify `access_code_expires_at` is set correctly
- Manual run: `SELECT expire_old_access_codes();`

### Stats not showing
- Check view exists: `SELECT * FROM showing_stats_by_account WHERE account_id = 'your-id';`
- Fallback calculation runs if view fails
- Verify showing dates are in correct format

### Reminders not logging
- Check activity_events table for event_type = 'showing_reminder_sent'
- Verify user has update permissions
- Check showing belongs to account

## Documentation
- KPI definitions documented above
- Conversion rate uses application_submitted flag
- Response time = showing_date - created_at (hours)
