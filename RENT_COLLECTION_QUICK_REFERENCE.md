# Rent Collections Quick Reference

## 🎯 Quick Start

Run the setup script:
```bash
./setup-rent-collection.sh
```

## 📊 KPI Calculations

### Collected This Month
```typescript
// Sum of paid payments in current month
SELECT SUM(amount) FROM payments 
WHERE status = 'paid' 
AND payment_type = 'rent'
AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', CURRENT_DATE);
```

### Collection Rate
```typescript
// Percentage of due rent that was collected
Formula: (collected / total_due) × 100

// Use database function:
SELECT calculate_collection_rate(account_id, start_date, end_date);
```

### Auto-Pay Enrolled
```typescript
// Percentage of active leases with auto-pay
SELECT 
  (COUNT(*) FILTER (WHERE auto_pay_enabled = TRUE)::FLOAT / 
   COUNT(*)::FLOAT * 100) as enrollment_rate
FROM leases 
WHERE status = 'active';
```

### Avg Collection Time
```typescript
// Average days from due_date to paid_at
SELECT AVG(EXTRACT(DAY FROM (paid_at::DATE - due_date))) 
FROM payments 
WHERE status = 'paid' 
AND paid_at >= CURRENT_DATE - INTERVAL '90 days';
```

## 🔄 Send Payment Reminder

### Frontend
```typescript
import { useSendPaymentReminder } from '@/lib/hooks/usePayments';

const { sendReminder } = useSendPaymentReminder();
await sendReminder(paymentId);
```

### Backend
```typescript
await sendPaymentReminder(accountId, userId, paymentId);
// Creates ActivityEvent with type 'payment_reminder_sent'
```

## 💰 Process Disbursement

### Frontend
```typescript
import { processDisbursement } from '@/lib/api/payments';

const idempotencyKey = `process-${disbursementId}-${Date.now()}`;
await processDisbursement(disbursementId, idempotencyKey);
```

### Backend (with Idempotency)
```typescript
// Database function ensures atomic processing
await supabase.rpc('process_disbursement', {
  p_disbursement_id: disbursementId,
  p_idempotency_key: idempotencyKey,
  p_processed_by: userId
});

// What it does:
// 1. Updates disbursement status to 'completed'
// 2. Creates ledger entry (debit: owner_disbursement)
// 3. Marks included payments as disbursed
// 4. Returns existing result if already processed (idempotent)
```

## 📝 Create Payment

### Record a Payment
```typescript
import { recordPayment } from '@/lib/api/payments';

await recordPayment({
  leaseId: 'lease-123',
  tenantId: 'tenant-456',
  amount: 1800.00,
  paymentDate: '2024-01-05',
  dueDate: '2024-01-01',
  paymentMethod: 'stripe'
});

// Automatically:
// - Creates payment record
// - Creates ledger entry (credit: rent_income)
// - Logs activity event
```

## 🏢 Calculate Disbursement

### Get Disbursement Calculation
```typescript
import { calculateDisbursement } from '@/lib/api/payments';

const calc = await calculateDisbursement(
  ownerId,
  '2024-01-01',  // periodStart
  '2024-01-31'   // periodEnd
);

// Returns:
// {
//   totalRentCollected: 15000,
//   totalExpenses: 2000,
//   managementFee: 1500,  // 10% of rent
//   netAmount: 11500,     // rent - expenses - fee
//   breakdown: { property_count: 3, payment_count: 10 }
// }
```

### Formula
```
Net Amount = Total Rent - Total Expenses - Management Fee

Management Fee = 
  IF owner.management_fee_flat THEN 
    flat_fee
  ELSE 
    total_rent × (fee_percentage / 100)
```

## 🔍 Query Examples

### Get Overdue Payments
```sql
SELECT * FROM get_overdue_payments('account-id');
-- Returns: payment_id, tenant_name, property_name, 
--          unit_number, amount, due_date, days_overdue
```

### Check Collection Stats
```sql
SELECT * FROM collection_stats_by_account 
WHERE account_id = 'your-account-id';
-- Returns: collected_this_month, collection_rate, 
--          auto_pay_enrollment_rate, avg_collection_days
```

### Find Undisbursed Payments
```sql
SELECT * FROM payments 
WHERE account_id = 'account-id'
AND status = 'paid'
AND payment_type = 'rent'
AND (disbursed = FALSE OR disbursed IS NULL);
```

