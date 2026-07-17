'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getRouteInfo, getBufferSeconds, BUFFER_SHORT_SEC } from '@/lib/routing'

export interface TravelTimes {
  forwardSec: number | null   // pickup -> destination
  returnSec: number | null    // destination -> office
  bufferSec: number
  officeFound: boolean
  loading: boolean
}

const IDLE: TravelTimes = { forwardSec: null, returnSec: null, bufferSec: BUFFER_SHORT_SEC, officeFound: true, loading: false }

// Mirrors the pickup->destination and buffer-time logic used to compute
// auto_complete_at on booking creation (see api/bookings/route.ts), plus an extra
// destination->office leg for display, since the driver's actual round trip ends
// back at base rather than back at the pickup point.
export function useTravelTimes(
  pickupLat: number | null | undefined,
  pickupLng: number | null | undefined,
  destLat: number | null | undefined,
  destLng: number | null | undefined,
  officeName = 'Central Engineering',
): TravelTimes {
  const [state, setState] = useState<TravelTimes>(IDLE)

  useEffect(() => {
    let cancelled = false

    if (!pickupLat || !pickupLng || !destLat || !destLng) {
      setState(IDLE)
      return
    }

    setState(s => ({ ...s, loading: true }))

    async function run() {
      const supabase = createClient()
      const [forwardInfo, officeRes] = await Promise.all([
        getRouteInfo(pickupLat!, pickupLng!, destLat!, destLng!),
        supabase.from('registered_locations').select('lat, lng').ilike('name', `%${officeName}%`).limit(1).maybeSingle(),
      ])
      if (cancelled) return

      const forwardKm  = forwardInfo ? forwardInfo.distanceMeters / 1000 : null
      const bufferSec  = getBufferSeconds(forwardKm)
      const forwardSec = forwardInfo?.durationSec ?? null

      if (!officeRes.data) {
        setState({ forwardSec, returnSec: null, bufferSec, officeFound: false, loading: false })
        return
      }

      const backInfo = await getRouteInfo(destLat!, destLng!, officeRes.data.lat, officeRes.data.lng)
      if (cancelled) return
      setState({ forwardSec, returnSec: backInfo?.durationSec ?? null, bufferSec, officeFound: true, loading: false })
    }

    run()
    return () => { cancelled = true }
  }, [pickupLat, pickupLng, destLat, destLng, officeName])

  return state
}
