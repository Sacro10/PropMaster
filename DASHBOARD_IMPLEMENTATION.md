# Dashboard Implementation Documentation

## Overview
This document provides complete details on the end-to-end dashboard implementation, including all widgets, data sources, API endpoints, and calculations.

## Architecture

### Frontend
- **Component**: `DashboardOverview.tsx` ([src/app/components/DashboardOverview.tsx](src/app/components/DashboardOverview.tsx))
- **Data Hook**: `useDashboardData.ts` ([src/lib/hooks/useDashboardData.ts](src/lib/hooks/useDashboardData.ts))
- **API Client**: `dashboard.ts` ([src/lib/api/dashboard.ts](src/lib/api/dashboard.ts))

### Backend
- **Route**: `dashboard.ts` ([server/src/routes/dashboard.ts](server/src/routes/dashboard.ts))
- **Service**: `dashboardService.ts` ([server/src/services/dashboardService.ts](server/src/services/dashboardService.ts))
- **Database**: PostgreSQL via Supabase

## API Endpoints

### GET /api/dashboard/summary
**Authentication**: Required (Bearer token)
**Authorization**: `Permissions.readAnalytics`
**Scoping**: All data scoped to user's `accountId`

**Response Schema**:
```typescript
{
  kpis: {
    totalUnits: number;
    occupiedUnits: number;
    activeTenants: number;
    monthlyRevenue: number;
  };
  properties: {
    total: number;
    active: number;
    totalUnits: number;
    occupiedUnits: number;
    occupancyRate: number; // percentage
  };
  revenue: {
    currentMonth: number;
    previousMonth: number;
    percentChange: number; // percentage
    collectionRate: number; // percentage
  };
  maintenance: {
    open: number;
    inProgress: number;
    urgent: number;
    avgResolutionTime: number; // hours
  };
  tenants: {
    total: number;
    moveIns: number; // current month
    moveOuts: number; // current month
    leasesExpiring: number; // next 60 days
  };
  systemStatus: {
    supportAvailable: boolean;
    avgLeaseTime: number; // days
    evictionRate: number; // percentage
    occupancyTrend: 'up' | 'down' | 'stable';
  };
  recentActivity: Array<{
    id: string;
    type: string;
    summary: string;
    timestamp: string;
  }>;
  upcomingTasks: Array<{
    id: string;
    type: 'lease_renewal' | 'maintenance' | 'hvac_delivery' | 'inspection' | 'reminder';
    title: string;
    dueDate: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    relatedEntityId?: string;
    relatedEntityType?: string;
  }>;
}
```

### GET /api/activity
**Authentication**: Required
**Authorization**: `Permissions.readAnalytics`

