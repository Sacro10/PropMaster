#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(rootDir, '.env'));
loadEnvFile(path.join(rootDir, 'server', '.env'));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const accountIdArg = process.argv[2];

async function resolveAccountId() {
  if (accountIdArg) return accountIdArg;

  const { data, error } = await supabase
    .from('properties')
    .select('id, account_id, name');

  if (error) throw error;

  const accountIds = Array.from(new Set((data || []).map((p) => p.account_id)));
  if (accountIds.length === 1) return accountIds[0];

  console.log('Multiple account_ids found. Rerun with an account id:');
  console.log('');
  for (const p of data || []) {
    console.log(`${p.name} - ${p.account_id}`);
  }
  process.exit(1);
}

async function main() {
  const accountId = await resolveAccountId();
  const { data, error } = await supabase
    .from('hvac_filter_subscriptions')
    .select(
      `
      id,
      quantity,
      next_delivery_date,
      status,
      units (
        property_id,
        properties ( name )
      )
    `,
    )
    .eq('account_id', accountId)
    .eq('status', 'active');

  if (error) throw error;

  const propertyMap = new Map();
  for (const sub of data || []) {
    const prop = sub.units?.properties;
    const propertyId = sub.units?.property_id;
    if (!prop || !propertyId) continue;

    if (!propertyMap.has(propertyId)) {
      propertyMap.set(propertyId, {
        property_id: propertyId,
        property_name: prop.name,
        unit_count: 0,
        total_filters: 0,
        next_delivery: null,
      });
    }

    const entry = propertyMap.get(propertyId);
    entry.unit_count += 1;
    entry.total_filters += sub.quantity ?? 1;

    if (sub.next_delivery_date) {
      if (!entry.next_delivery || sub.next_delivery_date < entry.next_delivery) {
        entry.next_delivery = sub.next_delivery_date;
      }
    }
  }

  console.log('HVAC program by property (active subscriptions)');
  console.log('');
  for (const entry of propertyMap.values()) {
    console.log(
      `${entry.property_name} (${entry.property_id}) | units=${entry.unit_count} | filters=${entry.total_filters} | next=${entry.next_delivery || 'n/a'}`,
    );
  }

  const totalFilters = Array.from(propertyMap.values()).reduce(
    (sum, p) => sum + p.total_filters,
    0,
  );

  console.log('');
  console.log(`Total filters scheduled: ${totalFilters}`);
  console.log(`Across properties: ${propertyMap.size}`);
}

main().catch((err) => {
  console.error('Failed to load HVAC program:', err);
  process.exit(1);
});
