import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function verifyCoordinator(request: NextRequest) {
  const admin = createAdminClient()
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401, admin: null, user: null }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return { error: 'Unauthorized', status: 401, admin: null, user: null }

  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coordinator') return { error: 'Forbidden', status: 403, admin: null, user: null }

  return { error: null, status: 200, admin, user }
}

export async function GET(request: NextRequest) {
  try {
    const { error, status, admin } = await verifyCoordinator(request)
    if (error || !admin) return NextResponse.json({ error }, { status })

    const roles = request.nextUrl.searchParams.get('roles') || 'staff,coordinator'
    const roleList = roles.split(',').map(r => r.trim())
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'

    let query = admin
      .from('users')
      .select('id, name, email, role, phone, is_active, created_at')
      .in('role', roleList)
      .order('name')

    if (!includeInactive) query = query.eq('is_active', true)

    const { data, error: dbError } = await query
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

    return NextResponse.json({ users: data || [] })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, status, admin } = await verifyCoordinator(request)
    if (error || !admin) return NextResponse.json({ error }, { status })

    const body = await request.json()
    const { name, email, password, role, phone } = body

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'name, email, password and role are required' }, { status: 400 })
    }
    if (!['staff', 'coordinator', 'driver'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Create auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    // Insert profile row — drivers default to Bahasa Indonesia (the whole fleet is
    // Indonesian-speaking); other roles keep the app-wide English default.
    const { data: profile, error: profileError } = await admin
      .from('users')
      .insert({ id: authData.user.id, name, email, role, phone: phone || null, language: role === 'driver' ? 'id' : 'en' })
      .select()
      .single()

    if (profileError) {
      // Roll back auth user if profile insert fails
      await admin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({ user: profile }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
