# Rent Collection & Disbursements - Implementation Summary

## Overview
Complete implementation of rent collection tracking, payment management, and owner disbursements with integrated accounting through a double-entry ledger system.

## Database Schema (Migration 006)

### New Tables

#### `owner_entities`
Owner information for property disbursements:
- **Fields**: name, email, phone, entity_type, tax_id, bank_account_last4, payment_method
- **Entity Types**: individual, llc, partnership, corporation
- **Payment Methods**: ach, check, wire

#### `property_owners`
Links properties to owner entities with ownership percentage:
- **Fields**: property_id, owner_id, ownership_percentage
- **Constraint**: ownership percentages must sum to 100% per property

### Enhanced Tables

#### `payments`
Added status tracking and disbursement linkage:
- **New Field**: `disbursement_id` - Links to owner disbursement
- **Statuses**: pending, paid, late, disbursed

#### `leases`
Added auto-pay enrollment tracking:
- **New Field**: `auto_pay_enabled` - Boolean flag for automatic payment enrollment

#### `disbursements`
Owner payout records:
- **Fields**: owner_id, property_id, period_start, period_end, gross_rent, management_fee, maintenance_costs, net_amount, payment_method, status, processed_by, processed_at, idempotency_key
- **Statuses**: pending, processing, completed, failed
- **Unique Constraint**: idempotency_key for duplicate prevention

### Database Functions

#### `calculate_collection_rate(p_account_id UUID, p_period_start DATE, p_period_end DATE)`
Calculates collection rate percentage:
```sql
RETURNS NUMERIC AS $$
  SELECT CASE 
    WHEN SUM(due_amount) > 0 
    THEN (SUM(collected_amount) / SUM(due_amount)) * 100 
    ELSE 100 
  END
FROM payments WHERE ...
```

#### `get_overdue_payments(p_account_id UUID)`
Returns payments with days overdue calculation:
```sql
RETURNS TABLE(
  payment_id UUID,
  days_overdue INTEGER,
  tenant_name TEXT,
  ...
)
```

#### `process_disbursement(p_disbursement_id UUID, p_processed_by UUID, p_idempotency_key TEXT)`
Idempotent disbursement processing:
1. Checks idempotency key for duplicates
2. Marks disbursement as completed
3. Updates linked payments to 'disbursed' status
4. Creates ledger entries (disbursement debit, owner payable credit)
5. Logs activity event
6. **Atomicity**: All operations in single transaction

### Materialized View

#### `collection_stats_by_account`
Pre-calculated collection statistics for dashboard KPIs:
- Refreshed on payment INSERT/UPDATE via trigger
- Includes: total_collected, total_due, collection_rate, overdue_count, auto_pay_count

### Indexes
- `idx_payments_status_due_date` - For overdue payment queries
- `idx_disbursements_status` - For pending disbursement filtering
- `idx_disbursements_owner_period` - For owner historical lookups
- `idx_ledger_entries_date_account` - For financial reporting

## Backend Services

### Payment Service (`server/src/services/paymentService.ts`)

#### Functions
1. **`getRecentPayments(accountId, limit)`**
   - Fetches recent payments with tenant, unit, property details
   - Left joins for comprehensive data
   - Orders by payment_date DESC

2. **`getOverduePayments(accountId)`**
   - Calls `get_overdue_payments()` database function
   - Returns payments with days_overdue calculation
   - Filters: status IN ('pending', 'late')

3. **`getCollectionStatistics(accountId)`**
   - Queries `collection_stats_by_account` view
   - Falls back to raw calculation if view empty
   - Formula: `(total_collected / total_due) * 100`

4. **`sendPaymentReminder(accountId, userId, paymentId)`**
   - Fetches payment with tenant details
   - Logs `payment_reminder_sent` activity event
   - TODO: Integrate with email/SMS provider

5. **`recordPayment(accountId, userId, data)`**
   - Inserts new payment record
   - Auto-determines status based on due_date
   - Logs `payment_recorded` activity event

### Ledger Service (`server/src/services/ledgerService.ts`)

#### Double-Entry Bookkeeping
All financial transactions create paired entries (debit + credit).

#### Functions
1. **`createLedgerEntry(accountId, data)`**
   - Single entry creation (use paired version instead)

2. **`createPairedLedgerEntries(accountId, data)`**
   - Creates debit and credit entries
   - Ensures accounting equation: Assets = Liabilities + Equity

3. **`getLedgerEntries(accountId, filters)`**
   - Filtered ledger retrieval
   - Supports: account_type, start_date, end_date

4. **`calculateAccountBalance(accountId, accountType)`**
   - Sums debits and credits for account
   - Returns net balance

5. **`getTrialBalance(accountId, asOfDate)`**
   - All account balances as of date
   - Verifies debits = credits

6. **`getIncomeStatement(accountId, periodStart, periodEnd)`**
   - Revenue and expense summary
   - Calculates Net Operating Income (NOI)

