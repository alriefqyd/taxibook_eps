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

        {/* Driver board — floating panel at bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000,
          background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(0,0,0,0.08)',
        }}>
          {/* Panel label */}
          <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: 0 }}>
              Driver Board · {drivers.length} unit{drivers.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Vertical scrollable list */}
          <div style={{ maxHeight: 210, overflowY: 'auto', padding: '0 12px 10px' }}>
            {sorted.map(d => {
              const isOnline = d.is_available && !!d.driver_id
              const hasGps   = isGpsActive(d.location_updated_at)
              const onTrip   = d.is_on_trip && d.active_booking

              return (
                <div key={d.id} style={{
                  display: 'flex', flexDirection: 'column',
                  borderLeft: `3px solid ${isOnline ? d.color : '#D1D5DB'}`,
                  background: onTrip ? `${d.color}08` : '#F9FAFB',
                  borderRadius: '0 8px 8px 0',
                  padding: '8px 10px',
                  marginBottom: 6,
                }}>
                  {/* Row 1: taxi info + status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#006064' }}>{d.name}</span>
                      {d.plate && <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>{d.plate}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: isOnline ? '#2D6A4F' : '#EF4444' }}>
                        {isOnline ? '● Online' : !d.driver_id ? '— No driver' : '○ Offline'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, color: hasGps ? '#059669' : '#9ca3af' }}>
                        <GpsIcon active={hasGps} />
                        {hasGps ? 'GPS' : 'No GPS'}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: driver name */}
                  <p style={{ fontSize: 10, color: '#6f7979', margin: '2px 0 0 14px' }}>
                    {d.driver_name || 'No driver assigned'}
                  </p>

                  {/* Row 3: route (only if on trip) */}
                  {onTrip && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 14, background: `${d.color}15`, borderRadius: 6, padding: '4px 8px' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill={d.color} stroke="none"><circle cx="12" cy="12" r="6"/></svg>
                      <span style={{ fontSize: 10, color: '#374151', fontWeight: 500, maxWidth: '35%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trunc(d.active_booking!.pickup)}
                      </span>
                      <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>→</span>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={d.color} strokeWidth="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                      <span style={{ fontSize: 10, color: '#374151', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trunc(d.active_booking!.destination)}
                      </span>
                      {d.active_booking!.status === 'waiting_trip' && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED', background: '#EDE9FE', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>Wait</span>
                      )}
                    </div>
                  )}
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
