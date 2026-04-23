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

        // Unregister ALL existing service workers first
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const reg of regs) {
          await reg.unregister()
          console.log('[Push] Unregistered SW:', reg.scope)
        }

        // Register fresh push-sw.js at root scope
        const reg = await navigator.serviceWorker.register('/push-sw.js')
        console.log('[Push] Registered:', reg.scope)

        // Wait for active
        await new Promise<void>(resolve => {
          if (reg.active) { resolve(); return }
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing
            if (!sw) { resolve(); return }
            sw.addEventListener('statechange', () => {
              if (sw.state === 'activated') resolve()
            })
          })
          setTimeout(resolve, 4000)
        })

        // Also wait for controller
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>(resolve => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
            setTimeout(resolve, 2000)
          })
        }

        console.log('[Push] Active:', !!reg.active, 'Controller:', !!navigator.serviceWorker.controller)

        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
          })
          console.log('[Push] Subscribed:', sub.endpoint.slice(0, 60))
        } else {
          console.log('[Push] Already subscribed')
        }

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
        console.log('[Push] Saved:', res.status)

      } catch (err) {
        console.error('[Push] Error:', err)
      }
    }

    if (document.readyState === 'complete') {
      setTimeout(subscribe, 1500)
    } else {
      window.addEventListener('load', () => setTimeout(subscribe, 1500), { once: true })
    }
  }, [])
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = window.atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}
