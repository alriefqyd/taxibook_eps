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
        if (!vapidKey) { console.log('[Push] No VAPID key'); return }

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        // Register SW explicitly instead of waiting for ready
        let reg = await navigator.serviceWorker.getRegistration('/')
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
          // Wait for it to install
          await new Promise<void>(resolve => {
            if (reg!.installing) {
              reg!.installing.addEventListener('statechange', function() {
                if (this.state === 'activated') resolve()
              })
            } else {
              resolve()
            }
          })
        }

        console.log('[Push] Registration:', reg.scope)

        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
          })
          console.log('[Push] Subscribed:', sub.endpoint.slice(0, 50))
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

    // Run after page fully loaded
    if (document.readyState === 'complete') {
      setTimeout(subscribe, 1000)
    } else {
      window.addEventListener('load', () => setTimeout(subscribe, 1000), { once: true })
    }
  }, [])
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = window.atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}