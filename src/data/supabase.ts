import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cloud sync is optional. It activates only when both env vars are present, so
// the app runs exactly as before (local-only) until you connect Supabase.
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const SUPABASE_ENABLED = Boolean(URL && ANON)

// The owner's email (set VITE_OWNER_EMAIL in the environment). Only this account
// may see/run the baked TV Time import, which reconstructs the owner's personal
// library — so no other user can pull it into their own account.
export const OWNER_EMAIL = (import.meta.env.VITE_OWNER_EMAIL as string | undefined)?.toLowerCase()

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(URL as string, ANON as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Namespaced key so it doesn't collide with the library store.
        storageKey: 'tw-auth',
      },
    })
  : null

// The single table that holds each user's whole library as one JSON blob.
export const LIBRARY_TABLE = 'library'