### Verify Ledger Entries
```sql
-- For a payment
SELECT * FROM ledger_entries 
WHERE reference_type = 'payment' 
AND reference_id = 'payment-id';

-- For a disbursement
SELECT * FROM ledger_entries 
WHERE disbursement_id = 'disbursement-id';
```

## 🧪 Testing

### Run Tests
```bash
cd server
npm test -- paymentService.test.ts
npm test -- disbursementService.test.ts
```

### Test Idempotency
```typescript
const key = 'test-123';

// Process once
await processDisbursement(accountId, userId, disbId, key);

// Process again with same key - should return same result
await processDisbursement(accountId, userId, disbId, key);

// Verify only one ledger entry created
const entries = await getLedgerEntries(accountId, {
  disbursementId: disbId
});
expect(entries.length).toBe(1);
```

## 📦 Data Models

### Payment
```typescript
{
  id: string;
  accountId: string;
  leaseId: string;
  tenantUserId: string;
  unitId: string;
  amount: number;
  paymentType: 'rent' | 'deposit' | 'late_fee' | ...;
  dueDate: string;
  paidAt: string | null;
  status: 'pending' | 'paid' | 'late' | 'failed';
  paymentMethod: 'stripe' | 'ach' | 'check' | 'manual';
  autoPayEnabled: boolean;
  disbursed: boolean;
  disbursementId: string | null;
}
```

### Disbursement
```typescript
{
  id: string;
  accountId: string;
  ownerId: string;
  propertyId: string | null;
  amount: number;
  periodStart: string;
  periodEnd: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  disbursedAt: string | null;
  paymentMethod: 'ach' | 'wire' | 'check';
  totalRentCollected: number;
  totalExpenses: number;
  managementFee: number;
  netAmount: number;
  breakdown: {
    property_count: number;
    payment_count: number;
    expense_count: number;
  };
  idempotencyKey: string | null;
}
```

### Owner Entity
```typescript
{
  id: string;
  accountId: string;
  name: string;
  email: string;
  entityType: 'individual' | 'llc' | 'trust' | 'corporation';
  disbursementMethod: 'ach' | 'wire' | 'check';
  disbursementSchedule: 'weekly' | 'monthly' | 'quarterly';
  disbursementDay: number;
  managementFeePercentage: number;
  managementFeeFlat: number | null;
}
```

## 🔐 Permissions

Routes protected by RBAC middleware:
- `Permissions.readPayments` - View payments
- `Permissions.updatePayments` - Send reminders
- `Permissions.createPayments` - Record payments
- `Permissions.readDisbursements` - View disbursements
- `Permissions.createDisbursements` - Create disbursements
- `Permissions.updateDisbursements` - Process disbursements

## 🚨 Error Handling

### Idempotency Error
```typescript
try {
  await processDisbursement(accountId, userId, id, key);
} catch (error) {
  if (error.message.includes('Duplicate disbursement')) {
    // Already processed - get existing result
    const existing = await getDisbursement(id);
    return existing;
  }
  throw error;
}
```

### Validation Errors
All endpoints validate required fields:
- Missing account ID → 400
- Missing required params → 400
- Not found → 404
- Server errors → 500

## 🎨 UI Components

### Recent Payments
```tsx
const { data: payments, loading, refetch } = useRecentPayments();
// Displays last 50 payments with tenant/property details
```

### Pending Payments
```tsx
const { data: pending, loading, refetch } = usePendingPayments();
// Shows overdue payments with reminder button
```

### Collection Stats
```tsx
const { data: stats, loading } = useCollectionStats();
// Returns: collected_this_month, collection_rate, 
//          auto_pay_enrolled, avg_collection_time
```

### Owner Disbursements
```tsx
const { data: disbursements, loading, refetch } = useOwnerDisbursements();
// Shows pending disbursements with process button
```

## 📚 Documentation

- Full Implementation: `RENT_COLLECTION_IMPLEMENTATION_COMPLETE.md`
- Database Schema: `supabase/migrations/006_rent_collection_enhancements.sql`
- Seed Data: `supabase/migrations/007_rent_collection_seed_data.sql`
- Tests: `server/__tests__/services/`

## ✅ Checklist

- [x] KPI cards show real data
- [x] Recent payments table populated
- [x] Pending payments with reminders
- [x] Auto-pay status tracking
- [x] Owner disbursement processing
- [x] Idempotent operations
- [x] Ledger integration
- [x] Activity logging
- [x] Test coverage
- [x] Error handling
- [x] Permission checks
- [x] Data validation
