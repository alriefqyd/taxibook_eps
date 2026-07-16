import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'
import { getDayAssignmentBlocks, isTaxiDayBlocked } from '@/lib/auto-assign'

// Swaps the taxi assigned to two bookings in one atomic step. Reassigning each
// one individually via /reassign would fail mid-way whenever the two trips'
// time windows overlap each other — the destination taxi always looks
// "conflicted" against the very booking that's about to move out. Swapping
// checks each side's conflict against the OTHER bookings only (excluding the
// two being traded), so a valid final arrangement doesn't get blocked by a
// transient state that never actually exists.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = createAdminClient()

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'coordinator') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { swap_with_booking_id } = await request.json()
    const bookingAId = params.id
    const bookingBId = swap_with_booking_id

    if (!bookingBId || bookingBId === bookingAId) {
      return NextResponse.json({ error: 'A different booking to swap with is required' }, { status: 400 })
    }

    const [{ data: bookingA }, { data: bookingB }] = await Promise.all([
      admin.from('bookings').select('*, taxis!taxi_id(id, name, driver_id, users!driver_id(id, name))').eq('id', bookingAId).single(),
      admin.from('bookings').select('*, taxis!taxi_id(id, name, driver_id, users!driver_id(id, name))').eq('id', bookingBId).single(),
    ])

    if (!bookingA || !bookingB) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (!bookingA.taxi_id || !bookingB.taxi_id) {
      return NextResponse.json({ error: 'Both bookings must already have a taxi assigned to swap' }, { status: 400 })
    }
    if (bookingA.taxi_id === bookingB.taxi_id) {
      return NextResponse.json({ error: 'Both bookings are already on the same taxi' }, { status: 400 })
    }

    const taxiA = bookingA.taxis as any // A's current taxi — will pick up B's trip after the swap
    const taxiB = bookingB.taxis as any // B's current taxi — will pick up A's trip after the swap

    const checkDestination = async (booking: any, destTaxiId: string, otherBookingId: string) => {
      const witaDate = new Date(new Date(booking.scheduled_at).getTime() + 8 * 3600000).toISOString().slice(0, 10)
      const { fullDay, ranges } = await getDayAssignmentBlocks(admin, witaDate)
      if (isTaxiDayBlocked(destTaxiId, fullDay, ranges, new Date(booking.scheduled_at), new Date(booking.auto_complete_at))) {
        return { kind: 'duty' as const }
      }

      const { data: conflict } = await admin
        .from('bookings')
        .select('id, booking_code, scheduled_at')
        .eq('taxi_id', destTaxiId)
        .in('status', ['booked', 'on_trip', 'waiting_trip'])
        .neq('id', booking.id)
        .neq('id', otherBookingId)
        .lt('scheduled_at', booking.auto_complete_at)
        .gt('auto_complete_at', booking.scheduled_at)
        .limit(1)
        .maybeSingle()

      return conflict ? { kind: 'conflict' as const, conflict } : { kind: 'ok' as const }
    }

    const [checkA, checkB] = await Promise.all([
      checkDestination(bookingA, bookingB.taxi_id, bookingB.id),
      checkDestination(bookingB, bookingA.taxi_id, bookingA.id),
    ])

    if (checkA.kind === 'duty' || checkB.kind === 'duty') {
      return NextResponse.json(
        { error: 'One of the target taxis has a driver duty assignment that blocks this swap.' },
        { status: 409 }
      )
    }
    const conflictCheck = checkA.kind === 'conflict' ? checkA : checkB.kind === 'conflict' ? checkB : null
    if (conflictCheck) {
      const time = new Date(conflictCheck.conflict.scheduled_at).toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar',
      })
      return NextResponse.json(
        { error: `The target taxi already has another booking (${conflictCheck.conflict.booking_code}) at ${time} that overlaps this trip.` },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    await Promise.all([
      admin.from('bookings').update({ taxi_id: bookingB.taxi_id, status: 'booked', assigned_at: now }).eq('id', bookingA.id),
      admin.from('bookings').update({ taxi_id: bookingA.taxi_id, status: 'booked', assigned_at: now }).eq('id', bookingB.id),
    ])

    const driverAId   = taxiA?.driver_id
    const driverBId   = taxiB?.driver_id
    const driverAName = taxiA?.users?.name || 'Driver'
    const driverBName = taxiB?.users?.name || 'Driver'

    const timeA = new Date(bookingA.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })
    const timeB = new Date(bookingB.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })

    const [{ data: passengerA }, { data: passengerB }] = await Promise.all([
      admin.from('users').select('name').eq('id', bookingA.passenger_id).single(),
      admin.from('users').select('name').eq('id', bookingB.passenger_id).single(),
    ])

    const notifs: any[] = []

    // B's driver now handles A's trip
    if (driverBId) {
      notifs.push({
        user_id:    driverBId,
        booking_id: bookingA.id,
        title:      { en: 'Trip swapped to you', id: 'Perjalanan ditukar kepada Anda' },
        body: {
          en: `You have been assigned to pick up ${passengerA?.name} → ${bookingA.destination} at ${timeA} (swapped with another driver).`,
          id: `Anda ditugaskan menjemput ${passengerA?.name} → ${bookingA.destination} pukul ${timeA} (ditukar dengan driver lain).`,
        },
        type: 'driver_reassigned',
        url:  '/driver/home',
      })
    }
    // A's driver now handles B's trip
    if (driverAId) {
      notifs.push({
        user_id:    driverAId,
        booking_id: bookingB.id,
        title:      { en: 'Trip swapped to you', id: 'Perjalanan ditukar kepada Anda' },
        body: {
          en: `You have been assigned to pick up ${passengerB?.name} → ${bookingB.destination} at ${timeB} (swapped with another driver).`,
          id: `Anda ditugaskan menjemput ${passengerB?.name} → ${bookingB.destination} pukul ${timeB} (ditukar dengan driver lain).`,
        },
        type: 'driver_reassigned',
        url:  '/driver/home',
      })
    }

    notifs.push({
      user_id:    bookingA.passenger_id,
      booking_id: bookingA.id,
      title:      { en: 'Driver updated', id: 'Driver diperbarui' },
      body: {
        en: `Your trip driver has been updated — ${taxiB?.name} · ${driverBName}`,
        id: `Driver perjalanan Anda telah diperbarui — ${taxiB?.name} · ${driverBName}`,
      },
      type: 'booking_reassigned',
    })
    notifs.push({
      user_id:    bookingB.passenger_id,
      booking_id: bookingB.id,
      title:      { en: 'Driver updated', id: 'Driver diperbarui' },
      body: {
        en: `Your trip driver has been updated — ${taxiA?.name} · ${driverAName}`,
        id: `Driver perjalanan Anda telah diperbarui — ${taxiA?.name} · ${driverAName}`,
      },
      type: 'booking_reassigned',
    })

    await notify(notifs)

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('swap error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
