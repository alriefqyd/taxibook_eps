import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

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

  const { taxi_id, assign_date, reason } = await request.json()
  if (!taxi_id || !assign_date) {
    return NextResponse.json({ error: 'taxi_id and assign_date are required' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('driver_day_assignments')
    .insert({ taxi_id, assign_date, reason: reason || null, created_by: user.id })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Driver already assigned full day on this date' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
