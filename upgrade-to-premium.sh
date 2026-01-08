#!/bin/bash

# Upgrade Account to Premium - Simple Script
# This script upgrades your account directly via Supabase API

echo "🚀 Premium Account Upgrade Script"
echo "=================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please create a .env file with your Supabase credentials"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check required variables
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Missing environment variables"
    echo "Make sure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env"
    exit 1
fi

echo "🔍 Finding your account..."

# Get the first user's email
USER_RESPONSE=$(curl -s "${VITE_SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

# Extract user ID and email (simple parsing)
USER_ID=$(echo $USER_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
USER_EMAIL=$(echo $USER_RESPONSE | grep -o '"email":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
    echo "❌ Error: No users found. Please sign up first."
    exit 1
fi

echo "✅ Found user: $USER_EMAIL"

# Get account ID for this user
ACCOUNT_RESPONSE=$(curl -s "${VITE_SUPABASE_URL}/rest/v1/account_members?user_id=eq.${USER_ID}&role=eq.owner&select=account_id&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

ACCOUNT_ID=$(echo $ACCOUNT_RESPONSE | grep -o '"account_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$ACCOUNT_ID" ]; then
    echo "❌ Error: No account found for this user"
    exit 1
fi

echo "✅ Found account ID: $ACCOUNT_ID"
echo ""
echo "⬆️  Upgrading to Premium..."

# Update account to Premium
UPDATE_RESPONSE=$(curl -s -X PATCH "${VITE_SUPABASE_URL}/rest/v1/accounts?id=eq.${ACCOUNT_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"plan\": \"premium\",
    \"subscription_status\": \"active\",
    \"max_units\": 999999,
    \"updated_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\"
  }")

# Check if update was successful
if echo "$UPDATE_RESPONSE" | grep -q "premium"; then
    echo ""
    echo "✅ Account upgraded successfully!"
    echo ""
    echo "📊 Account Details:"
    echo "   Email: $USER_EMAIL"
    echo "   Plan: PREMIUM"
    echo "   Status: Active"
    echo "   Max Units: Unlimited"
    echo ""
    echo "🎉 You now have access to all Premium features:"
    echo "   ✓ Unlimited units"
    echo "   ✓ AI risk scoring"
    echo "   ✓ Integrated accounting"
    echo "   ✓ HVAC filter program"
    echo "   ✓ Electronic showings"
    echo "   ✓ 24/7 emergency support"
    echo "   ✓ Advanced analytics"
    echo "   ✓ Custom reports"
    echo "   ✓ API access"
    echo ""
    echo "💡 Refresh your browser to see the changes!"
else
    echo "❌ Error: Failed to upgrade account"
    echo "Response: $UPDATE_RESPONSE"
    exit 1
fi