**Query Parameters**:
- `eventType` (optional): Filter by specific event type
- `entityType` (optional): Filter by entity type
- `userId` (optional): Filter by user
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string
- `limit` (optional): Max results (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

## Widget Implementations

### 1. KPI Cards

#### Total Units
- **Data Source**: `properties` table
- **Calculation**: `SUM(properties.total_units)` for all properties in account
- **SQL Location**: [dashboardService.ts:66-76](server/src/services/dashboardService.ts#L66-L76)
- **Display**: Formatted number (e.g., "145")
- **Trend**: Placeholder for now (TODO: implement month-over-month change)

#### Occupied Units
- **Data Source**: `properties` table
- **Calculation**: `SUM(properties.occupied_units)` for all properties in account
- **SQL Location**: [dashboardService.ts:77-78](server/src/services/dashboardService.ts#L77-L78)
- **Display**: Formatted number + occupancy rate percentage
- **Occupancy Rate**: `(occupied_units / total_units) * 100`

#### Active Tenants
- **Data Source**: `tenants` table
- **Calculation**: `COUNT(*)` WHERE `status = 'active'` AND `account_id = {accountId}`
- **SQL Location**: [dashboardService.ts:154-160](server/src/services/dashboardService.ts#L154-L160)
- **Display**: Formatted number
- **Trend**: Monthly change = `moveIns - moveOuts`

#### Monthly Revenue
- **Data Source**: `payments` table
- **Calculation**:
  - Current Month: `SUM(amount)` WHERE `status = 'paid'` AND `payment_date >= currentMonthStart`
  - Previous Month: `SUM(amount)` WHERE `status = 'paid'` AND `payment_date BETWEEN previousMonthStart AND previousMonthEnd`
  - Change: `((current - previous) / previous) * 100`
- **SQL Location**: [dashboardService.ts:82-111](server/src/services/dashboardService.ts#L82-L111)
- **Accounting Model**: **Accrual-based** - Only counts payments with `status = 'paid'`
- **Display**: Formatted currency (e.g., "$45.2K")
- **Trend**: Percentage change from previous month

### 2. Recent Activity Feed

- **Data Source**: `activity_events` table
- **Query**:
  ```sql
  SELECT id, event_type, summary, created_at
  FROM activity_events
  WHERE account_id = {accountId}
  ORDER BY created_at DESC
  LIMIT 10
  ```
- **SQL Location**: [dashboardService.ts:190-195](server/src/services/dashboardService.ts#L190-L195)
- **Event Types**: All events from the `event_type` enum (see migration 003)
- **Supported Event Types**:
  - Property events: `property_created`, `property_updated`, `property_deleted`
  - Tenant events: `tenant_added`, `tenant_removed`, `tenant_updated`
  - Lease events: `lease_created`, `lease_renewed`, `lease_terminated`
  - Maintenance events: `maintenance_created`, `maintenance_assigned`, `maintenance_completed`
  - Payment events: `payment_received`, `payment_failed`, `payment_reminder_sent`
  - And more (see [003_complete_schema.sql:12-25](supabase/migrations/003_complete_schema.sql#L12-L25))
- **Display**:
  - Status dot (color-coded by event type)
  - Summary text
  - Relative time (e.g., "12 mins ago")
- **Timezone**: Uses user/org timezone for relative time calculation
- **Empty State**: Shows "No recent activity" message

### 3. Quick Actions

All quick actions now navigate to real flows:

| Action | Icon | Navigation | Purpose |
|--------|------|------------|---------|
| Screen New Tenant | Users | `/app/tenants` | Opens tenant management to create new application |
| Create Maintenance Request | Wrench | `/app/maintenance` | Opens maintenance panel to create request |
| Generate Report | FileText | `/app/analytics` | Opens analytics for report export |
| Schedule Showing | Bell | `/app/showings` | Opens showings to schedule new showing |

- **Implementation**: [DashboardOverview.tsx:57-62](src/app/components/DashboardOverview.tsx#L57-L62)
- **Navigation**: Uses React Router `navigate()` function

### 4. System Status

#### 24/7 Support
- **Data Source**: `accounts` table
- **Calculation**: `account.plan IN ('premium', 'pro')`
- **SQL Location**: [dashboardService.ts:246-252](server/src/services/dashboardService.ts#L246-L252)
- **Display**: "24/7" or "Business Hours"
- **Status Bar**: Full green bar when active

#### Average Lease Time
- **Data Source**: `tenants` table
- **Calculation**:
  ```sql
  AVG(DATEDIFF(lease_end, lease_start))
  FROM tenants
  WHERE account_id = {accountId}
  ```
- **SQL Location**: [dashboardService.ts:198-211](server/src/services/dashboardService.ts#L198-L211)
- **Units**: Days
- **Definition**: Average duration between `lease_start` and `lease_end` for all leases (active and ended)
- **Display**: Number of days (e.g., "365 DAYS")
- **Status Bar**: Proportional to 365 days (max 100%)

#### Eviction Rate
- **Data Source**: `activity_events` table
- **Calculation**:
  ```sql
  (COUNT(activity_events WHERE event_type = 'lease_terminated' AND summary ILIKE '%evict%') /
   COUNT(all tenants)) * 100
  ```
- **SQL Location**: [dashboardService.ts:213-223](server/src/services/dashboardService.ts#L213-L223)
- **Definition**: Percentage of leases that ended in eviction
- **Display**: Percentage with one decimal (e.g., "2.3%")
- **Status Bar**: Green bar (lower is better)
- **Special Case**: Shows "<1%" for rates below 1%

### 5. Upcoming Tasks

Tasks are aggregated from multiple sources and sorted by due date:

#### Task Sources

1. **Lease Renewals** (Next 90 days)
   - **Query**: Tenants with `status = 'active'` AND `lease_end BETWEEN now AND now+90days`
   - **Priority**:
     - High: < 30 days until expiry
     - Medium: 30-60 days
     - Low: 60-90 days
   - **SQL Location**: [dashboardService.ts:261-284](server/src/services/dashboardService.ts#L261-L284)

2. **Urgent Maintenance** (24-hour SLA)
   - **Query**: `maintenance_requests` WHERE `priority = 'urgent'` AND `status IN ('open', 'assigned')`
   - **Due Date**: `created_at + 24 hours`
   - **Priority**: Always "urgent"
   - **SQL Location**: [dashboardService.ts:287-308](server/src/services/dashboardService.ts#L287-L308)

3. **HVAC Filter Deliveries** (Next 30 days)
   - **Query**: `hvac_program_enrollments` WHERE `status = 'active'` AND `next_delivery_date BETWEEN now AND now+30days`
   - **Priority**: Low
   - **SQL Location**: [dashboardService.ts:314-334](server/src/services/dashboardService.ts#L314-L334)

4. **Reminder Schedules** (Next scheduled run)
   - **Query**: `reminder_schedules` WHERE `is_active = true` AND `next_run_at >= now`
   - **Priority**: Low
   - **SQL Location**: [dashboardService.ts:337-356](server/src/services/dashboardService.ts#L337-L356)

- **Total Limit**: Top 10 tasks by due date
- **Display**:
  - Priority badge (color-coded)
  - Task title
  - Task type
  - Due date (relative or absolute)
- **Empty State**: Shows "No upcoming tasks" message

## Data Flow

### 1. Initial Load
```
User loads dashboard
  → useDashboardData() hook initialized
  → Calls getDashboardSummary() API
  → Backend fetches from all tables (scoped to accountId)
  → Returns complete dashboard summary
  → Frontend updates all widgets
```

### 2. Auto-Refresh
- **Interval**: 60 seconds (configurable)
- **Implementation**: [useDashboardData.ts:69-78](src/lib/hooks/useDashboardData.ts#L69-L78)
- **Behavior**: Silently refetches data in background
- **Error Handling**: Shows error state if refresh fails

### 3. Manual Refresh
- **Trigger**: User clicks "Refresh" button
- **Implementation**: Calls `refetch()` from hook
- **Behavior**: Shows loading state and refetches all data

## State Management

### Loading States
- **Initial Load**: Full-page loading spinner
- **Refresh**: Button shows loading indicator
- **Implementation**: [DashboardOverview.tsx:14-17](src/app/components/DashboardOverview.tsx#L14-L17)

### Error States
- **Network Errors**: Shows ErrorState component with retry button
- **Empty States**: Each widget shows appropriate empty message
- **Implementation**: [DashboardOverview.tsx:18-21](src/app/components/DashboardOverview.tsx#L18-L21)

### Empty States
- **Recent Activity**: "No recent activity"
- **Upcoming Tasks**: "No upcoming tasks"
- **Zero Values**: KPI cards show "0" gracefully

## Security & Scoping

### Account Isolation
- **All queries** are scoped to `account_id`
- **RLS Policies**: Enforced at database level
- **Verification**: See [dashboardService.test.ts](server/__tests__/services/dashboardService.test.ts)

### Authentication
- **JWT Token**: Required in Authorization header
- **Middleware**: `authenticate` middleware extracts `accountId` from token
- **Authorization**: `Permissions.readAnalytics` required

## Testing

### Backend Tests

#### 1. Organization Scoping
- **File**: [server/__tests__/services/dashboardService.test.ts](server/__tests__/services/dashboardService.test.ts)
- **Coverage**:
  - All queries scoped to account_id
  - No cross-account data access
  - Account_id parameter in all subqueries

#### 2. KPI Calculations
- **File**: [server/__tests__/services/dashboardKPIs.test.ts](server/__tests__/services/dashboardKPIs.test.ts)
- **Coverage**:
  - Total units calculation
  - Occupancy rate calculation
  - Monthly revenue (paid payments only)
  - Revenue change percentage
  - Active tenants count
  - Average lease time
  - Eviction rate
  - Support availability by plan
  - Maintenance request counts

#### 3. Activity Filtering
- **File**: [server/__tests__/services/activityService.test.ts](server/__tests__/services/activityService.test.ts)
- **Coverage**:
  - Filter by event type
  - Filter by date range
  - Filter by entity type
  - Filter by user ID
  - Pagination (limit/offset)
  - Event ordering (DESC by created_at)
  - Account scoping
  - Event type distribution stats

### Running Tests
```bash
cd server
npm test
```

## Performance Optimizations

### Database
- **Indexes**: All foreign keys and frequently queried columns indexed
- **Aggregations**: Performed in single query where possible
- **Parallel Queries**: Independent queries run in parallel

### Frontend
- **Auto-refresh**: Configurable interval (default 60s)
- **Single API Call**: All data fetched in one request
- **Optimistic Updates**: Could be added for mutations (future enhancement)

### Caching
- **Frontend**: Data cached in React state between refreshes
- **Backend**: No caching currently (relies on database query performance)
- **Future**: Could add Redis cache for frequently accessed data

## Future Enhancements

### Planned Features
1. **Real-time Updates**: WebSocket connection for live activity feed
2. **Customizable Widgets**: User can show/hide/reorder widgets
3. **Date Range Selector**: Filter all data by custom date range
4. **Export Functionality**: Export dashboard data to PDF/CSV
5. **Trend Charts**: Visual charts for KPI trends over time
6. **Benchmark Comparisons**: Compare metrics to industry averages

### Known Limitations
1. **Total Units Trend**: Currently placeholder, needs historical data tracking
2. **Occupancy Trend**: Calculated month-over-month, could be more granular
3. **Revenue**: Accrual-based only, no cash-based option
4. **Timezone**: Uses client timezone, should support org-level timezone setting

## Deployment Checklist

- [x] Backend API endpoints implemented
- [x] Frontend components wired to API
- [x] Loading states implemented
- [x] Error states implemented
- [x] Empty states implemented
- [x] Quick Actions navigation implemented
- [x] Auto-refresh implemented
- [x] Tests written for org scoping
- [x] Tests written for KPI calculations
- [x] Tests written for activity filtering
- [ ] Manual QA testing with real data
- [ ] Performance testing with large datasets
- [ ] Mobile responsiveness verification

## Maintenance

### Adding New Event Types
1. Update `event_type` enum in [003_complete_schema.sql](supabase/migrations/003_complete_schema.sql#L12-L25)
2. Add activity logging in relevant service functions
3. Update frontend color mapping if needed

### Adding New Task Sources
1. Add query in `getDashboardSummary()` function
2. Map to `UpcomingTask` type
3. Add to `upcomingTasks` array
4. Ensure sorting by due date

### Modifying KPIs
1. Update calculation in `dashboardService.ts`
2. Update `DashboardSummary` type
3. Update frontend display in `DashboardOverview.tsx`
4. Add/update tests in `dashboardKPIs.test.ts`

## Support

For questions or issues:
1. Check this documentation first
2. Review test files for examples
3. Check API logs for backend issues
4. Check browser console for frontend issues
