function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Only commit to advancing the trim point once the driver is within this distance of
// it — otherwise a single noisy GPS reading could yank the cut point far ahead.
const ADVANCE_THRESHOLD_M = 80

// Trims the already-traveled portion off the front of a route polyline, like
// turn-by-turn navigation. The cut point only ever moves forward (never back), so
// GPS jitter can't make an already-erased segment reappear.
export function trimRouteToDriver(
  route: [number, number][],
  driverLat: number,
  driverLng: number,
  lastIndex: number,
): { trimmed: [number, number][]; index: number } {
  if (route.length < 2) return { trimmed: route, index: lastIndex }

  const start = Math.min(lastIndex, route.length - 1)
  let bestIdx  = start
  let bestDist = Infinity
  for (let i = start; i < route.length; i++) {
    const d = haversineMeters(driverLat, driverLng, route[i][0], route[i][1])
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }

  const index  = bestDist <= ADVANCE_THRESHOLD_M ? bestIdx : start
  const sliced = route.slice(index)
  // Always keep at least 2 points so a Polyline has something to draw.
  const trimmed = sliced.length > 1 ? sliced : route.slice(Math.max(0, route.length - 2))
  return { trimmed, index }
}
