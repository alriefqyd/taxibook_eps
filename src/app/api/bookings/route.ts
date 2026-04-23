import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'

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
      status, auto_complete_at,
    } = await request.json()

    if (!pickup || !destination || !trip_type || !scheduled_at) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── Insert booking ──
    const { data: inserted, error: insertError } = await admin
      .from('bookings')
      .insert({
        passenger_id:     user.id,
        pickup,
        destination,
        trip_type,
        wait_minutes:     trip_type === 'WAITING' ? wait_minutes : 0,
        notes:            notes || null,
        scheduled_at,
        status,
        auto_complete_at,
        created_by:       user.id,
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
    if (status === 'submitted') {
      const result = await autoAssign(admin, booking.id, scheduled_at)

      if (result.taxi) {
        // Notify driver
        const { data: passenger } = await admin
          .from('users').select('name').eq('id', user.id).single()

        const time = new Date(scheduled_at).toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit'
        })

        await notify({
          user_id:    result.taxi.driver_id,
          booking_id: booking.id,
          title:      'New trip assigned',
          body:       `${passenger?.name} → ${destination} at ${time}`,
          type:       'driver_assigned',
        })

        return NextResponse.json({
          booking:     { ...booking, taxi_id: result.taxi.id, status: 'pending_driver_approval' },
          assigned:    true,
          taxi_name:   result.taxi.name,
          driver_name: result.taxi.driver_name,
        }, { status: 201 })
      }

      // No driver available — notify coordinator
      await notifyCoordinators(admin, booking, user.id, destination,
        'New booking — no driver available',
        `Please assign manually.`
      )

      return NextResponse.json({
        booking, assigned: false,
        message: 'No driver available — coordinator will assign manually',
      }, { status: 201 })
    }

    // ── Pending approval — notify coordinator ──
    await notifyCoordinators(admin, booking, user.id, destination,
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
async function autoAssign(admin: any, bookingId: string, scheduledAt: string) {
  const scheduledTime = new Date(scheduledAt)
  const now           = new Date()
  const isNowBooking  = (scheduledTime.getTime() - now.getTime()) < 5 * 60 * 1000 // within 5 min = "now"
  const todayStart    = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Get available taxis (active + available + has driver)
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

      let isFree = false

      if (isNowBooking) {
        // NOW booking: check if driver is physically free RIGHT NOW
        // Free = no booking currently active (scheduled_at <= now AND auto_complete_at >= now)
        const { data: currentTrip } = await admin
          .from('bookings')
          .select('id')
          .eq('taxi_id', taxi.id)
          .in('status', ['booked', 'on_trip', 'waiting_trip'])
          .lte('scheduled_at', now.toISOString())
          .gte('auto_complete_at', now.toISOString())
          .limit(1)
          .maybeSingle()

        isFree = !currentTrip
      } else {
        // SCHEDULED booking: check if driver is free at that future time
        const { data: conflict } = await admin
          .from('bookings')
          .select('auto_complete_at')
          .eq('taxi_id', taxi.id)
          .in('status', ['booked', 'on_trip', 'waiting_trip', 'pending_driver_approval'])
          .gt('auto_complete_at', scheduledTime.toISOString())
          .limit(1)
          .maybeSingle()

        const freeAt = conflict ? new Date(conflict.auto_complete_at) : new Date(0)
        isFree = freeAt <= scheduledTime
      }

      if (!isFree) return null

      // Trips completed today (fewest trips sort)
      const { count: tripsToday } = await admin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('taxi_id', taxi.id)
        .eq('status', 'completed')
        .gte('completed_at', todayStart.toISOString())

      // Last idle time (longest idle tiebreaker)
      const { data: lastBooking } = await admin
        .from('bookings')
        .select('auto_complete_at')
        .eq('taxi_id', taxi.id)
        .in('status', ['completed', 'booked', 'on_trip', 'waiting_trip'])
        .order('auto_complete_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const idleSince = lastBooking ? new Date(lastBooking.auto_complete_at).getTime() : 0

      return { taxi, tripsToday: tripsToday || 0, idleSince }
    })
  )

  // Filter nulls (unavailable taxis)
  const available = availability
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (a.tripsToday !== b.tripsToday) return a.tripsToday - b.tripsToday
      return a.idleSince - b.idleSince // longest idle first
    }) as any[]

  if (!available.length) return { taxi: null }

  const best = available[0].taxi

  // Assign
  await admin
    .from('bookings')
    .update({ taxi_id: best.id, status: 'pending_driver_approval' })
    .eq('id', bookingId)

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

  await admin.from('notifications').insert(
    coordinators.map((c: any) => ({
      user_id:    c.id,
      booking_id: booking.id,
      title,
      body:       `${passenger?.name} → ${destination}. ${extraBody}`,
      type:       'needs_approval',
    }))
  )
}
