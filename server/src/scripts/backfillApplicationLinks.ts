import { supabaseAdmin as supabase } from '../supabase';

type TenantProfileRow = {
  account_id: string;
  user_id: string;
  email: string | null;
};

type ApplicationRow = {
  id: string;
  account_id: string;
  email: string | null;
  applicant_user_id: string | null;
};

async function backfillApplicantUserIds() {
  const { data: profiles, error: profilesError } = await supabase
    .from('tenant_profiles')
    .select('account_id, user_id, email');

  if (profilesError) throw profilesError;

  const profileMap = new Map<string, string>();
  (profiles as TenantProfileRow[] | null || []).forEach((profile) => {
    if (!profile.email) return;
    profileMap.set(`${profile.account_id}:${profile.email.toLowerCase()}`, profile.user_id);
  });

  const pageSize = 500;
  let offset = 0;
  let updated = 0;
  let scanned = 0;

  while (true) {
    const { data: applications, error: applicationsError } = await supabase
      .from('rental_applications')
      .select('id, account_id, email, applicant_user_id')
      .is('applicant_user_id', null)
      .not('email', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (applicationsError) throw applicationsError;

    const rows = (applications as ApplicationRow[] | null) || [];
    if (rows.length === 0) break;

    for (const app of rows) {
      scanned += 1;
      if (!app.email) continue;
      const key = `${app.account_id}:${app.email.toLowerCase()}`;
      const userId = profileMap.get(key);
      if (!userId) continue;

      const { error: updateError } = await supabase
        .from('rental_applications')
        .update({ applicant_user_id: userId })
        .eq('id', app.id)
        .eq('account_id', app.account_id);

      if (updateError) throw updateError;
      updated += 1;
    }

    offset += pageSize;
  }

  console.log(`[Backfill] Scanned ${scanned} applications; updated ${updated} applicant_user_id values.`);
}

backfillApplicantUserIds()
  .then(() => {
    console.log('[Backfill] Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Backfill] Failed:', error);
    process.exit(1);
  });
