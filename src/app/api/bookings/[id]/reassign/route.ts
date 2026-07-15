import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'
import { getDayAssignmentBlocks, isTaxiDayBlocked } from '@/lib/auto-assign'

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

    // Check for a driver_day_assignment (full-day or special/partial duty) blocking this taxi
    const witaDate = new Date(new Date(booking.scheduled_at).getTime() + 8 * 3600000).toISOString().slice(0, 10)
    const { fullDay, ranges } = await getDayAssignmentBlocks(admin, witaDate)
    if (isTaxiDayBlocked(new_taxi_id, fullDay, ranges, new Date(booking.scheduled_at), new Date(booking.auto_complete_at))) {
      return NextResponse.json(
        { error: 'This taxi has a driver duty assignment that blocks this time — release the duty assignment first or choose another taxi.' },
        { status: 409 }
      )
    }

    // Check for driver schedule overlap
    const { data: driverConflict } = await admin
      .from('bookings')
      .select('id, booking_code, scheduled_at')
      .eq('taxi_id', new_taxi_id)
      .in('status', ['booked', 'on_trip', 'waiting_trip'])
      .neq('id', bookingId)
      .lt('scheduled_at', booking.auto_complete_at)
      .gt('auto_complete_at', booking.scheduled_at)
      .limit(1)
      .maybeSingle()

    if (driverConflict) {
      const t = new Date(driverConflict.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })
      return NextResponse.json(
        { error: `Driver already has a booking at ${t} that overlaps this trip.` },
        { status: 409 }
      )
    }

    const oldDriverId  = booking.taxis?.driver_id
    const newDriverId  = newTaxi.driver_id
    const newDriverName = (newTaxi.users as any)?.name || 'Driver'

    // Update booking — no driver approval needed
    await admin.from('bookings').update({
      taxi_id:     new_taxi_id,
      status:      'booked',
      assigned_at: new Date().toISOString(),
    }).eq('id', bookingId)

    // Notify old driver if different
    if (oldDriverId && oldDriverId !== newDriverId) {
      await notify({
        user_id:    oldDriverId,
        booking_id: bookingId,
        title:      { en: 'Trip reassigned by coordinator', id: 'Perjalanan dialihkan oleh koordinator' },
        body: {
          en: `Your trip to ${booking.destination} has been reassigned. You are now available.`,
          id: `Perjalanan Anda ke ${booking.destination} telah dialihkan. Anda sekarang tersedia.`,
        },
        type:       'driver_reassigned',
      })
    }

    // Notify passenger
    await notify({
      user_id:    booking.passenger_id,
      booking_id: bookingId,
      title:      { en: 'Driver updated', id: 'Driver diperbarui' },
      body: {
        en: `Your trip driver has been updated — ${newTaxi.name} · ${newDriverName}`,
        id: `Driver perjalanan Anda telah diperbarui — ${newTaxi.name} · ${newDriverName}`,
      },
      type:       'booking_reassigned',
    })

    // Notify new driver
    const { data: passenger } = await admin
      .from('users').select('name').eq('id', booking.passenger_id).single()

    const time = new Date(booking.scheduled_at).toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar'
    })

    if (newDriverId) {
      await notify({
        user_id:    newDriverId,
        booking_id: bookingId,
        title:      { en: 'Trip assigned to you', id: 'Perjalanan ditugaskan kepada Anda' },
        body: {
          en: `You have been assigned to pick up ${passenger?.name} → ${booking.destination} at ${time}. Please be ready on time.`,
          id: `Anda ditugaskan menjemput ${passenger?.name} → ${booking.destination} pukul ${time}. Mohon siap tepat waktu.`,
        },
        type:       'driver_reassigned',
        url:        '/driver/home',
      })
    }

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('reassign error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
