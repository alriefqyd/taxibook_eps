'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SupabaseAuthListener() {
  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Broadcast a window event so the app can react to restored sessions
      try {
        window.dispatchEvent(new CustomEvent('supabase-auth-change', { detail: session }))
      } catch (e) {
        // ignore
      }
    })

    return () => {
      // unsubscribe if available
      if (data && typeof (data as any).subscription?.unsubscribe === 'function') {
        ;(data as any).subscription.unsubscribe()
      }
      if (data && typeof (data as any).unsubscribe === 'function') {
        ;(data as any).unsubscribe()
      }
    }
  }, [])

  return null
}
