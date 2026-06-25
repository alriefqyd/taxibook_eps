/**
 * Session Persistence Utility
 * Handles storing and retrieving user sessions for offline access
 * Ensures drivers stay logged in even when the app is backgrounded or phone is off
 */

import type { Session } from '@supabase/supabase-js'

const SESSION_STORAGE_KEY = 'taxibook-session-backup'
const SESSION_EXPIRY_KEY = 'taxibook-session-expiry'

/**
 * Save session to persistent storage (localStorage + IndexedDB)
 * Call this whenever the session changes
 */
export async function saveSessionToStorage(session: Session | null) {
  if (typeof window === 'undefined') return

  try {
    if (session) {
      const sessionData = {
        session,
        timestamp: Date.now(),
        expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days default
      }

      // Save to localStorage
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData))
      localStorage.setItem(SESSION_EXPIRY_KEY, String(sessionData.expiresAt))

      // Also save to IndexedDB for better reliability
      try {
        const db = await openIndexedDB()
        const tx = db.transaction([SESSION_STORAGE_KEY], 'readwrite')
        tx.objectStore(SESSION_STORAGE_KEY).put(sessionData, 'current')
      } catch (err) {
        console.warn('[Session] IndexedDB save failed:', err)
      }

      console.log('[Session] Saved to storage, expires:', new Date(sessionData.expiresAt))
    } else {
      // Clear session on logout
      localStorage.removeItem(SESSION_STORAGE_KEY)
      localStorage.removeItem(SESSION_EXPIRY_KEY)

      try {
        const db = await openIndexedDB()
        const tx = db.transaction([SESSION_STORAGE_KEY], 'readwrite')
        tx.objectStore(SESSION_STORAGE_KEY).clear()
      } catch (err) {
        console.warn('[Session] IndexedDB clear failed:', err)
      }
    }
  } catch (err) {
    console.error('[Session] Storage save failed:', err)
  }
}

/**
 * Retrieve session from storage (used for offline/PWA access)
 * Returns null if session is expired or not found
 */
export async function getSessionFromStorage(): Promise<Session | null> {
  if (typeof window === 'undefined') return null

  try {
    // Check expiry
    const expiryStr = localStorage.getItem(SESSION_EXPIRY_KEY)
    if (expiryStr) {
      const expiry = parseInt(expiryStr)
      if (Date.now() > expiry) {
        console.log('[Session] Stored session expired')
        clearSessionStorage()
        return null
      }
    }

    // Try localStorage first (faster)
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)
    if (stored) {
      const data = JSON.parse(stored)
      console.log('[Session] Loaded from localStorage')
      return data.session
    }

    // Fall back to IndexedDB
    try {
      const db = await openIndexedDB()
      const tx = db.transaction([SESSION_STORAGE_KEY], 'readonly')
      const data = await new Promise<any>((resolve) => {
        const req = tx.objectStore(SESSION_STORAGE_KEY).get('current')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      })

      if (data?.session) {
        console.log('[Session] Loaded from IndexedDB')
        return data.session
      }
    } catch (err) {
      console.warn('[Session] IndexedDB load failed:', err)
    }

    return null
  } catch (err) {
    console.error('[Session] Storage retrieval failed:', err)
    return null
  }
}

/**
 * Clear all stored session data
 */
export function clearSessionStorage() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    localStorage.removeItem(SESSION_EXPIRY_KEY)

    if (typeof window !== 'undefined' && indexedDB) {
      const req = indexedDB.deleteDatabase(SESSION_STORAGE_KEY)
      req.onerror = () => console.warn('[Session] IndexedDB delete failed')
    }
  } catch (err) {
    console.error('[Session] Clear failed:', err)
  }
}

/**
 * Check if stored session is still valid
 */
export function isStoredSessionValid(): boolean {
  try {
    const expiryStr = localStorage.getItem(SESSION_EXPIRY_KEY)
    if (!expiryStr) return false

    const expiry = parseInt(expiryStr)
    return Date.now() <= expiry
  } catch {
    return false
  }
}

/**
 * Open or create IndexedDB for session storage
 */
async function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SESSION_STORAGE_KEY, 1)

    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(SESSION_STORAGE_KEY)) {
        db.createObjectStore(SESSION_STORAGE_KEY)
      }
    }
  })
}
