'use client'
import { useState, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { reverseGeocode, geocodeAddress } from '@/lib/geocode'
import type { Coords } from '@/lib/geocode'
import { createClient } from '@/lib/supabase/client'
import type { RegisteredLocation } from '@/types'
import { DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_URL } from './tileConfig'

const TILE_URL  = DEFAULT_TILE_URL
const SOROWAKO: [number, number] = [-2.5397, 121.3588]

function pinIcon() {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;background:#006064;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:13px">📍</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })
}

function savedLocIcon() {
  return L.divIcon({
    html: `<div style="width:30px;height:30px;background:#D97706;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:800">★</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
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
  autoGps?: boolean
}

export default function LocationPickerMap({ title, onConfirm, onClose, autoGps }: Props) {
  const supabase = createClient()

  const [picked,      setPicked]      = useState<(Coords & { address: string }) | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching,   setSearching]   = useState(false)
  const [searchErr,   setSearchErr]   = useState('')
  const [flyTarget,   setFlyTarget]   = useState<[number, number] | null>(null)
  const [savedLocs,   setSavedLocs]   = useState<RegisteredLocation[]>([])
  const [dropdown,    setDropdown]    = useState<RegisteredLocation[]>([])
  // Track visual viewport so the modal resizes when the mobile keyboard appears
  const [vpStyle,     setVpStyle]     = useState<React.CSSProperties>({})

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function update() {
      setVpStyle({ height: vv!.height, top: vv!.offsetTop })
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    supabase
      .from('registered_locations')
      .select('id, name, address, lat, lng, created_by, created_at, updated_at')
      .order('name')
      .then(({ data }) => setSavedLocs(data || []))
  }, [])

  useEffect(() => {
    if (!autoGps || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setFlyTarget([lat, lng])
        handlePick(lat, lng)
      },
      () => {}, // silently ignore — map stays at SOROWAKO default
      { timeout: 8000, maximumAge: 30000 },
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) { setDropdown([]); return }
    setDropdown(
      savedLocs
        .filter(l => l.name.toLowerCase().includes(q) || (l.address || '').toLowerCase().includes(q))
        .slice(0, 6)
    )
  }, [searchQuery, savedLocs])

  function selectSavedLoc(loc: RegisteredLocation) {
    setFlyTarget([loc.lat, loc.lng])
    setPicked({ lat: loc.lat, lng: loc.lng, address: loc.name })
    setSearchQuery('')
    setDropdown([])
  }

  async function handlePick(lat: number, lng: number) {
    setLoading(true)
    setDropdown([])
    setPicked({ lat, lng, address: 'Getting address...' })
    const address = await reverseGeocode(lat, lng)
    setPicked({ lat, lng, address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
    setLoading(false)
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!searchQuery.trim()) return
    // If a saved location matches exactly, select it directly
    const exact = savedLocs.find(l => l.name.toLowerCase() === searchQuery.trim().toLowerCase())
    if (exact) { selectSavedLoc(exact); return }
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
      ...vpStyle, // shrinks to visual viewport height when keyboard is open
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
            <p style={{ fontSize: 11, margin: 0, opacity: 0.75 }}>Search a saved place or tap the map to pin</p>
          </div>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchErr('') }}
            placeholder="Search saved places or address..."
            style={{
              flex: 1, padding: '10px 14px', fontSize: 16,
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
        {searchErr && <p style={{ fontSize: 11, color: '#fca5a5', margin: 0 }}>{searchErr}</p>}

        {/* Saved locations dropdown */}
        {dropdown.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}>
            {dropdown.map((loc, i) => (
              <button
                key={loc.id}
                onClick={() => selectSavedLoc(loc)}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: i < dropdown.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <span style={{ fontSize: 16, color: '#D97706', flexShrink: 0 }}>★</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1c1b', margin: 0 }}>{loc.name}</p>
                  {loc.address && <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{loc.address}</p>}
                </div>
              </button>
            ))}
          </div>
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
          <TileLayer url={TILE_URL} attribution={DEFAULT_TILE_ATTRIBUTION} />
          <ClickHandler onPick={handlePick} />
          <FlyTo target={flyTarget} />
          {picked && <Marker position={[picked.lat, picked.lng]} icon={pinIcon()} />}
          {savedLocs.map(loc => (
            <Marker
              key={loc.id}
              position={[loc.lat, loc.lng]}
              icon={savedLocIcon()}
              eventHandlers={{ click: () => selectSavedLoc(loc) }}
            >
              <Tooltip direction="top" offset={[0, -18]} opacity={0.92}>{loc.name}</Tooltip>
            </Marker>
          ))}
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

        {/* Legend */}
        {savedLocs.length > 0 && (
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 999,
            background: 'rgba(255,255,255,0.93)', borderRadius: 10,
            padding: '7px 11px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#D97706' }}>★</span>
              <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>Saved place</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>📍</span>
              <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>Custom pin</span>
            </div>
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