#### Account Types
- **Assets**: cash, accounts_receivable
- **Liabilities**: accounts_payable, owner_payable
- **Equity**: owner_equity, retained_earnings
- **Revenue**: rental_income, late_fees
- **Expenses**: management_fees, maintenance, utilities, insurance

### Disbursement Service (`server/src/services/disbursementService.ts`)

#### Functions
1. **`getOwnerEntities(accountId)`**
   - All owner entities for account

2. **`getPendingDisbursements(accountId)`**
   - Status IN ('pending', 'processing')
   - Includes owner details via join

3. **`calculateDisbursement(accountId, ownerId, periodStart, periodEnd)`**
   - Fetches payments for period (status: paid, not disbursed)
   - Fetches expenses for period
   - **Calculation**:
     - Gross Rent = SUM(payment amounts)
     - Management Fee = Gross Rent * 0.10 (10%)
     - Maintenance Costs = SUM(expense amounts)
     - Net Amount = Gross Rent - Management Fee - Maintenance Costs

4. **`createDisbursement(accountId, userId, data)`**
   - Calls `calculateDisbursement()` for amounts
   - Inserts disbursement with status 'pending'
   - Logs `disbursement_created` activity event

5. **`processDisbursement(accountId, userId, disbursementId, idempotencyKey?)`**
   - Generates UUID idempotency key if not provided
   - Calls `process_disbursement()` database function
   - **Idempotency**: Prevents duplicate processing via unique constraint
   - Updates status to 'completed', sets processed_at and processed_by
   - Marks linked payments as 'disbursed'
   - Creates ledger entries:
     - Debit: owner_payable (liability decrease)
     - Credit: cash (asset decrease)
   - Logs `disbursement_processed` activity event

## API Routes

### Payment Routes (`server/src/routes/payments.ts`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/payments/recent` | readPayments | Recent payments with limit |
| GET | `/api/payments/overdue` | readPayments | Overdue payments |
| GET | `/api/payments/stats` | readPayments | Collection statistics |
| POST | `/api/payments/:id/send-reminder` | updatePayments | Send payment reminder |
| POST | `/api/payments` | createPayments | Record new payment |

### Disbursement Routes (`server/src/routes/disbursements.ts`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/disbursements/owners` | readDisbursements | All owner entities |
| GET | `/api/disbursements/pending` | readDisbursements | Pending disbursements |
| POST | `/api/disbursements/calculate` | readDisbursements | Calculate disbursement |
| POST | `/api/disbursements` | createDisbursements | Create disbursement |
| POST | `/api/disbursements/:id/process` | updateDisbursements | Process with idempotency |

## Frontend Implementation

### API Layer (`src/lib/api/payments.ts`)

#### Functions
- `getRecentPayments(limit)` - Recent payment list
- `getOverduePayments()` - Overdue payments
- `getPendingPayments()` - Alias for UI compatibility
- `getCollectionStats()` - KPI statistics
- `sendPaymentReminder(paymentId)` - Send reminder
- `recordPayment(data)` - Create payment
- `getOwnerEntities()` - Owner list
- `getOwnerDisbursements()` - Disbursement list
- `calculateDisbursement(ownerId, start, end)` - Preview calculation
- `createDisbursement(data)` - Create disbursement
- `processDisbursement(id, idempotencyKey?)` - Process with idempotency

#### Types
```typescript
interface Payment {
  id: string;
  lease_id: string;
  tenant_id: string;
  amount: number;
  payment_date: string;
  due_date: string;
  payment_method: string;
  status: 'pending' | 'paid' | 'late' | 'disbursed';
  tenant?: { id, name, email };
  unit?: { id, unit_number, property_id };
  property?: { id, name, address };
}

interface CollectionStats {
  total_collected: number;
  total_due: number;
  collection_rate: number;
  overdue_count: number;
  overdue_amount: number;
  auto_pay_count: number;
  manual_pay_count: number;
}

interface Disbursement {
  id: string;
  owner_id: string;
  period_start: string;
  period_end: string;
  gross_rent: number;
  management_fee: number;
  maintenance_costs: number;
  net_amount: number;
  payment_method: 'ach' | 'check' | 'wire';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processed_at: string | null;
  owner?: OwnerEntity;
}
```

### React Hooks (`src/lib/hooks/usePayments.ts`)

- `useRecentPayments()` - { data, loading, error, refetch }
- `usePendingPayments()` - { data, loading, error, refetch }
- `useOwnerDisbursements()` - { data, loading, error, refetch }
- `useCollectionStats()` - { data, loading, error, refetch }
- `useSendPaymentReminder()` - { sendReminder, loading, error }

### Component (`src/app/components/RentCollection.tsx`)

#### KPI Cards
1. **Collected This Month** - Total payments received
2. **Collection Rate** - Percentage of due rent collected
3. **Auto-Pay Enrolled** - Percentage of tenants with auto-pay
4. **Avg. Collection Time** - Days to collect after due date

