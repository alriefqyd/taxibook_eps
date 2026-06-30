import { createAdminClient } from '@/lib/supabase/server'
import type { Taxi } from '@/types'

interface AssignResult {
  success: boolean
  taxiId?: string
  error?: string
}

export async function autoAssignDriver(
  bookingId: string,
  scheduledAt: string,
  autoCompleteAt: string
): Promise<AssignResult> {
  const supabase = createAdminClient()

  try {
    // Get all active + available taxis with drivers
    const { data: taxis, error: taxiError } = await supabase
      .from('taxis')
      .select('*, users!driver_id(id, name)')
      .eq('is_active', true)
      .eq('is_available', true)
      .not('driver_id', 'is', null)

    if (taxiError || !taxis || taxis.length === 0) {
      return { success: false, error: 'No taxis available' }
    }

    // Exclude taxis with a full-day assignment on the booking's WITA date
    const witaDate = new Date(new Date(scheduledAt).getTime() + 8 * 3600000).toISOString().slice(0, 10)
    const { data: dayAssigned } = await supabase
      .from('driver_day_assignments')
      .select('taxi_id')
      .eq('assign_date', witaDate)
    const dayAssignedIds = new Set((dayAssigned || []).map((d: any) => d.taxi_id))
    const candidates = taxis.filter((t: Taxi) => !dayAssignedIds.has(t.id))

    if (candidates.length === 0) {
      return { success: false, error: 'No driver available at that time' }
    }

    // For each candidate, check interval intersection: conflict if existing starts before new ends AND ends after new starts
    const taxiAvailability = await Promise.all(
      candidates.map(async (taxi: Taxi) => {
        const { data: conflict } = await supabase
          .from('bookings')
          .select('id')
          .eq('taxi_id', taxi.id)
          .in('status', ['booked', 'on_trip', 'waiting_trip'])
          .neq('id', bookingId)
          .lt('scheduled_at', autoCompleteAt)
          .gt('auto_complete_at', scheduledAt)
          .limit(1)
          .maybeSingle()

        return conflict ? null : taxi
      })
    )

    const available = taxiAvailability.filter(Boolean) as Taxi[]

    if (available.length === 0) {
      return { success: false, error: 'No driver available at that time' }
    }

    const assignedTaxi = available[0]

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        taxi_id:     assignedTaxi.id,
        status:      'booked',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', bookingId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    return { success: true, taxiId: assignedTaxi.id }

  } catch (err) {
    return { success: false, error: 'Auto-assign failed' }
  }
}

export async function getAvailableTaxisForTime(
  scheduledAt: string,
  autoCompleteAt: string
): Promise<string[]> {
  const supabase = createAdminClient()

  const { data: taxis } = await supabase
    .from('taxis')
    .select('id')
    .eq('is_active', true)
    .eq('is_available', true)
    .not('driver_id', 'is', null)

  if (!taxis) return []

  // Exclude taxis with a full-day assignment on the booking's WITA date
  const witaDate = new Date(new Date(scheduledAt).getTime() + 8 * 3600000).toISOString().slice(0, 10)
  const { data: dayAssigned } = await supabase
    .from('driver_day_assignments')
    .select('taxi_id')
    .eq('assign_date', witaDate)
  const dayAssignedIds = new Set((dayAssigned || []).map((d: any) => d.taxi_id))
  const candidates = taxis.filter((t: any) => !dayAssignedIds.has(t.id))

  const available: string[] = []

  for (const taxi of candidates) {
    const { data: conflict } = await supabase
      .from('bookings')
      .select('id')
      .eq('taxi_id', taxi.id)
      .in('status', ['booked', 'on_trip', 'waiting_trip'])
      .lt('scheduled_at', autoCompleteAt)
      .gt('auto_complete_at', scheduledAt)
      .limit(1)
      .maybeSingle()

    if (!conflict) {
      available.push(taxi.id)
    }
  }

  return available
}
