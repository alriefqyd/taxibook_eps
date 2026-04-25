import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'

// Test endpoint: POST /api/push/test-overdue with { user_id }
export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const admin = createAdminClient()

    // Check subscriptions
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    console.log(`User ${user_id} subscriptions:`, subs?.length)

    // Send test push
    await sendPushToUser(
      user_id,
      '⚠️ Test Overdue Alert',
      'This is a test overdue push notification. Tap to open.',
      '/driver/home'
    )

    return NextResponse.json({
      success: true,
      subscriptions_found: subs?.length || 0,
      message: 'Push sent — check device'
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
