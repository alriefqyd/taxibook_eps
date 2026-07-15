import { createAdminClient } from './supabase/server'
import { sendPushToUser } from './push'

export interface LocalizedText {
  en: string
  id: string
}

interface NotifPayload {
  user_id:    string
  booking_id: string | null
  title:      LocalizedText
  body:       LocalizedText
  type:       string
  url?:       string  // optional deep-link; skips role lookup when provided
}

// Insert notification to DB and send push concurrently, in each recipient's own language
export async function notify(payload: NotifPayload | NotifPayload[]): Promise<void> {
  const admin    = createAdminClient()
  const payloads = Array.isArray(payload) ? payload : [payload]
  if (!payloads.length) return

  // Batch-fetch each recipient's language preference in one query
  const userIds = Array.from(new Set(payloads.map(p => p.user_id)))
  const { data: langRows } = await admin.from('users').select('id, language').in('id', userIds)
  const langById = new Map((langRows || []).map((u: any) => [u.id, u.language === 'id' ? 'id' : 'en']))

  const rendered = payloads.map(p => {
    const lang = langById.get(p.user_id) || 'en'
    return {
      user_id:    p.user_id,
      booking_id: p.booking_id,
      title:      p.title[lang],
      body:       p.body[lang],
      type:       p.type,
      url:        p.url,
    }
  })

  await Promise.all([
    // DB insert (no url column)
    admin.from('notifications').insert(rendered.map(({ url: _url, ...rest }) => rest)),

    // Push sends — use provided url, or derive from type if not given
    ...rendered.map(async (p) => {
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
