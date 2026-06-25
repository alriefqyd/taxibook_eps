/**
 * Background Session Manager
 * Handles session refresh while the app is backgrounded or the phone is off
 * Enables drivers to receive push notifications without the app being active
 */

import { createClient } from '@/lib/supabase/client'

const BG_SYNC_TAG = 'refresh-session'

/**
 * Initialize background session refresh
 * Registers a periodic sync event to refresh the session every 30 minutes
 * This ensures tokens stay valid even when the app is backgrounded
 */
export async function initializeBackgroundSync() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  try {
    const reg = await navigator.serviceWorker.ready
    if (!('periodicSync' in reg)) {
      console.log('[BgSync] Periodic sync not supported')
      return
    }

    // Request periodic sync every 30 minutes
    await (reg.periodicSync as any).register(BG_SYNC_TAG, {
      minInterval: 30 * 60 * 1000, // 30 minutes
    })

    console.log('[BgSync] Registered periodic session refresh')
  } catch (err) {
    console.warn('[BgSync] Failed to register periodic sync:', err)
  }
}

/**
 * Refresh session token in the background
 * Called by service worker during periodic sync or on notification received
 */
export async function refreshSessionInBackground() {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.auth.refreshSession()

    if (error) {
      console.warn('[BgSync] Session refresh failed:', error.message)
      return false
    }

    if (data.session) {
      console.log('[BgSync] Session refreshed successfully')
      return true
    }

    return false
  } catch (err) {
    console.error('[BgSync] Refresh error:', err)
    return false
  }
}

/**
 * Check if session is still valid
 * Returns false if session is expired or missing
 */
export async function isSessionValid(): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.auth.getSession()

    if (error || !data.session) {
      return false
    }

    // Check if token is about to expire (within 5 minutes)
    if (data.session.expires_at) {
      const expiresIn = data.session.expires_at * 1000 - Date.now()
      return expiresIn > 5 * 60 * 1000
    }

    return true
  } catch (err) {
    console.error('[BgSync] Session check error:', err)
    return false
  }
}

/**
 * Ensure session is valid before making authenticated requests
 * Refreshes if needed
 */
export async function ensureValidSession(): Promise<boolean> {
  const valid = await isSessionValid()

  if (!valid) {
    console.log('[BgSync] Token expired, attempting refresh...')
    return refreshSessionInBackground()
  }

  return true
}
