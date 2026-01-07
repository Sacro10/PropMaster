# Plan Gating Quick Reference

## Component Gating Summary

### TenantManagement Component
**File**: `src/app/components/TenantManagement.tsx`

| Feature | Plan Required | Lines | What's Gated |
|---------|--------------|-------|--------------|
| `tenant_screening` | Pro | 120-147 | Screening metrics (4 stat cards) |
| `tenant_screening` | Pro | 234-318 | Applications panel (with LockedFeatureCard fallback) |
| `ai_risk_scoring` | Premium | 272-280 | AI score display in applications (conditional) |
| `ai_risk_scoring` | Premium | 321-369 | AI screening info panel |

---

### MaintenancePanel Component
**File**: `src/app/components/MaintenancePanel.tsx`

| Feature | Plan Required | Lines | What's Gated |
|---------|--------------|-------|--------------|
| `hvac_filter_program` | Premium | 222-275 | HVAC Filter Program panel |
| `emergency_support_24_7` | Premium | 277-332 | 24/7 Emergency Support panel |
| `maintenance_routing` | Pro | 334-369 | Smart Routing panel |

---

### AnalyticsPanel Component
**File**: `src/app/components/AnalyticsPanel.tsx`

| Feature | Plan Required | Lines | What's Gated |
|---------|--------------|-------|--------------|
| `advanced_exports` | Premium | 73-88 | Export Report button (shows disabled version if locked) |
| `standard_reporting` | Pro | 115-202 | Charts: Revenue Trend & Occupancy Rate |
| `standard_reporting` | Pro | 204-302 | Property Performance & Expense Breakdown |
| `advanced_analytics` | Premium | 304-358 | Market Intelligence panel |

---

### PropertyShowings Component
**File**: `src/app/components/PropertyShowings.tsx`

| Feature | Plan Required | Lines | What's Gated |
|---------|--------------|-------|--------------|
| `electronic_showings` | Premium | 93-331 | **Entire component** (all showings functionality) |

---

### RentCollection Component
**File**: `src/app/components/RentCollection.tsx`

| Feature | Plan Required | Lines | What's Gated |
|---------|--------------|-------|--------------|
| `integrated_accounting` | Premium | 357-411 | Integrated Accounting panel |

---

### CommunicationHub Component
**File**: `src/app/components/CommunicationHub.tsx`

| Feature | Plan Required | Lines | What's Gated |
|---------|--------------|-------|--------------|
| `communication_hub` | Pro | 88-375 | **Entire component** (all communication features) |

---

## Feature to Plan Mapping

### Basic Plan (Free) Features
- ✅ `tenant_portal`
- ✅ `basic_maintenance_requests`
- ✅ `basic_rent_collection`
- ✅ `property_management`
- Max 3 units

### Pro Plan ($10/mo) Features
All Basic features **plus**:
- ✅ `tenant_screening` → TenantManagement (metrics + applications)
- ✅ `maintenance_routing` → MaintenancePanel (smart routing)
- ✅ `marketing_tools`
- ✅ `standard_reporting` → AnalyticsPanel (charts)
- ✅ `lease_renewals`
- ✅ `communication_hub` → CommunicationHub (entire component)
- Max 100 units

### Premium Plan ($20/mo) Features
All Pro features **plus**:
- ✅ `ai_risk_scoring` → TenantManagement (AI scores)
- ✅ `integrated_accounting` → RentCollection (accounting panel)
- ✅ `hvac_filter_program` → MaintenancePanel (filter program)
- ✅ `electronic_showings` → PropertyShowings (entire component)
- ✅ `emergency_support_24_7` → MaintenancePanel (24/7 support)
- ✅ `advanced_analytics` → AnalyticsPanel (market intelligence)
- ✅ `advanced_exports` → AnalyticsPanel (export button)
- ✅ `custom_reports`
- ✅ `api_access`
- Unlimited units

---

## Code Patterns Used

### Pattern 1: Inline FeatureGate (Content Replacement)
```typescript
<FeatureGate
  feature="tenant_screening"
  hasAccess={tenantScreening.hasAccess}
  loading={tenantScreening.loading}
  variant="inline"
>
  {/* Protected content shows UpgradeCTA if locked */}
  <div>Premium feature content</div>
</FeatureGate>
```
**Used in**: TenantManagement (metrics), MaintenancePanel, AnalyticsPanel, PropertyShowings, CommunicationHub

### Pattern 2: FeatureGate with Custom Fallback
```typescript
<FeatureGate
  feature="tenant_screening"
  hasAccess={tenantScreening.hasAccess}
  loading={tenantScreening.loading}
  fallback={
    <LockedFeatureCard
      name="Feature Name"
      description="Feature description"
      icon={<Icon />}
      feature="tenant_screening"
    />
  }
>
  <div>Protected content</div>
</FeatureGate>
```
**Used in**: TenantManagement (applications), MaintenancePanel (all panels)

