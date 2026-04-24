'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  format, startOfWeek, addDays, addMonths,
  isSameDay, isSameMonth, startOfMonth, endOfMonth,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { BookingDetail, User } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/types'

type ViewMode = 'day' | 'week' | 'month'

const HOUR_START = 7
const HOUR_END   = 19
const HOUR_W     = 80   // px per hour (day view)
const DAY_W      = 100  // px per day  (week view)
const ROW_H      = 52   // px per taxi row

export default function StaffHomePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,     setUser]     = useState<User | null>(null)
  const [bookings, setBookings] = useState<BookingDetail[]>([])
  const [taxis,    setTaxis]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [bkPage,      setBkPage]      = useState(0)
  const [hasMoreBk,   setHasMoreBk]   = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [view,         setView]         = useState<ViewMode>('day')
  const [cursor,       setCursor]       = useState(new Date())
  const [selectedBk,   setSelectedBk]   = useState<any | null>(null)
  const dayScrollRef  = useRef<HTMLDivElement>(null)
  const weekScrollRef = useRef<HTMLDivElement>(null)

  async function loadData(userId: string) {
    const [{ data: bks }, { data: txs }] = await Promise.all([
      supabase
        .from('booking_details')
        .select('*')
        .eq('passenger_id', userId)
        .not('status', 'in', '("cancelled")')
        .order('scheduled_at', { ascending: false })
        .range(0, 9),
      supabase
        .from('taxis')
        .select('*, users!driver_id(name)')
        .eq('is_active', true)
        .order('name'),
    ])
    const bkList = bks || []
    setBookings(bkList)
    setHasMoreBk(bkList.length === 10)
    setBkPage(0)
    setTaxis((txs || []).map((t: any) => ({
      ...t,
      driver_name: t.users?.name || 'No driver',
    })))
  }

  // Separate reload for taxis only (availability changes)
  async function reloadTaxis() {
    const { data: txs } = await supabase
      .from('taxis')
      .select('*, users!driver_id(name)')
      .eq('is_active', true)
      .order('name')
    setTaxis((txs || []).map((t: any) => ({
      ...t,
      driver_name: t.users?.name || 'No driver',
    })))
  }

  useEffect(() => {
    let userId = ''
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      setUser(p)
      userId = au.id
      await loadData(au.id)
      setLoading(false)
    }
    init()
    const ch = supabase.channel('staff-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' },
        () => { if (userId) loadData(userId) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' },
        () => { if (userId) loadData(userId) })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Auto scroll to now
  useEffect(() => {
    if (loading) return
    const offset = (new Date().getHours() + new Date().getMinutes() / 60 - HOUR_START) * HOUR_W - 60
    if (dayScrollRef.current)  dayScrollRef.current.scrollLeft  = Math.max(0, offset)
    const today = new Date()
    const mon   = startOfWeek(cursor, { weekStartsOn: 1 })
    const dayIdx = Math.round((today.getTime() - mon.getTime()) / 86400000)
    if (weekScrollRef.current && dayIdx >= 0 && dayIdx < 7) {
      weekScrollRef.current.scrollLeft = Math.max(0, dayIdx * DAY_W - 40)
    }
  }, [loading, view])

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#F5F5F2', gap: 16, fontFamily:"'Inter',sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: '4px solid rgba(0,96,100,0.15)', borderTop: '4px solid #006064', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const today        = new Date()
  const ACTIVE_STATUSES = ['booked','on_trip','waiting_trip']
  const activeBookings  = bookings.filter(b => ACTIVE_STATUSES.includes(b.status))
  const myBookings      = bookings.filter(b => {
    if (!dateFrom && !dateTo) return true
    const d = new Date(b.scheduled_at)
    if (dateFrom && d < new Date(dateFrom + 'T00:00:00')) return false
    if (dateTo   && d > new Date(dateTo   + 'T23:59:59')) return false
    return true
  })
  // Stats show today's fleet activity
  const todayBookings  = activeBookings.filter(b => isSameDay(new Date(b.scheduled_at), today))
  const pendingCount   = activeBookings.filter(b => b.status === 'pending_driver_approval').length

  function navigate(dir: number) {
    setCursor(prev => {
      const d = new Date(prev)
      if (view === 'day')   d.setDate(d.getDate() + dir)
      if (view === 'week')  d.setDate(d.getDate() + dir * 7)
      if (view === 'month') return addMonths(prev, dir)
      return d
    })
  }

  function getNavLabel() {
    if (view === 'day')   return format(cursor, 'EEEE, d MMMM yyyy', { locale: idLocale })
    if (view === 'week') {
      const mon = startOfWeek(cursor, { weekStartsOn: 1 })
      return `${format(mon,'d MMM')} – ${format(addDays(mon,6),'d MMM yyyy')}`
    }
    return format(cursor, 'MMMM yyyy', { locale: idLocale })
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight:'100vh', background:'#F5F5F2' }}>

      {/* ── TopAppBar ── */}
      <header style={{
        background: '#F5F5F2', borderBottom: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 1px 4px rgba(0,96,100,0.06)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 20px', height: 64 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:'#006064', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🚗</div>
            <div>
              <p style={{ fontSize:16, fontWeight:800, color:'#006064', margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:'-0.3px', lineHeight:1 }}>TaxiBook</p>
              <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#344500', display:'inline-block' }} />
                <span style={{ fontSize:10, color:'#6f7979', fontWeight:500 }}>Staff</span>
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <Link href="/staff/notifications" style={{ textDecoration:'none', width:40, height:40, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></Link>
            <div style={{ position: 'relative' }}>
              <div onClick={() => setMenuOpen(o => !o)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#006064', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '2px solid rgba(0,96,100,0.3)' }}>
                {user?.name?.split(' ').map((n: string) => n[0]).slice(0,2).join('') || 'S'}
              </div>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{ position: 'absolute', top: 44, right: 0, background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 99, minWidth: 220, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#F5F5F2' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: '#1a1c1b' }}>{user?.name}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Staff</p>
                    </div>
                    <button onClick={() => { setMenuOpen(false); router.push('/staff/profile') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#006064' }}>View profile</p>
                    </button>
                    <button onClick={async () => { setMenuOpen(false); await supabase.auth.signOut(); router.push('/login') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ba1a1a" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#ba1a1a' }}>Sign out</p>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Greeting + Stats ── */}
      <div style={{ background:'#ffffff', borderBottom:'1px solid rgba(0,0,0,0.06)', padding:'20px 20px 0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#9ca3af', margin:'0 0 3px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Good {getGreeting()}</p>
            <h1 style={{ fontSize:24, fontWeight:800, color:'#006064', margin:'0 0 3px', letterSpacing:'-0.5px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {user?.name?.split(' ')[0]} 👋
            </h1>
            <p style={{ fontSize:13, color:'#6f7979', margin:0 }}>
              {format(today, 'EEEE, d MMMM yyyy', { locale: idLocale })}
            </p>
          </div>
        </div>

        {/* Stat cards — matching reference design */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
          <div style={{ background:'rgba(0,96,100,0.06)', borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#006064', margin:'0 0 4px', opacity:0.75 }}>Active</p>
            <p style={{ fontSize:26, fontWeight:800, margin:0, color:'#006064', letterSpacing:'-1px', lineHeight:1 }}>{todayBookings.length}</p>
          </div>
          <div style={{ background:'#fff8e6', borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#7e5700', margin:'0 0 4px', opacity:0.75 }}>Pending</p>
            <p style={{ fontSize:26, fontWeight:800, margin:0, color:'#7e5700', letterSpacing:'-1px', lineHeight:1 }}>{pendingCount}</p>
          </div>
          <div style={{ background:'#f0fce8', borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#344500', margin:'0 0 4px', opacity:0.75 }}>My trips</p>
            <p style={{ fontSize:26, fontWeight:800, margin:0, color:'#344500', letterSpacing:'-1px', lineHeight:1 }}>{myBookings.length}</p>
          </div>
        </div>

        {/* New booking CTA — amber pill like reference */}
        <Link href="/staff/book" style={{ textDecoration:'none', display:'block', marginBottom:16 }}>
          <button style={{ width:'100%', padding:'14px', background:'#feb300', color:'#3d2c00', border:'none', borderRadius:9999, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <span style={{ fontSize:18 }}>+</span> New booking
          </button>
        </Link>
      </div>

      {/* ── View tabs + nav ── */}
      <div style={{ background:'#ffffff', borderBottom:'1px solid rgba(0,0,0,0.08)', padding:'12px 16px' }}>
        {/* Tabs */}
        <div style={{ display:'flex', background:'#F5F5F2', borderRadius:10, padding:'3px', gap:'2px', marginBottom:'10px' }}>
          {(['day','week','month'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => { setView(v); setCursor(new Date()) }} style={{
              flex:1, padding:'6px 4px', fontSize:'12px', fontWeight:600,
              border:'none', borderRadius:'999px', cursor:'pointer',
              background: view === v ? '#ffffff' : 'transparent',
              color: view === v ? '#006064' : '#9ca3af',
              textTransform:'capitalize',
            }}>
              {v}
            </button>
          ))}
        </div>

        {/* Nav row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => navigate(-1)} style={navBtn}>←</button>
          <span style={{ fontSize:'13px', fontWeight:700, color:'#006064', textAlign:'center', flex:1, padding:'0 8px' }}>
            {getNavLabel()}
          </span>
          <button onClick={() => navigate(1)} style={navBtn}>→</button>
        </div>
      </div>

      {/* ── Views ── */}
      {view === 'day'   && <DayGantt   bookings={activeBookings} taxis={taxis} cursor={cursor} scrollRef={dayScrollRef} />}
      {view === 'week'  && <WeekView   bookings={activeBookings} cursor={cursor} />}
      {view === 'month' && <MonthView  bookings={bookings} cursor={cursor} onDayClick={d => { setCursor(d); setView('day') }} />}

      {/* ── My bookings list ── */}
      <div style={{ padding: '16px 16px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: 0 }}>
            My bookings {myBookings.length > 0 && `· ${myBookings.length}`}
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '5px 10px' }}>
            <span style={{ fontSize: 11, flexShrink: 0 }}>📅</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ width: 120, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent', color: '#006064' }} />
            <span style={{ fontSize: 10, color: '#9ca3af' }}>→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ width: 120, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent', color: '#006064' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }}
                style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, border: '1px solid rgba(0,0,0,0.08)', background: '#F5F5F2', color: '#6f7979', cursor: 'pointer', fontFamily: 'inherit' }}>
                ✕
              </button>
            )}
          </div>
        </div>
        {myBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af', background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: '13px', margin: 0 }}>No bookings yet</p>
          </div>
        ) : (
          <>
          {myBookings.map(b => {
            const sc = (STATUS_COLORS as any)[b.status]
            return (
              <div
                key={b.id}
                onClick={() => setSelectedBk(b)}
                style={{ background: '#ffffff', borderRadius: 16, padding: '16px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,96,100,0.06)', border: '1px solid rgba(0,0,0,0.05)', borderLeft: '3px solid #006064', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.destination}
                    </p>
                    <p style={{ fontSize: '12px', color: '#6f7979', margin: 0 }}>
                      {new Date(b.scheduled_at).toLocaleString('id-ID', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                  {sc && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 9999, flexShrink: 0, background: sc.bg, color: sc.text }}>{(STATUS_LABELS as any)[b.status]}</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
                    {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}min`}
                  </span>
                  {b.taxi_name
                    ? <span style={{ fontSize: '11px', color: '#6f7979', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.taxi_color || '#888', display: 'inline-block' }} />
                        {b.taxi_name} · {b.driver_name}
                      </span>
                    : <span style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
                        {b.status === 'pending_coordinator_approval' ? 'Awaiting approval' : 'Awaiting driver'}
                      </span>
                  }
                </div>
              </div>
            )
          })}
          {hasMoreBk && (
            <button
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true)
                const nextPage = bkPage + 1
                const { data: { user: au } } = await supabase.auth.getUser()
                if (au) {
                  const { data } = await supabase
                    .from('bookings')
                    .select('*, taxis(name,color), users!passenger_id(name)')
                    .eq('passenger_id', au.id)
                    .not('status', 'in', '("cancelled")')
                    .order('scheduled_at', { ascending: false })
                    .range(nextPage * 10, nextPage * 10 + 9)
                  if (data) {
                    setBookings(prev => [...prev, ...data])
                    setHasMoreBk(data.length === 10)
                    setBkPage(nextPage)
                  }
                }
                setLoadingMore(false)
              }}
              style={{ width: '100%', padding: '13px', marginTop: 10, background: '#ffffff', boxShadow: '0 2px 8px rgba(0,96,100,0.06)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 700, color: loadingMore ? '#9ca3af' : '#006064', cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
          </>
        )}
      </div>

      {/* ── Booking detail + cancel sheet ── */}
      {selectedBk && (
        <StaffBookingSheet
          booking={selectedBk}
          onClose={() => setSelectedBk(null)}
          onCancelled={() => { if (user) loadData(user.id) }}
        />
      )}
    </div>
  )
}

// ── DAY GANTT ───────────────────────────────────────────────
function DayGantt({ bookings, taxis, cursor, scrollRef }: {
  bookings: BookingDetail[]
  taxis: any[]
  cursor: Date
  scrollRef: React.RefObject<HTMLDivElement>
}) {
  const today    = new Date()
  const dayBks   = bookings.filter(b => isSameDay(new Date(b.scheduled_at), cursor))
  const hours    = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START)
  const totalW   = hours.length * HOUR_W

  return (
    <div style={{ paddingBottom: 20 }}>
      <div style={{ padding:'10px 16px 6px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:'11px', color:'#6B7C8F' }}>← scroll to see full day →</span>
        <span style={{ fontSize:'11px', color:'#6B7C8F' }}>{dayBks.length} booking{dayBks.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ overflowX:'auto' }} ref={scrollRef}>
        <div style={{ minWidth: totalW + 90 }}>

          {/* Time header */}
          <div style={{ display:'flex', marginLeft:90, borderBottom:'1px solid rgba(0,0,0,0.08)', background:'#ffffff', position:'sticky', top:0, zIndex:20 }}>
            {hours.map(h => (
              <div key={h} style={{ width:HOUR_W, flexShrink:0, padding:'5px 4px', borderLeft:'1px solid rgba(0,0,0,0.08)' }}>
                <span style={{ fontSize:'10px', fontWeight:700, color:'#6B7C8F' }}>
                  {String(h).padStart(2,'0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {taxis.map((taxi, idx) => (
            <GanttRow
              key={taxi.id}
              taxi={taxi}
              idx={idx}
              bookings={dayBks.filter(b => b.taxi_id === taxi.id)}
              renderBlock={(b) => {
                const dt      = new Date(b.scheduled_at)
                const startH  = dt.getHours() + dt.getMinutes() / 60
                const left    = (startH - HOUR_START) * HOUR_W
                const durH    = b.trip_type === 'WAITING'
                  ? Math.min(b.wait_minutes / 60 + 2, HOUR_END - startH)
                  : Math.min(2, HOUR_END - startH)
                const width   = Math.max(durH * HOUR_W - 4, 44)
                const isPending = b.status.includes('pending')
                return (
                  <div key={b.id} style={{
                    position:'absolute', left:left+2, top:5,
                    width, height:ROW_H - 10,
                    background: taxi.color + '22',
                    border:`1.5px ${isPending?'dashed':'solid'} ${taxi.color}`,
                    borderRadius:'7px', padding:'4px 6px', overflow:'hidden', zIndex:5,
                  }}>
                    <p style={{ fontSize:'10px', fontWeight:800, color:taxi.color, margin:'0 0 1px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {b.destination}
                    </p>
                    <p style={{ fontSize:'9px', color:taxi.color, opacity:0.8, margin:0, whiteSpace:'nowrap' }}>
                      {format(dt,'HH:mm')} · {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}m`}
                    </p>
                  </div>
                )
              }}
              nowLine={
                isSameDay(cursor, today) ? (
                  <div style={{
                    position:'absolute',
                    left:`${(today.getHours() + today.getMinutes()/60 - HOUR_START)*HOUR_W}px`,
                    top:0, bottom:0, width:2, background:'#EF4444', zIndex:8,
                  }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#EF4444', position:'absolute', top:-3, left:-2 }} />
                  </div>
                ) : null
              }
              gridLines={hours.map(h => (
                <div key={h} style={{ position:'absolute', left:(h-HOUR_START)*HOUR_W, top:0, bottom:0, width:1, background:'rgba(0,0,0,0.08)' }} />
              ))}
              totalW={totalW}
            />
          ))}
          <GanttLegend />
        </div>
      </div>
    </div>
  )
}

// ── WEEK GANTT ──────────────────────────────────────────────
function WeekGantt({ bookings, taxis, cursor, scrollRef }: {
  bookings: BookingDetail[]
  taxis: any[]
  cursor: Date
  scrollRef: React.RefObject<HTMLDivElement>
}) {
  const today    = new Date()
  const monday   = startOfWeek(cursor, { weekStartsOn: 1 })
  const days     = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const totalW   = days.length * DAY_W

  return (
    <div style={{ paddingBottom:20 }}>
      <div style={{ padding:'10px 16px 6px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:'11px', color:'#6B7C8F' }}>← scroll to see full week →</span>
        <span style={{ fontSize:'11px', color:'#6B7C8F' }}>
          {bookings.filter(b => days.some(d => isSameDay(new Date(b.scheduled_at), d))).length} bookings this week
        </span>
      </div>
      <div style={{ overflowX:'auto' }} ref={scrollRef}>
        <div style={{ minWidth: totalW + 90 }}>

          {/* Day header */}
          <div style={{ display:'flex', marginLeft:90, borderBottom:'1px solid rgba(0,0,0,0.08)', background:'#ffffff', position:'sticky', top:0, zIndex:20 }}>
            {days.map(d => {
              const isToday   = isSameDay(d, today)
              const dayBkCount = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d)).length
              return (
                <div key={d.toISOString()} style={{
                  width:DAY_W, flexShrink:0, padding:'6px 4px',
                  borderLeft:'1px solid rgba(0,0,0,0.08)', textAlign:'center',
                  background: isToday ? '#006064' : 'transparent',
                }}>
                  <p style={{ fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', color: isToday ? 'rgba(255,255,255,0.6)' : '#9ca3af', margin:'0 0 2px' }}>
                    {format(d,'EEE',{locale:idLocale})}
                  </p>
                  <p style={{ fontSize:'15px', fontWeight:700, color: isToday ? '#fff' : '#006064', margin:'0 0 2px', lineHeight:1 }}>
                    {format(d,'d')}
                  </p>
                  {dayBkCount > 0 && (
                    <p style={{ fontSize:'9px', color: isToday ? 'rgba(255,255,255,0.6)' : '#9ca3af', margin:0 }}>
                      {dayBkCount} trip{dayBkCount > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Rows */}
          {taxis.map((taxi, idx) => {
            const weekBks = bookings.filter(b =>
              days.some(d => isSameDay(new Date(b.scheduled_at), d)) &&
              b.taxi_id === taxi.id
            )
            return (
              <GanttRow
                key={taxi.id}
                taxi={taxi}
                idx={idx}
                bookings={weekBks}
                renderBlock={(b) => {
                  const dt      = new Date(b.scheduled_at)
                  const dayIdx  = days.findIndex(d => isSameDay(dt, d))
                  if (dayIdx < 0) return null
                  const left    = dayIdx * DAY_W + 2
                  const isPending = b.status.includes('pending')
                  return (
                    <div key={b.id} style={{
                      position:'absolute', left, top:5,
                      width: DAY_W - 6, height: ROW_H - 10,
                      background: taxi.color + '22',
                      border:`1.5px ${isPending?'dashed':'solid'} ${taxi.color}`,
                      borderRadius:'7px', padding:'4px 6px', overflow:'hidden', zIndex:5,
                    }}>
                      <p style={{ fontSize:'10px', fontWeight:800, color:taxi.color, margin:'0 0 1px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {b.destination}
                      </p>
                      <p style={{ fontSize:'9px', color:taxi.color, opacity:0.8, margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {format(dt,'HH:mm')} · {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}m`}
                      </p>
                    </div>
                  )
                }}
                nowLine={
                  days.some(d => isSameDay(d, today)) ? (
                    <div style={{
                      position:'absolute',
                      left: `${days.findIndex(d => isSameDay(d, today)) * DAY_W + (today.getHours() + today.getMinutes()/60)/24 * DAY_W}px`,
                      top:0, bottom:0, width:2, background:'#EF4444', zIndex:8,
                    }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:'#EF4444', position:'absolute', top:-3, left:-2 }} />
                    </div>
                  ) : null
                }
                gridLines={days.map((d, i) => (
                  <div key={d.toISOString()} style={{ position:'absolute', left:i*DAY_W, top:0, bottom:0, width:1, background: isSameDay(d, today) ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.08)' }} />
                ))}
                totalW={totalW}
              />
            )
          })}
          <GanttLegend />
        </div>
      </div>
    </div>
  )
}

// ── Shared Gantt row ────────────────────────────────────────
function GanttRow({ taxi, idx, bookings, renderBlock, nowLine, gridLines, totalW }: {
  taxi: any
  idx: number
  bookings: BookingDetail[]
  renderBlock: (b: BookingDetail) => React.ReactNode
  nowLine: React.ReactNode
  gridLines: React.ReactNode
  totalW: number
}) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid rgba(0,0,0,0.08)', background: idx % 2 === 0 ? '#fff' : '#f9f9f6' }}>
      {/* Label */}
      <div style={{
        width:90, flexShrink:0, padding:'8px 10px',
        borderRight:'1px solid rgba(0,0,0,0.08)',
        display:'flex', flexDirection:'column', justifyContent:'center', gap:2,
        position:'sticky', left:0,
        background: idx % 2 === 0 ? '#fff' : '#f9f9f6',
        zIndex:10,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background: taxi.is_available ? taxi.color : '#D1D5DB', flexShrink:0 }} />
          <span style={{ fontSize:'11px', fontWeight:800, color: taxi.is_available ? '#006064' : '#9ca3af' }}>
            {taxi.name}
          </span>
        </div>
        <span style={{ fontSize:'9px', color:'#6B7C8F', paddingLeft:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {taxi.is_available ? taxi.driver_name : 'Unavailable'}
        </span>
      </div>

      {/* Timeline */}
      <div style={{ flex:1, position:'relative', height:ROW_H, minWidth:totalW }}>
        {gridLines}
        {!taxi.is_available && (
          <div style={{ position:'absolute', inset:0, background:'repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(0,0,0,0.03) 5px,rgba(0,0,0,0.03) 10px)', zIndex:1 }} />
        )}
        {nowLine}
        {bookings.map(b => renderBlock(b))}
        {bookings.length === 0 && taxi.is_available && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', paddingLeft:12 }}>
            <span style={{ fontSize:'10px', color:'#D1D5DB', fontWeight:600 }}>Free</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MONTH VIEW ──────────────────────────────────────────────
function MonthView({ bookings, cursor, onDayClick }: {
  bookings: BookingDetail[]
  cursor: Date
  onDayClick: (d: Date) => void
}) {
  const today  = new Date()
  const start  = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const days   = Array.from({ length: 42 }, (_, i) => addDays(start, i))

  return (
    <div style={{ padding:'14px 16px 20px' }}>
      <div style={{ background:'#ffffff', borderRadius:'14px', border:'1px solid rgba(0,0,0,0.08)', overflow:'hidden' }}>
        {/* Day name headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid rgba(0,0,0,0.08)' }}>
          {['M','T','W','T','F','S','S'].map((n,i) => (
            <div key={i} style={{ textAlign:'center', padding:'7px 0', fontSize:'10px', fontWeight:700, color:'#6B7C8F', textTransform:'uppercase' }}>
              {n}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {days.map(d => {
            const inMonth = isSameMonth(d, cursor)
            const isToday = isSameDay(d, today)
            const bks     = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            return (
              <div
                key={d.toISOString()}
                onClick={() => onDayClick(d)}
                style={{ minHeight:52, borderRight:'1px solid rgba(0,0,0,0.08)', borderBottom:'1px solid rgba(0,0,0,0.08)', padding:'4px', opacity: inMonth ? 1 : 0.3, cursor:'pointer', background: isToday ? 'rgba(0,96,100,0.06)' : 'transparent' }}
              >
                <div style={{ width:20, height:20, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:3, background: isToday ? '#006064' : 'transparent', fontSize:'11px', fontWeight:700, color: isToday ? '#fff' : '#006064' }}>
                  {format(d,'d')}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>
                  {bks.slice(0,3).map(b => (
                    <span key={b.id} style={{ width:6, height:6, borderRadius:'50%', background: b.taxi_color || '#9ca3af', opacity: b.status.includes('pending') ? 0.4 : 1, display:'inline-block' }} />
                  ))}
                  {bks.length > 3 && <span style={{ fontSize:'8px', color:'#6B7C8F', fontWeight:700 }}>+{bks.length-3}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display:'flex', gap:'14px', marginTop:'10px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:16, height:2, background:'#EF4444' }} />
          <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Tap day → Day view</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#9ca3af', opacity:0.4 }} />
          <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Pending</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#2563EB' }} />
          <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Confirmed (taxi color)</span>
        </div>
      </div>
    </div>
  )
}

// ── Gantt legend ────────────────────────────────────────────
function GanttLegend() {
  return (
    <div style={{ padding:'8px 16px', background:'#ffffff', borderTop:'1px solid rgba(0,0,0,0.08)', display:'flex', gap:'14px', flexWrap:'wrap' }}>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ display:'inline-block', width:16, height:2, background:'#EF4444' }} />
        <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Now</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ display:'inline-block', width:20, height:10, border:'1.5px dashed #9ca3af', borderRadius:2 }} />
        <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Pending</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ display:'inline-block', width:20, height:10, border:'1.5px solid #9ca3af', borderRadius:2 }} />
        <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Confirmed</span>
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────
function StatCard({ label, value, color = '#006064', bg = 'rgba(0,0,0,0.04)' }: {
  label: string; value: number; color?: string; bg?: string
}) {
  return (
    <div style={{ background:bg, borderRadius:'10px', padding:'12px' }}>
      <p style={{ fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: color === '#006064' ? '#9ca3af' : color, margin:'0 0 4px' }}>{label}</p>
      <p style={{ fontSize:'24px', fontWeight:700, margin:0, letterSpacing:'-0.5px', color }}>{value}</p>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('')
  return (
    <div style={{ width:40, height:40, borderRadius:'50%', background:'#DBEAFE', color:'#1E3A5F', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:700, flexShrink:0 }}>
      {initials}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

const navBtn: React.CSSProperties = {
  width:30, height:30, borderRadius:'50%',
  background:'#ffffff', border:'1px solid rgba(0,0,0,0.08)',
  cursor:'pointer', fontSize:'14px', color:'#8A9BB0',
  display:'flex', alignItems:'center', justifyContent:'center',
  flexShrink:0,
}

// ── WEEK VIEW (original grid) ───────────────────────────────
function WeekView({ bookings, cursor }: { bookings: BookingDetail[]; cursor: Date }) {
  const today  = new Date()
  const monday = startOfWeek(cursor, { weekStartsOn: 1 })
  const days   = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <div style={{ padding:'14px 16px 20px' }}>
      <div style={{ background:'#ffffff', borderRadius:'14px', border:'1px solid rgba(0,0,0,0.08)', overflow:'hidden' }}>

        {/* Day headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid rgba(0,0,0,0.08)' }}>
          {days.map(d => {
            const isToday = isSameDay(d, today)
            return (
              <div key={d.toISOString()} style={{ textAlign:'center', padding:'8px 2px', background: isToday ? '#006064' : 'transparent', borderRight:'1px solid rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize:'8px', fontWeight:700, color: isToday ? 'rgba(255,255,255,0.6)' : '#9ca3af', margin:'0 0 2px', textTransform:'uppercase' }}>
                  {format(d,'EEE',{locale:idLocale})}
                </p>
                <p style={{ fontSize:'15px', fontWeight:700, color: isToday ? '#fff' : '#006064', margin:0 }}>
                  {format(d,'d')}
                </p>
              </div>
            )
          })}
        </div>

        {/* Day columns */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', minHeight:120 }}>
          {days.map(d => {
            const dayBks = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            return (
              <div key={d.toISOString()} style={{ borderRight:'1px solid rgba(0,0,0,0.08)', padding:'4px 2px', minHeight:120 }}>
                {dayBks.map(b => {
                  const color     = b.taxi_color || '#3f4949'
                  const isPending = b.status.includes('pending')
                  return (
                    <div key={b.id} style={{
                      background: color + '20',
                      border:`1px ${isPending?'dashed':'solid'} ${color}`,
                      borderRadius:3, padding:'2px 4px', marginBottom:2,
                      fontSize:'9px', fontWeight:700, color,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    }}>
                      {format(new Date(b.scheduled_at),'HH:mm')} {b.destination.split(' ')[0]}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:'14px', marginTop:'10px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:20, height:10, border:'1.5px dashed #9ca3af', borderRadius:2 }} />
          <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Pending</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:20, height:10, border:'1.5px solid #2563EB', borderRadius:2, background:'#2563EB20' }} />
          <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Confirmed (taxi color)</span>
        </div>
      </div>
    </div>
  )
}

// ── Staff booking detail + cancel sheet ────────────────────
// Add this to the bottom of the file and wire it into the header
function StaffBookingSheet({ booking, onClose, onCancelled }: {
  booking: any
  onClose: () => void
  onCancelled: () => void
}) {
  const supabase = createClient()
  const [cancelling,   setCancelling]   = React.useState(false)
  const [showCancel,   setShowCancel]   = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [error,        setError]        = React.useState('')

  async function handleCancel() {
    setCancelling(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Session expired'); setCancelling(false); return }

    const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ reason: cancelReason }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to cancel')
      setCancelling(false)
      return
    }

    onCancelled()
    onClose()
  }

  const canCancel = ['submitted','pending_coordinator_approval','pending_driver_approval','booked']
    .includes(booking.status)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', margin: '0 auto 20px' }} />

        {/* Booking header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
              {booking.destination}
            </p>
            <p style={{ fontSize: '13px', color: '#6f7979', margin: 0 }}>
              {booking.scheduled_at && new Date(booking.scheduled_at).toLocaleString('id-ID', {
                weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
              })}
            </p>
          </div>
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 9999,
            background: booking.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE',
            color: booking.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95',
          }}>
            {booking.trip_type === 'DROP' ? 'Drop' : `Wait ${booking.wait_minutes}min`}
          </span>
        </div>

        {/* Details */}
        <div style={{ background: '#F5F5F2', borderRadius: 16, padding: '12px 14px', marginBottom: '16px' }}>
          {[
            { label: 'Booking ID',  value: booking.booking_code },
            { label: 'Pickup',      value: booking.pickup },
            { label: 'Status',      value: booking.status?.replace(/_/g,' ') },
            { label: 'Taxi',        value: booking.taxi_name ? `${booking.taxi_name} · ${booking.driver_name}` : 'Not assigned yet' },
            ...(booking.notes ? [{ label: 'Notes', value: booking.notes }] : []),
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: i < arr.length - 1 ? '8px' : '0', marginBottom: i < arr.length - 1 ? '8px' : '0', borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.08)' : 'none' }}>
              <span style={{ fontSize: '12px', color: '#6f7979' }}>{row.label}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right', maxWidth: '60%', textTransform: 'capitalize' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Cancel section */}
        {canCancel && !showCancel && (
          <button
            onClick={() => setShowCancel(true)}
            style={{ width: '100%', padding: '12px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 16, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            Cancel this booking
          </button>
        )}

        {canCancel && showCancel && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: '6px' }}>
                Reason for cancellation
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. I no longer need the taxi"
                style={{ width: '100%', padding: '11px 14px', fontSize: '14px', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: '10px', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            {error && (
              <p style={{ fontSize: '12px', color: '#991B1B', margin: '0 0 10px', background: '#ffdad6', padding: '8px 12px', borderRadius: '8px' }}>{error}</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => setShowCancel(false)} style={{ padding: '12px', background: 'transparent', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Go back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ padding: '12px', background: '#991B1B', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                {cancelling ? 'Cancelling...' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        )}

        {!canCancel && (
          <div style={{ background: '#F5F5F2', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: '#6f7979', margin: 0 }}>
              {booking.status === 'completed' ? 'This trip has been completed.' : 'This booking cannot be cancelled.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
