import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  // Fetch before deleting so we can tell the driver what they've been released from
  const { data: assignment } = await admin
    .from('driver_day_assignments')
    .select('taxi_id, assign_date, start_time, end_time')
    .eq('id', params.id)
    .single()

  const { error } = await admin
    .from('driver_day_assignments')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the driver they're free again — released from this duty window and
  // back to being available for passenger trips / auto-assign.
  if (assignment?.taxi_id) {
    const { data: taxi } = await admin
      .from('taxis').select('driver_id').eq('id', assignment.taxi_id).single()

    if (taxi?.driver_id) {
      const dateLabel = {
        en: new Date(assignment.assign_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        id: new Date(assignment.assign_date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      }
      const timeLabel = assignment.start_time && assignment.end_time
        ? ` (${assignment.start_time.slice(0, 5)}–${assignment.end_time.slice(0, 5)})`
        : ''

      await notify({
        user_id:    taxi.driver_id,
        booking_id: null,
        title:      { en: 'Duty released', id: 'Tugas dibatalkan' },
        body: {
          en: `Your duty on ${dateLabel.en}${timeLabel} has been released. You're free and available for passenger trips again.`,
          id: `Tugas Anda pada ${dateLabel.id}${timeLabel} telah dibatalkan. Anda bebas dan tersedia untuk trip penumpang lagi.`,
        },
        type:       'driver_day_released',
      })
    }
  }

  return NextResponse.json({ success: true })
}
