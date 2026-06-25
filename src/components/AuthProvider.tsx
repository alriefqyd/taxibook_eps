'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSessionFromStorage, saveSessionToStorage } from '@/lib/session-persistence'
import type { Session, User, SupabaseClient } from '@supabase/supabase-js'

type AuthContextValue = {
  supabase: SupabaseClient
  session: Session | null
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let mounted = true

    async function initAuth() {
      // Declare outside try so catch block can access it
      let storedSession: Session | null = null
      try {
        // Step 1: Restore session from offline storage instantly (PWA fast-path)
        storedSession = await getSessionFromStorage()
        if (storedSession && mounted) {
          setSession(storedSession)
          setUser(storedSession.user ?? null)
        }

        // Step 2: Verify/refresh with Supabase (network request)
        const { data } = await supabase.auth.getSession()
        if (!mounted) return

        if (data.session) {
          setSession(data.session)
          setUser(data.session.user ?? null)
          await saveSessionToStorage(data.session)
        } else if (!storedSession) {
          setSession(null)
          setUser(null)
        }
        // else: keep the stored session — network unavailable but we have a valid local one
      } catch (err) {
        console.error('[Auth] Initialization error:', err)
        // If network fails, keep stored session if available
        if (storedSession && mounted) {
          setSession(storedSession)
          setUser(storedSession.user ?? null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initAuth()

    // Listen for auth changes (login, logout, token refresh)
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      
      setSession(newSession)
      setUser(newSession?.user ?? null)
      
      // Save session changes to storage
      saveSessionToStorage(newSession)
      
      console.log('[Auth] State changed:', _event)
    })

    return () => {
      mounted = false
      if (data?.subscription?.unsubscribe) {
        data.subscription.unsubscribe()
      }
    }
  }, [supabase])

  return (
    <AuthContext.Provider value={{ supabase, session, user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
