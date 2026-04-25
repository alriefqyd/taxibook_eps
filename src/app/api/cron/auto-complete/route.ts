import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'
import { sendPushToUser } from '@/lib/push'

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
      auto_completed:   0,
      reminded_15min:   0,
      reminded_start:   0,
      reminded_overdue: 0,
      notified_coord:   0,
    }

    // ── 1. AUTO-COMPLETE overdue bookings ──────────────────
    const { data: overdueBookings } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, taxi_id, taxis!taxi_id(driver_id)')
      .in('status', ['booked', 'on_trip', 'waiting_trip', 'pending_driver_approval'])
      .lt('auto_complete_at', now.toISOString())

    if (overdueBookings?.length) {
      const ids = overdueBookings.map((b: any) => b.id)
      await admin.from('bookings').update({
        status:       'completed',
        completed_at: now.toISOString(),
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
      results.reminded_15min++
    }

    // ── 3. START TIME REMINDER (T±2min) ────────────────────
    // Bookings that should start NOW (within 2 min window), still booked
    const startWindowStart = new Date(now.getTime() - 2 * 60 * 1000)
    const startWindowEnd   = new Date(now.getTime() + 2 * 60 * 1000)

    const { data: startingNow } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, scheduled_at, taxi_id, taxis!taxi_id(driver_id, name)')
      .eq('status', 'booked')
      .gte('scheduled_at', startWindowStart.toISOString())
      .lte('scheduled_at', startWindowEnd.toISOString())

    for (const b of (startingNow || []) as any[]) {
      // Check if start reminder already sent
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', b.id)
        .eq('type', 'reminder_start')

      if ((count || 0) > 0) continue

      const notifs: any[] = [
        {
          user_id:    b.passenger_id,
          booking_id: b.id,
          title:      '🚗 Your taxi is arriving now',
          body:       `Your trip to ${b.destination} is starting. Please be ready at pickup point.`,
          type:       'reminder_start',
        },
      ]

      if (b.taxis?.driver_id) {
        const { data: passenger } = await admin
          .from('users').select('name').eq('id', b.passenger_id).single()
        notifs.push({
          user_id:    b.taxis.driver_id,
          booking_id: b.id,
          title:      '🚗 Time to pick up passenger',
          body:       `Pick up ${passenger?.name} now → ${b.destination}. Tap "Start trip" when picked up.`,
          type:       'reminder_start',
        })
      }

      await notify(notifs)
      for (const notif of notifs) {
        const url = notif.type?.includes('driver') ? '/driver/home' : '/staff/home'
        await sendPushToUser(notif.user_id, notif.title, notif.body, url)
      }
      results.reminded_start++
    }

    // ── 4. OVERDUE REPEAT (every 5 min until started) ──────
    // Bookings past scheduled time, still booked (not started)
    // Max 30 min overdue (after that auto-complete handles it)
    const overdueStart = new Date(now.getTime() - 30 * 60 * 1000)

    const { data: overdueNotStarted } = await admin
      .from('bookings')
      .select('id, passenger_id, destination, scheduled_at, taxi_id, taxis!taxi_id(driver_id, name)')
      .eq('status', 'booked')
      .lt('scheduled_at', now.toISOString())
      .gte('scheduled_at', overdueStart.toISOString())

    console.log(`Overdue bookings found: ${(overdueNotStarted || []).length}`)

    for (const b of (overdueNotStarted || []) as any[]) {
      const minutesLate = Math.round(
        (now.getTime() - new Date(b.scheduled_at).getTime()) / 60000
      )
      console.log(`Overdue booking ${b.id}: ${minutesLate} min late, driver: ${b.taxis?.driver_id}`)

      // Only notify if at least 5 min has passed since last overdue notif
      const { data: lastNotif } = await admin
        .from('notifications')
        .select('created_at')
        .eq('booking_id', b.id)
        .eq('type', 'reminder_overdue')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastNotif) {
        const lastSent   = new Date(lastNotif.created_at)
        const minsSince  = (now.getTime() - lastSent.getTime()) / 60000
        console.log(`Last notif was ${minsSince.toFixed(1)} min ago`)
        if (minsSince < 4.5) { console.log('Skipping — too soon'); continue }
      }

      const notifs: any[] = []

      // Notify driver every 5 min
      if (b.taxis?.driver_id) {
        notifs.push({
          user_id:    b.taxis.driver_id,
          booking_id: b.id,
          title:      `⚠️ Trip ${minutesLate} min overdue`,
          body:       `Please start trip to ${b.destination}. Passenger is waiting. Tap "Start trip" now.`,
          type:       'reminder_overdue',
        })
      }

      // Notify coordinator after 10 min overdue
      if (minutesLate >= 10) {
        const { data: coordinators } = await admin
          .from('users').select('id').eq('role', 'coordinator').eq('is_active', true)

        if (coordinators?.length) {
          // Only notify coordinator once every 10 min
          const { data: lastCoordNotif } = await admin
            .from('notifications')
            .select('created_at')
            .eq('booking_id', b.id)
            .eq('type', 'reminder_overdue')
            .in('user_id', coordinators.map((c: any) => c.id))
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const shouldNotifyCoord = !lastCoordNotif ||
            (now.getTime() - new Date(lastCoordNotif.created_at).getTime()) / 60000 >= 9.5

          if (shouldNotifyCoord) {
            const { data: passenger } = await admin
              .from('users').select('name').eq('id', b.passenger_id).single()

            coordinators.forEach((c: any) => notifs.push({
              user_id:    c.id,
              booking_id: b.id,
              title:      `⚠️ Trip not started — ${minutesLate} min late`,
              body:       `${passenger?.name} → ${b.destination} hasn't started. Driver: ${b.taxis?.name}.`,
              type:       'reminder_overdue',
            }))
            results.notified_coord++
          }
        }
      }

      if (notifs.length) {
        // Check push subscriptions exist
        for (const notif of notifs) {
          const url = notif.user_id === b.taxis?.driver_id ? '/driver/home' : '/coordinator/home'
          const { data: subs } = await admin.from('push_subscriptions').select('id').eq('user_id', notif.user_id)
          console.log(`User ${notif.user_id} has ${subs?.length || 0} push subscriptions`)
          await sendPushToUser(notif.user_id, notif.title, notif.body, url)
          console.log(`Push sent to ${notif.user_id}: ${notif.title}`)
        }
        await admin.from('notifications').insert(notifs)
        results.reminded_overdue++
      } else {
        console.log(`No notifs built for booking ${b.id} (driver_id: ${b.taxis?.driver_id})`)
      }
    }

    console.log('Cron results:', results)
    return NextResponse.json({ success: true, ...results })

  } catch (err: any) {
    console.error('Cron error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
