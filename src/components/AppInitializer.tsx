'use client'

import { useEffect } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { useBackgroundSync } from '@/hooks/useBackgroundSync'
import { usePushNotifications } from '@/hooks/usePushNotifications'

function PushInitializer() {
  usePushNotifications()
  return null
}

export default function AppInitializer() {
  const { user, loading } = useAuth()

  useBackgroundSync()

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // App resumed from background — Supabase auto-refresh handles token renewal
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Only subscribe to push when the user is authenticated
  if (loading || !user) return null
  return <PushInitializer />
}
