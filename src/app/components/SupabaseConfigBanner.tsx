import { isSupabaseConfigured } from '@/lib/supabase'

export function SupabaseConfigBanner() {
  if (isSupabaseConfigured) {
    return null
  }

  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      Supabase is not configured. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your `.env` file
      and restart the dev server.
    </div>
  )
}
