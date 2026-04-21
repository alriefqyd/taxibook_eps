import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = createAdminClient()

    // ── Auth ──
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const bookingId = params.id

    // Get booking
    const { data: booking } = await admin
      .from('bookings')
      .select('*, taxis!taxi_id(id, name, driver_id)')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Only assigned driver can start trip
    if (booking.taxis?.driver_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Must be in booked status
    if (booking.status !== 'booked') {
      return NextResponse.json(
        { error: `Cannot start trip with status: ${booking.status}` },
        { status: 400 }
      )
    }

    // Update status
    const newStatus = booking.trip_type === 'WAITING' ? 'waiting_trip' : 'on_trip'

    await admin.from('bookings')
      .update({ status: newStatus })
      .eq('id', bookingId)

    // Get driver name
    const { data: driver } = await admin
      .from('users').select('name').eq('id', user.id).single()

    // Notify passenger — driver is on the way / arrived
    const msg = booking.trip_type === 'WAITING'
      ? `Your driver ${driver?.name} (${booking.taxis?.name}) has arrived and is waiting.`
      : `Your driver ${driver?.name} (${booking.taxis?.name}) has picked you up. Trip started.`

    await admin.from('notifications').insert({
      user_id:    booking.passenger_id,
      booking_id: bookingId,
      title:      booking.trip_type === 'WAITING' ? 'Driver arrived' : 'Trip started',
      body:       msg,
      type:       'booking_confirmed',
    })

    return NextResponse.json({ success: true, status: newStatus })

  } catch (err: any) {
    console.error('start route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
