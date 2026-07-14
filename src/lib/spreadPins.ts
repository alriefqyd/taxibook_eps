// Spreads map pins that share (nearly) the same coordinate so they don't visually
// stack on top of each other — nudges duplicates into a small circle around the
// original point, just enough to keep every pin visible and tappable.
interface PinInput {
  id: string
  lat: number
  lng: number
}

const GROUP_PRECISION = 4  // ~11m grid — coords this close are treated as "the same spot"
const SPREAD_RADIUS_DEG = 0.00015 // ~15-17m at the equator

export function spreadOverlappingPins<T extends PinInput>(items: T[]): Record<string, [number, number]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = `${item.lat.toFixed(GROUP_PRECISION)},${item.lng.toFixed(GROUP_PRECISION)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  const result: Record<string, [number, number]> = {}
  for (const group of Array.from(groups.values())) {
    if (group.length === 1) {
      result[group[0].id] = [group[0].lat, group[0].lng]
      continue
    }
    group.forEach((item, i) => {
      const angle = (2 * Math.PI * i) / group.length
      result[item.id] = [
        item.lat + SPREAD_RADIUS_DEG * Math.sin(angle),
        item.lng + SPREAD_RADIUS_DEG * Math.cos(angle),
      ]
    })
  }
  return result
}
