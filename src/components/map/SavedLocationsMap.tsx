'use client'
import { useEffect, useState } from 'react'
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet'
import TileLayerSwitcher from './TileLayerSwitcher'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RegisteredLocation } from '@/types'
const SOROWAKO: [number, number] = [-2.5397, 121.3588]
const FONT = "var(--font-inter), 'Inter', sans-serif"

function savedLocIcon() {
  return L.divIcon({
    html: `<div style="width:30px;height:30px;background:#D97706;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:800">★</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  })
}

function FitBounds({ locations }: { locations: RegisteredLocation[] }) {
  const map = useMap()
  useEffect(() => {
    if (locations.length === 0) { map.setView(SOROWAKO, 13); return }
    if (locations.length === 1) { map.setView([locations[0].lat, locations[0].lng], 15); return }
    const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [locations.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function MapCapture({ onMap }: { onMap: (m: L.Map) => void }) {
  const map = useMap()
  useEffect(() => { onMap(map) }, [map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// SVG icon for "fit bounds" button
const FitIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
    <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

interface Props {
  locations: RegisteredLocation[]
  onMarkerClick?: (loc: RegisteredLocation) => void
}

export default function SavedLocationsMap({ locations, onMarkerClick }: Props) {
  const [mapInst, setMapInst] = useState<L.Map | null>(null)

  function fitAll() {
    if (!mapInst) return
    if (locations.length === 0) { mapInst.setView(SOROWAKO, 13); return }
    if (locations.length === 1) { mapInst.setView([locations[0].lat, locations[0].lng], 15); return }
    const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lng] as [number, number]))
    mapInst.fitBounds(bounds, { padding: [40, 40] })
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={SOROWAKO}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom
      >
        <TileLayerSwitcher />
        <FitBounds locations={locations} />
        <MapCapture onMap={setMapInst} />

        {locations.map(loc => (
          <Marker
            key={loc.id}
            position={[loc.lat, loc.lng]}
            icon={savedLocIcon()}
            eventHandlers={onMarkerClick ? { click: () => onMarkerClick(loc) } : {}}
          >
            <Popup
              maxWidth={220}
              closeButton={false}
              offset={[0, -20]}
              className="taxibook-popup"
            >
              <div style={{ fontFamily: FONT, padding: '4px 2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <span style={{ fontSize: 15, color: '#D97706', lineHeight: 1 }}>★</span>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1c1b', margin: 0, lineHeight: 1.3 }}>
                    {loc.name}
                  </p>
                </div>
                {loc.address && (
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 5px', lineHeight: 1.45 }}>
                    {loc.address}
                  </p>
                )}
                <p style={{ fontSize: 10, color: '#c4c9d0', margin: 0, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Single fit-bounds control */}
      <button
        onClick={fitAll}
        title="Fit all locations"
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 1000,
          width: 34, height: 34, borderRadius: 8,
          background: '#fff', border: '1px solid rgba(0,0,0,0.12)',
          boxShadow: '0 1px 5px rgba(0,0,0,0.18)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#006064',
        }}
      >
        <FitIcon />
      </button>
    </div>
  )
}
