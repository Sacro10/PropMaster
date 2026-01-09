# Rent Collection - Quick Start & Testing Guide

## Prerequisites
- PostgreSQL database with Supabase migrations applied
- Backend server running on port 3001
- Frontend development server running

## Setup Steps

### 1. Run Database Migration
```bash
# Navigate to project root
cd "/Users/sacro/Documents/Property Management Automation App"

# Run migration 006
psql $DATABASE_URL -f supabase/migrations/006_rent_collection_enhancements.sql

# Verify tables created
psql $DATABASE_URL -c "\dt owner_entities"
psql $DATABASE_URL -c "\dt disbursements"
```

### 2. Start Backend Server
```bash
cd server
npm install  # If not already done
npm run dev
```

Expected output:
```
Server running on port 3001
Background jobs started
```

### 3. Verify API Endpoints

#### Test Payments API
```bash
# Get recent payments
curl -X GET http://localhost:3001/api/payments/recent \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get overdue payments
curl -X GET http://localhost:3001/api/payments/overdue \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get collection stats
curl -X GET http://localhost:3001/api/payments/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected response for stats:
```json
{
  "total_collected": 75000,
  "total_due": 80000,
  "collection_rate": 93.75,
  "overdue_count": 3,
  "overdue_amount": 5000,
  "auto_pay_count": 87,
  "manual_pay_count": 13
}
```

#### Test Disbursements API
```bash
# Get owner entities
curl -X GET http://localhost:3001/api/disbursements/owners \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get pending disbursements
curl -X GET http://localhost:3001/api/disbursements/pending \
  -H "Authorization: Bearer YOUR_TOKEN"

# Calculate disbursement
curl -X POST http://localhost:3001/api/disbursements/calculate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "owner-uuid",
    "periodStart": "2024-01-01",
    "periodEnd": "2024-01-31"
  }'
```

Expected calculation response:
```json
{
  "gross_rent": 5000,
  "management_fee": 500,
  "maintenance_costs": 300,
  "other_expenses": 0,
  "net_amount": 4200,
  "payments": [...]
}
```

### 4. Test Frontend Integration

Navigate to: `http://localhost:5173/rent-collection`

#### Expected UI Elements
✅ 4 KPI cards showing:
- Collected This Month ($75,000)
- Collection Rate (93.8%)
- Auto-Pay Enrolled (87%)
- Avg. Collection Time (2.1 days)

✅ Recent Payments table with:
- Tenant name
- Property and unit
- Amount
- Payment method
- Date
- Status badge

✅ Pending Payments panel with:
- Overdue count badge
- Days overdue calculation
- "Send Reminder" button
- Amount displayed in red

✅ Owner Disbursements section (if owners exist)

## Testing Scenarios

### Scenario 1: Record a Payment
```bash
curl -X POST http://localhost:3001/api/payments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": "lease-uuid",
    "tenant_id": "tenant-uuid",
    "amount": 2500,
    "payment_date": "2024-01-15T00:00:00Z",
    "due_date": "2024-01-01T00:00:00Z",
    "payment_method": "ACH",
    "notes": "January rent"
  }'
```

Expected:
- ✅ Payment created with status 'paid' (paid on time)
- ✅ Activity event logged: `payment_recorded`
- ✅ Collection stats updated
- ✅ Payment appears in Recent Payments list

### Scenario 2: Send Payment Reminder
```bash
curl -X POST http://localhost:3001/api/payments/PAYMENT_ID/send-reminder \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected:
- ✅ Activity event logged: `payment_reminder_sent`
- ✅ Success response returned
- ✅ Email/SMS sent (when integrated)

### Scenario 3: Create Owner Disbursement
```bash
curl -X POST http://localhost:3001/api/disbursements \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "owner-uuid",
    "periodStart": "2024-01-01",
    "periodEnd": "2024-01-31",
    "paymentMethod": "ach"
  }'
```

Expected:
- ✅ Disbursement created with status 'pending'
- ✅ Amounts calculated automatically
- ✅ Activity event logged: `disbursement_created`
- ✅ Appears in Pending Disbursements

### Scenario 4: Process Disbursement (Idempotent)
```bash
# First attempt
curl -X POST http://localhost:3001/api/disbursements/DISB_ID/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "idempotency-key: unique-key-123" \
  -H "Content-Type: application/json" \
  -d '{}'

# Second attempt (same key)
curl -X POST http://localhost:3001/api/disbursements/DISB_ID/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "idempotency-key: unique-key-123" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected:
- ✅ First attempt: Status changed to 'completed'
- ✅ Payments marked as 'disbursed'
- ✅ Ledger entries created (debit owner_payable, credit cash)
- ✅ Activity event logged: `disbursement_processed`
- ❌ Second attempt: Rejected with duplicate key error

