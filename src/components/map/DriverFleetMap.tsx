'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useDriverLocations } from '@/hooks/useDriverLocations'

const TILE_URL = `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''}`
const DEFAULT_CENTER: [number, number] = [-2.5397, 121.3588] // PTVI Sorowako

function taxiIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:20px;height:20px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1">🚗</div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
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
  style?: React.CSSProperties
}

export default function DriverFleetMap({ style }: Props) {
  const drivers = useDriverLocations()
  const positioned = drivers.filter(d => d.latitude !== null && d.longitude !== null)
  const positions: [number, number][] = positioned.map(d => [d.latitude!, d.longitude!])

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', ...style }}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl
      >
        <TileLayer url={TILE_URL} attribution="© MapTiler © OpenStreetMap contributors" />
        {positions.length > 0 && <FitBounds positions={positions} />}
        {positioned.map(d => (
          <Marker key={d.id} position={[d.latitude!, d.longitude!]} icon={taxiIcon(d.color)}>
            <Popup>
              <strong>{d.name}</strong>
              {d.driver_name && <><br />{d.driver_name}</>}
              {d.location_updated_at && (
                <><br /><span style={{ fontSize: 11, color: '#6f7979' }}>
                  {new Date(d.location_updated_at).toLocaleTimeString()}
                </span></>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {positioned.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(245,245,242,0.88)', zIndex: 999, gap: 6,
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#6f7979', margin: 0 }}>
            No drivers sharing location
          </p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
            Locations appear when drivers are active
          </p>
        </div>
      )}
    </div>
  )
}
