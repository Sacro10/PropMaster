#!/bin/bash

# Communication Portal Setup Script
# This script sets up the Communication Portal feature

set -e

echo "========================================="
echo "Communication Portal Setup"
echo "========================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  echo "Please set it with: export DATABASE_URL='your-database-url'"
  exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

# Apply migration
echo "📦 Applying database migration..."
echo ""

if command -v psql &> /dev/null; then
  psql "$DATABASE_URL" -f supabase/migrations/008_communication_portal.sql
  echo ""
  echo "✅ Migration applied successfully!"
else
  echo "⚠️  psql not found. Please install PostgreSQL client or run manually:"
  echo "   psql \$DATABASE_URL -f supabase/migrations/008_communication_portal.sql"
  echo ""
fi

echo ""
echo "========================================="
echo "Communication Portal Setup Complete!"
echo "========================================="
echo ""
echo "Features now available:"
echo "  ✓ Conversations with message threading"
echo "  ✓ Message templates (CRUD operations)"
echo "  ✓ Automated reminders (4 pre-configured)"
echo "  ✓ Portal activity tracking"
echo "  ✓ Communication statistics"
echo "  ✓ Background job for reminders"
echo "  ✓ Integration with Rent/Showings/Maintenance"
echo ""
echo "Next steps:"
echo "  1. Start the backend server: cd server && npm run dev"
echo "  2. Start the frontend: npm run dev"
echo "  3. Navigate to Communication Portal in the app"
echo ""
echo "API Endpoints:"
echo "  GET    /api/communications/conversations"
echo "  POST   /api/communications/messages"
echo "  GET    /api/communications/templates"
echo "  GET    /api/communications/reminders"
echo "  GET    /api/communications/stats"
echo "  GET    /api/communications/activity"
echo ""
echo "For more details, see: COMMUNICATION_PORTAL_COMPLETE.md"
echo ""
