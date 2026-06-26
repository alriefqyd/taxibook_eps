import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'

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

    const { reason } = await request.json()
    const bookingId  = params.id

    // Get booking
    const { data: booking } = await admin
      .from('bookings')
      .select('*, taxis!taxi_id(driver_id, name, users!driver_id(name))')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: profile } = await admin
      .from('users').select('role, name').eq('id', user.id).single()

    const isOwner        = booking.passenger_id === user.id
    const isCoordCreator = profile?.role === 'coordinator' && booking.created_by === user.id

    if (!isOwner && !isCoordCreator) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Can only cancel if not yet on_trip or completed
    const cancellable = ['submitted','pending_coordinator_approval','booked']
    if (!cancellable.includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot cancel a booking with status: ${booking.status}` },
        { status: 400 }
      )
    }

    // Cancel booking
    await admin.from('bookings').update({
      status:           'cancelled',
      rejection_reason: reason || null,
    }).eq('id', bookingId)

    // Notify driver if already assigned
    const driverId   = booking.taxis?.driver_id
    const driverName = (booking.taxis?.users as any)?.name
    const taxiName   = booking.taxis?.name

    if (driverId) {
      await notify({
        user_id:    driverId,
        booking_id: bookingId,
        title:      'Booking cancelled',
        body:       `Trip to ${booking.destination} has been cancelled${reason ? `: ${reason}` : ''}. You are now available.`,
        type:       'booking_rejected',
      })
    }

    // Notify coordinators (skip the one who cancelled, since they did it themselves)
    const { data: coordinators } = await admin
      .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

    const cancellerLabel = isCoordCreator ? 'Coordinator' : 'Staff'

    if (coordinators?.length) {
      const others = coordinators.filter((c: any) => c.id !== user.id)
      if (others.length) {
        await notify(
          others.map((c: any) => ({
            user_id:    c.id,
            booking_id: bookingId,
            title:      `Booking cancelled by ${cancellerLabel}`,
            body:       `${profile?.name} cancelled trip to ${booking.destination}${reason ? `: ${reason}` : ''}.${driverName ? ` ${taxiName} (${driverName}) is now free.` : ''}`,
            type:       'booking_rejected',
            url:        '/coordinator/home',
          }))
        )
      }
    }

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('cancel route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
