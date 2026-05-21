import { createAdminClient } from './supabase/server'
import { sendPushToUser } from './push'

interface NotifPayload {
  user_id:    string
  booking_id: string | null
  title:      string
  body:       string
  type:       string
}

function resolveUrl(role: string, type: string): string {
  if (role === 'driver')                                                    return '/driver/home'
  if (role === 'coordinator')                                               return '/coordinator/home'
  if (type.includes('driver'))                                              return '/driver/home'
  if (type.includes('coordinator') || type.includes('needs_approval'))     return '/coordinator/home'
  return '/staff/home'
}

// Insert notification to DB and send push concurrently
export async function notify(payload: NotifPayload | NotifPayload[]): Promise<void> {
  const admin    = createAdminClient()
  const payloads = Array.isArray(payload) ? payload : [payload]

  await Promise.all([
    // DB insert
    admin.from('notifications').insert(payloads),

    // Push sends — resolve each user's role then fire, all in parallel
    ...payloads.map(async (p) => {
      let url = '/staff/home'
      try {
        const { data: u } = await admin
          .from('users').select('role').eq('id', p.user_id).single()
        url = resolveUrl(u?.role || '', p.type)
      } catch (_) {}
      await sendPushToUser(p.user_id, p.title, p.body, url, p.type)
    }),
  ])
}
