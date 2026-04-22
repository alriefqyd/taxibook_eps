import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient()

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check subscription exists
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user.id)

    if (!subs?.length) {
      return NextResponse.json({
        success: false,
        error:   'No push subscription found for this user',
        hint:    'Make sure you allowed notifications in browser and subscription was saved',
      })
    }

    // Send test push
    await sendPushToUser(
      user.id,
      '🔔 TaxiBook Test',
      'Push notifications are working! 🎉',
      '/'
    )

    return NextResponse.json({
      success:    true,
      message:    'Test push sent!',
      subs_count: subs.length,
      endpoint:   subs[0].endpoint.slice(0, 50) + '...',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
