# Demo Data Seeder

This script generates realistic demo data for the Property Management Automation App.

## Prerequisites

1. Set up your environment variables in `.env`:
   ```bash
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. Ensure your Supabase database schema is up to date.

## Usage

```bash
# Get your account ID first (from Supabase dashboard or by logging in)
# Then run:
npx ts-node server/src/scripts/seedDemoData.ts <your-account-id>
```

## What Gets Created

The script will generate:

- **4 Properties** across different cities (LA, Portland, Seattle, Austin)
- **~60 Units** distributed across properties with varying configurations
- **~50 Tenant Users** with active leases
- **~50 Active Leases** with move-in dates
- **~300 Payment Records** covering 6 months of payment history
- **30 Maintenance Requests** with various statuses and priorities
- **~20 Property Showings** for vacant units
- **~30 HVAC Filter Subscriptions** for occupied units
- **~15 Messages** between tenants and property managers
- **6 Owner Disbursements** for monthly accounting

## Features

- ✅ **Realistic Data**: All data follows real-world patterns and constraints
- ✅ **Account-Scoped**: All records are properly associated with your account
- ✅ **Varied Statuses**: Mix of pending/completed/active statuses for realism
- ✅ **Proper Relationships**: Foreign keys and relationships are maintained
- ✅ **Safe to Run**: Requires explicit account ID to prevent accidental execution

## Example Output

```
🌱 Starting to seed demo data...

📍 Creating properties...
✅ Created 4 properties

🏠 Creating units...
✅ Created 62 units

👥 Creating tenant users...
✅ Created 51 tenant users

📄 Creating leases...
✅ Created 51 leases

💳 Creating payments...
✅ Created 306 payment records

... and so on

🎉 Seed data creation complete!
```

## Notes

- The script uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS policies
- Tenant users are created with email `tenant1@example.com`, `tenant2@example.com`, etc.
- Default password for all test users: `DemoPass123!`
- The script will wait 3 seconds before execution to allow cancellation
- All dates are relative to current date for relevance

## Cleanup

To remove all demo data, you can:

1. Delete the account from Supabase (cascades to all related data)
2. Or manually delete records by account_id from each table

## Troubleshooting

**Error: "Account not found"**
- Verify your account ID is correct
- Check that you have the right Supabase project

**Error: "Missing environment variables"**
- Ensure `.env` file exists with correct values
- Check that variables are exported if running in a different shell

**Error: "Could not create user"**
- Check Supabase Auth settings
- Verify email confirmation is not required
- Ensure rate limits haven't been exceeded