### Pattern 3: Conditional Rendering
```typescript
{advancedExports.hasAccess ? (
  <button onClick={handleExport}>Export</button>
) : (
  <button onClick={handleUpgrade}>Export (Premium)</button>
)}
```
**Used in**: AnalyticsPanel (export button), TenantManagement (AI scores)

---

## Testing Checklist

### Basic Plan Testing
- [ ] TenantManagement: Metrics should show upgrade CTA
- [ ] TenantManagement: Applications should show locked card
- [ ] TenantManagement: AI scores should be hidden
- [ ] MaintenancePanel: All 3 side panels show locked cards
- [ ] AnalyticsPanel: Charts show upgrade CTA
- [ ] AnalyticsPanel: Export button shows "(Premium)" label
- [ ] PropertyShowings: Entire page shows upgrade CTA
- [ ] CommunicationHub: Entire page shows upgrade CTA
- [ ] RentCollection: Accounting panel shows upgrade CTA

### Pro Plan Testing
- [ ] TenantManagement: Metrics visible
- [ ] TenantManagement: Applications visible
- [ ] TenantManagement: AI scores still hidden (Premium only)
- [ ] TenantManagement: AI info panel still locked (Premium only)
- [ ] MaintenancePanel: Smart routing visible
- [ ] MaintenancePanel: HVAC & Emergency still locked
- [ ] AnalyticsPanel: Charts visible
- [ ] AnalyticsPanel: Market intelligence still locked
- [ ] AnalyticsPanel: Export button still disabled
- [ ] CommunicationHub: Entire page visible
- [ ] PropertyShowings: Still locked (Premium only)

### Premium Plan Testing
- [ ] All features from Pro visible
- [ ] TenantManagement: AI scores visible
- [ ] TenantManagement: AI info panel visible
- [ ] MaintenancePanel: All panels visible
- [ ] AnalyticsPanel: Market intelligence visible
- [ ] AnalyticsPanel: Export button active
- [ ] PropertyShowings: Entire page visible
- [ ] RentCollection: Accounting panel visible

---

## Quick Commands

### Check Current Plan (SQL)
```sql
SELECT plan, max_units, max_properties
FROM accounts
WHERE id = '<account-id>';
```

### Change Plan (SQL)
```sql
-- Upgrade to Pro
UPDATE accounts
SET plan = 'pro', max_units = 100, max_properties = 50
WHERE id = '<account-id>';

-- Upgrade to Premium
UPDATE accounts
SET plan = 'premium', max_units = 999999, max_properties = 999999
WHERE id = '<account-id>';

-- Downgrade to Basic
UPDATE accounts
SET plan = 'basic', max_units = 3, max_properties = 10
WHERE id = '<account-id>';
```

### Test Feature Access (Frontend)
```typescript
import { hasFeature } from '@/lib/planGating';

// In browser console or component
const hasAccess = await hasFeature('tenant_screening');
console.log('Has tenant screening:', hasAccess);
```

### Test RPC Functions (SQL)
```sql
-- Check feature
SELECT rpc_check_feature('tenant_screening');

-- Check plan
SELECT rpc_check_plan('pro');

-- Get all features
SELECT * FROM rpc_get_account_features();

-- Get plan info
SELECT * FROM rpc_get_account_plan();
```

---

## Integration with Stripe

When implementing Stripe webhooks:

```typescript
// Handle subscription.updated webhook
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const plan = getPlanFromPrice(subscription.items.data[0].price.id);

  await supabase
    .from('accounts')
    .update({
      plan: plan, // 'basic' | 'pro' | 'premium'
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      subscription_current_period_end: new Date(subscription.current_period_end * 1000),
    })
    .eq('stripe_customer_id', subscription.customer);
}
```

---

## File Reference

| File | Purpose |
|------|---------|
| `supabase/migrations/002_plan_gating.sql` | Database schema, RLS, functions |
| `src/lib/planGating.ts` | Backend logic, feature checking |
| `src/app/hooks/usePlanGating.ts` | React hooks |
| `src/app/components/UpgradeCTA.tsx` | UI components for gating |
| `src/app/components/TenantManagement.tsx` | Gated component |
| `src/app/components/MaintenancePanel.tsx` | Gated component |
| `src/app/components/AnalyticsPanel.tsx` | Gated component |
| `src/app/components/PropertyShowings.tsx` | Gated component |
| `src/app/components/RentCollection.tsx` | Gated component |
| `src/app/components/CommunicationHub.tsx` | Gated component |

---

## Support

For questions or issues with the plan gating system:
1. Check `PLAN_GATING_IMPLEMENTATION.md` for detailed documentation
2. Review the inline comments in `planGating.ts`
3. Test using the SQL commands in this guide
4. Verify RLS policies are properly set up in Supabase dashboard
