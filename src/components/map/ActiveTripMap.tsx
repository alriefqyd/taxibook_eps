'use client'
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geocodeAddress } from '@/lib/geocode'
import { getRoute } from '@/lib/routing'

const TILE_URL = `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''}`
const DEFAULT_CENTER: [number, number] = [-2.5397, 121.3588] // PTVI Sorowako

function driverIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:20px;height:20px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:10px">🚗</div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function destinationIcon() {
  return L.divIcon({
    html: `<div style="width:24px;height:24px;background:#EF4444;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:11px">📍</div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  })
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [40, 40] })
    else if (positions.length === 1) map.setView(positions[0], 14)
  }, [positions.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

interface Props {
  pickup: string
  destination: string
  status: string   // 'booked' | 'on_trip' | 'waiting_trip'
  taxiColor: string
  pickupLat?: number | null
  pickupLng?: number | null
  destLat?: number | null
  destLng?: number | null
}

export default function ActiveTripMap({ pickup, destination, status, taxiColor, pickupLat, pickupLng, destLat, destLng }: Props) {
  const [driverPos,  setDriverPos]  = useState<[number, number] | null>(null)
  const [targetPos,  setTargetPos]  = useState<[number, number] | null>(null)
  const [route,      setRoute]      = useState<[number, number][] | null>(null)
  const [eta,        setEta]        = useState<number | null>(null)

  const headingToPickup = status === 'booked'
  const targetAddress   = headingToPickup ? pickup : destination
  const etaLabel        = headingToPickup ? 'to pickup' : 'to destination'

  // Watch driver's own GPS
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => setDriverPos([pos.coords.latitude, pos.coords.longitude]),
      null,
      { enableHighAccuracy: true, maximumAge: 5_000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Resolve target coordinates — use stored coords first, fall back to geocoding
  useEffect(() => {
    setTargetPos(null)
    setRoute(null)
    setEta(null)
    const lat = headingToPickup ? pickupLat : destLat
    const lng = headingToPickup ? pickupLng : destLng
    if (lat != null && lng != null) {
      setTargetPos([lat, lng])
    } else {
      geocodeAddress(targetAddress).then(c => { if (c) setTargetPos([c.lat, c.lng]) })
    }
  }, [targetAddress, headingToPickup, pickupLat, pickupLng, destLat, destLng])

  // Fetch route when both positions ready
  useEffect(() => {
    if (!driverPos || !targetPos) return
    getRoute(
      { lat: driverPos[0],  lng: driverPos[1]  },
      { lat: targetPos[0],  lng: targetPos[1]  }
    ).then(r => {
      if (r) { setRoute(r.coordinates); setEta(Math.round(r.durationSeconds / 60)) }
    })
  }, [driverPos?.[0], driverPos?.[1], targetPos?.[0], targetPos?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  const bounds: [number, number][] = [
    ...(driverPos ? [driverPos] : []),
    ...(targetPos ? [targetPos] : []),
  ]

  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginTop: 12 }}>
      {eta !== null && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 1000,
          background: '#006064', color: '#fff',
          padding: '5px 12px', borderRadius: 20,
          fontSize: 12, fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}>
          ~{eta} min {etaLabel}
        </div>
      )}

      <MapContainer center={driverPos ?? DEFAULT_CENTER} zoom={driverPos ? 13 : 5} style={{ height: 280, width: '100%' }} zoomControl>
        <TileLayer url={TILE_URL} attribution="© MapTiler © OpenStreetMap contributors" />
        {bounds.length > 0 && <FitBounds positions={bounds} />}
        {driverPos && (
          <Marker position={driverPos} icon={driverIcon(taxiColor || '#006064')}>
            <Popup>Your location</Popup>
          </Marker>
        )}
        {targetPos && (
          <Marker position={targetPos} icon={headingToPickup ? destinationIcon() : destinationIcon()}>
            <Popup>{targetAddress}</Popup>
          </Marker>
        )}
        {route && route.length > 1 && (
          <Polyline positions={route} color={taxiColor || '#006064'} weight={4} opacity={0.8} />
        )}
      </MapContainer>

      {!driverPos && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(245,245,242,0.88)', zIndex: 999, gap: 6,
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#6f7979', margin: 0 }}>Waiting for GPS...</p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Please allow location access</p>
        </div>
      )}
    </div>
  )
}
