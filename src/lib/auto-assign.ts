import { createAdminClient } from '@/lib/supabase/server'
import type { Taxi } from '@/types'

interface AssignResult {
  success: boolean
  taxiId?: string
  error?: string
}

// Full-day duties (no time range) block the taxi entirely; time-range duties
// only block the overlapping window, leaving the rest of the day free for auto-assign.
export async function getDayAssignmentBlocks(supabase: ReturnType<typeof createAdminClient>, witaDate: string) {
  const { data } = await supabase
    .from('driver_day_assignments')
    .select('taxi_id, start_time, end_time')
    .eq('assign_date', witaDate)

  const fullDay = new Set<string>()
  const ranges: Record<string, { start: Date; end: Date }[]> = {}

  for (const d of (data || []) as any[]) {
    if (!d.start_time || !d.end_time) {
      fullDay.add(d.taxi_id)
    } else {
      if (!ranges[d.taxi_id]) ranges[d.taxi_id] = []
      ranges[d.taxi_id].push({
        start: new Date(`${witaDate}T${d.start_time.slice(0, 5)}:00+08:00`),
        end:   new Date(`${witaDate}T${d.end_time.slice(0, 5)}:00+08:00`),
      })
    }
  }
  return { fullDay, ranges }
}

export function isTaxiDayBlocked(
  taxiId: string,
  fullDay: Set<string>,
  ranges: Record<string, { start: Date; end: Date }[]>,
  bookingStart: Date,
  bookingEnd: Date,
): boolean {
  if (fullDay.has(taxiId)) return true
  const blocks = ranges[taxiId]
  if (!blocks) return false
  return blocks.some(b => b.start < bookingEnd && b.end > bookingStart)
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

    // Exclude taxis whose day-duty (full-day, or overlapping time range) blocks this booking
    const witaDate = new Date(new Date(scheduledAt).getTime() + 8 * 3600000).toISOString().slice(0, 10)
    const { fullDay, ranges } = await getDayAssignmentBlocks(supabase, witaDate)
    const bookingStart = new Date(scheduledAt)
    const bookingEnd   = new Date(autoCompleteAt)
    const candidates = taxis.filter((t: Taxi) => !isTaxiDayBlocked(t.id, fullDay, ranges, bookingStart, bookingEnd))

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

  // Exclude taxis whose day-duty (full-day, or overlapping time range) blocks this booking
  const witaDate = new Date(new Date(scheduledAt).getTime() + 8 * 3600000).toISOString().slice(0, 10)
  const { fullDay, ranges } = await getDayAssignmentBlocks(supabase, witaDate)
  const bookingStart = new Date(scheduledAt)
  const bookingEnd   = new Date(autoCompleteAt)
  const candidates = taxis.filter((t: any) => !isTaxiDayBlocked(t.id, fullDay, ranges, bookingStart, bookingEnd))

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
