import { createAdminClient } from './supabase/server'
import { sendPushToUser } from './push'

interface NotifPayload {
  user_id:    string
  booking_id: string | null
  title:      string
  body:       string
  type:       string
  url?:       string  // optional deep-link; skips role lookup when provided
}

// Insert notification to DB and send push concurrently
export async function notify(payload: NotifPayload | NotifPayload[]): Promise<void> {
  const admin    = createAdminClient()
  const payloads = Array.isArray(payload) ? payload : [payload]

  // Strip url from DB insert (not a DB column)
  const rows = payloads.map(({ url: _url, ...rest }) => rest)

  await Promise.all([
    // DB insert (no url column)
    admin.from('notifications').insert(rows),

    // Push sends — use provided url, or derive from type if not given
    ...payloads.map(async (p) => {
      let url = p.url
      if (!url) {
        // Derive URL from notification type without an extra DB query
        if (p.type.includes('driver'))                                           url = '/driver/home'
        else if (p.type.includes('coordinator') || p.type.includes('approval')) url = '/coordinator/home'
        else                                                                     url = '/staff/home'
      }
      await sendPushToUser(p.user_id, p.title, p.body, url, p.type)
    }),
  ])
}
