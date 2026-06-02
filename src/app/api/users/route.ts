import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient()

    // Auth check
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Coordinator only
    const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'coordinator') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const roles = request.nextUrl.searchParams.get('roles') || 'staff,coordinator'
    const roleList = roles.split(',').map(r => r.trim())

    const { data, error } = await admin
      .from('users')
      .select('id, name, email, role')
      .in('role', roleList)
      .eq('is_active', true)
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ users: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
