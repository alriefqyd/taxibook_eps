import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = createAdminClient()

    // ── Auth via Bearer token ──
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const bookingId = params.id

    // Get booking + taxi
    const { data: booking } = await admin
      .from('bookings')
      .select('*, taxis!taxi_id(id, name, driver_id)')
      .eq('id', bookingId)
      .single()

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Verify driver owns this booking OR coordinator
    const { data: profile } = await admin
      .from('users').select('role').eq('id', user.id).single()

    const isDriver = booking.taxis?.driver_id === user.id
    const isCoord  = profile?.role === 'coordinator'

    if (!isDriver && !isCoord) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update booking to completed
    const { error: updateError } = await admin
      .from('bookings')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', bookingId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Notify passenger — inline (no VAPID dependency)
    await notify({
      user_id:    booking.passenger_id,
      booking_id: bookingId,
      title:      'Trip completed',
      body:       `Your trip to ${booking.destination} is complete. Driver is back at base.`,
      type:       'trip_completed',
    })

    // Notify driver too (confirmation)
    if (isCoord) {
      // If coordinator completed it, notify driver as well
      await notify({
        user_id:    booking.taxis?.driver_id,
        booking_id: bookingId,
        title:      'Trip marked as completed',
        body:       `Trip to ${booking.destination} has been marked complete by coordinator.`,
        type:       'auto_completed',
      })
    }

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('complete route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
