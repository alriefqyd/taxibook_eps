'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import {
  format, startOfWeek, addDays, addMonths,
  isSameDay, isSameMonth, startOfMonth, endOfMonth,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { BookingDetail, User } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/types'
import OnboardingTour from '@/components/OnboardingTour'

const TrackingMap    = dynamic(() => import('@/components/map/TrackingMap'),    { ssr: false })
const DriverFleetMap = dynamic(() => import('@/components/map/DriverFleetMap'), { ssr: false })

type ViewMode = 'day' | 'week' | 'month' | 'map'

const HOUR_START = 7
const HOUR_END   = 19
const HOUR_W     = 80   // px per hour (day view)
const DAY_W      = 100  // px per day  (week view)
const ROW_H      = 52   // px per taxi row

export default function StaffHomePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,        setUser]        = useState<User | null>(null)
  const [bookings,    setBookings]    = useState<BookingDetail[]>([])
  const [allBookings, setAllBookings] = useState<BookingDetail[]>([])
  const [taxis,       setTaxis]       = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [bkPage,      setBkPage]      = useState(0)
  const [hasMoreBk,   setHasMoreBk]   = useState(false)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [view,           setView]           = useState<ViewMode>('day')
  const [cursor,         setCursor]         = useState(new Date())
  const [dayAssignments, setDayAssignments] = useState<{ taxi_id: string; assign_date: string }[]>([])
  const [selectedBk,   setSelectedBk]   = useState<any | null>(null)
  const [refreshing,   setRefreshing]   = useState(false)
  const [pullY,        setPullY]        = useState(0)
  const dayScrollRef  = useRef<HTMLDivElement>(null)
  const weekScrollRef = useRef<HTMLDivElement>(null)
  const touchStartY   = useRef(0)
  const atTopRef      = useRef(false)
  const PULL_THRESHOLD = 60

  async function loadData(userId: string) {
    const [{ data: bks }, { data: allBks }, { data: txs }] = await Promise.all([
      // Current user's bookings — for "My bookings" list
      supabase
        .from('booking_details')
        .select('*')
        .eq('passenger_id', userId)
        .not('status', 'in', '("cancelled")')
        .order('scheduled_at', { ascending: false })
        .range(0, 9),
      // All users' bookings — for the schedule/Gantt view
      supabase
        .from('booking_details')
        .select('*')
        .not('status', 'in', '("cancelled","completed","rejected")')
        .order('scheduled_at', { ascending: true })
        .limit(200),
      supabase
        .from('taxis')
        .select('*, users!driver_id(name)')
        .eq('is_active', true)
        .order('name'),
    ])
    const witaToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
    supabase.from('driver_day_assignments').select('taxi_id, assign_date')
      .gte('assign_date', witaToday).then(({ data }) => setDayAssignments(data || []))

    const bkList = bks || []
    setBookings(bkList)
    setAllBookings(allBks || [])
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

  async function refresh() {
    if (!user?.id || refreshing) return
    setRefreshing(true)
    await loadData(user.id)
    setRefreshing(false)
  }

  function onTouchStart(e: React.TouchEvent) {
    atTopRef.current = window.scrollY === 0
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!atTopRef.current) return
    const dist = e.touches[0].clientY - touchStartY.current
    setPullY(dist > 0 ? Math.min(dist * 0.45, PULL_THRESHOLD) : 0)
  }

  function onTouchEnd() {
    if (pullY >= PULL_THRESHOLD) refresh()
    setPullY(0)
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
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', au.id).eq('is_read', false).then(({ count }) => setUnreadCount(count || 0))
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
  const ACTIVE_STATUSES    = ['booked','on_trip','waiting_trip']
  const activeBookings     = bookings.filter(b => ACTIVE_STATUSES.includes(b.status))
  const allActiveBookings  = allBookings.filter(b => ACTIVE_STATUSES.includes(b.status))
  const myBookings      = bookings.filter(b => {
    if (!dateFrom && !dateTo) return true
    const d = new Date(b.scheduled_at)
    if (dateFrom && d < new Date(dateFrom + 'T00:00:00')) return false
    if (dateTo   && d > new Date(dateTo   + 'T23:59:59')) return false
    return true
  })
  // Stats show today's fleet activity
  const todayBookings  = activeBookings.filter(b => isSameDay(new Date(b.scheduled_at), today))
  const pendingCount   = activeBookings.filter(b => b.status === 'pending_coordinator_approval').length

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
    <div
      style={{ fontFamily: "'Inter', sans-serif", minHeight:'100vh', background:'#F5F5F2' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Pull-to-refresh indicator */}
      {pullY > 0 && (
        <div style={{ height: pullY, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E0F2F1', overflow: 'hidden' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#006064', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', transform: pullY >= PULL_THRESHOLD ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>↓</span>
            {pullY >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      {/* ── TopAppBar ── */}
      <header style={{
        background: '#F5F5F2', borderBottom: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 1px 4px rgba(0,96,100,0.06)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 20px', height: 64 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
            <img src="/vale-logo.svg" alt="Vale" style={{ height: 30, display: 'block' }} />
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:'#006064', margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:'0.3px', lineHeight:1 }}>TaxiBook EPS</p>
              <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#344500', display:'inline-block' }} />
                <span style={{ fontSize:10, color:'#6f7979', fontWeight:500 }}>Staff</span>
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button
              onClick={refresh}
              disabled={refreshing}
              title="Refresh"
              style={{ width:40, height:40, borderRadius:'50%', background:'none', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0, color:'#006064' }}
            >
              <span style={{ display:'flex', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </span>
            </button>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <Link href="/staff/notifications" style={{ textDecoration:'none', width:40, height:40, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </Link>
              {unreadCount > 0 && (
                <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, background:'#EF4444', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', border:'1.5px solid #F5F5F2', pointerEvents:'none', lineHeight:1 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
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
      <OnboardingTour role="staff" />

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
        <div style={{ display:'flex', background:'#F5F5F2', borderRadius:10, padding:'3px', gap:'2px', marginBottom: view === 'map' ? 0 : '10px' }}>
          {(['day','week','month','map'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => { setView(v); if (v !== 'map') setCursor(new Date()) }} style={{
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

        {/* Nav row — hidden on map tab */}
        {view !== 'map' && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <button onClick={() => navigate(-1)} style={navBtn}>←</button>
            <span style={{ fontSize:'13px', fontWeight:700, color:'#006064', textAlign:'center', flex:1, padding:'0 8px' }}>
              {getNavLabel()}
            </span>
            <button onClick={() => navigate(1)} style={navBtn}>→</button>
          </div>
        )}
      </div>

      {/* ── Views ── */}
      {view === 'day'   && <DayGantt   bookings={allActiveBookings} taxis={taxis} cursor={cursor} scrollRef={dayScrollRef} onSelectBooking={setSelectedBk} currentUserId={user?.id} dayAssignments={dayAssignments} />}
      {view === 'week'  && <WeekView   bookings={allActiveBookings} cursor={cursor} onSelectBooking={setSelectedBk} currentUserId={user?.id} dayAssignments={dayAssignments} />}
      {view === 'month' && <MonthView  bookings={allBookings} cursor={cursor} onDayClick={d => { setCursor(d); setView('day') }} dayAssignments={dayAssignments} />}
      {view === 'map'   && (
        <div style={{ height: 'calc(100dvh - 348px)', minHeight: 300, position: 'relative' }}>
          <DriverFleetMap style={{ borderRadius: 0, height: '100%' }} />
        </div>
      )}

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
            const isPast = b.status === 'completed' || b.status === 'cancelled' || new Date(b.scheduled_at) < new Date()
            return (
              <div
                key={b.id}
                onClick={() => setSelectedBk(b)}
                style={{ background: isPast ? '#F9FAFB' : '#ffffff', borderRadius: 16, padding: '16px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.05)', borderLeft: `3px solid ${isPast ? '#D1D5DB' : '#006064'}`, cursor: 'pointer', opacity: isPast ? 0.72 : 1 }}
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
                        {b.status === 'pending_coordinator_approval' ? 'Awaiting approval' : 'Unassigned'}
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
          currentUserId={user?.id}
          onClose={() => setSelectedBk(null)}
          onCancelled={() => { if (user) loadData(user.id) }}
        />
      )}
    </div>
  )
}

// ── DAY GANTT ───────────────────────────────────────────────
function DayGantt({ bookings, taxis, cursor, scrollRef, onSelectBooking, currentUserId, dayAssignments = [] }: {
  bookings: BookingDetail[]
  taxis: any[]
  cursor: Date
  scrollRef: React.RefObject<HTMLDivElement>
  onSelectBooking: (b: BookingDetail) => void
  currentUserId?: string
  dayAssignments?: { taxi_id: string; assign_date: string }[]
}) {
  const today    = new Date()
  const cursorDateStr = format(cursor, 'yyyy-MM-dd')
  const dayBks = bookings.filter(b => isSameDay(new Date(b.scheduled_at), cursor))
  const hours  = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START)
  const totalW = hours.length * HOUR_W

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

          {/* All taxi rows */}
          {taxis.map((taxi, idx) => {
            const isFullDay = dayAssignments.some(a => a.taxi_id === taxi.id && a.assign_date === cursorDateStr)
            return (
            <GanttRow
              key={taxi.id}
              taxi={taxi}
              idx={idx}
              bookings={dayBks.filter(b => b.taxi_id === taxi.id)}
              overlay={isFullDay ? (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(254,179,0,0.13)',
                  borderTop: '2px solid #feb300',
                  zIndex: 2, display: 'flex', alignItems: 'center', paddingLeft: 10,
                  pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#7e5700', letterSpacing: '0.05em' }}>★ FULL DAY DUTY</span>
                </div>
              ) : undefined}
              renderBlock={(b) => {
                const dt        = new Date(b.scheduled_at)
                const startH    = dt.getHours() + dt.getMinutes() / 60
                const left      = (startH - HOUR_START) * HOUR_W
                const durH      = b.auto_complete_at
                  ? Math.min(Math.max((new Date(b.auto_complete_at).getTime() - dt.getTime()) / 3_600_000, 0.3), HOUR_END - startH)
                  : b.trip_type === 'WAITING'
                    ? Math.min(b.wait_minutes / 60 + 2, HOUR_END - startH)
                    : Math.min(2, HOUR_END - startH)
                const width     = Math.max(durH * HOUR_W - 4, 44)
                const isPending = b.status.includes('pending')
                const isOwner   = currentUserId && b.passenger_id === currentUserId
                return (
                  <div
                    key={b.id}
                    onClick={isOwner ? () => onSelectBooking(b) : undefined}
                    style={{
                      position:'absolute', left:left+2, top:5,
                      width, height:ROW_H - 10,
                      background: taxi.color + '22',
                      border:`1.5px ${isPending?'dashed':'solid'} ${taxi.color}`,
                      borderRadius:'7px', padding:'4px 6px', overflow:'hidden', zIndex:5,
                      cursor: isOwner ? 'pointer' : 'default',
                      opacity: isOwner ? 1 : 0.6,
                    }}
                  >
                    <p style={{ fontSize:'10px', fontWeight:800, color:taxi.color, margin:'0 0 1px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {b.passenger_name}
                    </p>
                    <p style={{ fontSize:'9px', color:taxi.color, opacity:0.8, margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {format(dt,'HH:mm')} · {b.destination}
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
          )
        })}
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
function GanttRow({ taxi, idx, bookings, renderBlock, nowLine, gridLines, totalW, overlay }: {
  taxi: any
  idx: number
  bookings: BookingDetail[]
  renderBlock: (b: BookingDetail) => React.ReactNode
  nowLine: React.ReactNode
  gridLines: React.ReactNode
  totalW: number
  overlay?: React.ReactNode
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
        {overlay}
        {nowLine}
        {bookings.map(b => renderBlock(b))}
        {bookings.length === 0 && taxi.is_available && !overlay && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', paddingLeft:12 }}>
            <span style={{ fontSize:'10px', color:'#D1D5DB', fontWeight:600 }}>Free</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MONTH VIEW ──────────────────────────────────────────────
function MonthView({ bookings, cursor, onDayClick, dayAssignments = [] }: {
  bookings: BookingDetail[]
  cursor: Date
  onDayClick: (d: Date) => void
  dayAssignments?: { taxi_id: string; assign_date: string }[]
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
            const inMonth     = isSameMonth(d, cursor)
            const isToday     = isSameDay(d, today)
            const dayStr      = format(d, 'yyyy-MM-dd')
            const bks         = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            const assignCount = dayAssignments.filter(a => a.assign_date === dayStr).length
            return (
              <div
                key={d.toISOString()}
                onClick={() => onDayClick(d)}
                style={{ minHeight:52, borderRight:'1px solid rgba(0,0,0,0.08)', borderBottom:'1px solid rgba(0,0,0,0.08)', padding:'4px', opacity: inMonth ? 1 : 0.3, cursor:'pointer', background: isToday ? 'rgba(0,96,100,0.06)' : assignCount > 0 ? 'rgba(254,179,0,0.08)' : 'transparent' }}
              >
                <div style={{ width:20, height:20, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:3, background: isToday ? '#006064' : 'transparent', fontSize:'11px', fontWeight:700, color: isToday ? '#fff' : '#006064' }}>
                  {format(d,'d')}
                </div>
                {assignCount > 0 && (
                  <div style={{ fontSize:'8px', fontWeight:800, color:'#7e5700', marginBottom:2 }}>★ {assignCount}</div>
                )}
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
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:'10px', color:'#7e5700', fontWeight:700 }}>★</span>
          <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Full Day Duty</span>
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
function WeekView({ bookings, cursor, onSelectBooking, currentUserId, dayAssignments = [] }: { bookings: BookingDetail[]; cursor: Date; onSelectBooking: (b: BookingDetail) => void; currentUserId?: string; dayAssignments?: { taxi_id: string; assign_date: string }[] }) {
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
            const dayStr  = format(d, 'yyyy-MM-dd')
            const assignCount = dayAssignments.filter(a => a.assign_date === dayStr).length
            return (
              <div key={d.toISOString()} style={{ textAlign:'center', padding:'8px 2px', background: isToday ? '#006064' : assignCount > 0 ? 'rgba(254,179,0,0.12)' : 'transparent', borderRight:'1px solid rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize:'8px', fontWeight:700, color: isToday ? 'rgba(255,255,255,0.6)' : '#9ca3af', margin:'0 0 2px', textTransform:'uppercase' }}>
                  {format(d,'EEE',{locale:idLocale})}
                </p>
                <p style={{ fontSize:'15px', fontWeight:700, color: isToday ? '#fff' : '#006064', margin:'0 0 2px', lineHeight:1 }}>
                  {format(d,'d')}
                </p>
                {assignCount > 0 && !isToday && (
                  <p style={{ fontSize:'8px', fontWeight:700, color:'#7e5700', margin:0 }}>★ {assignCount}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Day columns */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', minHeight:120 }}>
          {days.map(d => {
            const dayBks = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            const dayStr = format(d, 'yyyy-MM-dd')
            const assignCount = dayAssignments.filter(a => a.assign_date === dayStr).length
            return (
              <div key={d.toISOString()} style={{ borderRight:'1px solid rgba(0,0,0,0.08)', padding:'4px 2px', minHeight:120, background: assignCount > 0 ? 'rgba(254,179,0,0.06)' : 'transparent' }}>
                {assignCount > 0 && (
                  <div style={{ fontSize:'8px', fontWeight:700, color:'#7e5700', background:'rgba(254,179,0,0.18)', borderRadius:3, padding:'1px 3px', marginBottom:3, textAlign:'center' }}>
                    ★ {assignCount} full day
                  </div>
                )}
                {dayBks.map(b => {
                  const color     = b.taxi_color || '#3f4949'
                  const isPending = b.status.includes('pending')
                  const isOwner   = currentUserId && b.passenger_id === currentUserId
                  return (
                    <div
                      key={b.id}
                      onClick={isOwner ? () => onSelectBooking(b) : undefined}
                      style={{
                        background: color + '20',
                        border:`1px ${isPending?'dashed':'solid'} ${color}`,
                        borderRadius:3, padding:'2px 4px', marginBottom:2,
                        fontSize:'9px', fontWeight:700, color,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                        cursor: isOwner ? 'pointer' : 'default',
                        opacity: isOwner ? 1 : 0.6,
                      }}
                    >
                      {format(new Date(b.scheduled_at),'HH:mm')} {b.passenger_name}
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
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:'10px', color:'#7e5700', fontWeight:700 }}>★</span>
          <span style={{ fontSize:'10px', color:'#6B7C8F' }}>Full Day Duty</span>
        </div>
      </div>
    </div>
  )
}

// ── Contact helpers ─────────────────────────────────────────
function staffToWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

function staffBuildWaMessage(b: any): string {
  const time = new Date(b.scheduled_at).toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const type = b.trip_type === 'DROP' ? 'Drop (antar saja)' : `Waiting ${b.wait_minutes} menit (tunggu penumpang)`
  const taxi = b.taxi_name ? `${b.taxi_name}${b.taxi_plate ? ` (${b.taxi_plate})` : ''}` : null
  return [
    `📋 *TaxiBook – Penugasan Perjalanan*`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔖 Kode Booking: *${b.booking_code}*`,
    ``,
    `👤 *Penumpang*`,
    `   Nama : ${b.passenger_name || 'Anda'}`,
    ...(b.passenger_phone ? [`   HP   : ${b.passenger_phone}`] : []),
    ``,
    `📍 *Rute Perjalanan*`,
    `   Dari    : ${b.pickup}`,
    `   Tujuan  : ${b.destination}`,
    ``,
    `🕐 *Jadwal*`,
    `   ${time}`,
    ``,
    `🚗 *Detail Trip*`,
    `   Jenis : ${type}`,
    ...(taxi ? [`   Taksi : ${taxi}`] : []),
    ...(b.notes ? [`   Catatan : ${b.notes}`] : []),
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `Mohon konfirmasi kesiapan Anda untuk perjalanan ini. Terima kasih! 🙏`,
  ].join('\n')
}

// ── Staff booking detail + cancel sheet ─────────────────────
function StaffBookingSheet({ booking, currentUserId, onClose, onCancelled }: {
  booking: any
  currentUserId?: string
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

  const isOwner   = !!currentUserId && booking.passenger_id === currentUserId
  const canCancel = isOwner && ['submitted','pending_coordinator_approval','booked']
    .includes(booking.status)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' }}
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

        {/* Driver tracking map — shown when driver is confirmed/active */}
        {['booked', 'on_trip', 'waiting_trip'].includes(booking.status) && booking.taxi_id && (
          <TrackingMap
            taxiId={booking.taxi_id}
            taxiColor={booking.taxi_color || '#006064'}
            pickup={booking.pickup}
            destination={booking.destination}
            status={booking.status}
            pickupLat={booking.pickup_lat}
            pickupLng={booking.pickup_lng}
            destLat={booking.destination_lat}
            destLng={booking.destination_lng}
          />
        )}

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

        {/* Action buttons — call & WhatsApp side by side, cancel below */}
        {booking.driver_phone && !showCancel && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: canCancel ? 8 : 0 }}>
            <a
              href={`tel:${booking.driver_phone}`}
              style={{ padding: '12px 8px', background: '#EFF6FF', color: '#0369A1', border: '1px solid #BAE6FD', borderRadius: 16, fontSize: '13px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.63 4.35 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Call Driver
            </a>
            <a
              href={`https://wa.me/${staffToWaNumber(booking.driver_phone)}?text=${encodeURIComponent(staffBuildWaMessage(booking))}`}
              target="_blank" rel="noopener noreferrer"
              style={{ padding: '12px 8px', background: '#25D366', color: '#ffffff', border: 'none', borderRadius: 16, fontSize: '13px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
              WhatsApp Driver
            </a>
          </div>
        )}

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
