# Product Requirement Document (PRD)
**Product:** PropMaster — Property Management Automation Platform  
**Version:** v1.0  
**Date:** Jan 2026  
**Owner:** Product

---

## 1. Product Summary

PropMaster is a vertical SaaS platform for modern property management operations. It consolidates tenant onboarding, maintenance workflows, rent collection, analytics, communication, and property showings into one system.

The platform emphasizes automation through real-time dashboards, screening tools, analytics, and communication workflows.

Primary users include:
- Independent landlords
- Property management firms
- Real estate investment groups

---

## 2. Problem Statement

Property managers currently operate using fragmented tools:
- Email/SMS for communication
- Spreadsheets for rent/units
- Accounting software for financials
- Manual screening & scheduling
- No unified analytics or reporting

This leads to:
- Slow tenant onboarding
- Missed renewals & inspections
- Poor maintenance SLAs
- Manual monthly tasks & reminders
- Lack of portfolio visibility

PropMaster provides a unified operating system for property portfolios.

---

## 3. Goals & KPIs

### **Primary Product Goals**
1. Centralize property operations
2. Reduce manual reminders and follow-ups
3. Improve maintenance response and tenant satisfaction
4. Standardize leasing processes
5. Provide transparent financial analytics

### **Success KPIs**
| Category | KPI |
|---|---|
| Operations | Avg. Maintenance Response Time |
| Leasing | Screening Duration, Acceptance Rate |
| Financial | Rent Collection Rate, Auto-Pay Enrollment % |
| Automation | % Automated Reminders & Routing |
| Satisfaction | Tenant Satisfaction Score |
| Retention | Renewal Rate |

---

## 4. User Personas

### **Property Manager**
- Oversees operations, maintenance, tenants, rent
- Needs automation & visibility

### **Leasing Agent**
- Screens tenants & schedules showings
- Needs faster approval workflows

### **Owner / Investor**
- Views financial and operational performance
- Needs standard reporting & NOI insight

### **Tenant**
- Pays rent, submits maintenance, receives updates
- Needs timely responses & clear communication

---

## 5. Core Features & Requirements

Below are product requirements derived from UI flows.

---

### 5.1 Dashboard — **Portfolio Overview**

**Purpose:** Provide high-level operational and financial insights

#### Functional Requirements:
- KPI Cards:
  - Total Units
  - Occupied Units
  - Active Tenants
  - Monthly Revenue
- Recent Activity Feed with timestamps and categories
- Quick Actions:
  - Screen New Tenant
  - Create Maintenance Request
  - Generate Report
  - Schedule Showing
- System Status Panel:
  - 24/7 Support Status
  - Avg Lease Time
  - Eviction Rate
- Upcoming Tasks:
  - Lease Renewals
  - Inspections
  - Filter Deliveries
  - Financial Reports

#### Non-Functional:
- Real-time or near-real-time updates
- Access: Manager/Owner role

---

### 5.2 Tenants — **Tenant Management & Screening**

#### Functional Requirements:
- Screening KPIs:
  - Avg Screening Time
  - Acceptance Rate
  - AI Accuracy
  - Eviction Rate
- Active Tenants Table:
  - Name
  - Property/Unit
  - Risk Score
  - Monthly Rent
  - Lease End Date
  - Status (Active, Renewal, etc.)
- Applications Panel:
  - Income
  - Credit
  - Screening Status
  - Approve / Review Actions
- Add New Tenant Flow:
  - Application input
  - Screening step
  - Lease assignment

#### Optional AI Requirements:
- Generates:
  - Risk Score
  - Risk Factors
  - Recommendation (Approve/Reject)

---

### 5.3 Maintenance — **Maintenance & Remodel**

#### Functional Requirements:
- KPI Cards:
  - Active Requests
  - Avg Response Time
  - Completion Rate
  - Emergency Support
- Maintenance Requests Table:
  - ID, Priority, Status, Property/Unit
  - Tenant
  - Technician
  - ETA
  - Assign Button
- HVAC Filter Program:
  - Units enrolled per property
  - Next delivery date
  - Filters scheduled
