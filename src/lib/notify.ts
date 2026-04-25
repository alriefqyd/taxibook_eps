import { createAdminClient } from './supabase/server'
import { sendPushToUser } from './push'

interface NotifPayload {
  user_id:    string
  booking_id: string | null
  title:      string
  body:       string
  type:       string
}

// Insert notification AND send push in one call
export async function notify(payload: NotifPayload | NotifPayload[]) {
  const admin   = createAdminClient()
  const payloads = Array.isArray(payload) ? payload : [payload]

  // Insert to DB
  await admin.from('notifications').insert(payloads)

  // Send push to each user
  for (const p of payloads) {
    // Look up user role to determine correct URL
    const { data: u } = await admin.from('users').select('role').eq('id', p.user_id).single().catch(() => ({ data: null }))
    const role = u?.role || ''
    const url = role === 'driver' ? '/driver/home'
              : role === 'coordinator' ? '/coordinator/home'
              : p.type.includes('driver') ? '/driver/home'
              : p.type.includes('coordinator') || p.type.includes('needs_approval') ? '/coordinator/home'
              : '/staff/home'
    await sendPushToUser(p.user_id, p.title, p.body, url)
  }
}
