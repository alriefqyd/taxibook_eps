'use client'

import { useEffect } from 'react'
import { initializeBackgroundSync } from '@/lib/background-sync'

/**
 * Hook to initialize background session refresh for PWAs
 * Ensures drivers receive notifications even when app is backgrounded
 * 
 * Usage: Call once in your root layout or main app component
 */
export function useBackgroundSync() {
  useEffect(() => {
    const init = async () => {
      try {
        await initializeBackgroundSync()
        console.log('[App] Background sync initialized')
      } catch (err) {
        console.warn('[App] Background sync init failed:', err)
      }
    }

    init()
  }, [])
}
