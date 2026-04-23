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

    // Coordinator only
    const { data: profile } = await admin
      .from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'coordinator') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { new_taxi_id } = await request.json()
    const bookingId = params.id

    // Get current booking
    const { data: booking } = await admin
      .from('bookings')
      .select('*, taxis!taxi_id(id, name, driver_id, users!driver_id(name))')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Get new taxi
    const { data: newTaxi } = await admin
      .from('taxis')
      .select('*, users!driver_id(id, name)')
      .eq('id', new_taxi_id)
      .single()

    if (!newTaxi) return NextResponse.json({ error: 'Taxi not found' }, { status: 404 })

    const oldDriverId  = booking.taxis?.driver_id
    const newDriverId  = newTaxi.driver_id
    const newDriverName = (newTaxi.users as any)?.name || 'Driver'

    // Update booking
    await admin.from('bookings').update({
      taxi_id: new_taxi_id,
      status:  'pending_driver_approval',
    }).eq('id', bookingId)

    // Notify old driver if different
    if (oldDriverId && oldDriverId !== newDriverId) {
      await notify({
        user_id:    oldDriverId,
        booking_id: bookingId,
        title:      'Trip reassigned by coordinator',
        body:       `Your trip to ${booking.destination} has been reassigned. You are now available.`,
        type:       'driver_reassigned',
      })
    }

    // Notify passenger
    await notify({
      user_id:    booking.passenger_id,
      booking_id: bookingId,
      title:      'Driver updated',
      body:       `Your trip driver has been updated — ${newTaxi.name} · ${newDriverName}`,
      type:       'booking_reassigned',
    })

    // Notify new driver
    const { data: passenger } = await admin
      .from('users').select('name').eq('id', booking.passenger_id).single()

    const time = new Date(booking.scheduled_at).toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit'
    })

    await notify({
      user_id:    newDriverId,
      booking_id: bookingId,
      title:      'New trip assigned (reassigned)',
      body:       `${passenger?.name} → ${booking.destination} at ${time}`,
      type:       'driver_reassigned',
    })

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('reassign error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
