import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ActiveBooking {
  id: string
  pickup: string
  destination: string
  status: string
  pickup_lat: number | null
  pickup_lng: number | null
  destination_lat: number | null
  destination_lng: number | null
}

export interface DriverLocation {
  id: string
  name: string
  plate: string | null
  color: string
  is_available: boolean
  driver_id: string | null
  driver_name: string | null
  latitude: number | null
  longitude: number | null
  location_updated_at: string | null
  is_on_trip: boolean
  active_booking: ActiveBooking | null
}

// Includes 'booked' (assigned but not yet started) so status badges/labels can
// still distinguish "booked" from "available" — but consumers must check
// `active_booking.status` themselves before rendering pickup/destination pins,
// since those should only appear once the driver has actually started the trip
// (on_trip / waiting_trip), not while it's merely scheduled.
const ACTIVE_STATUSES = ['on_trip', 'booked', 'waiting_trip']

async function fetchActiveBookings(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, ActiveBooking>> {
  const { data } = await supabase
    .from('bookings')
    .select('taxi_id, id, pickup, destination, status, pickup_lat, pickup_lng, destination_lat, destination_lng')
    .in('status', ACTIVE_STATUSES)
    .not('taxi_id', 'is', null)
  const map = new Map<string, ActiveBooking>()
  for (const b of (data ?? []) as any[]) {
    map.set(b.taxi_id, {
      id: b.id, pickup: b.pickup, destination: b.destination, status: b.status,
      pickup_lat: b.pickup_lat, pickup_lng: b.pickup_lng,
      destination_lat: b.destination_lat, destination_lng: b.destination_lng,
    })
  }
  return map
}

export function useDriverLocations(): DriverLocation[] {
  const [drivers, setDrivers] = useState<DriverLocation[]>([])
  const channelId = useRef(`driver-locations-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const [{ data: taxiData }, activeBookings] = await Promise.all([
        supabase
          .from('taxis')
          .select('id, name, plate, color, is_available, driver_id, latitude, longitude, location_updated_at, users!driver_id(name)')
          .eq('is_active', true),
        fetchActiveBookings(supabase),
      ])

      if (taxiData) {
        setDrivers(taxiData.map((t: any) => ({
          ...t,
          driver_name: t.users?.name ?? null,
          is_on_trip: activeBookings.has(t.id),
          active_booking: activeBookings.get(t.id) ?? null,
        })))
      }
    }

    load()

    const channel = supabase
      .channel(channelId.current)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'taxis' }, (payload) => {
        setDrivers(prev =>
          prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d)
        )
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async () => {
        const activeBookings = await fetchActiveBookings(supabase)
        setDrivers(prev => prev.map(d => ({
          ...d,
          is_on_trip: activeBookings.has(d.id),
          active_booking: activeBookings.get(d.id) ?? null,
        })))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return drivers
}
