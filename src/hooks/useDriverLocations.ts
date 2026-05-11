import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface DriverLocation {
  id: string
  name: string
  plate: string | null
  color: string
  driver_id: string | null
  driver_name: string | null
  latitude: number | null
  longitude: number | null
  location_updated_at: string | null
}

export function useDriverLocations(): DriverLocation[] {
  const [drivers,   setDrivers]   = useState<DriverLocation[]>([])
  const channelId = useRef(`driver-locations-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    const supabase = createClient()

    supabase
      .from('taxis')
      .select('id, name, plate, color, driver_id, latitude, longitude, location_updated_at, users!driver_id(name)')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) {
          setDrivers(data.map((t: any) => ({ ...t, driver_name: t.users?.name ?? null })))
        }
      })

    const channel = supabase
      .channel(channelId.current)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'taxis' },
        (payload) => {
          setDrivers(prev =>
            prev.map(d => (d.id === payload.new.id ? { ...d, ...payload.new } : d))
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return drivers
}
