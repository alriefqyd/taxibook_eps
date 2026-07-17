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
        title:      { en: 'Trip request rejected', id: 'Permintaan perjalanan ditolak' },
        body: rejection_reason
          ? {
              en: `Your trip to ${booking.destination} was rejected: ${rejection_reason}`,
              id: `Perjalanan Anda ke ${booking.destination} ditolak: ${rejection_reason}`,
            }
          : {
              en: `Your trip to ${booking.destination} was rejected by coordinator.`,
              id: `Perjalanan Anda ke ${booking.destination} ditolak oleh koordinator.`,
            },
        type: 'booking_rejected',
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'approve') {
      await admin.from('bookings').update({ status: 'submitted' }).eq('id', bookingId)

      const WITA_MS       = 8 * 60 * 60 * 1000
      const nowWita       = new Date(Date.now() + WITA_MS)
      nowWita.setUTCHours(0, 0, 0, 0)
      const todayStart    = new Date(nowWita.getTime() - WITA_MS)
      const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

      const scheduledWita     = new Date(new Date(booking.scheduled_at).getTime() + 8 * 3600000)
      const scheduledWitaDate = scheduledWita.toISOString().slice(0, 10)
      const todayWitaDate     = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
      const isFutureDay       = scheduledWitaDate > todayWitaDate

      let assignedTaxi = null

      {
        let taxiQuery = admin
          .from('taxis')
          .select('id, name, driver_id, users!driver_id(name)')
          .eq('is_active', true)
          .not('driver_id', 'is', null)
        if (!isFutureDay) taxiQuery = taxiQuery.eq('is_available', true)

        const { data: taxis } = await taxiQuery

        if (taxis?.length) {
          const witaDate = scheduledWitaDate
          const { fullDay, ranges } = await getDayAssignmentBlocks(admin, witaDate)
          const bookingStart = new Date(booking.scheduled_at)
          const bookingEnd   = new Date(booking.auto_complete_at)
          const eligibleTaxis = taxis.filter((t: any) => !isTaxiDayBlocked(t.id, fullDay, ranges, bookingStart, bookingEnd))

          const avail = await Promise.all(
            eligibleTaxis.map(async (taxi: any) => {
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
              const { data: passenger } = await admin
                .from('users').select('name').eq('id', booking.passenger_id).single()
              const time = new Date(booking.scheduled_at).toLocaleTimeString('id-ID', {
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar',
              })

              await notify({
                user_id:    assignedTaxi.driver_id,
                booking_id: bookingId,
                title:      { en: 'New trip assigned', id: 'Perjalanan baru ditugaskan' },
                body: {
                  en: `${passenger?.name} → ${booking.destination} at ${time}`,
                  id: `${passenger?.name} → ${booking.destination} pukul ${time}`,
                },
                type:       'driver_assigned',
              })
            }
          }
        }
      }

      // Passenger always gets told their trip was approved, whether or not a driver
      // could be auto-assigned right away — previously this only fired inside the
      // taxi-assigned branch above, so anyone approved with no taxi currently free
      // got no notification at all.
      await notify({
        user_id:    booking.passenger_id,
        booking_id: bookingId,
        title:      { en: '✅ Trip approved!', id: '✅ Perjalanan disetujui!' },
        body: assignedTaxi
          ? {
              en: `Your trip to ${booking.destination} is approved and a driver has been assigned.`,
              id: `Perjalanan Anda ke ${booking.destination} disetujui dan driver telah ditugaskan.`,
            }
          : {
              en: `Your trip to ${booking.destination} is approved. A driver will be assigned soon.`,
              id: `Perjalanan Anda ke ${booking.destination} disetujui. Driver akan segera ditugaskan.`,
            },
        type: 'booking_confirmed',
      })

      return NextResponse.json({ success: true, assigned: !!assignedTaxi })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err: any) {
    console.error('approve route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
