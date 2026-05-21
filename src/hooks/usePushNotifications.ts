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

        // Unregister stale non-pwa workers that may block activation
        const allRegs = await navigator.serviceWorker.getRegistrations()
        for (const r of allRegs) {
          const swUrl = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || ''
          if (swUrl && !swUrl.endsWith('/sw.js')) {
            await r.unregister()
            console.log('[Push] Unregistered stale SW:', swUrl)
          }
        }

        // Ensure /sw.js is registered in case next-pwa hasn't run yet
        const swReg = await navigator.serviceWorker.getRegistration('/')
        if (!swReg) {
          try { await navigator.serviceWorker.register('/sw.js', { scope: '/' }) } catch { /* ignore */ }
        }

        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Service worker not ready')), 20000)
          ),
        ])
        console.log('[Push] SW ready:', reg.scope)

        // Always unsubscribe the stale sub first so we get a fresh, valid endpoint
        const staleSub = await reg.pushManager.getSubscription()
        if (staleSub) await staleSub.unsubscribe()

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
        })
        console.log('[Push] Subscribed:', sub.endpoint.slice(0, 60))

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
