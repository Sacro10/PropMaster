#!/bin/bash

# Property Management App - Seed Data Runner
# This script runs the seed data generator with your account ID

echo "🌱 Property Management App - Seed Data Generator"
echo ""

# Set environment variables
export SUPABASE_URL="https://orgefuaujqiluulzhzeg.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjcwOCwiZXhwIjoyMDgzMzcyNzA4fQ.ycG37inQesKufMZ_sUhk_WwCjDna8LfMORe6XOCnu9Q"

# Account ID
ACCOUNT_ID="ad20ed72-b46d-44f4-837c-0b7594465418"

echo "📋 Account ID: $ACCOUNT_ID"
echo ""

# Run the seed script
npx ts-node server/src/scripts/seedDemoData.ts $ACCOUNT_ID
