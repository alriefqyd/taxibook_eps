import { createAdminClient } from '@/lib/supabase/server'
import type { Taxi } from '@/types'

interface AssignResult {
  success: boolean
  taxiId?: string
  error?: string
}

export async function autoAssignDriver(
  bookingId: string,
  scheduledAt: string
): Promise<AssignResult> {
  const supabase = createAdminClient()

  try {
    const scheduledTime = new Date(scheduledAt)

    // Get all active taxis with their drivers
    const { data: taxis, error: taxiError } = await supabase
      .from('taxis')
      .select('*, users!driver_id(id, name)')
      .eq('is_active', true)
      .not('driver_id', 'is', null)

    if (taxiError || !taxis || taxis.length === 0) {
      return { success: false, error: 'No taxis available' }
    }

    // For each taxi, find when they are next free
    const taxiAvailability = await Promise.all(
      taxis.map(async (taxi: Taxi) => {
        // Find the latest booking for this taxi that hasn't completed yet
        const { data: lastBooking } = await supabase
          .from('bookings')
          .select('auto_complete_at, scheduled_at')
          .eq('taxi_id', taxi.id)
          .in('status', ['booked', 'on_trip', 'waiting_trip', 'pending_driver_approval'])
          .order('auto_complete_at', { ascending: false })
          .limit(1)
          .single()

        const freeAt = lastBooking
          ? new Date(lastBooking.auto_complete_at)
          : new Date(0) // No bookings = available from epoch

        return { taxi, freeAt }
      })
    )

    // Filter taxis that are free before the booking time
    // and sort by earliest free (first available)
    const available = taxiAvailability
      .filter(({ freeAt }) => freeAt <= scheduledTime)
      .sort((a, b) => a.freeAt.getTime() - b.freeAt.getTime())

    if (available.length === 0) {
      return { success: false, error: 'No driver available at that time' }
    }

    const assignedTaxi = available[0].taxi

    // Update booking with assigned taxi
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        taxi_id: assignedTaxi.id,
        status: 'pending_driver_approval',
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
  scheduledAt: string
): Promise<string[]> {
  const supabase = createAdminClient()
  const scheduledTime = new Date(scheduledAt)

  const { data: taxis } = await supabase
    .from('taxis')
    .select('id')
    .eq('is_active', true)
    .not('driver_id', 'is', null)

  if (!taxis) return []

  const available: string[] = []

  for (const taxi of taxis) {
    const { data: lastBooking } = await supabase
      .from('bookings')
      .select('auto_complete_at')
      .eq('taxi_id', taxi.id)
      .in('status', ['booked', 'on_trip', 'waiting_trip', 'pending_driver_approval'])
      .order('auto_complete_at', { ascending: false })
      .limit(1)
      .single()

    const freeAt = lastBooking
      ? new Date(lastBooking.auto_complete_at)
      : new Date(0)

    if (freeAt <= scheduledTime) {
      available.push(taxi.id)
    }
  }

  return available
}