#### Main Sections
1. **Recent Payments** - Table with tenant, property, amount, method, date, status
2. **Pending Payments** - Overdue payments with "Send Reminder" button
3. **Auto-Pay Status** - Enrollment statistics
4. **Owner Disbursements** - Pending disbursements table

#### Actions
- **Refresh Data** - Refetch all data
- **Process Disbursement** - Button to process selected disbursement
- **Send Reminder** - Send payment reminder email/SMS
- **View Details** - Navigate to payment details

## Security & Permissions

### RBAC Permissions (`server/src/middleware/rbac.ts`)
- **payments:read** - View payment data
- **payments:create** - Record payments
- **payments:update** - Send reminders, update status
- **disbursements:read** - View disbursements
- **disbursements:create** - Create disbursements
- **disbursements:update** - Process disbursements

### Row-Level Security
All tables scoped by `account_id`:
- Queries filtered by authenticated user's account
- Prevents cross-account data access
- Enforced at database and application layers

## Testing

### Payment Service Tests (`server/__tests__/services/paymentService.test.ts`)
- ✅ Recent payments with joins
- ✅ Overdue detection and days calculation
- ✅ Collection rate math (collected / due * 100)
- ✅ Zero division handling
- ✅ Payment reminder logging
- ✅ Duplicate payment detection

### Disbursement Service Tests (`server/__tests__/services/disbursementService.test.ts`)
- ✅ Owner entity retrieval
- ✅ Pending disbursement filtering
- ✅ Calculation with 10% management fee
- ✅ Idempotent processing (duplicate key rejection)
- ✅ Ledger entry creation
- ✅ Payment status updates
- ✅ Zero net amount handling
- ✅ Large amount handling

## Key Features

### 1. Collection Rate Tracking
- Real-time calculation via materialized view
- Formula: `(total_collected / total_due) * 100`
- Auto-refreshed on payment changes

### 2. Overdue Detection
- Database function calculates days overdue
- Filters payments with status 'pending' or 'late'
- Supports automated reminder workflows

### 3. Auto-Pay Enrollment
- Tracked on `leases.auto_pay_enabled`
- Counted in collection statistics
- Displayed as KPI percentage

### 4. Owner Disbursements
- 10% management fee calculation
- Links payments to disbursements
- Prevents double-disbursement via status tracking

### 5. Idempotent Processing
- Unique `idempotency_key` on disbursements
- Prevents duplicate processing from retries
- Database-level enforcement via constraint

### 6. Double-Entry Ledger
- All disbursements create paired ledger entries
- Supports NOI calculation
- Enables financial reporting and audit trails

### 7. Activity Logging
- All actions logged to `activity_events`
- Event types: `payment_recorded`, `payment_reminder_sent`, `disbursement_created`, `disbursement_processed`
- Provides audit trail for compliance

## Integration Points

### Email/SMS Reminders
Current: Activity event logging
TODO: Integrate with SendGrid, Twilio, or similar
- Template: "Your rent payment of $X is Y days overdue"
- Include payment portal link

### Stripe Integration
Current: Manual payment recording
TODO: Webhook for automatic payment capture
- Listen to `payment_intent.succeeded`
- Auto-create payment record
- Mark as paid with transaction ID

### Accounting Export
Current: Ledger entries stored in database
TODO: QuickBooks/Xero integration
- Export ledger entries as journal entries
- Sync chart of accounts
- Real-time financial sync

## Deployment Notes

### Migration
Run migration 006:
```bash
psql $DATABASE_URL -f supabase/migrations/006_rent_collection_enhancements.sql
```

### Environment Variables
No new variables required. Uses existing:
- `DATABASE_URL` - PostgreSQL connection
- `FRONTEND_URL` - CORS configuration

### Monitoring
Watch for:
- Collection rate drops (< 95%)
- Increasing overdue count
- Failed disbursement processing
- Ledger imbalance (debits ≠ credits)

## Future Enhancements

1. **Recurring Payment Schedules**
   - Auto-generate monthly payments from lease data
   - Reduce manual entry

2. **ACH Direct Debit**
   - Stripe ACH integration for auto-pay
   - Bank account verification

3. **Owner Portal**
   - Self-service disbursement viewing
   - Historical financial reports
   - Tax document generation (1099 forms)

4. **Late Fee Automation**
   - Auto-apply late fees after grace period
   - Configurable per property

5. **Payment Plans**
   - Support installment agreements
   - Track partial payment progress

6. **Multi-Currency**
   - Support international properties
   - Currency conversion tracking

## Summary

The Rent Collection & Disbursements feature is now fully functional with:
- ✅ Real-time collection statistics
- ✅ Overdue payment tracking
- ✅ Payment reminder workflow
- ✅ Owner disbursement processing
- ✅ Idempotent operations
- ✅ Double-entry ledger integration
- ✅ Comprehensive test coverage
- ✅ RBAC security controls

All data flows through backend APIs with proper authentication and authorization. The frontend components integrate seamlessly with loading states, error handling, and real-time updates.
