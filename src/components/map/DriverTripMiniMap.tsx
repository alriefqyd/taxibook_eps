'use client'
import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet'
import TileLayerSwitcher from './TileLayerSwitcher'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function markerIcon(emoji: string, color: string, size = 28) {
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:${size * 0.45}px">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function FitAll({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [32, 32], maxZoom: 15 })
    else if (positions.length === 1) map.setView(positions[0], 14)
  }, [positions.map(p => p.join(',')).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

interface Props {
  driverLat: number
  driverLng: number
  pickupLat?: number | null
  pickupLng?: number | null
  destLat?: number | null
  destLng?: number | null
  color: string
  route?: [number, number][]
  status?: string
}

export default function DriverTripMiniMap({ driverLat, driverLng, pickupLat, pickupLng, destLat, destLng, color, route }: Props) {
  const positions: [number, number][] = [[driverLat, driverLng]]
  if (pickupLat && pickupLng) positions.push([pickupLat, pickupLng])
  if (destLat && destLng) positions.push([destLat, destLng])

  // Full trip route: driver position → pickup → destination
  const fallback: [number, number][] = [
    [driverLat, driverLng],
    ...(pickupLat != null && pickupLng != null ? [[pickupLat, pickupLng] as [number, number]] : []),
    ...(destLat != null && destLng != null ? [[destLat, destLng] as [number, number]] : []),
  ]
  const lineCoords: [number, number][] = route && route.length > 1 ? route : fallback

  return (
    <MapContainer
      center={[driverLat, driverLng]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayerSwitcher showToggle={false} />
      <FitAll positions={positions} />

      {/* Route line */}
      {lineCoords.length > 1 && (
        <Polyline positions={lineCoords} pathOptions={{ color, weight: 4, opacity: 0.8 }} />
      )}

      {/* Pickup marker */}
      {pickupLat && pickupLng && (
        <Marker position={[pickupLat, pickupLng]} icon={markerIcon('🟢', '#059669')} />
      )}

      {/* Destination marker */}
      {destLat && destLng && (
        <Marker position={[destLat, destLng]} icon={markerIcon('📍', color)} />
      )}

      {/* Driver marker */}
      <Marker position={[driverLat, driverLng]} icon={markerIcon('🚗', color, 32)} />
    </MapContainer>
  )
}
