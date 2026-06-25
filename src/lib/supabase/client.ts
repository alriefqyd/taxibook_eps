import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Persist session in browser storage so PWAs and reloads restore login
        persistSession: true,
        // Auto-refresh token when it expires
        autoRefreshToken: true,
        // Detect session changes across tabs
        detectSessionInUrl: true,
        // Storage options for PWA
        storage: {
          getItem: (key: string) => {
            if (typeof window === 'undefined') return null
            try { return localStorage.getItem(key) } catch { return null }
          },
          setItem: (key: string, value: string) => {
            if (typeof window === 'undefined') return
            try { localStorage.setItem(key, value) } catch { /* quota errors */ }
          },
          removeItem: (key: string) => {
            if (typeof window === 'undefined') return
            try { localStorage.removeItem(key) } catch { /* ignore */ }
          },
        },
      },
    }
  )
}
