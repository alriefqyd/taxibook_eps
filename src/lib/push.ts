import webpush from 'web-push'
import { createAdminClient } from './supabase/server'

// Lazy init VAPID keys
function initWebPush() {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

export async function sendPushToUser(userId: string, title: string, body: string, url?: string) {
  try {
    initWebPush()
    if (!process.env.VAPID_PRIVATE_KEY) return // skip if not configured

    const admin = createAdminClient()
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (!subs?.length) return

    const payload = JSON.stringify({ title, body, url: url || '/' })

    for (const sub of subs) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, payload)
      } catch (err: any) {
        // Subscription expired — remove it
        if (err.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }
  } catch (err) {
    console.error('Push send error:', err)
  }
}
