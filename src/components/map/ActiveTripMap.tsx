'use client'
import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import TileLayerSwitcher from './TileLayerSwitcher'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geocodeAddress } from '@/lib/geocode'
import { getRoute } from '@/lib/routing'
import { trimRouteToDriver } from '@/lib/routeTrim'
const DEFAULT_CENTER: [number, number] = [-2.5397, 121.3588] // PTVI Sorowako

function driverIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:20px;height:20px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:10px">🚗</div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function pickupIcon() {
  return L.divIcon({
    html: `<div style="width:24px;height:24px;background:#16A34A;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:11px">📍</div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
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
  const [driverPos,    setDriverPos]    = useState<[number, number] | null>(null)
  const [pickupPos,    setPickupPos]    = useState<[number, number] | null>(null)
  const [destPos,      setDestPos]      = useState<[number, number] | null>(null)
  const [route,        setRoute]        = useState<[number, number][] | null>(null)
  const [displayRoute, setDisplayRoute] = useState<[number, number][] | null>(null)
  const [eta,          setEta]          = useState<number | null>(null)
  const trimIndexRef = useRef(0)

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

  // Resolve pickup coordinates — use stored coords first, fall back to geocoding
  useEffect(() => {
    if (pickupLat != null && pickupLng != null) {
      setPickupPos([pickupLat, pickupLng])
    } else {
      geocodeAddress(pickup).then(c => { if (c) setPickupPos([c.lat, c.lng]) })
    }
  }, [pickup, pickupLat, pickupLng])

  // Resolve destination coordinates — use stored coords first, fall back to geocoding
  useEffect(() => {
    if (destLat != null && destLng != null) {
      setDestPos([destLat, destLng])
    } else {
      geocodeAddress(destination).then(c => { if (c) setDestPos([c.lat, c.lng]) })
    }
  }, [destination, destLat, destLng])

  // Fetch the full trip route: driver position → pickup → destination
  useEffect(() => {
    if (!driverPos || !pickupPos || !destPos) return
    Promise.all([
      getRoute({ lat: driverPos[0], lng: driverPos[1] }, { lat: pickupPos[0], lng: pickupPos[1] }),
      getRoute({ lat: pickupPos[0], lng: pickupPos[1] }, { lat: destPos[0],   lng: destPos[1]   }),
    ]).then(([leg1, leg2]) => {
      const coords = [...(leg1?.coordinates ?? []), ...(leg2?.coordinates ?? [])]
      if (coords.length > 1) {
        trimIndexRef.current = 0
        setRoute(coords)
      }
      const seconds = (leg1?.durationSeconds ?? 0) + (leg2?.durationSeconds ?? 0)
      if (seconds > 0) setEta(Math.round(seconds / 60))
    })
  }, [driverPos?.[0], driverPos?.[1], pickupPos?.[0], pickupPos?.[1], destPos?.[0], destPos?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  // Erase the already-traveled portion of the line as the driver moves, like navigation.
  useEffect(() => {
    if (!driverPos || !route) { setDisplayRoute(route); return }
    const { trimmed, index } = trimRouteToDriver(route, driverPos[0], driverPos[1], trimIndexRef.current)
    trimIndexRef.current = index
    setDisplayRoute(trimmed)
  }, [driverPos?.[0], driverPos?.[1], route]) // eslint-disable-line react-hooks/exhaustive-deps

  const bounds: [number, number][] = [
    ...(driverPos ? [driverPos] : []),
    ...(pickupPos ? [pickupPos] : []),
    ...(destPos   ? [destPos]   : []),
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
          ~{eta} min total
        </div>
      )}

      <MapContainer center={driverPos ?? DEFAULT_CENTER} zoom={driverPos ? 13 : 5} style={{ height: 280, width: '100%' }} zoomControl>
        <TileLayerSwitcher />
        {bounds.length > 0 && <FitBounds positions={bounds} />}
        {driverPos && (
          <Marker position={driverPos} icon={driverIcon(taxiColor || '#006064')}>
            <Popup>Your location</Popup>
          </Marker>
        )}
        {pickupPos && (
          <Marker position={pickupPos} icon={pickupIcon()}>
            <Popup>Pickup: {pickup}</Popup>
          </Marker>
        )}
        {destPos && (
          <Marker position={destPos} icon={destinationIcon()}>
            <Popup>Destination: {destination}</Popup>
          </Marker>
        )}
        {displayRoute && displayRoute.length > 1 && (
          <Polyline positions={displayRoute} color={taxiColor || '#006064'} weight={4} opacity={0.8} />
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
