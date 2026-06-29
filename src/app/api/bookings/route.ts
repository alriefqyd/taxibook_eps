import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'
import { getRouteDurationSeconds } from '@/lib/routing'

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient()

    // ── Auth ──
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      pickup, destination, trip_type,
      wait_minutes = 0, notes, scheduled_at,
      status,
      pickup_lat = null, pickup_lng = null,
      destination_lat = null, destination_lng = null,
      passenger_id: requestedPassengerId = null,
    } = await request.json()

    if (!pickup || !destination || !trip_type || !scheduled_at) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Coordinators can book on behalf of a passenger
    const { data: caller } = await admin.from('users').select('role').eq('id', user.id).single()
    const passengerId = (caller?.role === 'coordinator' && requestedPassengerId)
      ? requestedPassengerId
      : user.id

    // ── Compute auto_complete_at: pickup→destination + destination→pickup + wait + 30 min ──
    // Window covers the full round trip so the driver isn't double-booked until back at base.
    const MARGIN_S   = 30 * 60   // 30 min buffer
    const FALLBACK_S = 2 * 3600  // 2h fallback when route unavailable
    const waitSec    = trip_type === 'WAITING' ? (wait_minutes || 0) * 60 : 0

    let routeSec = FALLBACK_S
    if (pickup_lat && pickup_lng && destination_lat && destination_lng) {
      const [forward, back] = await Promise.all([
        getRouteDurationSeconds(pickup_lat, pickup_lng, destination_lat, destination_lng),
        getRouteDurationSeconds(destination_lat, destination_lng, pickup_lat, pickup_lng),
      ])
      if (forward != null && back != null) routeSec = forward + back
      else if (forward != null)            routeSec = forward * 2  // mirror if return leg fails
    }

    const auto_complete_at = new Date(
      new Date(scheduled_at).getTime() + (routeSec + MARGIN_S + waitSec) * 1000
    ).toISOString()

    // ── Passenger overlap check (server-side guard) ──
    const { data: passengerConflict } = await admin
      .from('bookings')
      .select('booking_code, scheduled_at, destination')
      .eq('passenger_id', passengerId)
      .not('status', 'in', '(rejected,cancelled,completed)')
      .lt('scheduled_at', auto_complete_at)
      .gt('auto_complete_at', scheduled_at)
      .limit(1)
      .maybeSingle()

    if (passengerConflict) {
      const t = new Date(passengerConflict.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      return NextResponse.json(
        { error: `Passenger already has a booking at ${t} to ${passengerConflict.destination} that overlaps this trip.` },
        { status: 409 }
      )
    }

    // ── Insert booking ──
    const { data: inserted, error: insertError } = await admin
      .from('bookings')
      .insert({
        passenger_id:     passengerId,
        pickup,
        destination,
        trip_type,
        wait_minutes:     trip_type === 'WAITING' ? wait_minutes : 0,
        notes:            notes || null,
        scheduled_at,
        status,
        auto_complete_at,
        created_by:       user.id,
        pickup_lat,
        pickup_lng,
        destination_lat,
        destination_lng,
      })
      .select('id, booking_code, status, passenger_id, taxi_id, destination, scheduled_at, trip_type, wait_minutes, auto_complete_at')
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'You already have a booking at this time.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    if (!inserted) {
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
    }

    const booking = inserted

    // ── Auto-assign if submitted ──
    // Use the DB-returned auto_complete_at — the trigger may have adjusted it
    if (status === 'submitted') {
      const result = await autoAssign(admin, booking.id, booking.scheduled_at, booking.auto_complete_at)

      if (result.taxi) {
        // Notify driver
        const { data: passenger } = await admin
          .from('users').select('name').eq('id', passengerId).single()

        const time = new Date(scheduled_at).toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit'
        })

        await notify({
          user_id:    result.taxi.driver_id,
          booking_id: booking.id,
          title:      'Trip assigned to you',
          body:       `You have been assigned to pick up ${passenger?.name} → ${destination} at ${time}. Please be ready on time.`,
          type:       'driver_assigned',
        })

        return NextResponse.json({
          booking:     { ...booking, taxi_id: result.taxi.id, status: 'booked' },
          assigned:    true,
          taxi_name:   result.taxi.name,
          driver_name: result.taxi.driver_name,
        }, { status: 201 })
      }

      // No driver available — cancel the booking so it doesn't block future attempts
      await admin.from('bookings').update({
        status:           'cancelled',
        rejection_reason: 'no_driver_available',
      }).eq('id', booking.id)
      return NextResponse.json(
        { error: 'No driver available at this time. Please try a different time or contact your coordinator.' },
        { status: 409 }
      )
    }

    // ── Pending approval — notify coordinator ──
    await notifyCoordinators(admin, booking, passengerId, destination,
      'Booking needs your approval',
      `Waiting ${wait_minutes} min — over 60 min limit.`
    )

    return NextResponse.json({ booking, assigned: false }, { status: 201 })

  } catch (err: any) {
    console.error('POST /api/bookings error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── Auto-assign: fewest trips today + longest idle tiebreaker ────────────────
async function autoAssign(admin: any, bookingId: string, scheduledAt: string, autoCompleteAt: string) {
  // Midnight WIB (UTC+7) expressed as UTC — trips are counted per local business day
  const WIB_MS      = 7 * 60 * 60 * 1000
  const nowWib      = new Date(Date.now() + WIB_MS)
  nowWib.setUTCHours(0, 0, 0, 0)
  const todayStart    = new Date(nowWib.getTime() - WIB_MS)
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  // Active taxis with a driver on duty (is_available = driver manually set themselves online)
  const { data: taxis } = await admin
    .from('taxis')
    .select('id, name, driver_id, users!driver_id(name)')
    .eq('is_active',    true)
    .eq('is_available', true)
    .not('driver_id', 'is', null)

  if (!taxis?.length) return { taxi: null }

  // Build availability data for each taxi
  const availability = await Promise.all(
    taxis.map(async (taxi: any) => {

      // No schedule conflict: existing booking starts before new ends AND existing ends after new starts
      const { data: conflict } = await admin
        .from('bookings')
        .select('id')
        .eq('taxi_id', taxi.id)
        .in('status', ['booked', 'on_trip', 'waiting_trip'])
        .neq('id', bookingId)
        .lt('scheduled_at', autoCompleteAt)
        .gt('auto_complete_at', scheduledAt)
        .limit(1)
        .maybeSingle()

      if (conflict) return null

      // Count all non-cancelled trips scheduled today — includes active bookings, not just completed
      const { count: tripsToday } = await admin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('taxi_id', taxi.id)
        .not('status', 'in', '(cancelled,rejected)')
        .gte('scheduled_at', todayStart.toISOString())
        .lt('scheduled_at', tomorrowStart.toISOString())

      // Last booking that ends before the new booking starts — excludes future bookings from idle calc
      const { data: lastBooking } = await admin
        .from('bookings')
        .select('auto_complete_at')
        .eq('taxi_id', taxi.id)
        .in('status', ['completed', 'booked', 'on_trip', 'waiting_trip'])
        .lte('auto_complete_at', scheduledAt)
        .order('auto_complete_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const idleSince = lastBooking ? new Date(lastBooking.auto_complete_at).getTime() : 0

      return { taxi, tripsToday: tripsToday || 0, idleSince }
    })
  )

  // Filter nulls (unavailable taxis)
  // Primary: fewest trips today (spread load)
  // Tiebreaker: longest idle (smallest idleSince = has been free the longest)
  const available = availability
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (a.tripsToday !== b.tripsToday) return a.tripsToday - b.tripsToday
      return a.idleSince - b.idleSince
    }) as any[]

  if (!available.length) return { taxi: null }

  const best = available[0].taxi

  // Assign — the DB exclusion constraint (no_driver_overlap) is the final guard against race conditions
  const { error: assignErr } = await admin
    .from('bookings')
    .update({ taxi_id: best.id, status: 'booked', assigned_at: new Date().toISOString() })
    .eq('id', bookingId)

  if (assignErr) {
    // 23P01 = exclusion constraint violation (race condition: another booking was assigned to this taxi first)
    console.warn('autoAssign conflict on assignment:', assignErr.code, assignErr.message)
    return { taxi: null }
  }

  return {
    taxi: {
      id:          best.id,
      name:        best.name,
      driver_id:   best.driver_id,
      driver_name: best.users?.name || 'Driver',
    }
  }
}

// ── Notify all coordinators ──────────────────────────────────────────────────
async function notifyCoordinators(
  admin: any, booking: any, passengerId: string,
  destination: string, title: string, extraBody: string
) {
  const [{ data: coordinators }, { data: passenger }] = await Promise.all([
    admin.from('users').select('id').eq('role', 'coordinator').eq('is_active', true),
    admin.from('users').select('name').eq('id', passengerId).single(),
  ])

  if (!coordinators?.length) return

  await notify(
    coordinators.map((c: any) => ({
      user_id:    c.id,
      booking_id: booking.id,
      title,
      body:       `${passenger?.name} → ${destination}. ${extraBody}`,
      type:       'needs_approval',
    }))
  )
}
