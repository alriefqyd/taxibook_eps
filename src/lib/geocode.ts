export interface Coords {
  lat: number
  lng: number
}

export async function geocodeAddress(address: string): Promise<Coords | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Ridr/1.0' },
    })
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Ridr/1.0' },
    })
    const data = await res.json()
    // Prefer a short readable name over the full display_name
    const d = data.address
    if (d) {
      const parts = [
        d.amenity || d.building || d.road,
        d.suburb || d.village || d.town || d.city,
      ].filter(Boolean)
      if (parts.length) return parts.join(', ')
    }
    return data.display_name || null
  } catch {
    return null
  }
}
