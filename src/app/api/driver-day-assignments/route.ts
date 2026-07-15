import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'

const MAX_RECURRING_DAYS = 90

export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  const { searchParams } = new URL(request.url)
  const date    = searchParams.get('date')
  const taxi_id = searchParams.get('taxi_id')
  const from    = searchParams.get('from')
  const to      = searchParams.get('to')

  let query = admin
    .from('driver_day_assignments')
    .select('*, taxis(id, name, color, plate, users!driver_id(name))')

  if (date)    query = query.eq('assign_date', date)
  if (taxi_id) query = query.eq('taxi_id', taxi_id)
  if (from)    query = query.gte('assign_date', from)
  if (to)      query = query.lte('assign_date', to)

  const { data, error } = await query.order('assign_date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Inclusive list of 'yyyy-MM-dd' date strings from start to end
function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient()

  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await admin
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coordinator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { taxi_id, assign_date, repeat_until, start_time, end_time, reason, passenger_id, passenger_name_other } = await request.json()
  if (!taxi_id || !assign_date) {
    return NextResponse.json({ error: 'taxi_id and assign_date are required' }, { status: 400 })
  }
  if (repeat_until && repeat_until < assign_date) {
    return NextResponse.json({ error: 'repeat_until must be on or after assign_date' }, { status: 400 })
  }
  if ((start_time && !end_time) || (end_time && !start_time)) {
    return NextResponse.json({ error: 'start_time and end_time must be provided together' }, { status: 400 })
  }
  if (start_time && end_time && end_time <= start_time) {
    return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 })
  }

  const dates = repeat_until ? dateRange(assign_date, repeat_until) : [assign_date]
  if (dates.length > MAX_RECURRING_DAYS) {
    return NextResponse.json({ error: `Recurring range cannot exceed ${MAX_RECURRING_DAYS} days` }, { status: 400 })
  }

  // ── Block if this taxi already has an active booking overlapping the assignment window ──
  // A full-day duty blocks the whole WITA day; a partial/special duty only blocks its own
  // start_time–end_time range on that date.
  for (const d of dates) {
    const windowStart = start_time
      ? new Date(`${d}T${start_time.slice(0, 5)}:00+08:00`)
      : new Date(`${d}T00:00:00+08:00`)
    const windowEnd = end_time
      ? new Date(`${d}T${end_time.slice(0, 5)}:00+08:00`)
      : new Date(new Date(`${d}T00:00:00+08:00`).getTime() + 24 * 3600000)

    const { data: bookingConflict } = await admin
      .from('bookings')
      .select('id, booking_code, scheduled_at')
      .eq('taxi_id', taxi_id)
      .in('status', ['booked', 'on_trip', 'waiting_trip'])
      .lt('scheduled_at', windowEnd.toISOString())
      .gt('auto_complete_at', windowStart.toISOString())
      .limit(1)
      .maybeSingle()

    if (bookingConflict) {
      const time = new Date(bookingConflict.scheduled_at).toLocaleString('id-ID', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar',
      })
      return NextResponse.json(
        { error: `This taxi already has a booking (${bookingConflict.booking_code}) at ${time} that overlaps this assignment window.` },
        { status: 409 }
      )
    }
  }

  const { data: taxi } = await admin
    .from('taxis')
    .select('driver_id, name')
    .eq('id', taxi_id)
    .single()

  // Resolve passenger name + role for notification
  let passengerName = passenger_name_other || null
  let passengerRole = 'staff'
  if (passenger_id) {
    const { data: p } = await admin.from('users').select('name, role').eq('id', passenger_id).single()
    passengerName = p?.name || null
    passengerRole = p?.role || 'staff'
  }

  let created: any[] = []

  if (dates.length === 1) {
    const { data, error } = await admin
      .from('driver_day_assignments')
      .insert({
        taxi_id,
        assign_date: dates[0],
        start_time:           start_time || null,
        end_time:             end_time || null,
        reason:               reason || null,
        passenger_id:         passenger_id || null,
        passenger_name_other: passenger_name_other || null,
        created_by:           user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Driver already assigned full day on this date' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    created = [data]
  } else {
    const rows = dates.map(d => ({
      taxi_id,
      assign_date: d,
      start_time:           start_time || null,
      end_time:             end_time || null,
      reason:               reason || null,
      passenger_id:         passenger_id || null,
      passenger_name_other: passenger_name_other || null,
      created_by:           user.id,
    }))

    // Skip any day that's already assigned instead of failing the whole range
    const { data, error } = await admin
      .from('driver_day_assignments')
      .upsert(rows, { onConflict: 'taxi_id,assign_date', ignoreDuplicates: true })
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    created = data || []

    if (created.length === 0) {
      return NextResponse.json({ error: 'Driver is already assigned full day on every date in this range' }, { status: 409 })
    }
  }

  const skippedCount = dates.length - created.length
  const fmtLabel = (d: string, locale: string) => new Date(d).toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const rangeLabel = {
    en: dates.length === 1
      ? fmtLabel(dates[0], 'en-GB')
      : `${fmtLabel(dates[0], 'en-GB')} – ${fmtLabel(dates[dates.length - 1], 'en-GB')} (${created.length} days)`,
    id: dates.length === 1
      ? fmtLabel(dates[0], 'id-ID')
      : `${fmtLabel(dates[0], 'id-ID')} – ${fmtLabel(dates[dates.length - 1], 'id-ID')} (${created.length} hari)`,
  }

  const timeLabel = {
    en: start_time && end_time ? ` at ${start_time.slice(0, 5)}–${end_time.slice(0, 5)}` : '',
    id: start_time && end_time ? ` pukul ${start_time.slice(0, 5)}–${end_time.slice(0, 5)}` : '',
  }
  const dutyWord = {
    en: start_time && end_time ? 'duty' : 'full-day duty',
    id: start_time && end_time ? 'tugas' : 'tugas penuh',
  }
  const reasonLine = {
    en: reason ? `. Note: ${reason}` : '',
    id: reason ? `. Keterangan: ${reason}` : '',
  }

  const notifs: any[] = []

  // Notify driver
  if (taxi?.driver_id) {
    const passengerLine = {
      en: passengerName ? `. Passenger: ${passengerName}` : '',
      id: passengerName ? `. Penumpang: ${passengerName}` : '',
    }
    const skippedLine = {
      en: skippedCount > 0 ? ` (${skippedCount} date(s) skipped — already assigned)` : '',
      id: skippedCount > 0 ? ` (${skippedCount} tanggal dilewati karena sudah ada tugas)` : '',
    }
    notifs.push({
      user_id:    taxi.driver_id,
      booking_id: null,
      title:      { en: 'Daily duty assigned', id: 'Tugas harian ditetapkan' },
      body: {
        en: `You are scheduled for ${dutyWord.en} on ${rangeLabel.en}${timeLabel.en}${skippedLine.en}${passengerLine.en}${reasonLine.en}.`,
        id: `Anda dijadwalkan ${dutyWord.id} pada ${rangeLabel.id}${timeLabel.id}${skippedLine.id}${passengerLine.id}${reasonLine.id}.`,
      },
      type:       'driver_day_assigned',
    })
  }

  // Notify passenger (only if they have an account in the system)
  if (passenger_id) {
    const passengerUrl = passengerRole === 'driver' ? '/driver/home'
      : passengerRole === 'coordinator' ? '/coordinator/home'
      : '/staff/home'
    notifs.push({
      user_id:    passenger_id,
      booking_id: null,
      title:      { en: 'You have a scheduled trip', id: 'Anda dijadwalkan perjalanan' },
      body: {
        en: `Driver ${taxi?.name || ''} has been assigned for you on ${rangeLabel.en}${timeLabel.en}${reasonLine.en}.`,
        id: `Driver ${taxi?.name || 'telah'} ditugaskan untuk Anda pada ${rangeLabel.id}${timeLabel.id}${reasonLine.id}.`,
      },
      type:       'passenger_day_assigned',
      url:        passengerUrl,
    })
  }

  if (notifs.length) await notify(notifs)

  return NextResponse.json({ created, skipped_count: skippedCount }, { status: 201 })
}
