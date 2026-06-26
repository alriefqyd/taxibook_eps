import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Vercel cron runs every 5 minutes
// vercel.json: { "crons": [{ "path": "/api/cron/auto-complete", "schedule": "*/5 * * * *" }] }

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (process.env.NODE_ENV !== 'development' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const now   = new Date()
    const results = {
      auto_cancelled:   0,
      auto_completed:   0,
      reminded_15min:   0,
      reminded_start:   0,
      reminded_overdue: 0,
      notified_coord:   0,
    }

    // ── 0. AUTO-CANCEL bookings not started 15+ min after assigned_at ──
    // Window: driver must press "Start trip" within 15 min of being assigned
    const cancelCutoff = new Date(now.getTime() - 15 * 60 * 1000)
    const { data: notStarted } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, taxi_id, taxis!taxi_id(driver_id)')
      .eq('status', 'booked')
      .not('assigned_at', 'is', null)
      .lt('assigned_at', cancelCutoff.toISOString())

    if (notStarted?.length) {
      const ids = notStarted.map((b: any) => b.id)
      await admin.from('bookings').update({
        status:           'cancelled',
        rejection_reason: 'Driver did not start trip within 15 minutes of scheduled time',
      }).in('id', ids)

      const { data: coordinators } = await admin
        .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

      const cancelNotifs: any[] = []
      for (const b of notStarted as any[]) {
        cancelNotifs.push({
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      'Trip auto-cancelled',
          body:       `Your trip to ${b.destination} was cancelled — driver did not start on time.`,
          type:       'booking_cancelled',
          url:        '/staff/home',
        })
        if (b.taxis?.driver_id) {
          cancelNotifs.push({
            user_id:    b.taxis.driver_id,
            booking_id: b.id,
            title:      'Trip auto-cancelled',
            body:       `Trip to ${b.destination} was auto-cancelled. You did not start within 15 min of the scheduled time.`,
            type:       'booking_cancelled',
            url:        '/driver/home',
          })
        }
        for (const c of (coordinators || []) as any[]) {
          cancelNotifs.push({
            user_id:    c.id,
            booking_id: b.id,
            title:      'Trip auto-cancelled',
            body:       `Booking to ${b.destination} was auto-cancelled — driver did not start within 15 min of scheduled time.`,
            type:       'booking_cancelled',
            url:        '/coordinator/home',
          })
        }
      }
      if (cancelNotifs.length) await notify(cancelNotifs)
      results.auto_cancelled = notStarted.length
    }

    // ── 1. AUTO-COMPLETE trips that have been started but not finished ──
    const { data: overdueBookings } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, taxi_id, taxis!taxi_id(driver_id)')
      .in('status', ['on_trip', 'waiting_trip'])
      .lt('auto_complete_at', now.toISOString())

    if (overdueBookings?.length) {
      const ids = overdueBookings.map((b: any) => b.id)
      await admin.from('bookings').update({
        status:       'completed',
        completed_at: now.toISOString(),
        completed_by: 'system',
      }).in('id', ids)

      // Notify passengers + drivers
      const notifications: any[] = []
      for (const b of overdueBookings as any[]) {
        notifications.push({
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      'Trip auto-completed',
          body:       `Your trip to ${b.destination} has been automatically completed.`,
          type:       'auto_completed',
        })
        if (b.taxis?.driver_id) {
          notifications.push({
            user_id:    b.taxis.driver_id,
            booking_id: b.id,
            title:      'Trip auto-completed',
            body:       `Trip to ${b.destination} has been automatically completed.`,
            type:       'auto_completed',
          })
        }
      }
      if (notifications.length) await notify(notifications)
      results.auto_completed++
    }

    // ── 2. 15-MIN PRE-TRIP REMINDER ────────────────────────────────
    // Fires once per booking when scheduled_at is 13–17 min away.
    // Includes driver distance + rough ETA if GPS is fresh.

    const remind15Start = new Date(now.getTime() + 12 * 60 * 1000)
    const remind15End   = new Date(now.getTime() + 18 * 60 * 1000)

    const { data: upcoming15 } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, scheduled_at, pickup_lat, pickup_lng, taxi_id, taxis!taxi_id(driver_id, name, latitude, longitude, location_updated_at)')
      .eq('status', 'booked')
      .gte('scheduled_at', remind15Start.toISOString())
      .lte('scheduled_at', remind15End.toISOString())

    for (const b of (upcoming15 || []) as any[]) {
      // Skip if already sent
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', b.id)
        .eq('type', 'reminder_15min')
      if ((count || 0) > 0) continue

      const taxi       = b.taxis
      const gpsAgeMin  = taxi?.location_updated_at
        ? (now.getTime() - new Date(taxi.location_updated_at).getTime()) / 60000
        : Infinity
      const gpsIsFresh = gpsAgeMin < 3

      let locationLine = ''
      if (gpsIsFresh && taxi?.latitude && taxi?.longitude && b.pickup_lat && b.pickup_lng) {
        const distanceKm = haversineKm(taxi.latitude, taxi.longitude, b.pickup_lat, b.pickup_lng)
        const etaMin     = Math.round((distanceKm / 30) * 60) // ~30 km/h estimate
        locationLine     = ` Driver is ~${distanceKm < 1
          ? `${Math.round(distanceKm * 1000)}m`
          : `${distanceKm.toFixed(1)}km`} away, ETA ~${etaMin} min.`
      }

      const notifs15: any[] = [
        {
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      '⏰ Your trip is in 15 minutes',
          body:       `Trip to ${b.destination} starts soon. Please head to the pickup point.${locationLine}`,
          type:       'reminder_15min',
          url:        '/staff/home',
        },
      ]

      if (taxi?.driver_id) {
        const { data: passenger } = await admin
          .from('users').select('name').eq('id', b.passenger_id).single()
        notifs15.push({
          user_id:    taxi.driver_id,
          booking_id: b.id,
          title:      '⏰ Pickup in 15 minutes',
          body:       `Pick up ${passenger?.name} → ${b.destination} in 15 min. Head to the pickup point now.`,
          type:       'reminder_15min',
          url:        '/driver/home',
        })
      }

      await notify(notifs15)
      results.reminded_15min++
    }

    // ── 3. ARRIVING NOTIFICATION — GPS-primary, time-fallback ─────
    // Primary:  driver GPS ≤ 500 m from pickup → fires immediately
    // Fallback: no fresh GPS → fires at scheduled_at ± 2 min (old behaviour)
    // Fires once per booking (deduped on reminder_start type)

    const arrivingWindowStart = new Date(now.getTime() - 30 * 60 * 1000)
    const arrivingWindowEnd   = new Date(now.getTime() + 30 * 60 * 1000)

    const { data: arrivingBookings } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, scheduled_at, pickup_lat, pickup_lng, taxi_id, taxis!taxi_id(driver_id, name, latitude, longitude, location_updated_at)')
      .eq('status', 'booked')
      .gte('scheduled_at', arrivingWindowStart.toISOString())
      .lte('scheduled_at', arrivingWindowEnd.toISOString())

    for (const b of (arrivingBookings || []) as any[]) {
      // Skip if already sent
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', b.id)
        .eq('type', 'reminder_start')
      if ((count || 0) > 0) continue

      const taxi       = b.taxis
      const gpsAgeMin  = taxi?.location_updated_at
        ? (now.getTime() - new Date(taxi.location_updated_at).getTime()) / 60000
        : Infinity
      const gpsIsFresh = gpsAgeMin < 3

      let shouldNotify = false
      let distanceM: number | null = null

      if (gpsIsFresh && taxi?.latitude && taxi?.longitude && b.pickup_lat && b.pickup_lng) {
        const distanceKm = haversineKm(taxi.latitude, taxi.longitude, b.pickup_lat, b.pickup_lng)
        if (distanceKm <= 0.5) {
          shouldNotify = true
          distanceM    = Math.round(distanceKm * 1000)
        }
      } else {
        // GPS unavailable — fall back to scheduled time ± 2 min
        const diffMs = Math.abs(now.getTime() - new Date(b.scheduled_at).getTime())
        if (diffMs <= 3 * 60 * 1000) shouldNotify = true
      }

      if (!shouldNotify) continue

      const passengerBody = distanceM !== null
        ? `Your driver is ~${distanceM}m away from the pickup point. Please be ready.`
        : `Your trip to ${b.destination} is starting. Please be ready at the pickup point.`

      const notifs: any[] = [
        {
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      '🚗 Your driver is arriving now',
          body:       passengerBody,
          type:       'reminder_start',
          url:        '/staff/home',
        },
      ]

      if (taxi?.driver_id) {
        const { data: passenger } = await admin
          .from('users').select('name').eq('id', b.passenger_id).single()
        notifs.push({
          user_id:    taxi.driver_id,
          booking_id: b.id,
          title:      '🚗 Time to pick up passenger',
          body:       `Pick up ${passenger?.name} now → ${b.destination}. Tap "Start trip" when picked up.`,
          type:       'reminder_start',
          url:        '/driver/home',
        })
      }

      await notify(notifs)
      results.reminded_start++
    }

    // ── 4. OVERDUE REPEAT (every 5 min until started) ──────
    const overdueStart = new Date(now.getTime() - 30 * 60 * 1000)

    const { data: overdueNotStarted } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, scheduled_at, pickup_lat, pickup_lng, taxi_id, taxis!taxi_id(driver_id, name, latitude, longitude, location_updated_at)')
      .eq('status', 'booked')
      .lt('scheduled_at', now.toISOString())
      .gte('scheduled_at', overdueStart.toISOString())

    for (const b of (overdueNotStarted || []) as any[]) {
      const minutesLate = Math.round(
        (now.getTime() - new Date(b.scheduled_at).getTime()) / 60000
      )

      // ── GPS proximity check ──────────────────────────────
      const taxi        = b.taxis
      const gpsAgeMin   = taxi?.location_updated_at
        ? (now.getTime() - new Date(taxi.location_updated_at).getTime()) / 60000
        : Infinity
      const gpsIsFresh  = gpsAgeMin < 3   // updated within last 3 minutes

      let distanceKm: number | null = null
      if (gpsIsFresh && taxi?.latitude && taxi?.longitude && b.pickup_lat && b.pickup_lng) {
        distanceKm = haversineKm(taxi.latitude, taxi.longitude, b.pickup_lat, b.pickup_lng)
      }

      // ≤ 500m → almost at pickup, no need to alert driver at all
      const driverAtPickup = distanceKm !== null && distanceKm <= 0.5
      // ≤ 3km + fresh GPS → clearly en route, skip driver nag
      const driverEnRoute  = distanceKm !== null && distanceKm <= 3.0

      // ── Throttle: skip if last overdue notif was < 5 min ago ──
      const { data: lastNotif } = await admin
        .from('notifications')
        .select('created_at')
        .eq('booking_id', b.id)
        .eq('type', 'reminder_overdue')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastNotif) {
        const minsSince = (now.getTime() - new Date(lastNotif.created_at).getTime()) / 60000
        if (minsSince < 4.5) continue
      }

      const notifs: any[] = []

      // ── Driver alert — always fire, tone depends on proximity ──
      if (taxi?.driver_id) {
        let driverTitle: string
        let driverBody: string

        if (driverAtPickup) {
          driverTitle = `You're almost at pickup`
          driverBody  = `You're ~${Math.round(distanceKm! * 1000)}m from the passenger. Tap "Start trip" once they're in the car.`
        } else if (driverEnRoute) {
          driverTitle = `Reminder: passenger is waiting`
          driverBody  = `You're on your way (~${distanceKm!.toFixed(1)}km from pickup). Don't forget to tap "Start trip" when picked up.`
        } else {
          driverTitle = `⚠️ Trip ${minutesLate} min overdue`
          driverBody  = `Passenger is waiting for pickup to ${b.destination}. Please head there now and tap "Start trip" when picked up.`
        }

        notifs.push({
          user_id:    taxi.driver_id,
          booking_id: b.id,
          title:      driverTitle,
          body:       driverBody,
          type:       'reminder_overdue',
          url:        '/driver/home',
        })
      }

      // ── Passenger alert after 5 min overdue ─────────────
      if (minutesLate >= 5) {
        const { data: lastPassengerNotif } = await admin
          .from('notifications')
          .select('created_at')
          .eq('booking_id', b.id)
          .eq('type', 'reminder_overdue')
          .eq('user_id', b.passenger_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const shouldNotifyPassenger = !lastPassengerNotif ||
          (now.getTime() - new Date(lastPassengerNotif.created_at).getTime()) / 60000 >= 9.5

        if (shouldNotifyPassenger) {
          let passengerBody: string
          if (driverAtPickup) {
            passengerBody = `Your driver is almost there — ~${Math.round(distanceKm! * 1000)}m from pickup. Please be ready.`
          } else if (driverEnRoute) {
            passengerBody = `Your driver is on the way (~${distanceKm!.toFixed(1)}km from pickup, ${minutesLate} min late). Please wait.`
          } else if (gpsIsFresh && distanceKm !== null) {
            passengerBody = `Your trip is ${minutesLate} min late. Driver is ${distanceKm.toFixed(1)}km away.`
          } else {
            passengerBody = `Your trip to ${b.destination} is ${minutesLate} min late. Please contact the coordinator if needed.`
          }

          notifs.push({
            user_id:    b.passenger_id,
            booking_id: b.id,
            title:      `Your driver is ${minutesLate} min late`,
            body:       passengerBody,
            type:       'reminder_overdue',
            url:        '/staff/home',
          })
          results.notified_coord++
        }
      }

      if (notifs.length) {
        await notify(notifs)
        results.reminded_overdue++
      }
    }

    console.log('Cron results:', results)
    return NextResponse.json({ success: true, ...results })

  } catch (err: any) {
    console.error('Cron error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
