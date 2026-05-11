'use client'
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createClient } from '@/lib/supabase/client'
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

function pickupIcon() {
  return L.divIcon({
    html: `<div style="width:24px;height:24px;background:#16A34A;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:11px">📍</div>`,
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
  taxiId: string
  taxiColor: string
  pickup: string
  destination: string
  status: string   // 'booked' | 'on_trip' | 'waiting_trip'
}

export default function TrackingMap({ taxiId, taxiColor, pickup, destination, status }: Props) {
  const [driverPos,  setDriverPos]  = useState<[number, number] | null>(null)
  const [targetPos,  setTargetPos]  = useState<[number, number] | null>(null)
  const [route,      setRoute]      = useState<[number, number][] | null>(null)
  const [eta,        setEta]        = useState<number | null>(null)

  const headingToPickup = status === 'booked'
  const targetAddress   = headingToPickup ? pickup : destination
  const etaLabel        = headingToPickup ? 'driver arriving' : 'to destination'

  // Subscribe to driver's real-time taxi location
  useEffect(() => {
    if (!taxiId) return
    const supabase = createClient()

    supabase
      .from('taxis').select('latitude, longitude').eq('id', taxiId).single()
      .then(({ data }) => {
        if (data?.latitude && data?.longitude)
          setDriverPos([data.latitude, data.longitude])
      })

    const ch = supabase
      .channel(`taxi-track-${taxiId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'taxis', filter: `id=eq.${taxiId}` },
        (payload) => {
          const { latitude, longitude } = payload.new
          if (latitude && longitude) setDriverPos([latitude, longitude])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [taxiId])

  // Geocode target when status or addresses change
  useEffect(() => {
    setTargetPos(null)
    setRoute(null)
    setEta(null)
    geocodeAddress(targetAddress).then(c => { if (c) setTargetPos([c.lat, c.lng]) })
  }, [targetAddress])

  // Fetch route when both positions ready
  useEffect(() => {
    if (!driverPos || !targetPos) return
    getRoute(
      { lat: driverPos[0], lng: driverPos[1] },
      { lat: targetPos[0], lng: targetPos[1] }
    ).then(r => {
      if (r) { setRoute(r.coordinates); setEta(Math.round(r.durationSeconds / 60)) }
    })
  }, [driverPos?.[0], driverPos?.[1], targetPos?.[0], targetPos?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  const bounds: [number, number][] = [
    ...(driverPos ? [driverPos] : []),
    ...(targetPos ? [targetPos] : []),
  ]

  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
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

      <MapContainer center={DEFAULT_CENTER} zoom={5} style={{ height: 260, width: '100%' }} zoomControl>
        <TileLayer url={TILE_URL} attribution="© MapTiler © OpenStreetMap contributors" />
        {bounds.length > 0 && <FitBounds positions={bounds} />}
        {driverPos && (
          <Marker position={driverPos} icon={driverIcon(taxiColor || '#006064')}>
            <Popup>{headingToPickup ? 'Driver on the way' : 'Driver'}</Popup>
          </Marker>
        )}
        {targetPos && (
          <Marker position={targetPos} icon={pickupIcon()}>
            <Popup>{headingToPickup ? `Pickup: ${pickup}` : `Destination: ${destination}`}</Popup>
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
          <p style={{ fontSize: 13, fontWeight: 600, color: '#6f7979', margin: 0 }}>
            Driver location not yet available
          </p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
            Waiting for driver to share GPS...
          </p>
        </div>
      )}
    </div>
  )
}
