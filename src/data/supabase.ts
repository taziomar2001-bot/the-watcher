import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cloud sync is optional. It activates only when both env vars are present, so
// the app runs exactly as before (local-only) until you connect Supabase.
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const SUPABASE_ENABLED = Boolean(URL && ANON)

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(URL as string, ANON as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Namespaced key so it doesn't collide with the library store.
        storageKey: 'tw-auth',
        // PKCE returns OAuth results as ?code=… in the query string. The default
        // implicit flow returns tokens in the #fragment, which collides with
        // HashRouter's #/route URLs.
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    })
  : null

// The single table that holds each user's whole library as one JSON blob.
export const LIBRARY_TABLE = 'library'
