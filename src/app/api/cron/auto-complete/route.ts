import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'
import { AUTO_CANCEL_REASON } from '@/lib/autoCancel'

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
      auto_cancelled:            0,
      auto_completed:            0,
      reminded_15min:            0,
      reminded_start:            0,
      reminded_overdue:          0,
      notified_coord:            0,
      reminded_pending_approval: 0,
      driver_offline_warned:     0,
      gps_stale_warned:          0,
      duty_window_reminded:      0,
    }

    // ── 0. AUTO-CANCEL bookings not started 15+ min after scheduled_at ──
    // Window: driver must press "Start trip" within 15 min of the scheduled trip time
    const cancelCutoff = new Date(now.getTime() - 15 * 60 * 1000)
    const { data: notStarted } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, taxi_id, taxis!taxi_id(driver_id)')
      .eq('status', 'booked')
      .not('taxi_id', 'is', null)
      .lt('scheduled_at', cancelCutoff.toISOString())

    if (notStarted?.length) {
      const ids = notStarted.map((b: any) => b.id)
      await admin.from('bookings').update({
        status:           'cancelled',
        rejection_reason: AUTO_CANCEL_REASON,
      }).in('id', ids)

      const { data: coordinators } = await admin
        .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

      const cancelNotifs: any[] = []
      for (const b of notStarted as any[]) {
        cancelNotifs.push({
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      { en: 'Trip auto-cancelled', id: 'Perjalanan otomatis dibatalkan' },
          body: {
            en: `Your trip to ${b.destination} was cancelled — driver did not start on time.`,
            id: `Perjalanan Anda ke ${b.destination} dibatalkan — driver tidak memulai tepat waktu.`,
          },
          type:       'booking_cancelled',
          url:        '/staff/home',
        })
        if (b.taxis?.driver_id) {
          cancelNotifs.push({
            user_id:    b.taxis.driver_id,
            booking_id: b.id,
            title:      { en: 'Trip auto-cancelled', id: 'Perjalanan otomatis dibatalkan' },
            body: {
              en: `Trip to ${b.destination} was auto-cancelled. You did not start within 15 min of the scheduled time.`,
              id: `Perjalanan ke ${b.destination} otomatis dibatalkan. Anda tidak memulai dalam 15 menit sejak waktu jadwal.`,
            },
            type:       'booking_cancelled',
            url:        '/driver/home',
          })
        }
        for (const c of (coordinators || []) as any[]) {
          cancelNotifs.push({
            user_id:    c.id,
            booking_id: b.id,
            title:      { en: 'Trip auto-cancelled', id: 'Perjalanan otomatis dibatalkan' },
            body: {
              en: `Booking to ${b.destination} was auto-cancelled — driver did not start within 15 min of scheduled time.`,
              id: `Booking ke ${b.destination} otomatis dibatalkan — driver tidak memulai dalam 15 menit sejak waktu jadwal.`,
            },
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
          title:      { en: 'Trip auto-completed', id: 'Perjalanan otomatis selesai' },
          body: {
            en: `Your trip to ${b.destination} has been automatically completed.`,
            id: `Perjalanan Anda ke ${b.destination} telah otomatis diselesaikan.`,
          },
          type:       'auto_completed',
        })
        if (b.taxis?.driver_id) {
          notifications.push({
            user_id:    b.taxis.driver_id,
            booking_id: b.id,
            title:      { en: 'Trip auto-completed', id: 'Perjalanan otomatis selesai' },
            body: {
              en: `Trip to ${b.destination} has been automatically completed.`,
              id: `Perjalanan ke ${b.destination} telah otomatis diselesaikan.`,
            },
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

      let locationLine = { en: '', id: '' }
      if (gpsIsFresh && taxi?.latitude && taxi?.longitude && b.pickup_lat && b.pickup_lng) {
        const distanceKm = haversineKm(taxi.latitude, taxi.longitude, b.pickup_lat, b.pickup_lng)
        const etaMin     = Math.round((distanceKm / 30) * 60) // ~30 km/h estimate
        const distText   = distanceKm < 1
          ? `${Math.round(distanceKm * 1000)}m`
          : `${distanceKm.toFixed(1)}km`
        locationLine = {
          en: ` Driver is ~${distText} away, ETA ~${etaMin} min.`,
          id: ` Driver berjarak ~${distText}, estimasi tiba ~${etaMin} menit.`,
        }
      }

      const notifs15: any[] = [
        {
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      { en: '⏰ Your trip is in 15 minutes', id: '⏰ Perjalanan Anda 15 menit lagi' },
          body: {
            en: `Trip to ${b.destination} starts soon. Please head to the pickup point.${locationLine.en}`,
            id: `Perjalanan ke ${b.destination} akan segera dimulai. Mohon menuju titik jemput.${locationLine.id}`,
          },
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
          title:      { en: '⏰ Pickup in 15 minutes', id: '⏰ Penjemputan 15 menit lagi' },
          body: {
            en: `Pick up ${passenger?.name} → ${b.destination} in 15 min. Head to the pickup point now.`,
            id: `Jemput ${passenger?.name} → ${b.destination} dalam 15 menit. Segera menuju titik jemput.`,
          },
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

      const passengerTitle = distanceM !== null
        ? { en: '🚗 Your driver is nearby', id: '🚗 Driver Anda sudah dekat' }
        : { en: '⏰ Time to head to your pickup point', id: '⏰ Saatnya menuju titik jemput' }
      const passengerBody = distanceM !== null
        ? {
            en: `Your driver is ~${distanceM}m away from the pickup point. Please be ready.`,
            id: `Driver Anda berjarak ~${distanceM}m dari titik jemput. Mohon bersiap.`,
          }
        : {
            en: `Your trip to ${b.destination} is scheduled now. Please head to the pickup point.`,
            id: `Perjalanan Anda ke ${b.destination} sudah dijadwalkan sekarang. Mohon menuju titik jemput.`,
          }

      const notifs: any[] = [
        {
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      passengerTitle,
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
          title:      { en: '🚗 Time to pick up passenger', id: '🚗 Saatnya menjemput penumpang' },
          body: {
            en: `Pick up ${passenger?.name} now → ${b.destination}. Tap "Start trip" when picked up.`,
            id: `Jemput ${passenger?.name} sekarang → ${b.destination}. Tekan "Mulai perjalanan" setelah dijemput.`,
          },
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

      // ── Throttle: skip if last overdue notif was < 9.5 min ago ──
      const { data: lastNotif } = await admin
        .from('notifications')
        .select('sent_at')
        .eq('booking_id', b.id)
        .eq('type', 'reminder_overdue')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastNotif) {
        const minsSince = (now.getTime() - new Date(lastNotif.sent_at).getTime()) / 60000
        if (minsSince < 9.5) continue
      }

      const notifs: any[] = []

      // ── Driver alert — always fire, tone depends on proximity ──
      if (taxi?.driver_id) {
        let driverTitle: { en: string; id: string }
        let driverBody:  { en: string; id: string }

        if (driverAtPickup) {
          driverTitle = { en: `You're almost at pickup`, id: `Anda hampir sampai di titik jemput` }
          driverBody  = {
            en: `You're ~${Math.round(distanceKm! * 1000)}m from the passenger. Tap "Start trip" once they're in the car.`,
            id: `Anda ~${Math.round(distanceKm! * 1000)}m dari penumpang. Tekan "Mulai perjalanan" setelah mereka naik.`,
          }
        } else if (driverEnRoute) {
          driverTitle = { en: `Reminder: passenger is waiting`, id: `Pengingat: penumpang sedang menunggu` }
          driverBody  = {
            en: `You're on your way (~${distanceKm!.toFixed(1)}km from pickup). Don't forget to tap "Start trip" when picked up.`,
            id: `Anda dalam perjalanan (~${distanceKm!.toFixed(1)}km dari titik jemput). Jangan lupa tekan "Mulai perjalanan" setelah menjemput.`,
          }
        } else {
          driverTitle = { en: `⚠️ Trip ${minutesLate} min overdue`, id: `⚠️ Perjalanan terlambat ${minutesLate} menit` }
          driverBody  = {
            en: `Passenger is waiting for pickup to ${b.destination}. Please head there now and tap "Start trip" when picked up.`,
            id: `Penumpang sedang menunggu jemputan ke ${b.destination}. Segera menuju lokasi dan tekan "Mulai perjalanan" setelah menjemput.`,
          }
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

      // ── Passenger alert — only once they're actually late (≥5 min) ──
      if (minutesLate >= 5) {
        let passengerBody: { en: string; id: string }
        if (driverAtPickup) {
          passengerBody = {
            en: `Your driver is almost there — ~${Math.round(distanceKm! * 1000)}m from pickup. Please be ready.`,
            id: `Driver Anda hampir sampai — ~${Math.round(distanceKm! * 1000)}m dari titik jemput. Mohon bersiap.`,
          }
        } else if (driverEnRoute) {
          passengerBody = {
            en: `Your driver is on the way (~${distanceKm!.toFixed(1)}km from pickup, ${minutesLate} min late). Please wait.`,
            id: `Driver Anda dalam perjalanan (~${distanceKm!.toFixed(1)}km dari titik jemput, terlambat ${minutesLate} menit). Mohon menunggu.`,
          }
        } else if (gpsIsFresh && distanceKm !== null) {
          passengerBody = {
            en: `Your trip is ${minutesLate} min late. Driver is ${distanceKm.toFixed(1)}km away.`,
            id: `Perjalanan Anda terlambat ${minutesLate} menit. Driver berjarak ${distanceKm.toFixed(1)}km.`,
          }
        } else {
          passengerBody = {
            en: `Your trip to ${b.destination} is ${minutesLate} min late. Please contact the coordinator if needed.`,
            id: `Perjalanan Anda ke ${b.destination} terlambat ${minutesLate} menit. Silakan hubungi koordinator bila diperlukan.`,
          }
        }

        notifs.push({
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      { en: `Your driver is ${minutesLate} min late`, id: `Driver Anda terlambat ${minutesLate} menit` },
          body:       passengerBody,
          type:       'reminder_overdue',
          url:        '/staff/home',
        })
        results.notified_coord++
      }

      if (notifs.length) {
        await notify(notifs)
        results.reminded_overdue++
      }
    }

    // ── 5. PENDING APPROVAL REMINDER (every 2 hours to coordinators) ──
    const { data: pendingApprovals } = await admin
      .from('bookings')
      .select('id, destination, scheduled_at')
      .eq('status', 'pending_coordinator_approval')
      .order('scheduled_at', { ascending: true })

    if (pendingApprovals?.length) {
      // Throttle: skip if a reminder was already sent within the last 115 min
      const { data: lastApprovalReminder } = await admin
        .from('notifications')
        .select('sent_at')
        .eq('type', 'pending_approval_reminder')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const minsSinceLast = lastApprovalReminder
        ? (now.getTime() - new Date(lastApprovalReminder.sent_at).getTime()) / 60000
        : Infinity

      if (minsSinceLast >= 115) {
        const { data: coordinators } = await admin
          .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

        const count = pendingApprovals.length
        const approvalNotifs: any[] = (coordinators || []).map((c: any) => ({
          user_id:    c.id,
          booking_id: pendingApprovals[0].id,
          title: {
            en: `${count} booking${count > 1 ? 's' : ''} need your approval`,
            id: `${count} booking memerlukan persetujuan Anda`,
          },
          body: {
            en: `There ${count > 1 ? 'are' : 'is'} ${count} pending booking${count > 1 ? 's' : ''} waiting for coordinator approval.`,
            id: `Ada ${count} booking yang menunggu persetujuan koordinator.`,
          },
          type:       'pending_approval_reminder',
          url:        '/coordinator/home',
        }))

        if (approvalNotifs.length) {
          await notify(approvalNotifs)
          results.reminded_pending_approval = approvalNotifs.length
        }
      }
    }

    // ── 6. DRIVER OFFLINE WARNING — H-30 ──────────────────────────
    // Fires once per booking when trip is 25–35 min away and assigned driver is offline.
    // Notifies coordinators only — passenger is notified only if trip is actually reassigned.
    const warnStart = new Date(now.getTime() + 25 * 60 * 1000)
    const warnEnd   = new Date(now.getTime() + 35 * 60 * 1000)

    const { data: upcomingBooked } = await admin
      .from('bookings')
      .select('id, destination, scheduled_at, passenger_id, taxi_id, taxis!taxi_id(name, is_available, driver_id, users!driver_id(name))')
      .eq('status', 'booked')
      .not('taxi_id', 'is', null)
      .gte('scheduled_at', warnStart.toISOString())
      .lte('scheduled_at', warnEnd.toISOString())

    const offlineBookings = (upcomingBooked || []).filter(
      (b: any) => b.taxis && b.taxis.is_available === false
    )

    if (offlineBookings.length) {
      const { data: coordinators } = await admin
        .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

      for (const b of offlineBookings as any[]) {
        // Dedup — only send once per booking
        const { count } = await admin
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('booking_id', b.id)
          .eq('type', 'driver_offline_warning')
        if ((count || 0) > 0) continue

        const driverName = b.taxis?.users?.name || b.taxis?.name || 'Driver'
        const tripTime   = new Date(b.scheduled_at).toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar',
        })

        const coordNotifs = (coordinators || []).map((c: any) => ({
          user_id:    c.id,
          booking_id: b.id,
          title:      { en: '⚠️ Driver offline — trip in 30 min', id: '⚠️ Driver offline — perjalanan 30 menit lagi' },
          body: {
            en: `${driverName} is offline but has a trip to ${b.destination} at ${tripTime}. Please check or reassign.`,
            id: `${driverName} sedang offline namun memiliki perjalanan ke ${b.destination} pukul ${tripTime}. Mohon periksa atau alihkan.`,
          },
          type:       'driver_offline_warning',
          url:        '/coordinator/home',
        }))

        if (coordNotifs.length) {
          await notify(coordNotifs)
          results.driver_offline_warned++
        }
      }
    }

    // ── 7. DRIVER GPS STALE WARNING ────────────────────────────────
    // Any on-duty driver whose GPS hasn't updated in 60+ min gets a reminder —
    // both the driver themself and coordinators — roughly once every 2 hours, and only
    // during operating hours (07:00–16:00 WITA). Off-duty drivers (is_available =
    // false) are excluded entirely by the query below, so this never fires at night
    // for someone who tapped "Set Offline". The external trigger for this endpoint
    // isn't controlled from this repo (no vercel.json crons entry) and may fire far
    // more often than assumed, so the throttle below is load-bearing, not a nicety.
    const nowWita         = new Date(now.getTime() + 8 * 3600000)
    const witaHour        = nowWita.getUTCHours()
    const inGpsWarnWindow = witaHour >= 7 && witaHour < 16
    const GPS_WARN_THROTTLE_MIN = 115 // ~once per 2 hours, per recipient, per taxi

    const gpsStaleCutoff = new Date(now.getTime() - 60 * 60 * 1000)

    const { data: onDutyTaxis } = inGpsWarnWindow
      ? await admin
          .from('taxis')
          .select('id, name, driver_id, location_updated_at, users!driver_id(name)')
          .eq('is_available', true)
          .not('driver_id', 'is', null)
      : { data: [] }

    const staleTaxis = (onDutyTaxis || []).filter((tx: any) =>
      !tx.location_updated_at || new Date(tx.location_updated_at) < gpsStaleCutoff
    )

    if (staleTaxis.length) {
      const { data: coordinators } = await admin
        .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

      for (const tx of staleTaxis as any[]) {
        const minsStale = tx.location_updated_at
          ? Math.round((now.getTime() - new Date(tx.location_updated_at).getTime()) / 60000)
          : null
        // "Last updated at HH:mm" is more actionable than a bare duration —
        // clear enough to act on for both the driver and the coordinator.
        const lastUpdateClock = tx.location_updated_at
          ? new Date(tx.location_updated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })
          : null
        const staleText = minsStale === null
          ? { en: 'no GPS signal has ever been received', id: 'belum pernah menerima sinyal GPS sama sekali' }
          : minsStale >= 60
            ? { en: `${Math.floor(minsStale / 60)}h ${minsStale % 60}m (last seen ${lastUpdateClock})`, id: `${Math.floor(minsStale / 60)} jam ${minsStale % 60} menit (terakhir pukul ${lastUpdateClock} WITA)` }
            : { en: `${minsStale}m (last seen ${lastUpdateClock})`, id: `${minsStale} menit (terakhir pukul ${lastUpdateClock} WITA)` }

        const driverName = tx.users?.name || tx.name
        const notifs: any[] = []

        // ── Coordinator alert: throttled ~1 hour per taxi ──
        const { data: lastCoordWarn } = await admin
          .from('notifications')
          .select('sent_at')
          .eq('type', 'gps_stale_warning_coord')
          .ilike('body', `%(${tx.name})%`)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const coordThrottled = lastCoordWarn
          ? (now.getTime() - new Date(lastCoordWarn.sent_at).getTime()) / 60000 < GPS_WARN_THROTTLE_MIN
          : false

        if (!coordThrottled) {
          notifs.push(...(coordinators || []).map((c: any) => ({
            user_id: c.id,
            title:   { en: '⚠️ Driver GPS not updating', id: '⚠️ GPS Driver Tidak Update' },
            body: {
              en: `${driverName} (${tx.name}) — GPS hasn't updated in ${staleText.en}. Please contact the driver to check on them.`,
              id: `${driverName} (${tx.name}) — GPS tidak update selama ${staleText.id}. Segera hubungi driver untuk memastikan kondisinya.`,
            },
            type:    'gps_stale_warning_coord',
            url:     '/coordinator/drivers',
          })))
        }

        // ── Driver's own nag: throttled ~1 hour ──
        const { data: lastDriverWarn } = await admin
          .from('notifications')
          .select('sent_at')
          .eq('user_id', tx.driver_id)
          .eq('type', 'gps_stale_warning')
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const driverThrottled = lastDriverWarn
          ? (now.getTime() - new Date(lastDriverWarn.sent_at).getTime()) / 60000 < GPS_WARN_THROTTLE_MIN
          : false

        if (!driverThrottled) {
          notifs.push({
            user_id: tx.driver_id,
            title:   { en: '⚠️ Your GPS location is not updating', id: '⚠️ GPS Anda Tidak Update' },
            body: {
              en: `Your location hasn't updated in ${staleText.en}. Open the app now and make sure location permission is turned on.`,
              id: `Lokasi Anda tidak update selama ${staleText.id}. Segera buka aplikasi dan pastikan izin lokasi (GPS) aktif.`,
            },
            type:    'gps_stale_warning',
            url:     '/driver/home',
          })
        }

        if (notifs.length) {
          await notify(notifs)
          results.gps_stale_warned++
        }
      }
    }

    // ── 8. SPECIAL (PARTIAL-DAY) DUTY WINDOW REMINDER ──────────────
    // driver_day_assignments with a specific start_time/end_time (not a full-day
    // duty) get a reminder to the assigned driver ~15 min before the window opens,
    // so a special assignment doesn't get missed. Fires once per assignment per day.
    const todayWita = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
    const nowWitaDate = new Date(now.getTime() + 8 * 3600000)
    const nowWitaMinutes = nowWitaDate.getUTCHours() * 60 + nowWitaDate.getUTCMinutes()

    const { data: todaysDuties } = await admin
      .from('driver_day_assignments')
      .select('id, start_time, end_time, reason, taxis!taxi_id(name, driver_id, users!driver_id(name))')
      .eq('assign_date', todayWita)
      .not('start_time', 'is', null)

    for (const duty of (todaysDuties || []) as any[]) {
      const driverId = duty.taxis?.driver_id
      if (!driverId || !duty.start_time) continue

      const [h, m] = duty.start_time.split(':').map(Number)
      const minsUntilStart = (h * 60 + m) - nowWitaMinutes
      if (minsUntilStart < 12 || minsUntilStart > 18) continue // fire once, ~15 min before

      const startClock = duty.start_time.slice(0, 5)
      const endClock    = duty.end_time ? duty.end_time.slice(0, 5) : null

      // Dedup: skip if this driver already got a reminder mentioning this exact start time today
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', driverId)
        .eq('type', 'duty_window_reminder')
        .ilike('body', `%${startClock}%`)
      if ((count || 0) > 0) continue

      const timeRange = { en: endClock ? `${startClock}–${endClock}` : `${startClock}`, id: endClock ? `${startClock}–${endClock}` : `${startClock}` }
      const reasonLine = { en: duty.reason ? `: ${duty.reason}` : '', id: duty.reason ? `: ${duty.reason}` : '' }

      await notify({
        user_id:    driverId,
        booking_id: null,
        title: { en: '⏰ Special duty starting soon', id: '⏰ Tugas Khusus Segera Dimulai' },
        body: {
          en: `Your special assignment starts at ${timeRange.en} today${reasonLine.en}. Please be ready.`,
          id: `Tugas khusus Anda dimulai pukul ${timeRange.id} hari ini${reasonLine.id}. Segera bersiap sebelum jam tersebut.`,
        },
        type: 'duty_window_reminder',
        url:  '/driver/home',
      })
      results.duty_window_reminded++
    }

    console.log('Cron results:', results)
    return NextResponse.json({ success: true, ...results })

  } catch (err: any) {
    console.error('Cron error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
