# Complete API Documentation

## Overview

This is the complete backend API implementation for the Property Management SaaS application. All endpoints are authenticated via JWT and enforce multi-tenant isolation with account_id scoping.

**Base URL**: `http://localhost:3001/api`
**Authentication**: Bearer token in `Authorization` header
**Version**: 2.0.0

## Table of Contents

1. [Authentication](#authentication)
2. [Dashboard API](#dashboard-api)
3. [Activity Feed API](#activity-feed-api)
4. [Tenants API](#tenants-api)
5. [Maintenance API](#maintenance-api)
6. [Applications & Screening API](#applications--screening-api)
7. [HVAC Program API](#hvac-program-api)
8. [Showings API](#showings-api)
9. [Messages & Communication API](#messages--communication-api)
10. [Background Jobs](#background-jobs)
11. [Error Handling](#error-handling)
12. [Rate Limiting](#rate-limiting)

---

## Authentication

All API endpoints (except `/health`) require authentication via Supabase JWT token.

### Headers

```
Authorization: Bearer <supabase_jwt_token>
```

### How It Works

1. User authenticates with Supabase (client-side)
2. Client receives JWT token
3. Client includes token in Authorization header
4. Server validates token and extracts:
   - User ID
   - User email
   - Account ID (from account_members table)
   - User role

### Roles

- `owner` - Full access
- `admin` - Full access except billing
- `manager` - Properties, tenants, maintenance, showings
- `maintenance` - Maintenance tickets only
- `agent` - Showings and applications
- `readonly` - View-only access
- `tenant` - Tenant portal
- `vendor` - Vendor portal

---

## Dashboard API

### GET /api/dashboard/summary

Get comprehensive dashboard summary with metrics.

**Auth Required**: Yes
**Permission**: `analytics:read`

**Response**:
```json
{
  "properties": {
    "total": 12,
    "active": 11,
    "totalUnits": 145,
    "occupiedUnits": 132,
    "occupancyRate": 91.0
  },
  "revenue": {
    "currentMonth": 156780.50,
    "previousMonth": 148230.00,
    "percentChange": 5.8,
    "collectionRate": 94.2
  },
  "maintenance": {
    "open": 8,
    "inProgress": 15,
    "urgent": 2,
    "avgResolutionTime": 18.5
  },
  "tenants": {
    "total": 132,
    "moveIns": 5,
    "moveOuts": 3,
    "leasesExpiring": 12
  },
  "recentActivity": [
    {
      "id": "uuid",
      "type": "payment_received",
      "summary": "Payment received from John Doe",
      "timestamp": "2026-01-08T10:30:00Z"
    }
  ]
}
```

---

## Activity Feed API

### GET /api/activity

Get filtered activity events.

**Auth Required**: Yes
**Permission**: `analytics:read`

**Query Parameters**:
- `eventType` (string, optional) - Filter by event type
- `entityType` (string, optional) - Filter by entity type
- `userId` (string, optional) - Filter by user
- `startDate` (string, optional) - ISO date
- `endDate` (string, optional) - ISO date
- `limit` (number, optional) - Default: 50, Max: 100
- `offset` (number, optional) - Default: 0

**Response**:
```json
{
  "events": [
    {
      "id": "uuid",
      "eventType": "tenant_added",
      "entityType": "tenant",
      "entityId": "uuid",
      "summary": "New tenant added: John Doe",
      "metadata": {},
      "userId": "uuid",
      "userEmail": "admin@example.com",
      "userName": "Admin User",
      "timestamp": "2026-01-08T10:30:00Z"
    }
  ],
  "total": 150
}
```

### GET /api/activity/stats

Get activity statistics.

**Auth Required**: Yes
**Permission**: `analytics:read`

**Query Parameters**:
- `startDate` (string, optional) - ISO date
- `endDate` (string, optional) - ISO date

**Response**:
```json
{
  "totalEvents": 1250,
  "eventsByType": {
    "payment_received": 450,
    "maintenance_created": 180,
    "tenant_added": 25
  },
  "eventsByDay": [
    { "date": "2026-01-01", "count": 45 },
    { "date": "2026-01-02", "count": 52 }
  ]
}
```

---

## Tenants API

### GET /api/tenants

List all tenants.

**Auth Required**: Yes
**Permission**: `tenants:read`

**Query Parameters**:
- `status` (string, optional) - Filter by status
- `unitId` (string, optional) - Filter by unit
- `propertyId` (string, optional) - Filter by property
- `limit` (number, optional) - Default: 50
- `offset` (number, optional) - Default: 0

**Response**:
```json
{
  "tenants": [
    {
      "id": "uuid",
      "userId": "uuid",
      "unitId": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "status": "active",
      "leaseStart": "2024-01-01",
      "leaseEnd": "2024-12-31",
      "rentAmount": 1500.00,
      "depositAmount": 1500.00,
      "createdAt": "2024-01-01T00:00:00Z",
      "unit": {
        "unitNumber": "101",
        "property": {
          "name": "Sunset Apartments",
          "address": "123 Main St"
        }
      }
    }
  ],
  "total": 132
}
```

### GET /api/tenants/:id

Get single tenant.

**Auth Required**: Yes
**Permission**: `tenants:read`

**Response**: Same as single tenant object above.

### POST /api/tenants

Create a new tenant.

**Auth Required**: Yes
**Permission**: `tenants:create`

**Request Body**:
```json
{
  "unitId": "uuid",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "leaseStart": "2026-02-01",
  "leaseEnd": "2027-01-31",
  "rentAmount": 1600.00,
  "depositAmount": 1600.00
}
```

**Response**: Created tenant object (201).

### PATCH /api/tenants/:id

Update a tenant.

**Auth Required**: Yes
**Permission**: `tenants:update`

**Request Body**:
```json
{
  "phone": "+0987654321",
  "status": "moved_out",
  "leaseEnd": "2026-12-31",
  "rentAmount": 1650.00
}
```

**Response**: Updated tenant object.

---

## Maintenance API

### GET /api/maintenance

List maintenance requests.

**Auth Required**: Yes
**Permission**: `maintenance:read`

**Query Parameters**:
- `status` (string, optional)
- `priority` (string, optional)
- `propertyId` (string, optional)
- `unitId` (string, optional)
- `assignedTo` (string, optional)
- `limit` (number, optional)
- `offset` (number, optional)

**Response**:
```json
{
  "requests": [
    {
      "id": "uuid",
      "title": "Leaking faucet in kitchen",
      "description": "Kitchen sink faucet is dripping",
      "priority": "medium",
      "status": "open",
      "category": "plumbing",
      "unitId": "uuid",
      "propertyId": "uuid",
      "reportedBy": "uuid",
      "assignedTo": null,
      "createdAt": "2026-01-08T09:00:00Z",
      "updatedAt": "2026-01-08T09:00:00Z",
      "property": {
        "name": "Sunset Apartments",
        "address": "123 Main St"
      },
      "unit": {
        "unitNumber": "101"
      }
    }
  ],
  "total": 45
}
```

### POST /api/maintenance

Create maintenance request.

**Auth Required**: Yes
**Permission**: `maintenance:create`

**Request Body**:
```json
{
  "title": "Broken AC unit",
  "description": "AC not cooling, making noise",
  "priority": "urgent",
  "category": "hvac",
  "unitId": "uuid",
  "reportedBy": "uuid"
}
```

**Response**: Created request (201).

### PATCH /api/maintenance/:id

Update maintenance request.

**Auth Required**: Yes
**Permission**: `maintenance:update`

**Request Body**:
```json
{
  "status": "in_progress",
  "assignedTo": "uuid",
  "priority": "high"
}
```

**Response**: Updated request.

### GET /api/maintenance/sla-metrics

Get SLA performance metrics.

**Auth Required**: Yes
**Permission**: `maintenance:read`

**Response**:
```json
{
  "totalRequests": 150,
  "avgResponseTime": 2.5,
  "avgResolutionTime": 18.3,
  "responseSLAMet": 92,
  "resolutionSLAMet": 85,
  "byPriority": {
    "urgent": { "total": 15, "slaMetPercentage": 80.0 },
    "high": { "total": 35, "slaMetPercentage": 88.6 },
    "medium": { "total": 70, "slaMetPercentage": 90.0 },
    "low": { "total": 30, "slaMetPercentage": 93.3 }
  }
}
```

---

## Applications & Screening API

### GET /api/applications

List rental applications.

**Auth Required**: Yes
**Permission**: `applications:read`

**Query Parameters**:
- `status` (string, optional)
- `unitId` (string, optional)
- `propertyId` (string, optional)
- `limit` (number, optional)
- `offset` (number, optional)

**Response**:
```json
{
  "applications": [
    {
      "id": "uuid",
      "firstName": "Alice",
      "lastName": "Johnson",
      "email": "alice@example.com",
      "phone": "+1234567890",
      "unitId": "uuid",
      "propertyId": "uuid",
      "status": "pending",
      "moveInDate": "2026-03-01",
      "monthlyIncome": 5000.00,
      "currentEmployer": "Tech Corp",
      "currentAddress": "456 Oak St",
      "hasScreeningResult": false,
      "createdAt": "2026-01-08T10:00:00Z",
      "unit": {
        "unitNumber": "202",
        "rentAmount": 1500.00
      },
      "property": {
        "name": "Sunset Apartments",
        "address": "123 Main St"
      }
    }
  ],
  "total": 25
}
```

### GET /api/applications/:id

Get single application.

**Auth Required**: Yes
**Permission**: `applications:read`

**Response**: Same as single application object.

### POST /api/applications

Create rental application.

**Auth Required**: Yes

**Request Body**:
```json
{
  "firstName": "Bob",
  "lastName": "Williams",
  "email": "bob@example.com",
  "phone": "+1234567890",
  "unitId": "uuid",
  "moveInDate": "2026-03-01",
  "monthlyIncome": 4500.00,
  "currentEmployer": "Startup Inc",
  "currentAddress": "789 Pine St"
}
```

**Response**: Created application (201).

### POST /api/applications/:id/approve

Approve an application.

**Auth Required**: Yes
**Permission**: `applications:update`

**Response**: Updated application with status "approved".

### POST /api/applications/:id/reject

Reject an application.

**Auth Required**: Yes
**Permission**: `applications:update`

**Request Body** (optional):
```json
{
  "reason": "Income verification failed"
}
```

**Response**: Updated application with status "rejected".

### POST /api/applications/:id/screen

Run screening for application.

**Auth Required**: Yes
**Permission**: `applications:update`

**Response**:
```json
{
  "id": "uuid",
  "applicationId": "uuid",
  "provider": "internal",
  "creditScore": 720,
  "backgroundCheckStatus": "clear",
  "evictionHistory": false,
  "criminalHistory": false,
  "incomeVerificationStatus": "verified",
  "riskScore": 85,
  "riskFactors": [],
  "recommendations": "Recommended for approval",
  "screenedAt": "2026-01-08T11:00:00Z"
}
```

---

## HVAC Program API

### GET /api/hvac/summary

Get HVAC program summary.

**Auth Required**: Yes
**Permission**: `hvac:read`

**Response**:
```json
{
  "totalEnrollments": 95,
  "activeEnrollments": 92,
  "upcomingDeliveries": 15,
  "deliveriesThisMonth": 28,
  "filtersSentThisMonth": 28,
  "nextBatchDate": "2026-01-15"
}
```

### GET /api/hvac/enrollments

List HVAC enrollments.

**Auth Required**: Yes
**Permission**: `hvac:read`

**Query Parameters**:
- `status` (string, optional)
- `unitId` (string, optional)
- `limit` (number, optional)
- `offset` (number, optional)

**Response**:
```json
{
  "enrollments": [
    {
      "id": "uuid",
      "unitId": "uuid",
      "frequency": "quarterly",
      "filterSize": "16x25x1",
      "nextDeliveryDate": "2026-04-01",
      "status": "active",
      "createdAt": "2025-01-01T00:00:00Z",
      "unit": {
        "unitNumber": "101",
        "property": {
          "name": "Sunset Apartments",
          "address": "123 Main St"
        }
      }
    }
  ],
  "total": 95
}
```

### POST /api/hvac/enrollments

Create HVAC enrollment.

**Auth Required**: Yes
**Permission**: `hvac:create`

**Request Body**:
```json
{
  "unitId": "uuid",
  "frequency": "quarterly",
  "filterSize": "16x25x1"
}
```

**Response**: Created enrollment (201).

### GET /api/hvac/batches

List delivery batches.

**Auth Required**: Yes
**Permission**: `hvac:read`

**Query Parameters**:
- `status` (string, optional)
- `limit` (number, optional)
- `offset` (number, optional)

**Response**:
```json
{
  "batches": [
    {
      "id": "uuid",
      "batchNumber": "BATCH-1736345678901",
      "deliveryDate": "2026-01-15",
      "totalUnits": 30,
      "totalFilters": 30,
      "status": "pending",
      "carrier": "USPS",
      "trackingNumbers": ["9400..."],
      "createdAt": "2026-01-08T00:00:00Z"
    }
  ],
  "total": 12
}
```

### POST /api/hvac/deliveries/:id/delivered

Mark delivery as delivered.

**Auth Required**: Yes
**Permission**: `hvac:update`

**Request Body** (optional):
```json
{
  "trackingNumber": "9400111111111111111111"
}
```

**Response**: `{ "success": true }`

### POST /api/hvac/batches/generate

Generate next delivery batch.

**Auth Required**: Yes
**Permission**: `hvac:create`

**Response**: Created batch (201).

---

## Showings API

### GET /api/showings

List showings.

**Auth Required**: Yes
**Permission**: `showings:read`

**Query Parameters**:
- `status` (string, optional)
- `unitId` (string, optional)
- `propertyId` (string, optional)
- `startDate` (string, optional)
- `endDate` (string, optional)
- `limit` (number, optional)
- `offset` (number, optional)

**Response**:
```json
{
  "showings": [
    {
      "id": "uuid",
      "unitId": "uuid",
      "propertyId": "uuid",
      "scheduledDate": "2026-01-10T14:00:00Z",
      "duration": 30,
      "status": "scheduled",
      "agentName": "Sarah Agent",
      "prospectName": "Mike Prospect",
      "prospectEmail": "mike@example.com",
      "prospectPhone": "+1234567890",
      "accessCode": "ABC123",
      "notes": "Interested in 2BR units",
      "createdAt": "2026-01-08T10:00:00Z",
      "unit": {
        "unitNumber": "301",
        "rentAmount": 1800.00
      },
      "property": {
        "name": "Sunset Apartments",
        "address": "123 Main St"
      }
    }
  ],
  "total": 45
}
```

### POST /api/showings

Create a showing.

**Auth Required**: Yes
**Permission**: `showings:create`

**Request Body**:
```json
{
  "unitId": "uuid",
  "scheduledDate": "2026-01-10T14:00:00Z",
  "duration": 30,
  "agentName": "Sarah Agent",
  "prospectName": "Mike Prospect",
  "prospectEmail": "mike@example.com",
  "prospectPhone": "+1234567890",
  "notes": "Wants to see kitchen"
}
```

**Response**: Created showing with auto-generated access code (201).

### PATCH /api/showings/:id/status

Update showing status.

**Auth Required**: Yes
**Permission**: `showings:update`

**Request Body**:
```json
{
  "status": "completed"
}
```

**Response**: `{ "success": true }`

### POST /api/showings/:id/outcome

Record showing outcome.

**Auth Required**: Yes
**Permission**: `showings:update`

**Request Body**:
```json
{
  "outcome": "interested",
  "feedbackRating": 5,
  "feedbackText": "Loved the unit!",
  "nextSteps": "Send application",
  "followUpDate": "2026-01-12"
}
```

**Response**: Created outcome (201).

---

## Messages & Communication API

### GET /api/messages/conversations

List conversations.

**Auth Required**: Yes
**Permission**: `messages:read`

**Query Parameters**:
- `status` (string, optional)
- `limit` (number, optional)
- `offset` (number, optional)

**Response**:
```json
{
  "conversations": [
    {
      "id": "uuid",
      "subject": "Maintenance inquiry",
      "participants": ["uuid1", "uuid2"],
      "propertyId": "uuid",
      "unitId": "uuid",
      "relatedType": "maintenance",
      "relatedId": "uuid",
      "status": "active",
      "lastMessageAt": "2026-01-08T15:30:00Z",
      "createdAt": "2026-01-07T10:00:00Z"
    }
  ],
  "total": 25
}
```

### GET /api/messages/conversations/:id

Get messages in conversation.

**Auth Required**: Yes
**Permission**: `messages:read`

**Response**:
```json
[
  {
    "id": "uuid",
    "conversationId": "uuid",
    "senderId": "uuid",
    "recipientId": "uuid",
    "subject": "Maintenance inquiry",
    "body": "When will the AC be fixed?",
    "isRead": true,
    "createdAt": "2026-01-08T15:30:00Z"
  }
]
```

### POST /api/messages/send

Send a message.

**Auth Required**: Yes
**Permission**: `messages:create`

**Request Body**:
```json
{
  "recipientId": "uuid",
  "subject": "Follow up",
  "body": "Just following up on your request",
  "conversationId": "uuid",
  "propertyId": "uuid",
  "unitId": "uuid"
}
```

**Response**: Created message (201).

### PATCH /api/messages/:id/read

Mark message as read.

**Auth Required**: Yes
**Permission**: `messages:read`

**Response**: `{ "success": true }`

### GET /api/messages/templates

Get message templates.

**Auth Required**: Yes
**Permission**: `messages:read`

**Query Parameters**:
- `category` (string, optional)
- `isActive` (boolean, optional)

**Response**:
```json
[
  {
    "id": "uuid",
    "name": "Rent Reminder",
    "category": "payment",
    "subject": "Rent Due Reminder",
    "body": "Hi {{tenant_name}}, your rent of {{amount}} is due on {{due_date}}.",
    "variables": ["tenant_name", "amount", "due_date"],
    "usageCount": 150,
    "isActive": true,
    "createdAt": "2025-01-01T00:00:00Z"
  }
]
```

### POST /api/messages/templates

Create message template.

**Auth Required**: Yes
**Permission**: `messages:create`

**Request Body**:
```json
{
  "name": "Move-in Welcome",
  "category": "onboarding",
  "subject": "Welcome to {{property_name}}!",
  "body": "Welcome {{tenant_name}}! Here's your move-in info...",
  "variables": ["property_name", "tenant_name"]
}
```

**Response**: Created template (201).

### GET /api/messages/reminders

Get reminder schedules.

**Auth Required**: Yes
**Permission**: `messages:read`

**Query Parameters**:
- `isActive` (boolean, optional)

**Response**:
```json
[
  {
    "id": "uuid",
    "name": "Monthly Rent Reminder",
    "reminderType": "rent_due",
    "templateId": "uuid",
    "frequency": "monthly",
    "customCron": null,
    "nextRunAt": "2026-02-01T09:00:00Z",
    "lastRunAt": "2026-01-01T09:00:00Z",
    "isActive": true,
    "recipientFilter": { "role": "tenant", "lease_status": "active" },
    "createdAt": "2025-01-01T00:00:00Z"
  }
]
```

### POST /api/messages/reminders

Create reminder schedule.

**Auth Required**: Yes
**Permission**: `messages:create`

**Request Body**:
```json
{
  "name": "Lease Expiry Reminder",
  "reminderType": "lease_expiring",
  "templateId": "uuid",
  "frequency": "monthly",
  "recipientFilter": { "role": "tenant" }
}
```

**Response**: Created reminder (201).

---

## Background Jobs

The system includes automated background jobs that run on a schedule:

### Active Jobs

1. **Process Reminders** - Every 5 minutes
   - Checks for scheduled reminders that are due
   - Sends messages based on templates
   - Updates next run time

2. **Process HVAC Deliveries** - Every hour
   - Checks for delivery batches due today
   - Processes delivery schedules
   - Updates batch status

3. **Cleanup Old Events** - Every 24 hours
   - Deletes activity events older than 90 days
   - Keeps database size manageable

4. **Update Property Stats** - Every 15 minutes
   - Recalculates occupancy rates
   - Updates unit counts
   - Refreshes property statistics

### Job Management

Jobs are automatically started when the server starts and stopped on shutdown. They can be managed via:

```typescript
import { startJobs, stopJobs, stopJob } from './jobs';

startJobs();  // Start all jobs
stopJobs();   // Stop all jobs
stopJob('process-reminders');  // Stop specific job
```

---

## Error Handling

All endpoints return consistent error responses:

### Error Response Format

```json
{
  "error": "Human-readable error message",
  "details": "Additional error details (optional)"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Example Errors

**Missing Authentication**:
```json
{
  "error": "Missing or invalid authorization header"
}
```

**Insufficient Permissions**:
```json
{
  "error": "Insufficient permissions",
  "required": { "resource": "tenants", "action": "create" },
  "userRole": "readonly"
}
```

**Validation Error**:
```json
{
  "error": "Missing required fields",
  "required": ["firstName", "lastName", "email"]
}
```

---

## Rate Limiting

Rate limiting is applied to all API endpoints:

- **General API**: 100 requests per 15 minutes per IP
- **Webhooks**: 30 requests per minute per IP

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1736345678
```

---

## Complete Endpoint List

### Dashboard
- `GET /api/dashboard/summary`

### Activity
- `GET /api/activity`
- `GET /api/activity/stats`

### Tenants
- `GET /api/tenants`
- `GET /api/tenants/:id`
- `POST /api/tenants`
- `PATCH /api/tenants/:id`

### Maintenance
- `GET /api/maintenance`
- `POST /api/maintenance`
- `PATCH /api/maintenance/:id`
- `GET /api/maintenance/sla-metrics`

### Applications
- `GET /api/applications`
- `GET /api/applications/:id`
- `POST /api/applications`
- `POST /api/applications/:id/approve`
- `POST /api/applications/:id/reject`
- `POST /api/applications/:id/screen`

### HVAC
- `GET /api/hvac/summary`
- `GET /api/hvac/enrollments`
- `POST /api/hvac/enrollments`
- `GET /api/hvac/batches`
- `POST /api/hvac/deliveries/:id/delivered`
- `POST /api/hvac/batches/generate`

### Showings
- `GET /api/showings`
- `POST /api/showings`
- `PATCH /api/showings/:id/status`
- `POST /api/showings/:id/outcome`

### Messages
- `GET /api/messages/conversations`
- `GET /api/messages/conversations/:id`
- `POST /api/messages/send`
- `PATCH /api/messages/:id/read`
- `GET /api/messages/templates`
- `POST /api/messages/templates`
- `GET /api/messages/reminders`
- `POST /api/messages/reminders`

### Other
- `GET /health`
- `GET /`
- `POST /api/checkout/*` (Stripe checkout)
- `POST /webhooks/stripe`

---

## Getting Started

1. **Install dependencies**:
   ```bash
   cd server
   npm install
   ```

2. **Run database migration**:
   ```bash
   ./run-migration.sh
   ```

3. **Start server**:
   ```bash
   npm run dev
   ```

4. **Test endpoint**:
   ```bash
   curl http://localhost:3001/health
   ```

5. **Authenticate**:
   - Get JWT token from Supabase authentication
   - Include in Authorization header: `Bearer <token>`

---

## Additional Resources

- [BACKEND_IMPLEMENTATION.md](BACKEND_IMPLEMENTATION.md) - Architecture overview
- [Database Migration](supabase/migrations/003_complete_schema.sql) - Complete schema
- [Background Jobs](server/src/jobs/index.ts) - Job system implementation

---

**Last Updated**: 2026-01-08
**Version**: 2.0.0
