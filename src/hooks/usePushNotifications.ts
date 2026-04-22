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

        // Get all registrations and find active one
        const regs = await navigator.serviceWorker.getRegistrations()
        console.log('[Push] SW registrations:', regs.length)

        let reg = regs.find(r => r.active) || regs[0]

        if (!reg) {
          // No SW found — register sw.js directly
          reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
          // Give it time to activate
          await new Promise(r => setTimeout(r, 2000))
          reg = await navigator.serviceWorker.getRegistration('/') || reg
        }

        if (!reg) { console.log('[Push] No SW found'); return }
        console.log('[Push] Using SW:', reg.scope, 'active:', !!reg.active)

        // Use active or installing worker
        const worker = reg.active || reg.installing || reg.waiting
        if (!worker) { console.log('[Push] No SW worker'); return }

        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
          })
          console.log('[Push] New subscription created')
        } else {
          console.log('[Push] Existing subscription found')
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
