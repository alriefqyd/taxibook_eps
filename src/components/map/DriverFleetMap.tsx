'use client'
import { useEffect, useState, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useDriverLocations } from '@/hooks/useDriverLocations'
import { getRoute } from '@/lib/routing'

const TILE_URL = `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''}`
const DEFAULT_CENTER: [number, number] = [-2.5397, 121.3588]
const GPS_STALE_MS = 10 * 60 * 1000

function isGpsActive(ts: string | null) {
  if (!ts) return false
  return Date.now() - new Date(ts).getTime() < GPS_STALE_MS
}

function driverIcon(color: string, stale: boolean) {
  const opacity = stale ? '0.5' : '1'
  return L.divIcon({
    html: `<div style="opacity:${opacity};width:20px;height:20px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:10px">🚗</div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
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

interface Props { style?: React.CSSProperties }

export default function DriverFleetMap({ style }: Props) {
  const drivers = useDriverLocations()
  const [routes, setRoutes] = useState<Record<string, [number, number][]>>({})

  // Key changes when any on-trip driver moves (toFixed(3) ≈ 110m granularity)
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
        { lat: d.latitude,          lng: d.longitude          },
        { lat: bk.destination_lat,  lng: bk.destination_lng   },
      ).then(r => {
        if (r) setRoutes(prev => ({ ...prev, [d.id]: r.coordinates }))
        else   setRoutes(prev => ({           // fallback: straight line
          ...prev,
          [d.id]: [[d.latitude!, d.longitude!], [bk.destination_lat!, bk.destination_lng!]],
        }))
      })
    })
  }, [tripKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const positioned = drivers.filter(d => d.latitude != null && d.longitude != null)
  const fitPositions: [number, number][] = positioned.map(d => [d.latitude!, d.longitude!])

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', ...style }}>
      <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl>
        <TileLayer url={TILE_URL} attribution="© MapTiler © OpenStreetMap contributors" />
        {fitPositions.length > 0 && <FitBounds positions={fitPositions} />}

        {positioned.map(d => {
          const stale = !isGpsActive(d.location_updated_at)
          const bk    = d.active_booking
          const hasDest = bk?.destination_lat != null && bk?.destination_lng != null
          const route   = routes[d.id]

          return (
            <Fragment key={d.id}>
              {/* Road-following route line in taxi color */}
              {bk && route && route.length > 1 && (
                <Polyline
                  positions={route}
                  pathOptions={{ color: d.color, weight: 4, opacity: 0.85 }}
                />
              )}

              {/* Destination pin */}
              {bk && hasDest && (
                <Marker
                  position={[bk.destination_lat!, bk.destination_lng!]}
                  icon={destinationIcon(d.color, d.name)}
                >
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

              {/* Driver marker */}
              <Marker position={[d.latitude!, d.longitude!]} icon={driverIcon(d.color, stale)}>
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

      {positioned.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,245,242,0.88)', zIndex: 999, gap: 6 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#6f7979', margin: 0 }}>No driver locations available</p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Locations appear when drivers share GPS</p>
        </div>
      )}
    </div>
  )
}
