'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function usePushNotifications() {
  const supabase = createClient()

  useEffect(() => {
    async function subscribe() {
      try {
        if (typeof window === 'undefined') return
        if (!('serviceWorker' in navigator)) return
        if (!('PushManager' in window)) return

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        // Wait for next-pwa's sw.js to be ready (it has the push handler)
        const reg = await navigator.serviceWorker.ready
        console.log('[Push] SW ready:', reg.scope)

        // Get or create push subscription using the active sw.js
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
          })
          console.log('[Push] New subscription:', sub.endpoint.slice(0, 60))
        } else {
          console.log('[Push] Existing subscription:', sub.endpoint.slice(0, 60))
        }

        // Save to DB
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch('/api/push/subscribe', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ subscription: sub }),
        })
        console.log('[Push] Saved to DB:', res.status)

      } catch (err) {
        console.error('[Push] Error:', err)
      }
    }

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