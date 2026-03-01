-- Add Stripe Connect account linkage for vendor payouts
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS stripe_connected_account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_stripe_connected_account_id
ON vendor_profiles(stripe_connected_account_id);
