#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
elif [[ -f "$ROOT_DIR/server/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/server/.env"
  set +a
fi

SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [[ -z "${SUPABASE_URL}" || -z "${SUPABASE_SERVICE_ROLE_KEY}" ]]; then
  echo "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env/.server/.env"
  exit 1
fi

ACCOUNT_ID="${1:-}"

headers=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
)

if [[ -z "${ACCOUNT_ID}" ]]; then
  properties_json="$(
    curl -sS "${SUPABASE_URL}/rest/v1/properties?select=id,account_id,name" "${headers[@]}"
  )"
  account_ids="$(echo "${properties_json}" | jq -r 'map(.account_id) | unique | .[]')"
  account_count="$(echo "${account_ids}" | wc -l | tr -d ' ')"
  if [[ "${account_count}" -eq 1 ]]; then
    ACCOUNT_ID="$(echo "${account_ids}" | head -n 1)"
  else
    echo "Multiple account_ids found. Rerun with an account id:"
    echo ""
    echo "${properties_json}" | jq -r '.[] | "\(.name) - \(.account_id)"' | sort -u
    exit 1
  fi
fi

hvac_json="$(
  curl -sS --get "${SUPABASE_URL}/rest/v1/hvac_filter_subscriptions" \
    "${headers[@]}" \
    --data-urlencode "select=id,quantity,next_delivery_date,status,units(property_id,properties(name))" \
    --data-urlencode "account_id=eq.${ACCOUNT_ID}"
)"

echo "HVAC program by property (active subscriptions)"
echo ""

echo "${hvac_json}" | jq -r '
  map(select(.status == "active"))
  | group_by(.units.property_id)[]
  | {
      property_id: .[0].units.property_id,
      property_name: .[0].units.properties.name,
      unit_count: length,
      total_filters: (map(.quantity // 1) | add),
      next_delivery: (map(.next_delivery_date) | map(select(. != null)) | min)
    }
'

total_filters="$(echo "${hvac_json}" | jq -r 'map(select(.status == "active") | (.quantity // 1)) | add // 0')"
property_count="$(echo "${hvac_json}" | jq -r 'map(select(.status == "active") | .units.property_id) | unique | length')"

echo ""
echo "Total filters scheduled: ${total_filters}"
echo "Across properties: ${property_count}"
