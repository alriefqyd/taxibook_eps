import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient()

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { subscription } = body

    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    console.log('Saving push subscription for user:', user.id)
    console.log('Endpoint:', subscription.endpoint.slice(0, 50))

    // Delete old subscription for this user first
    await admin.from('push_subscriptions').delete().eq('user_id', user.id)

    // Insert new subscription
    const { data, error } = await admin.from('push_subscriptions').insert({
      user_id:  user.id,
      endpoint: subscription.endpoint,
      p256dh:   subscription.keys.p256dh,
      auth:     subscription.keys.auth,
    }).select()

    if (error) {
      console.error('DB insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('Push subscription saved:', data)
    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('Push subscribe error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
