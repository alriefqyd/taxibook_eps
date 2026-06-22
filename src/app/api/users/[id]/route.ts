import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function verifyCoordinator(request: NextRequest) {
  const admin = createAdminClient()
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401, admin: null }

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return { error: 'Unauthorized', status: 401, admin: null }

  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coordinator') return { error: 'Forbidden', status: 403, admin: null }

  return { error: null, status: 200, admin }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, status, admin } = await verifyCoordinator(request)
    if (error || !admin) return NextResponse.json({ error }, { status })

    const body = await request.json()
    const { name, phone, role, is_active } = body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (phone !== undefined) updates.phone = phone || null
    if (role !== undefined) {
      if (!['staff', 'coordinator', 'driver'].includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      updates.role = role
    }
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error: dbError } = await admin
      .from('users')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

    return NextResponse.json({ user: data })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, status, admin } = await verifyCoordinator(request)
    if (error || !admin) return NextResponse.json({ error }, { status })

    // Soft-delete: deactivate rather than delete to preserve referential integrity
    const { error: dbError } = await admin
      .from('users')
      .update({ is_active: false })
      .eq('id', params.id)

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

    // Also disable the auth account
    await admin.auth.admin.updateUserById(params.id, { ban_duration: 'none' })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
