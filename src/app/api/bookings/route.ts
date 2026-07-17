import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify, LocalizedText } from '@/lib/notify'
import { getRouteInfo, getBufferSeconds } from '@/lib/routing'
import { getDayAssignmentBlocks, isTaxiDayBlocked } from '@/lib/auto-assign'

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
      is_now_trip = false,
      pickup_lat = null, pickup_lng = null,
      destination_lat = null, destination_lng = null,
      passenger_id: requestedPassengerId = null,
    } = await request.json()

    if (!pickup || !destination || !trip_type || !scheduled_at) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── Block trip bookings during 12:00–13:00 WITA (lunch/prayer break) ──
    // Driver-day-assignment (special/full-day duty) goes through a separate endpoint
    // (/api/driver-day-assignments) and is unaffected — coordinators can still assign
    // drivers during this window, they just can't book a passenger trip through here.
    const scheduledWitaHour = new Date(new Date(scheduled_at).getTime() + 8 * 3600000).getUTCHours()
    if (scheduledWitaHour === 12) {
      return NextResponse.json(
        { error: 'Booking is not available between 12:00–13:00 WITA (lunch/prayer break).' },
        { status: 400 }
      )
    }

    // Coordinators can book on behalf of a passenger
    const { data: caller } = await admin.from('users').select('role').eq('id', user.id).single()
    const passengerId = (caller?.role === 'coordinator' && requestedPassengerId)
      ? requestedPassengerId
      : user.id

    // ── Compute auto_complete_at: pickup→destination + destination→pickup + wait + buffer ──
    // Window covers the full round trip so the driver isn't double-booked until back at base.
    const FALLBACK_S        = 2 * 3600  // 2h fallback when route unavailable (driver/taxi side)
    const ONEWAY_FALLBACK_S = 25 * 60   // 25 min fallback for a single leg (passenger side)
    const waitSec           = trip_type === 'WAITING' ? (wait_minutes || 0) * 60 : 0

    let forward: number | null = null
    let back: number | null = null
    let forwardDistanceKm: number | null = null
    if (pickup_lat && pickup_lng && destination_lat && destination_lng) {
      const [forwardInfo, backInfo] = await Promise.all([
        getRouteInfo(pickup_lat, pickup_lng, destination_lat, destination_lng),
        getRouteInfo(destination_lat, destination_lng, pickup_lat, pickup_lng),
      ])
      forward = forwardInfo?.durationSec ?? null
      back    = backInfo?.durationSec ?? null
      forwardDistanceKm = forwardInfo ? forwardInfo.distanceMeters / 1000 : null
    }

    const MARGIN_S = getBufferSeconds(forwardDistanceKm)

    let routeSec = FALLBACK_S
    if (forward != null && back != null) routeSec = forward + back
    else if (forward != null)            routeSec = forward * 2  // mirror if return leg fails

    const auto_complete_at = new Date(
      new Date(scheduled_at).getTime() + (routeSec + MARGIN_S + waitSec) * 1000
    ).toISOString()

    // ── Compute passenger_end_at: when is the PASSENGER (not the taxi) actually free again? ──
    // auto_complete_at above includes the driver's drive back to base, which the passenger isn't
    // part of for a DROP trip — they're done once they arrive. WAITING trips genuinely keep the
    // passenger occupied for the full round trip, so those reuse auto_complete_at as-is.
    const passenger_end_at = trip_type === 'WAITING'
      ? auto_complete_at
      : new Date(
          new Date(scheduled_at).getTime() + ((forward ?? ONEWAY_FALLBACK_S) + MARGIN_S) * 1000
        ).toISOString()

    // Coordinators are fully exempt from the overlap checks below — they may need to serve
    // multiple (possibly different) vendors with overlapping windows at once.
    const isCoordinator = caller?.role === 'coordinator'

    // ── Same passenger overlap check (server-side guard) ──
    // A passenger can't be in two places at once — their bookings' time windows must not overlap.
    // Compared against passenger_end_at (not auto_complete_at) so a DROP trip's driver-return
    // leg doesn't falsely block the passenger's next booking.
    if (!isCoordinator) {
      const { data: passengerConflict } = await admin
        .from('bookings')
        .select('booking_code, scheduled_at, destination')
        .eq('passenger_id', passengerId)
        .not('status', 'in', '(rejected,cancelled,completed)')
        .lt('scheduled_at', passenger_end_at)
        .gt('passenger_end_at', scheduled_at)
        .limit(1)
        .maybeSingle()

      if (passengerConflict) {
        const t = new Date(passengerConflict.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })
        return NextResponse.json(
          { error: `Passenger already has a booking at ${t} to ${passengerConflict.destination} that overlaps this trip.` },
          { status: 409 }
        )
      }
    }

    // ── Same route, near-simultaneous booking check (server-side guard) ──
    // If someone already has a booking for the exact same pickup → destination and trip type
    // (DROP vs WAITING — a WAITING trip has different logistics so it isn't a candidate to join)
    // within 15 minutes at or before this one, and that trip hasn't departed yet, tell this
    // booker to join the existing one instead of creating a redundant trip. Once the earlier trip
    // has actually started (on_trip / waiting_trip) it's too late to join — let this booking
    // proceed normally. This only depends on scheduled_at, not on now-vs-schedule mode.
    if (!isCoordinator) {
      const JOIN_WINDOW_MS = 15 * 60 * 1000
      const windowStart = new Date(new Date(scheduled_at).getTime() - JOIN_WINDOW_MS).toISOString()

      const { data: sameRouteBooking } = await admin
        .from('bookings')
        .select('booking_code, pickup, destination, scheduled_at, auto_complete_at, status, passenger_id, taxi_id')
        .eq('pickup', pickup)
        .eq('destination', destination)
        .eq('trip_type', trip_type)
        .not('status', 'in', '(rejected,cancelled,completed)')
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', scheduled_at)
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (sameRouteBooking && !['on_trip', 'waiting_trip'].includes(sameRouteBooking.status)) {
        const tz = 'Asia/Makassar'
        const start = new Date(sameRouteBooking.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: tz })

        const [{ data: conflictPassenger }, taxiResult] = await Promise.all([
          admin.from('users').select('name, phone').eq('id', sameRouteBooking.passenger_id).single(),
          sameRouteBooking.taxi_id
            ? admin.from('taxis').select('name, users!driver_id(name, phone)').eq('id', sameRouteBooking.taxi_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        const conflictDriver = (taxiResult.data?.users as any) || null

        return NextResponse.json(
          {
            error: `There is already a booking for this route (${sameRouteBooking.pickup} → ${sameRouteBooking.destination}) from ${start} by ${conflictPassenger?.name || 'another passenger'}. Please join that booking instead.`,
            conflict: {
              booking_code:    sameRouteBooking.booking_code,
              pickup:          sameRouteBooking.pickup,
              destination:     sameRouteBooking.destination,
              scheduled_at:    sameRouteBooking.scheduled_at,
              auto_complete_at: sameRouteBooking.auto_complete_at,
              passenger_name:  conflictPassenger?.name || null,
              passenger_phone: conflictPassenger?.phone || null,
              driver_name:     conflictDriver?.name || null,
              driver_phone:    conflictDriver?.phone || null,
            },
          },
          { status: 409 }
        )
      }
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
        passenger_end_at,
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
        // The only unique constraint on bookings is booking_code — this is a code-generation
        // collision (or retry), not an actual double-booking. Real time-slot conflicts are
        // caught above, before we ever reach this insert.
        return NextResponse.json(
          { error: 'Could not create the booking due to a temporary conflict. Please try again.' },
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
      const result = await autoAssign(admin, booking.id, booking.scheduled_at, booking.auto_complete_at, pickup_lat, pickup_lng, is_now_trip)

      if (result.taxi) {
        // Notify driver
        const { data: passenger } = await admin
          .from('users').select('name, role').eq('id', passengerId).single()

        const time = new Date(scheduled_at).toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar'
        })

        const notifs: any[] = [{
          user_id:    result.taxi.driver_id,
          booking_id: booking.id,
          title:      { en: 'Trip assigned to you', id: 'Perjalanan ditugaskan kepada Anda' },
          body: {
            en: `You have been assigned to pick up ${passenger?.name} → ${destination} at ${time}. Please be ready on time.`,
            id: `Anda ditugaskan menjemput ${passenger?.name} → ${destination} pukul ${time}. Mohon siap tepat waktu.`,
          },
          type:       'driver_assigned',
        }]

        // Someone else (a coordinator) booked this trip on the passenger's behalf —
        // let the passenger know a trip now exists for them, with the driver already assigned.
        if (passengerId !== user.id) {
          const passengerUrl = passenger?.role === 'driver' ? '/driver/home'
            : passenger?.role === 'coordinator' ? '/coordinator/home'
            : '/staff/home'
          notifs.push({
            user_id:    passengerId,
            booking_id: booking.id,
            title:      { en: 'A trip has been booked for you', id: 'Trip telah dibooking untuk Anda' },
            body: {
              en: `${result.taxi.name} · ${result.taxi.driver_name} will pick you up → ${destination} at ${time}.`,
              id: `${result.taxi.name} · ${result.taxi.driver_name} akan menjemput Anda → ${destination} pukul ${time}.`,
            },
            type: 'booking_created_for_you',
            url:  passengerUrl,
          })
        }

        await notify(notifs)

        return NextResponse.json({
          booking:      { ...booking, taxi_id: result.taxi.id, status: 'booked' },
          assigned:     true,
          taxi_name:    result.taxi.name,
          driver_name:  result.taxi.driver_name,
          driver_phone: result.taxi.driver_phone,
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
      { en: 'Booking needs your approval', id: 'Booking memerlukan persetujuan Anda' },
      {
        en: `Waiting trip — ${wait_minutes} min wait time requires coordinator approval.`,
        id: `Trip tunggu — waktu tunggu ${wait_minutes} menit memerlukan persetujuan koordinator.`,
      }
    )

    // Someone else (a coordinator) booked this trip on the passenger's behalf —
    // let the passenger know, even though it's still awaiting approval.
    if (passengerId !== user.id) {
      const { data: passenger } = await admin
        .from('users').select('role').eq('id', passengerId).single()
      const passengerUrl = passenger?.role === 'driver' ? '/driver/home'
        : passenger?.role === 'coordinator' ? '/coordinator/home'
        : '/staff/home'
      const time = new Date(scheduled_at).toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar'
      })
      await notify({
        user_id:    passengerId,
        booking_id: booking.id,
        title:      { en: 'A trip has been booked for you', id: 'Trip telah dibooking untuk Anda' },
        body: {
          en: `A trip to ${destination} at ${time} has been booked for you — awaiting coordinator approval.`,
          id: `Trip ke ${destination} pukul ${time} telah dibooking untuk Anda — menunggu persetujuan koordinator.`,
        },
        type: 'booking_created_for_you',
        url:  passengerUrl,
      })
    }

    return NextResponse.json({ booking, assigned: false }, { status: 201 })

  } catch (err: any) {
    console.error('POST /api/bookings error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── Haversine distance in km ─────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ── Auto-assign ───────────────────────────────────────────────────────────────
// Now trips (scheduled ≤30 min from now): nearest driver first (if GPS fresh).
// Scheduled trips: fewest trips today → longest idle tiebreaker.
async function autoAssign(
  admin: any,
  bookingId: string,
  scheduledAt: string,
  autoCompleteAt: string,
  pickupLat: number | null = null,
  pickupLng: number | null = null,
  isNowTrip: boolean = false,
) {
  // Midnight WITA (UTC+8) expressed as UTC — trips are counted per local business day
  const WITA_MS     = 8 * 60 * 60 * 1000
  const nowWita     = new Date(Date.now() + WITA_MS)
  nowWita.setUTCHours(0, 0, 0, 0)
  const todayStart    = new Date(nowWita.getTime() - WITA_MS)
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const scheduledWita = new Date(new Date(scheduledAt).getTime() + 8 * 3600000)

  // For future-day trips drivers may be offline (end of shift) — only check is_available for same-day trips
  const scheduledWitaDate = scheduledWita.toISOString().slice(0, 10)
  const todayWitaDate     = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const isFutureDay       = scheduledWitaDate > todayWitaDate

  // Also treat as now-trip if scheduled within 20 min even when user chose "schedule" mode
  const effectiveNowTrip = isNowTrip || (new Date(scheduledAt).getTime() - Date.now() <= 15 * 60 * 1000)

  let taxiQuery = admin
    .from('taxis')
    .select('id, name, driver_id, latitude, longitude, location_updated_at, users!driver_id(name, phone)')
    .eq('is_active', true)
    .not('driver_id', 'is', null)
  if (!isFutureDay) taxiQuery = taxiQuery.eq('is_available', true)

  const { data: taxis } = await taxiQuery

  if (!taxis?.length) return { taxi: null }

  // Exclude taxis whose day-duty (full-day, or overlapping time range) blocks this booking
  const witaDate = new Date(new Date(scheduledAt).getTime() + 8 * 3600000).toISOString().slice(0, 10)
  const { fullDay, ranges } = await getDayAssignmentBlocks(admin, witaDate)
  const bookingStart = new Date(scheduledAt)
  const bookingEnd   = new Date(autoCompleteAt)
  const candidates = taxis.filter((t: any) => !isTaxiDayBlocked(t.id, fullDay, ranges, bookingStart, bookingEnd))

  if (!candidates.length) return { taxi: null }

  // Build availability data for each taxi
  const GPS_FRESH_MS = 30 * 60 * 1000

  const availability = await Promise.all(
    candidates.map(async (taxi: any) => {

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

      // Distance from driver's current GPS to pickup — only meaningful for now-trips
      let distanceKm: number | null = null
      if (effectiveNowTrip && pickupLat && pickupLng && taxi.latitude && taxi.longitude) {
        const gpsAgeMs = taxi.location_updated_at
          ? Date.now() - new Date(taxi.location_updated_at).getTime()
          : Infinity
        if (gpsAgeMs <= GPS_FRESH_MS) {
          distanceKm = haversineKm(taxi.latitude, taxi.longitude, pickupLat, pickupLng)
        }
      }

      return { taxi, tripsToday: tripsToday || 0, idleSince, distanceKm }
    })
  )

  // Filter nulls (unavailable taxis)
  // Now-trips: nearest driver first (GPS must be fresh); fall back to fewest-trips if no GPS.
  // Scheduled trips: fewest trips today → longest idle tiebreaker.
  const available = availability
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (effectiveNowTrip) {
        if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm
        if (a.distanceKm !== null) return -1  // driver with GPS data ranks higher
        if (b.distanceKm !== null) return 1
      }
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
      id:           best.id,
      name:         best.name,
      driver_id:    best.driver_id,
      driver_name:  best.users?.name  || 'Driver',
      driver_phone: best.users?.phone || null,
    }
  }
}

// ── Notify all coordinators ──────────────────────────────────────────────────
async function notifyCoordinators(
  admin: any, booking: any, passengerId: string,
  destination: string, title: LocalizedText, extraBody: LocalizedText
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
      body: {
        en: `${passenger?.name} → ${destination}. ${extraBody.en}`,
        id: `${passenger?.name} → ${destination}. ${extraBody.id}`,
      },
      type:       'needs_approval',
    }))
  )
}
