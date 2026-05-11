import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useGpsReporting(taxiId: string | null) {
  const lastRef = useRef<{ lat: number; lng: number; time: number } | null>(null)

  useEffect(() => {
    if (!taxiId || !navigator.geolocation) return

    const supabase = createClient()

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const now = Date.now()
        const last = lastRef.current

        const distMoved = last
          ? Math.hypot(lat - last.lat, lng - last.lng) * 111000 // approx metres
          : Infinity
        const elapsed = last ? now - last.time : Infinity

        // Skip update if barely moved and recently updated
        if (distMoved < 10 && elapsed < 10_000) return

        lastRef.current = { lat, lng, time: now }

        await supabase
          .from('taxis')
          .update({ latitude: lat, longitude: lng, location_updated_at: new Date().toISOString() })
          .eq('id', taxiId)
      },
      null,
      { enableHighAccuracy: true, maximumAge: 5_000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [taxiId])
}