- 24/7 Emergency Panel:
  - Response Time Metric
  - Coverage %
  - Hotline Button
- Smart Routing Panel:
  - Routing Efficiency %
  - Auto-Assignment %

---

### 5.4 Analytics — **Reporting & Performance**

#### Functional Requirements:
- KPI Cards:
  - Total Revenue
  - Occupancy Rate
  - Avg Rent/Unit
  - NOI Margin
- Charts:
  - Revenue Trend (Time Series)
  - Occupancy Rate (Time Series)
  - Property Performance (Bar)
  - Expense Breakdown (Donut)
- Market Pricing Intelligence:
  - Days to Lease
  - Renewal Rate
  - Revenue Growth
  - Monthly Revenue
- Export Button:
  - CSV/PDF formats
  - Timeframe selector

---

### 5.5 Showings — **Electronic Property Showings**

#### Functional Requirements:
- KPI Cards:
  - Scheduled Today
  - Scheduled This Week
  - Avg Response Time
  - Conversion Rate
- Upcoming Showings:
  - Visitor Name
  - Access Code
  - Date & Time
  - Status (Confirmed/Pending)
  - Self-Guided vs Agent-Assisted
  - Reminder + Details Actions
- Available Properties Grid:
  - Rent
  - Beds/Baths
  - SqFt
  - Availability Date
- Schedule Showing Flow
- 24/7 Access Integration:
  - Smart Lock Compatibility
  - Auto Access Codes
  - Notifications

---

### 5.6 Rent — **Rent Collections & Disbursements**

#### Functional Requirements:
- KPI Cards:
  - Collected This Month
  - Collection Rate
  - Auto-Pay Enrolled %
  - Avg Collection Time
- Recent Payments Table:
  - Tenant
  - Property
  - Amount
  - Method
  - Status
  - Date
- Pending Payments Panel:
  - Days overdue
  - Reminder Actions
- Auto-Pay Status Panel:
  - Enrolled count
  - Success Rate
  - Next Payment Day
- Owner Disbursements:
  - Amount
  - Schedule Date
  - Status
- Process Disbursement Flow

---

### 5.7 Messages — **Communication Portal**

#### Functional Requirements:
- KPI Cards:
  - Active Conversations
  - Avg Response Time
  - Automation Rate
  - Tenant Satisfaction
- Conversation List
- Search Messages Input
- Template Management:
  - Create Template
  - View Usage Metrics
- Portal Activity Panel:
  - Messages Today
  - Unread Messages
  - Resolved Today
- Automated Reminders:
  - Rent Due
  - Lease Renewal
  - HVAC Delivery
  - Property Inspection
- Create Reminder Button

#### Automation Rules:
System must support scheduling reminders for:
- Monthly rent
- Lease renewals
- Filter deliveries
- Inspections

---

## 6. Data Requirements

Minimum data models:
- Organizations
- Properties
- Units
- Tenants
- Applications
- Screening Results
- Leases
- Payments
- Disbursements
- Maintenance Requests
- Vendors/Technicians
- Showings
- Conversations / Messages
- Tasks / Reminders
- Activity Events

---

## 7. Security & Compliance

- Multi-tenant RBAC permissions
- PII encryption at rest
- Audit logs for financial & lease actions
- Secure payment data handling

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Dashboard loads < 2.5s |
| Uptime | ≥ 99.5% |
| Scalability | Supports 50K+ units |
| Access Control | RBAC (Owner/Manager/Agent/Tenant) |
| Automation | Background job support |
| Observability | Logs + Metrics + Activity Feed |

---

## 9. Out of Scope (V1)

- Native mobile apps
- Vendor billing/payments
- Full accounting ledger integrations
- Owner portal UX
- Hardware lock integration (beyond placeholder UI)

---

## 10. Future Roadmap

- Tenant Mobile App
- AI Maintenance Auto-Triage
- Owner Investment Portal
- Vendor Marketplace
- Smart Lock Hardware Integrations
- Native Stripe Integration
- Investment & NOI Analytics Dashboard

---

END OF PRD
