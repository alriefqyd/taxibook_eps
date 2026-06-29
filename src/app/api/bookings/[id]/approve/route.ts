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
      const WIB_MS      = 7 * 60 * 60 * 1000
      const nowWib      = new Date(Date.now() + WIB_MS)
      nowWib.setUTCHours(0, 0, 0, 0)
      const todayStart    = new Date(nowWib.getTime() - WIB_MS)
      const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

      const { data: taxis } = await admin
        .from('taxis')
        .select('id, name, driver_id, users!driver_id(name)')
        .eq('is_active',    true)
        .eq('is_available', true)
        .not('driver_id', 'is', null)

      let assignedTaxi = null

      if (taxis?.length) {
        const avail = await Promise.all(
          taxis.map(async (taxi: any) => {
            const { data: conflict } = await admin
              .from('bookings')
              .select('id')
              .eq('taxi_id', taxi.id)
              .in('status', ['booked', 'on_trip', 'waiting_trip'])
              .lt('scheduled_at', booking.auto_complete_at)
              .gt('auto_complete_at', booking.scheduled_at)
              .limit(1)
              .maybeSingle()

            if (conflict) return null

            const { count: trips } = await admin
              .from('bookings')
              .select('id', { count: 'exact', head: true })
              .eq('taxi_id', taxi.id)
              .not('status', 'in', '(cancelled,rejected)')
              .gte('scheduled_at', todayStart.toISOString())
              .lt('scheduled_at', tomorrowStart.toISOString())

            const { data: lastBooking } = await admin
              .from('bookings')
              .select('auto_complete_at')
              .eq('taxi_id', taxi.id)
              .in('status', ['completed', 'booked', 'on_trip', 'waiting_trip'])
              .lte('auto_complete_at', booking.scheduled_at)
              .order('auto_complete_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            const idleSince = lastBooking ? new Date(lastBooking.auto_complete_at).getTime() : 0

            return { taxi, tripsToday: trips || 0, idleSince }
          })
        )

        const candidates = avail
          .filter(Boolean)
          .sort((a: any, b: any) => {
            if (a.tripsToday !== b.tripsToday) return a.tripsToday - b.tripsToday
            return a.idleSince - b.idleSince
          }) as any[]

        if (candidates.length) {
          assignedTaxi = candidates[0].taxi
          const { error: assignErr } = await admin.from('bookings').update({
            taxi_id:     assignedTaxi.id,
            status:      'booked',
            assigned_at: new Date().toISOString(),
          }).eq('id', bookingId)

          if (assignErr) {
            console.warn('approve autoAssign conflict:', assignErr.code, assignErr.message)
            assignedTaxi = null
          }

          if (assignedTaxi) {
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
              body:       `Your trip to ${booking.destination} is approved and a driver has been assigned.`,
              type:       'booking_confirmed',
            })
          }
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
