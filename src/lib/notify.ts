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
export async function notify(payload: NotifPayload | NotifPayload[]): Promise<void> {
  const admin    = createAdminClient()
  const payloads = Array.isArray(payload) ? payload : [payload]

  // Insert to DB
  await admin.from('notifications').insert(payloads)

  // Send push to each user with correct URL based on role
  for (const p of payloads) {
    let url = '/staff/home'
    try {
      const { data: u } = await admin
        .from('users').select('role').eq('id', p.user_id).single()
      const role = u?.role || ''
      if (role === 'driver')      url = '/driver/home'
      else if (role === 'coordinator') url = '/coordinator/home'
      else if (p.type.includes('driver')) url = '/driver/home'
      else if (p.type.includes('coordinator') || p.type.includes('needs_approval')) url = '/coordinator/home'
    } catch (_) {}
    await sendPushToUser(p.user_id, p.title, p.body, url)
  }
}
