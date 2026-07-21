import type { Coords } from './geocode'

export interface RouteDurationInfo {
  durationSec: number
  distanceMeters: number
}

// Free OSRM-based duration + distance (no API key needed) — for server-side
// auto_complete_at calculation and distance-based buffer time.
export async function getRouteInfo(
  pickupLat: number, pickupLng: number,
  destLat: number, destLng: number
): Promise<RouteDurationInfo | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=false`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route) return null
    return { durationSec: route.duration, distanceMeters: route.distance }
  } catch {
    return null
  }
}

export interface RouteResult {
  coordinates: [number, number][] // [lat, lng] pairs for Leaflet Polyline
  distanceMeters: number
  durationSeconds: number
}

// Distance-based buffer added on top of drive time, shared by the auto_complete_at
// calculation (api/bookings/route.ts) and any UI that surfaces the same figure.
export const MID_TRIP_KM        = 10
export const LONG_TRIP_KM       = 15
export const BUFFER_SHORT_SEC   = 15 * 60
export const BUFFER_MID_SEC     = 55 * 60
export const BUFFER_LONG_SEC    = 90 * 60

export function getBufferSeconds(oneWayDistanceKm: number | null): number {
  if (oneWayDistanceKm === null) return BUFFER_SHORT_SEC
  if (oneWayDistanceKm > LONG_TRIP_KM) return BUFFER_LONG_SEC
  if (oneWayDistanceKm > MID_TRIP_KM) return BUFFER_MID_SEC
  return BUFFER_SHORT_SEC
}

export function formatDurationMin(sec: number, lang: 'en' | 'id'): string {
  const mins = Math.round(sec / 60)
  if (mins < 60) return lang === 'id' ? `${mins} menit` : `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return lang === 'id' ? `${h}j ${m}m` : `${h}h ${m}m`
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
