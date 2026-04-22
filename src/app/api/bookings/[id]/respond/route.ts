import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'

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

    const { action } = await request.json()
    const bookingId  = params.id

    // Get booking + current taxi
    const { data: booking } = await admin
      .from('bookings')
      .select('*, taxis!taxi_id(id, name, driver_id, users!driver_id(name))')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    // Verify this driver owns the booking
    if (booking.taxis?.driver_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── Record response ──
    await admin.from('booking_responses').insert({
      booking_id: bookingId,
      driver_id:  user.id,
      taxi_id:    booking.taxi_id,
      response:   action === 'accept' ? 'accepted' : 'declined',
    })

    // ── ACCEPT ──
    if (action === 'accept') {
      await admin.from('bookings')
        .update({ status: 'booked' })
        .eq('id', bookingId)

      const { data: driver } = await admin
        .from('users').select('name').eq('id', user.id).single()

      await admin.from('notifications').insert({
        user_id:    booking.passenger_id,
        booking_id: bookingId,
        title:      'Trip confirmed!',
        body:       `Your trip to ${booking.destination} is confirmed — ${booking.taxis?.name} · ${driver?.name}`,
        type:       'booking_confirmed',
      })
      // Push to passenger
      await sendPushToUser(booking.passenger_id, '✅ Trip confirmed!', `${booking.taxis?.name} · ${driver?.name} → ${booking.destination}`, '/staff/home')

      return NextResponse.json({ success: true, status: 'booked' })
    }

    // ── DECLINE ──
    if (action === 'decline') {
      const { data: driver } = await admin
        .from('users').select('name').eq('id', user.id).single()

      const scheduledTime = new Date(booking.scheduled_at)
      const nowTime        = new Date()
      const isNowBooking   = (scheduledTime.getTime() - nowTime.getTime()) < 5 * 60 * 1000

      // Get all active+available taxis with drivers sorted by name (consistent order)
      const { data: allTaxis } = await admin
        .from('taxis')
        .select('id, name, driver_id, users!driver_id(name)')
        .eq('is_active', true)
        .eq('is_available', true)
        .not('driver_id', 'is', null)
        .order('name', { ascending: true })

      if (!allTaxis?.length) {
        await notifyCoordinators(admin, booking,
          'No taxis available',
          `No taxis available for trip to ${booking.destination}.`)
        await admin.from('bookings')
          .update({ status: 'submitted', taxi_id: null })
          .eq('id', bookingId)
        return NextResponse.json({ success: true, status: 'no_taxis' })
      }

      // ── Check availability ──
      // NOW booking: physically free right now (no active trip in progress)
      // SCHEDULED: free at the scheduled future time
      const availableAtTime = await Promise.all(
        allTaxis.map(async (taxi: any) => {
          let isFree = false

          if (isNowBooking) {
            const { data: currentTrip } = await admin
              .from('bookings')
              .select('id')
              .eq('taxi_id', taxi.id)
              .neq('id', bookingId)
              .in('status', ['booked','on_trip','waiting_trip'])
              .lte('scheduled_at', nowTime.toISOString())
              .gte('auto_complete_at', nowTime.toISOString())
              .limit(1)
              .maybeSingle()
            isFree = !currentTrip
          } else {
            const { data: conflict } = await admin
              .from('bookings')
              .select('id')
              .eq('taxi_id', taxi.id)
              .neq('id', bookingId)
              .in('status', ['booked','on_trip','waiting_trip','pending_driver_approval'])
              .gt('auto_complete_at', scheduledTime.toISOString())
              .limit(1)
              .maybeSingle()
            isFree = !conflict
          }

          return { taxi, isFree }
        })
      )

      // Only consider taxis that are FREE
      const freeTaxis = availableAtTime
        .filter(({ isFree }: any) => isFree)
        .map(({ taxi }: any) => taxi)

      if (!freeTaxis.length) {
        // All taxis are busy at that time — notify coordinator
        await notifyCoordinators(admin, booking,
          'All taxis busy — manual assignment needed',
          `All taxis are busy at ${scheduledTime.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} for trip to ${booking.destination}.`)
        await admin.from('bookings')
          .update({ status: 'submitted', taxi_id: null })
          .eq('id', bookingId)
        return NextResponse.json({ success: true, status: 'all_busy' })
      }

      // ── Sort free taxis by merit: fewest trips → longest idle → random ──
      const todayStart2 = new Date()
      todayStart2.setHours(0, 0, 0, 0)

      const freeTaxisRanked = await Promise.all(
        freeTaxis.map(async (taxi: any) => {
          // Trips completed today
          const { count: tripsToday } = await admin
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('taxi_id', taxi.id)
            .eq('status', 'completed')
            .gte('completed_at', todayStart2.toISOString())

          // Last booking end time (idle since)
          const { data: lastBooking } = await admin
            .from('bookings')
            .select('auto_complete_at')
            .eq('taxi_id', taxi.id)
            .in('status', ['booked','on_trip','waiting_trip','pending_driver_approval','completed'])
            .order('auto_complete_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const idleSince = lastBooking
            ? new Date(lastBooking.auto_complete_at).getTime()
            : 0 // never used = idle forever

          return { taxi, tripsToday: tripsToday || 0, idleSince }
        })
      )

      // Sort: fewest trips → longest idle (lowest idleSince = free longest)
      freeTaxisRanked.sort((a: any, b: any) => {
        if (a.tripsToday !== b.tripsToday) return a.tripsToday - b.tripsToday
        return a.idleSince - b.idleSince // longest idle wins if trips tied
      })

      const rankedTaxis = freeTaxisRanked.map((r: any) => r.taxi)

      // ── Round-robin among ranked free taxis ──
      const { data: declineHistory } = await admin
        .from('booking_responses')
        .select('driver_id')
        .eq('booking_id', bookingId)
        .eq('response', 'declined')

      const declinedDriverIds = (declineHistory || []).map((r: any) => r.driver_id)

      // Check if all FREE taxis have declined this booking in current round
      const allFreeDeclined = rankedTaxis.every((t: any) =>
        declinedDriverIds.includes(t.driver_id)
      )

      if (allFreeDeclined) {
        // All available drivers declined — notify coordinator and reset
        const { data: coordinators } = await admin
          .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

        if (coordinators?.length) {
          await admin.from('notifications').insert(
            coordinators.map((c: any) => ({
              user_id:    c.id,
              booking_id: bookingId,
              title:      '⚠️ All available drivers declined',
              body:       `All ${rankedTaxis.length} available drivers declined trip to ${booking.destination}. Restarting rotation.`,
              type:       'driver_declined',
            }))
          )
        }

        // Reset decline history to restart round-robin
        await admin.from('booking_responses')
          .delete()
          .eq('booking_id', bookingId)
          .eq('response', 'declined')

        // Restart from best ranked taxi
        const nextTaxi = rankedTaxis[0]
        await assignToDriver(admin, booking, nextTaxi, bookingId)

        return NextResponse.json({
          success:      true,
          status:       'loop_restarted',
          next_driver:  (nextTaxi.users as any)?.name || nextTaxi.name,
        })
      }

      // ── Find next driver in merit-ranked order ──
      const currentIdx = rankedTaxis.findIndex((t: any) => t.id === booking.taxi_id)

      let nextTaxi = null
      const total = rankedTaxis.length

      for (let i = 1; i <= total; i++) {
        const nextIdx   = (currentIdx + i) % total
        const candidate = rankedTaxis[nextIdx]
        if (!declinedDriverIds.includes(candidate.driver_id)) {
          nextTaxi = candidate
          break
        }
      }

      if (!nextTaxi) {
        nextTaxi = rankedTaxis[0]
      }

      await assignToDriver(admin, booking, nextTaxi, bookingId)

      // Notify coordinator about decline
      const { data: coordinators } = await admin
        .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

      if (coordinators?.length) {
        const newDeclineCount = declinedDriverIds.length + 1
        await admin.from('notifications').insert(
          coordinators.map((c: any) => ({
            user_id:    c.id,
            booking_id: bookingId,
            title:      'Driver declined — reassigned',
            body:       `${driver?.name} declined trip to ${booking.destination}. Trying ${(nextTaxi!.users as any)?.name || nextTaxi!.name}. (${newDeclineCount}/${freeTaxis.length} declined)`,
            type:       'driver_declined',
          }))
        )
      }

      return NextResponse.json({
        success:     true,
        status:      'reassigned',
        next_driver: (nextTaxi.users as any)?.name || nextTaxi.name,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err: any) {
    console.error('respond route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── Assign taxi to driver + notify ──────────────────────────
async function assignToDriver(admin: any, booking: any, taxi: any, bookingId: string) {
  await admin.from('bookings').update({
    taxi_id: taxi.id,
    status:  'pending_driver_approval',
  }).eq('id', bookingId)

  const { data: passenger } = await admin
    .from('users').select('name').eq('id', booking.passenger_id).single()

  const time = new Date(booking.scheduled_at).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit'
  })

  await admin.from('notifications').insert({
    user_id:    taxi.driver_id,
    booking_id: bookingId,
    title:      'New trip assigned',
    body:       `${passenger?.name} → ${booking.destination} at ${time}`,
    type:       'driver_assigned',
  })
  await sendPushToUser(taxi.driver_id, '🚗 New trip assigned', `${passenger?.name} → ${booking.destination} at ${time}`, '/driver/home')
}

// ── Notify all coordinators ──────────────────────────────────
async function notifyCoordinators(admin: any, booking: any, title: string, body: string) {
  const { data: coordinators } = await admin
    .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)
  if (!coordinators?.length) return
  await admin.from('notifications').insert(
    coordinators.map((c: any) => ({
      user_id:    c.id,
      booking_id: booking.id,
      title,
      body,
      type: 'driver_declined',
    }))
  )
}
