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
  const fmtLabel = (d: string) => new Date(d).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const rangeLabel = dates.length === 1
    ? fmtLabel(dates[0])
    : `${fmtLabel(dates[0])} – ${fmtLabel(dates[dates.length - 1])} (${created.length} hari)`

  const timeLabel = start_time && end_time ? ` pukul ${start_time.slice(0, 5)}–${end_time.slice(0, 5)}` : ''
  const dutyWord  = start_time && end_time ? 'tugas' : 'tugas penuh'

  const notifs = []

  // Notify driver
  if (taxi?.driver_id) {
    const passengerLine = passengerName ? `. Penumpang: ${passengerName}` : ''
    const skippedLine = skippedCount > 0 ? ` (${skippedCount} tanggal dilewati karena sudah ada tugas)` : ''
    notifs.push({
      user_id:    taxi.driver_id,
      booking_id: null,
      title:      'Tugas harian ditetapkan',
      body:       `Anda dijadwalkan ${dutyWord} pada ${rangeLabel}${timeLabel}${skippedLine}${passengerLine}${reason ? `. Keterangan: ${reason}` : ''}.`,
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
      title:      'Anda dijadwalkan perjalanan',
      body:       `Driver ${taxi?.name || 'telah'} ditugaskan untuk Anda pada ${rangeLabel}${timeLabel}${reason ? `. Keterangan: ${reason}` : ''}.`,
      type:       'passenger_day_assigned',
      url:        passengerUrl,
    })
  }

  if (notifs.length) await notify(notifs)

  return NextResponse.json({ created, skipped_count: skippedCount }, { status: 201 })
}
