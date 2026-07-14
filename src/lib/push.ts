import webpush from 'web-push'
import { createAdminClient } from './supabase/server'

// Init VAPID keys once
let vapidInitialized = false
function initWebPush() {
  if (vapidInitialized) return
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('[Push] VAPID keys not configured!')
    return
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@ridr.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  vapidInitialized = true
  console.log('[Push] VAPID initialized')
}

export async function sendPushToUser(userId: string, title: string, body: string, url?: string, type?: string) {
  try {
    initWebPush()
    if (!process.env.VAPID_PRIVATE_KEY) return // skip if not configured

    const admin = createAdminClient()
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (!subs?.length) {
      console.log(`[Push] No subscriptions for user ${userId}`)
      return
    }
    console.log(`[Push] Sending to ${subs.length} subscription(s) for user ${userId}`)

    const payload = JSON.stringify({ title, body, url: url || '/', type: type || 'general' })

    for (const sub of subs) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, payload)
      } catch (err: any) {
        console.error(`Push failed for sub ${sub.id}:`, err.statusCode, err.message)
        // Subscription expired or invalid — remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
          console.log(`Removed expired subscription ${sub.id}`)
        }
      }
    }
  } catch (err) {
    console.error('Push send error:', err)
  }
}
