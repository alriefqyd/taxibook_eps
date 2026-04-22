'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function usePushNotifications() {
  const supabase = createClient()

  useEffect(() => {
    async function subscribe() {
      try {
        console.log('[Push] Starting subscription process...')

        if (typeof window === 'undefined') { console.log('[Push] No window'); return }
        if (!('serviceWorker' in navigator)) { console.log('[Push] No service worker'); return }
        if (!('PushManager' in window)) { console.log('[Push] No PushManager'); return }

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        console.log('[Push] VAPID key exists:', !!vapidKey)
        if (!vapidKey) return

        const permission = await Notification.requestPermission()
        console.log('[Push] Permission:', permission)
        if (permission !== 'granted') return

        const reg = await navigator.serviceWorker.ready
        console.log('[Push] SW ready:', reg.scope)

        let sub = await reg.pushManager.getSubscription()
        console.log('[Push] Existing subscription:', !!sub)

        if (!sub) {
          console.log('[Push] Creating new subscription...')
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
          })
          console.log('[Push] Subscription created:', sub.endpoint)
        }

        const { data: { session } } = await supabase.auth.getSession()
        console.log('[Push] Session exists:', !!session)
        if (!session) return

        const res = await fetch('/api/push/subscribe', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ subscription: sub }),
        })
        console.log('[Push] Subscribe API response:', res.status)

      } catch (err) {
        console.error('[Push] Error:', err)
      }
    }

    setTimeout(subscribe, 3000)
  }, [])
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = window.atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}