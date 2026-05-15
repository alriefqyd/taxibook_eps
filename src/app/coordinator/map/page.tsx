'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useDriverLocations } from '@/hooks/useDriverLocations'
import BottomNav from '@/components/BottomNav'

const DriverFleetMap = dynamic(() => import('@/components/map/DriverFleetMap'), { ssr: false })

const GPS_STALE_MS = 10 * 60 * 1000

function isGpsActive(ts: string | null): boolean {
  if (!ts) return false
  return Date.now() - new Date(ts).getTime() < GPS_STALE_MS
}

function trunc(s: string, n = 22) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function GpsIcon({ active }: { active: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={active ? '#059669' : '#9ca3af'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
    </svg>
  )
}

export default function CoordinatorMapPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const drivers = useDriverLocations()

  useEffect(() => {
    async function guard() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      setReady(true)
    }
    guard()
  }, [])

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F2', fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
      <p style={{ color: '#9ca3af' }}>Loading map...</p>
    </div>
  )

  const onlineCount  = drivers.filter(d => d.is_available && d.driver_id).length
  const offlineCount = drivers.filter(d => !d.is_available || !d.driver_id).length
  const gpsCount     = drivers.filter(d => isGpsActive(d.location_updated_at)).length

  // Sort: on_trip first → online → offline
  const sorted = [...drivers].sort((a, b) => {
    const rank = (d: typeof a) => d.is_on_trip ? 0 : (d.is_available && d.driver_id) ? 1 : 2
    return rank(a) - rank(b)
  })

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '12px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/coordinator/home')} style={{ width: 32, height: 32, borderRadius: '50%', background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.2px' }}>Fleet Map</h1>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#2D6A4F', background: '#D8F3DC', borderRadius: 6, padding: '1px 7px' }}>{onlineCount} online</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', background: '#FEE2E2', borderRadius: 6, padding: '1px 7px' }}>{offlineCount} offline</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', borderRadius: 6, padding: '1px 7px', display: 'flex', alignItems: 'center', gap: 3 }}>
                <GpsIcon active={true} />{gpsCount} GPS
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <DriverFleetMap style={{ borderRadius: 0 }} />

        {/* Driver board — collapsible floating panel at bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000,
          background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          transition: 'transform 0.25s ease',
          transform: panelOpen ? 'translateY(0)' : 'translateY(calc(100% - 36px))',
        }}>
          {/* Toggle bar */}
          <div
            onClick={() => setPanelOpen(o => !o)}
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: 0 }}>
              Driver Board · {drivers.length} unit{drivers.length !== 1 ? 's' : ''}
            </p>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{panelOpen ? '▼' : '▲'}</span>
          </div>

          {/* 5-column compact grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, padding: '0 12px 10px' }}>
            {sorted.map(d => {
              const isOnline = d.is_available && !!d.driver_id
              const hasGps   = isGpsActive(d.location_updated_at)
              const onTrip   = d.is_on_trip && d.active_booking
              return (
                <div key={d.id} style={{
                  borderTop: `3px solid ${isOnline ? d.color : '#D1D5DB'}`,
                  background: onTrip ? `${d.color}12` : '#F9FAFB',
                  borderRadius: '0 0 8px 8px',
                  padding: '5px 4px 4px',
                  textAlign: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 1 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: isOnline ? d.color : '#D1D5DB', flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#006064', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  </div>
                  <p style={{ fontSize: 8, color: '#6f7979', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trunc(d.driver_name || '—', 10)}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    <GpsIcon active={hasGps} />
                    {onTrip && <span style={{ fontSize: 7, fontWeight: 700, color: d.color }}>trip</span>}
                    {!isOnline && !onTrip && <span style={{ fontSize: 7, color: '#9ca3af' }}>off</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <BottomNav role="coordinator" />
    </div>
  )
}
