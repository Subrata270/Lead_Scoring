/**
 * Validates required client env vars at startup. Logs warnings; does not throw.
 */
export function validateClientEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const missing = []
  if (!url?.trim()) missing.push('VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL')
  if (!key?.trim()) missing.push('VITE_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY')

  if (missing.length) {
    console.warn(
      `[env] Missing required Supabase configuration: ${missing.join(', ')}. ` +
        'Copy frontend/.env.example to frontend/.env and set your project values.',
    )
    return { ok: false, missing }
  }

  return { ok: true, missing: [] }
}
