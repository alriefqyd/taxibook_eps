import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'

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

    // Coordinator only
    const { data: profile } = await admin
      .from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'coordinator') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { action, rejection_reason } = await request.json()
    const bookingId = params.id

    const { data: booking } = await admin
      .from('bookings').select('*').eq('id', bookingId).single()
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'reject') {
      await admin.from('bookings').update({
        status: 'rejected',
        rejection_reason: rejection_reason || null,
      }).eq('id', bookingId)

      await notify({
        user_id:    booking.passenger_id,
        booking_id: bookingId,
        title:      'Trip request rejected',
        body:       rejection_reason
          ? `Your trip to ${booking.destination} was rejected: ${rejection_reason}`
          : `Your trip to ${booking.destination} was rejected by coordinator.`,
        type: 'booking_rejected',
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'approve') {
      // Move to submitted so auto-assign runs
      await admin.from('bookings')
        .update({ status: 'submitted' })
        .eq('id', bookingId)

      // Auto-assign
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const scheduledTime = new Date(booking.scheduled_at)

      const { data: taxis } = await admin
        .from('taxis')
        .select('id, name, driver_id, users!driver_id(name)')
        .eq('is_active', true)
        .eq('is_available', true)
        .not('driver_id', 'is', null)

      let assignedTaxi = null

      if (taxis?.length) {
        const avail = await Promise.all(
          taxis.map(async (taxi: any) => {
            const { data: last } = await admin
              .from('bookings')
              .select('auto_complete_at')
              .eq('taxi_id', taxi.id)
              .in('status', ['booked','on_trip','waiting_trip','pending_driver_approval'])
              .order('auto_complete_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            const freeAt = last ? new Date(last.auto_complete_at) : new Date(0)

            const { count: trips } = await admin
              .from('bookings')
              .select('id', { count: 'exact', head: true })
              .eq('taxi_id', taxi.id)
              .eq('status', 'completed')
              .gte('completed_at', todayStart.toISOString())

            return { taxi, freeAt, tripsToday: trips || 0 }
          })
        )

        const candidates = avail
          .filter(({ freeAt }: any) => freeAt <= scheduledTime)
          .sort((a, b) => {
            if (a.tripsToday !== b.tripsToday) return a.tripsToday - b.tripsToday
            return a.freeAt.getTime() - b.freeAt.getTime()
          })

        if (candidates.length) {
          // Pick best — fewest trips then longest idle
          assignedTaxi = candidates[0].taxi
          await admin.from('bookings').update({
            taxi_id: assignedTaxi.id,
            status:  'pending_driver_approval',
          }).eq('id', bookingId)

          // Notify driver
          const { data: passenger } = await admin
            .from('users').select('name').eq('id', booking.passenger_id).single()
          const time = new Date(booking.scheduled_at).toLocaleTimeString('id-ID', {
            hour: '2-digit', minute: '2-digit'
          })

          await notify({
            user_id:    assignedTaxi.driver_id,
            booking_id: bookingId,
            title:      'New trip assigned',
            body:       `${passenger?.name} → ${booking.destination} at ${time}`,
            type:       'driver_assigned',
          })

          // Notify passenger
          await notify({
            user_id:    booking.passenger_id,
            booking_id: bookingId,
            title:      '✅ Trip approved!',
            body:       `Your trip to ${booking.destination} is approved. ${assignedTaxi.name} will confirm shortly.`,
            type:       'booking_confirmed',
          })
        }
      }

      return NextResponse.json({
        success:  true,
        assigned: !!assignedTaxi,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err: any) {
    console.error('approve route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
