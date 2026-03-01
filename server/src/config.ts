import dotenv from 'dotenv';
import path from 'path';

const cwd = process.cwd();

// Load env files in precedence order:
// 1) root .env
// 2) server .env (server defaults can override root defaults)
// 3) root .env.local (developer-local overrides)
// 4) server .env.local (server-specific local overrides, if present)
dotenv.config({ path: path.resolve(cwd, '..', '.env') });
dotenv.config({ path: path.resolve(cwd, '.env'), override: true });
dotenv.config({ path: path.resolve(cwd, '..', '.env.local'), override: true });
dotenv.config({ path: path.resolve(cwd, '.env.local'), override: true });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getProjectRefFromSupabaseUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

function getProjectRefFromJwt(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as { ref?: string };
    return parsed.ref || null;
  } catch {
    return null;
  }
}

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabaseRefFromUrl = getProjectRefFromSupabaseUrl(supabaseUrl);
const supabaseRefFromKey = getProjectRefFromJwt(supabaseServiceRoleKey);

if (supabaseRefFromUrl && supabaseRefFromKey && supabaseRefFromUrl !== supabaseRefFromKey) {
  throw new Error(
    `SUPABASE_URL project ref (${supabaseRefFromUrl}) does not match SUPABASE_SERVICE_ROLE_KEY ref (${supabaseRefFromKey}).`
  );
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  stripe: {
    secretKey: requireEnv('STRIPE_SECRET_KEY'),
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
    proPriceId: requireEnv('STRIPE_PRO_PRICE_ID'),
    premiumPriceId: requireEnv('STRIPE_PREMIUM_PRICE_ID'),
  },

  supabase: {
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceRoleKey,
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
} as const;
