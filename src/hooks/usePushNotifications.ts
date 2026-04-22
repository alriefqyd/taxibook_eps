'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function usePushNotifications() {
  const supabase = createClient()

  useEffect(() => {
    async function subscribe() {
      try {
        console.log('[Push] Starting...')
        if (typeof window === 'undefined') return
        if (!('serviceWorker' in navigator)) { console.log('[Push] No SW support'); return }
        if (!('PushManager' in window)) { console.log('[Push] No PushManager'); return }

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) { console.log('[Push] No VAPID key'); return }

        const permission = await Notification.requestPermission()
        console.log('[Push] Permission:', permission)
        if (permission !== 'granted') return

        // Wait for SW with timeout
        let reg: ServiceWorkerRegistration | null = null
        try {
          reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('SW timeout')), 10000)
            )
          ]) as ServiceWorkerRegistration
        } catch (e) {
          console.log('[Push] SW not ready:', e)
          // Try getting existing registration
          reg = await navigator.serviceWorker.getRegistration() || null
        }

        if (!reg) { console.log('[Push] No SW registration'); return }
        console.log('[Push] SW ready:', reg.scope)

        let sub = await reg.pushManager.getSubscription()
        console.log('[Push] Existing sub:', !!sub)

        if (!sub) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly:      true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
            })
            console.log('[Push] New sub created:', sub.endpoint.slice(0, 40))
          } catch (e) {
            console.error('[Push] Subscribe failed:', e)
            return
          }
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { console.log('[Push] No session'); return }

        const res = await fetch('/api/push/subscribe', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ subscription: sub }),
        })
        const data = await res.json()
        console.log('[Push] Saved to DB:', res.status, data)

      } catch (err) {
        console.error('[Push] Error:', err)
      }
    }

    // Wait for page to fully load
    if (document.readyState === 'complete') {
      setTimeout(subscribe, 2000)
    } else {
      window.addEventListener('load', () => setTimeout(subscribe, 2000), { once: true })
    }
  }, [])
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = window.atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}
