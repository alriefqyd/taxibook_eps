'use client'
import { useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { reverseGeocode, geocodeAddress } from '@/lib/geocode'
import type { Coords } from '@/lib/geocode'

const TILE_URL   = `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''}`
const SOROWAKO: [number, number] = [-2.5397, 121.3588]

function pinIcon() {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;background:#006064;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:13px">📍</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  const prev = useRef<string>('')
  if (target) {
    const key = target.join(',')
    if (key !== prev.current) { prev.current = key; map.flyTo(target, 16) }
  }
  return null
}

interface Props {
  title: string
  onConfirm: (address: string, coords: Coords) => void
  onClose: () => void
}

export default function LocationPickerMap({ title, onConfirm, onClose }: Props) {
  const [picked,      setPicked]      = useState<(Coords & { address: string }) | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching,   setSearching]   = useState(false)
  const [searchErr,   setSearchErr]   = useState('')
  const [flyTarget,   setFlyTarget]   = useState<[number, number] | null>(null)

  async function handlePick(lat: number, lng: number) {
    setLoading(true)
    setPicked({ lat, lng, address: 'Getting address...' })
    const address = await reverseGeocode(lat, lng)
    setPicked({ lat, lng, address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
    setLoading(false)
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchErr('')
    const coords = await geocodeAddress(searchQuery.trim())
    if (coords) {
      setFlyTarget([coords.lat, coords.lng])
      await handlePick(coords.lat, coords.lng)
    } else {
      setSearchErr('Location not found. Try a different name.')
    }
    setSearching(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      fontFamily: "var(--font-inter), 'Inter', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: '#006064', color: '#fff', flexShrink: 0,
        padding: '14px 16px 10px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            cursor: 'pointer', fontSize: 16, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>←</button>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</p>
            <p style={{ fontSize: 11, margin: 0, opacity: 0.75 }}>Search or tap the map to pin a location</p>
          </div>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchErr('') }}
            placeholder="Search location, e.g. Karebbe..."
            style={{
              flex: 1, padding: '10px 14px', fontSize: 13,
              border: 'none', borderRadius: 10,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              outline: 'none', fontFamily: "var(--font-inter), 'Inter', sans-serif",
            }}
          />
          <button type="submit" disabled={searching} style={{
            padding: '10px 16px', background: 'rgba(255,255,255,0.2)',
            border: 'none', borderRadius: 10, color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
          }}>
            {searching ? '...' : 'Search'}
          </button>
        </form>
        {searchErr && (
          <p style={{ fontSize: 11, color: '#fca5a5', margin: 0 }}>{searchErr}</p>
        )}
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={SOROWAKO}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl
        >
          <TileLayer url={TILE_URL} attribution="© MapTiler © OpenStreetMap contributors" />
          <ClickHandler onPick={handlePick} />
          <FlyTo target={flyTarget} />
          {picked && <Marker position={[picked.lat, picked.lng]} icon={pinIcon()} />}
        </MapContainer>

        {!picked && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.6)', color: '#fff',
            padding: '10px 18px', borderRadius: 20, zIndex: 999,
            fontSize: 13, fontWeight: 600, pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            Tap anywhere to select
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        background: '#fff', flexShrink: 0,
        padding: '16px 20px 24px',
        boxShadow: '0 -2px 16px rgba(0,0,0,0.1)',
      }}>
        {picked ? (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 4px' }}>
              Selected location
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#006064', margin: '0 0 14px', lineHeight: 1.45 }}>
              {picked.address}
            </p>
            <button
              onClick={() => !loading && onConfirm(picked.address, { lat: picked.lat, lng: picked.lng })}
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading ? '#9ca3af' : '#006064',
                color: '#fff', border: 'none', borderRadius: 16,
                fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
              }}
            >
              {loading ? 'Getting address...' : 'Use this location'}
            </button>
          </>
        ) : (
          <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', margin: 0 }}>
            No location selected yet
          </p>
        )}
      </div>
    </div>
  )
}
