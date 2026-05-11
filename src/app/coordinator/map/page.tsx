'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useDriverLocations } from '@/hooks/useDriverLocations'
import BottomNav from '@/components/BottomNav'

const DriverFleetMap = dynamic(() => import('@/components/map/DriverFleetMap'), { ssr: false })

export default function CoordinatorMapPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [ready,  setReady]  = useState(false)
  const drivers  = useDriverLocations()

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

  const onlineCount = drivers.filter(d => d.latitude !== null).length

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/coordinator/home')} style={{ width: 32, height: 32, borderRadius: '50%', background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.2px' }}>Fleet Map</h1>
            <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>
              {onlineCount} of {drivers.length} driver{drivers.length !== 1 ? 's' : ''} sharing location
            </p>
          </div>
        </div>
      </div>

      {/* Map fills all remaining space */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <DriverFleetMap style={{ borderRadius: 0 }} />

        {/* Driver list — floating strip over map bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
          borderTop: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px 12px',
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>Drivers</p>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {drivers.map(d => {
              const online = d.latitude !== null
              return (
                <div key={d.id} style={{
                  flexShrink: 0, background: '#F5F5F2', borderRadius: 10,
                  padding: '7px 11px', borderLeft: `3px solid ${online ? d.color : '#D1D5DB'}`,
                  minWidth: 100,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: online ? '#22C55E' : '#D1D5DB', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#006064' }}>{d.name}</span>
                  </div>
                  <p style={{ fontSize: 10, color: '#6f7979', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 85 }}>
                    {d.driver_name || 'No driver'}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 600, margin: 0, color: online ? '#16A34A' : '#9ca3af' }}>
                    {online ? 'GPS active' : 'No signal'}
                  </p>
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
