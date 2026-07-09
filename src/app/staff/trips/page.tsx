'use client'

import React, { useEffect, useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import type { BookingDetail, User } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/types'
import StaffBookingSheet from '@/components/StaffBookingSheet'
import PageLoader from '@/components/PageLoader'

type StatusGroup = 'all' | 'active' | 'pending' | 'completed'

const STATUS_GROUPS: { key: StatusGroup; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'pending',   label: 'Pending' },
  { key: 'completed', label: 'Completed' },
]

const ACTIVE_STATUSES  = ['booked', 'on_trip', 'waiting_trip']
const PENDING_STATUSES = ['submitted', 'pending_coordinator_approval']

function matchesGroup(status: string, group: StatusGroup) {
  if (group === 'all')       return true
  if (group === 'active')    return ACTIVE_STATUSES.includes(status)
  if (group === 'pending')   return PENDING_STATUSES.includes(status)
  if (group === 'completed') return status === 'completed'
  return true
}

export default function StaffTripsPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,        setUser]        = useState<User | null>(null)
  const [bookings,    setBookings]    = useState<BookingDetail[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [selectedBk,  setSelectedBk]  = useState<BookingDetail | null>(null)

  const [statusGroup, setStatusGroup] = useState<StatusGroup>('all')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')

  async function loadData(userId: string) {
    const { data: bks } = await supabase
      .from('booking_details')
      .select('*')
      .eq('passenger_id', userId)
      .not('status', 'in', '("cancelled")')
      .order('scheduled_at', { ascending: false })
    setBookings(bks || [])
    setLoading(false)
  }

  async function refresh() {
    if (!user?.id || refreshing) return
    setRefreshing(true)
    await loadData(user.id)
    setRefreshing(false)
  }

  useEffect(() => {
    let userId = ''
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const au = session?.user
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      setUser(p)
      userId = au.id
      await loadData(au.id)
    }
    init()
    const channel = supabase.channel('staff-trips')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => { if (userId) loadData(userId) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, () => { if (userId) loadData(userId) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = bookings.filter(b => {
    if (!matchesGroup(b.status, statusGroup)) return false
    if (dateFrom) {
      const d = new Date(b.scheduled_at)
      if (d < new Date(dateFrom + 'T00:00:00')) return false
    }
    if (dateTo) {
      const d = new Date(b.scheduled_at)
      if (d > new Date(dateTo + 'T23:59:59')) return false
    }
    return true
  })

  const hasDateFilter = !!(dateFrom || dateTo)

  function clearFilters() {
    setStatusGroup('all')
    setDateFrom('')
    setDateTo('')
  }

  if (loading) return <PageLoader />

  return (
    <div style={{ minHeight:'100vh', background:'#F5F5F2', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Header ── */}
      <div style={{ background:'#ffffff', borderBottom:'1px solid rgba(0,0,0,0.06)', padding:'20px 16px 0' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:16 }}>
          <div>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#9ca3af', margin:'0 0 3px' }}>My trips</p>
            <h1 style={{ fontSize:22, fontWeight:800, color:'#006064', margin:0, letterSpacing:'-0.5px' }}>All trips</h1>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{ marginTop:4, width:36, height:36, borderRadius:'50%', border:'none', background:'rgba(0,96,100,0.08)', color:'#006064', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}
          >
            <span style={{ display:'flex', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </span>
          </button>
        </div>

        {/* ── Status chips ── */}
        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:14, scrollbarWidth:'none' as any }}>
          {STATUS_GROUPS.map(sg => {
            const active = statusGroup === sg.key
            const count  = sg.key === 'all'
              ? bookings.length
              : bookings.filter(b => matchesGroup(b.status, sg.key)).length
            return (
              <button
                key={sg.key}
                onClick={() => setStatusGroup(sg.key)}
                style={{
                  flexShrink: 0,
                  padding: '7px 14px',
                  borderRadius: 9999,
                  border: active ? 'none' : '1px solid rgba(0,0,0,0.1)',
                  background: active ? '#006064' : '#ffffff',
                  color: active ? '#ffffff' : '#6f7979',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {sg.label}
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.07)',
                  color: active ? '#ffffff' : '#6f7979',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}>
                  {count}
                </span>
              </button>
            )
          })}

        </div>

        {/* ── Date range — always visible ── */}
        <div style={{ display:'flex', gap:10, alignItems:'center', padding:'0 0 14px' }}>
          <div style={{ flex:1, background:'#F5F5F2', borderRadius:12, padding:'10px 12px' }}>
            <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#9ca3af', margin:'0 0 4px' }}>From</p>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ width:'100%', border:'none', outline:'none', fontSize:13, fontWeight:600, fontFamily:'inherit', background:'transparent', color:'#006064' }}
            />
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
          <div style={{ flex:1, background:'#F5F5F2', borderRadius:12, padding:'10px 12px' }}>
            <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#9ca3af', margin:'0 0 4px' }}>To</p>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ width:'100%', border:'none', outline:'none', fontSize:13, fontWeight:600, fontFamily:'inherit', background:'transparent', color:'#006064' }}
            />
          </div>
          {hasDateFilter && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ flexShrink:0, width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.06)', color:'#6f7979', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Active filter summary bar ── */}
      {(statusGroup !== 'all' || hasDateFilter) && (
        <div style={{ padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <p style={{ fontSize:11, color:'#6f7979', margin:0 }}>
            Showing <strong style={{ color:'#006064' }}>{filtered.length}</strong> result{filtered.length !== 1 ? 's' : ''}
            {statusGroup !== 'all' && <> · <span style={{ color:'#006064' }}>{STATUS_GROUPS.find(s => s.key === statusGroup)?.label}</span></>}
            {hasDateFilter && <> · date range</>}
          </p>
          <button
            onClick={clearFilters}
            style={{ fontSize:11, fontWeight:700, color:'#006064', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'inherit' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── List ── */}
      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.length === 0 ? (
          <div style={{ background:'#ffffff', borderRadius:16, padding:'32px 24px', border:'1px solid rgba(0,0,0,0.08)', textAlign:'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin:'0 auto 10px', display:'block' }}>
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
            <p style={{ fontSize:13, fontWeight:600, color:'#9ca3af', margin:'0 0 4px' }}>No trips found</p>
            <p style={{ fontSize:11, color:'#c4c9c9', margin:0 }}>Try changing your filter</p>
          </div>
        ) : (
          filtered.map(b => {
            const sc     = STATUS_COLORS[b.status]
            const isPast = b.status === 'completed' || new Date(b.scheduled_at) < new Date()
            return (
              <div
                key={b.id}
                onClick={() => setSelectedBk(b)}
                style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '14px',
                  border: '1px solid rgba(0,0,0,0.07)',
                  borderLeft: `3px solid ${isPast ? '#D1D5DB' : '#006064'}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  opacity: isPast ? 0.75 : 1,
                }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <p style={{ fontSize:13, fontWeight:700, margin:'0 0 3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.destination}</p>
                    <p style={{ fontSize:11, color:'#6f7979', margin:0 }}>
                      {new Date(b.scheduled_at).toLocaleString('id-ID', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:9999, background:sc.bg, color:sc.text, flexShrink:0, marginTop:1 }}>
                    {STATUS_LABELS[b.status]}
                  </span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, alignItems:'center', marginTop:10, paddingTop:10, borderTop:'1px solid rgba(0,0,0,0.06)' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:9999, background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
                    {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes} min`}
                  </span>
                  {b.taxi_name ? (
                    <span style={{ fontSize:10, color:'#6f7979', display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:b.taxi_color || '#888', display:'inline-block' }} />
                      {b.taxi_name} · {b.driver_name}
                    </span>
                  ) : (
                    <span style={{ fontSize:10, color:'#9ca3af', fontStyle:'italic' }}>
                      {b.status === 'pending_coordinator_approval' ? 'Awaiting approval' : 'Unassigned'}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {selectedBk && (
        <StaffBookingSheet
          booking={selectedBk}
          currentUserId={user?.id}
          onClose={() => setSelectedBk(null)}
          onCancelled={() => { if (user?.id) loadData(user.id) }}
        />
      )}
    </div>
  )
}