### Scenario 5: Check Collection Rate
```bash
curl -X GET http://localhost:3001/api/payments/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Verify math:
- Collected: $75,000
- Due: $80,000
- Rate: 75000 / 80000 * 100 = 93.75%

### Scenario 6: Overdue Detection
```bash
curl -X GET http://localhost:3001/api/payments/overdue \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected:
- ✅ Only payments with `due_date < today` and status IN ('pending', 'late')
- ✅ `days_overdue` calculated correctly
- ✅ Sorted by `due_date` ascending (oldest first)

## Running Tests

### Backend Service Tests
```bash
cd server
npm test -- paymentService.test.ts
npm test -- disbursementService.test.ts
```

Expected:
- ✅ 10+ payment service tests passing
- ✅ 12+ disbursement service tests passing
- ✅ Collection rate math verified
- ✅ Idempotency tests passing
- ✅ Ledger entry creation tested

### Integration Tests
```bash
cd server
npm test -- __tests__/integration/
```

## Manual UI Testing Checklist

### Page Load
- [ ] KPI cards display with loading states
- [ ] Data fetched from backend APIs
- [ ] No console errors

### Recent Payments
- [ ] Table displays up to 50 payments
- [ ] Tenant names, properties, units shown
- [ ] Amounts formatted as currency ($2,500.00)
- [ ] Status badges color-coded (green=paid, yellow=processing, red=failed)
- [ ] "View All Transactions" button works

### Pending Payments
- [ ] Overdue count badge displays correctly
- [ ] Days overdue calculated from due_date to today
- [ ] "Send Reminder" button enabled
- [ ] Clicking "Send Reminder" shows loading state
- [ ] Success/error message after reminder sent
- [ ] "Details" button navigates (if implemented)

### Owner Disbursements
- [ ] Pending disbursements listed
- [ ] Gross rent, fees, net amount displayed
- [ ] Owner details shown
- [ ] "Process Disbursement" button enabled
- [ ] Processing shows loading state
- [ ] Idempotency prevents double-processing

### Auto-Pay Status
- [ ] Percentage calculated correctly
- [ ] Green badge shows "Active"
- [ ] Tenant count displayed

### Refresh
- [ ] Clicking refresh button re-fetches data
- [ ] Loading spinner shows during refresh
- [ ] Data updates after refresh completes

## Common Issues & Solutions

### Issue: "Account ID required" error
**Solution**: Ensure user is authenticated and has valid session

### Issue: Collection stats show 0%
**Solution**: 
1. Check if payments exist in database
2. Verify `collection_stats_by_account` view has data
3. Refresh materialized view: `REFRESH MATERIALIZED VIEW collection_stats_by_account;`

### Issue: No disbursements showing
**Solution**:
1. Create owner entity first
2. Link property to owner via `property_owners` table
3. Ensure payments exist for that property

### Issue: "Duplicate idempotency key" error
**Solution**: This is expected behavior - use a new unique key for each disbursement processing attempt

### Issue: TypeScript errors in IDE
**Solution**: 
```bash
cd server
npm run build  # Compile to verify no actual errors
# Restart TypeScript server in IDE
```

## Database Queries for Verification

### Check collection stats view
```sql
SELECT * FROM collection_stats_by_account 
WHERE account_id = 'your-account-id';
```

### Check overdue payments
```sql
SELECT * FROM get_overdue_payments('your-account-id');
```

### Check disbursement status
```sql
SELECT id, status, gross_rent, net_amount, processed_at 
FROM disbursements 
WHERE account_id = 'your-account-id'
ORDER BY created_at DESC;
```

### Check ledger balance
```sql
SELECT 
  account_type,
  SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as total_debits,
  SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as total_credits
FROM ledger_entries
WHERE account_id = 'your-account-id'
GROUP BY account_type;
```

Verify: total_debits should equal total_credits

## Performance Considerations

### Database Indexes
Verify indexes exist:
```sql
\d payments  -- Should show idx_payments_status_due_date
\d disbursements  -- Should show idx_disbursements_status
\d ledger_entries  -- Should show idx_ledger_entries_date_account
```

### Materialized View Refresh
If stats are stale:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY collection_stats_by_account;
```

### Query Performance
Monitor slow queries:
```sql
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%payments%' OR query LIKE '%disbursements%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## Next Steps

After verification:
1. ✅ Configure email/SMS provider for reminders
2. ✅ Set up Stripe webhook for auto payment recording
3. ✅ Add export to QuickBooks/Xero
4. ✅ Create owner portal for self-service viewing
5. ✅ Implement late fee automation

## Support

If issues persist:
1. Check server logs: `tail -f server/logs/app.log`
2. Check browser console for frontend errors
3. Verify database schema: `psql $DATABASE_URL -c "\d+ payments"`
4. Review [RENT_COLLECTION_IMPLEMENTATION.md](RENT_COLLECTION_IMPLEMENTATION.md) for architecture details
