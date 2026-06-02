'use client'
import { useEffect, useState, useRef, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useDriverLocations } from '@/hooks/useDriverLocations'
import { getRoute } from '@/lib/routing'
import { DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_URL } from './tileConfig'

const TILE_URL = DEFAULT_TILE_URL
const DEFAULT_CENTER: [number, number] = [-2.5397, 121.3588]
const GPS_STALE_MS = 10 * 60 * 1000

function isGpsActive(ts: string | null) {
  if (!ts) return false
  return Date.now() - new Date(ts).getTime() < GPS_STALE_MS
}

function driverIcon(color: string, stale: boolean, name: string) {
  const opacity = stale ? '0.5' : '1'
  const label = name.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return L.divIcon({
    html: `<div style="opacity:${opacity};display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="background:${color};color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${label}</div>
      <div style="width:26px;height:26px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:12px">🚗</div>
    </div>`,
    className: '',
    iconSize: [80, 46],
    iconAnchor: [40, 33],
  })
}

function destinationIcon(color: string, taxiName: string) {
  const label = taxiName.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return L.divIcon({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="background:${color};color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2)">${label}</div>
        <div style="width:24px;height:24px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:11px">📍</div>
      </div>`,
    className: '',
    iconSize: [60, 42],
    iconAnchor: [30, 42],
  })
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [50, 50] })
    else if (positions.length === 1) map.setView(positions[0], 14)
  }, [positions.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
      <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
    </svg>
  )
}

function CompressIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
      <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
    </svg>
  )
}

interface Props { style?: React.CSSProperties }

export default function DriverFleetMap({ style }: Props) {
  const drivers = useDriverLocations()
  const [routes, setRoutes] = useState<Record<string, [number, number][]>>({})
  const [isFs, setIsFs] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onFSChange() { setIsFs(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFSChange)
    return () => document.removeEventListener('fullscreenchange', onFSChange)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }

  const tripKey = drivers
    .filter(d => d.is_on_trip && d.latitude != null && d.longitude != null)
    .map(d => `${d.id}:${d.latitude!.toFixed(3)},${d.longitude!.toFixed(3)},${d.active_booking?.destination_lat?.toFixed(3)}`)
    .join('|')

  useEffect(() => {
    if (!tripKey) return
    drivers.forEach(d => {
      if (!d.is_on_trip || !d.active_booking) return
      const bk = d.active_booking
      if (d.latitude == null || d.longitude == null) return
      if (bk.destination_lat == null || bk.destination_lng == null) return

      getRoute(
        { lat: d.latitude,         lng: d.longitude         },
        { lat: bk.destination_lat, lng: bk.destination_lng  },
      ).then(r => {
        if (r) setRoutes(prev => ({ ...prev, [d.id]: r.coordinates }))
        else   setRoutes(prev => ({
          ...prev,
          [d.id]: [[d.latitude!, d.longitude!], [bk.destination_lat!, bk.destination_lng!]],
        }))
      })
    })
  }, [tripKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const positioned = drivers.filter(d => d.latitude != null && d.longitude != null)
  const fitPositions: [number, number][] = positioned.map(d => [d.latitude!, d.longitude!])

  return (
    <div ref={containerRef} style={{ position: 'relative', overflow: 'hidden', height: '100%', background: '#e8e0d8', ...style }}>
      <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl>
        <TileLayer url={TILE_URL} attribution={DEFAULT_TILE_ATTRIBUTION} />
        {fitPositions.length > 0 && <FitBounds positions={fitPositions} />}

        {positioned.map(d => {
          const stale   = !isGpsActive(d.location_updated_at)
          const bk      = d.active_booking
          const hasDest = bk?.destination_lat != null && bk?.destination_lng != null
          const route   = routes[d.id]

          return (
            <Fragment key={d.id}>
              {bk && route && route.length > 1 && (
                <Polyline positions={route} pathOptions={{ color: d.color, weight: 4, opacity: 0.85 }} />
              )}

              {bk && hasDest && (
                <Marker position={[bk.destination_lat!, bk.destination_lng!]} icon={destinationIcon(d.color, d.driver_name || d.name)}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ width: 8, height: 8, background: d.color, borderRadius: '50%', display: 'inline-block' }} />
                        <strong style={{ fontSize: 12 }}>{d.name}</strong>
                        {d.driver_name && <span style={{ fontSize: 10, color: '#6f7979' }}>· {d.driver_name}</span>}
                      </div>
                      <p style={{ margin: '0 0 1px', fontSize: 10, fontWeight: 700, color: d.color }}>Destination</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#374151' }}>{bk.destination}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              <Marker position={[d.latitude!, d.longitude!]} icon={driverIcon(d.color, stale, d.driver_name || d.name)}>
                <Popup>
                  <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 155 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, display: 'inline-block', flexShrink: 0 }} />
                      <strong style={{ fontSize: 13 }}>{d.name}</strong>
                      {d.plate && <span style={{ fontSize: 10, color: '#9ca3af' }}>{d.plate}</span>}
                    </div>
                    {d.driver_name && <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6f7979' }}>{d.driver_name}</p>}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: bk ? 6 : 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: d.is_available && d.driver_id ? '#2D6A4F' : '#EF4444' }}>
                        {d.is_available && d.driver_id ? '● Online' : '○ Offline'}
                      </span>
                      <span style={{ fontSize: 10, color: stale ? '#9ca3af' : '#059669' }}>
                        · {stale ? 'GPS stale' : 'GPS active'}
                      </span>
                    </div>
                    {bk && (
                      <div style={{ background: `${d.color}12`, border: `1px solid ${d.color}30`, borderRadius: 6, padding: '5px 8px' }}>
                        <p style={{ margin: '0 0 3px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: d.color }}>
                          {bk.status === 'waiting_trip' ? '⏱ Waiting' : '→ On Trip'}
                        </p>
                        <p style={{ margin: '0 0 2px', fontSize: 10, color: '#374151' }}>
                          <span style={{ color: '#6f7979' }}>From </span>{bk.pickup}
                        </p>
                        <p style={{ margin: 0, fontSize: 10, color: '#374151' }}>
                          <span style={{ color: '#6f7979' }}>To </span><strong>{bk.destination}</strong>
                        </p>
                      </div>
                    )}
                    {d.location_updated_at && (
                      <p style={{ margin: '5px 0 0', fontSize: 9, color: '#9ca3af' }}>
                        GPS {new Date(d.location_updated_at).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            </Fragment>
          )
        })}
      </MapContainer>

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        title={isFs ? 'Exit fullscreen' : 'Fullscreen'}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 1000,
          width: 34, height: 34, borderRadius: 6,
          background: '#fff', border: '1px solid rgba(0,0,0,0.12)',
          boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#374151',
        }}
      >
        {isFs ? <CompressIcon /> : <ExpandIcon />}
      </button>

      {positioned.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,245,242,0.88)', zIndex: 999, gap: 6 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#6f7979', margin: 0 }}>No driver locations available</p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Locations appear when drivers share GPS</p>
        </div>
      )}
    </div>
  )
}
