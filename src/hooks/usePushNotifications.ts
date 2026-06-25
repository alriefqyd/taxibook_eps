'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export function usePushNotifications() {
  const subscribedRef = useRef(false)

  useEffect(() => {
    async function subscribe() {
      try {
        if (typeof window === 'undefined') return
        if (!('serviceWorker' in navigator)) return
        if (!('PushManager' in window)) return

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          console.log('[Push] Notification permission denied')
          return
        }

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

        // Wait for session to be available (critical for PWAs)
        const supabase = createClient()
        let session = null
        let attempts = 0
        while (!session && attempts < 10) {
          const { data } = await supabase.auth.getSession()
          session = data.session
          if (!session) {
            console.log('[Push] Waiting for session...', attempts + 1)
            await new Promise(resolve => setTimeout(resolve, 500))
          }
          attempts++
        }

        if (!session) {
          console.warn('[Push] No session available for subscription')
          // Don't fail - continue anyway, the subscription endpoint is still useful
          return
        }

        // Save to DB
        const res = await fetch('/api/push/subscribe', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ subscription: sub }),
        })
        console.log('[Push] Saved to DB:', res.status)
        subscribedRef.current = true

      } catch (err) {
        console.error('[Push] Error:', err)
      }
    }

    // Subscribe when page fully loads
    if (!subscribedRef.current) {
      if (document.readyState === 'complete') {
        subscribe()
      } else {
        window.addEventListener('load', subscribe, { once: true })
      }
    }
  }, [])
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = window.atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}
