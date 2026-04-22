import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient()

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { subscription } = await request.json()
    if (!subscription) return NextResponse.json({ error: 'No subscription' }, { status: 400 })

    // Upsert push subscription for this user
    await admin.from('push_subscriptions').upsert({
      user_id:      user.id,
      endpoint:     subscription.endpoint,
      p256dh:       subscription.keys.p256dh,
      auth:         subscription.keys.auth,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Push subscribe error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
