import type { Coords } from './geocode'

// Free OSRM-based duration (no API key needed) — for server-side auto_complete_at calculation
export async function getRouteDurationSeconds(
  pickupLat: number, pickupLng: number,
  destLat: number, destLng: number
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=false`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    return data.routes?.[0]?.duration ?? null
  } catch {
    return null
  }
}

export interface RouteResult {
  coordinates: [number, number][] // [lat, lng] pairs for Leaflet Polyline
  distanceMeters: number
  durationSeconds: number
}

export async function getRoute(from: Coords, to: Coords): Promise<RouteResult | null> {
  try {
    const key = process.env.NEXT_PUBLIC_ORS_KEY
    if (!key) return null

    const url =
      `https://api.openrouteservice.org/v2/directions/driving-car` +
      `?api_key=${key}` +
      `&start=${from.lng},${from.lat}` +
      `&end=${to.lng},${to.lat}`

    const res = await fetch(url)
    if (!res.ok) return null

    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null

    // ORS returns [lng, lat] — flip to [lat, lng] for Leaflet
    const coordinates: [number, number][] = feature.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    )

    return {
      coordinates,
      distanceMeters: feature.properties.summary.distance,
      durationSeconds: feature.properties.summary.duration,
    }
  } catch {
    return null
  }
}
