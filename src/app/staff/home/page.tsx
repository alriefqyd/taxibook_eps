'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
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
import StaffBookingSheet from '@/components/StaffBookingSheet'
import PageLoader from '@/components/PageLoader'

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
  const [bkPage,      setBkPage]      = useState(0)
  const [hasMoreBk,   setHasMoreBk]   = useState(false)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [view,           setView]           = useState<ViewMode>('day')
  const [cursor,         setCursor]         = useState(new Date())
  const [dayAssignments, setDayAssignments] = useState<{ taxi_id: string; assign_date: string }[]>([])
  const [selectedBk,   setSelectedBk]   = useState<BookingDetail | null>(null)
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
        .range(0, 4),
      // All users' bookings — for the schedule/Gantt view (include completed so calendar shows history)
      supabase
        .from('booking_details')
        .select('*')
        .not('status', 'in', '("cancelled","rejected","submitted","pending_coordinator_approval")')
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
    setHasMoreBk(bkList.length === 5)
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

  if (loading) return <PageLoader />

  const today        = new Date()
  const ACTIVE_STATUSES    = ['booked','on_trip','waiting_trip']
  const activeBookings     = bookings.filter(b => ACTIVE_STATUSES.includes(b.status))
  const allActiveBookings  = allBookings.filter(b => [...ACTIVE_STATUSES, 'completed'].includes(b.status))
  const myBookings = bookings
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
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#344500', display:'inline-block' }} />
              <span style={{ fontSize:10, color:'#6f7979', fontWeight:500 }}>Staff</span>
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
                    <button onClick={() => { setMenuOpen(false); router.push('/staff/trips') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#006064' }}>View all trips</p>
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
        <div style={{ marginBottom:16 }}>
          <Link href="/staff/book" style={{ textDecoration:'none', display:'block' }}>
            <button style={{ width:'100%', padding:'14px', background:'#feb300', color:'#3d2c00', border:'none', borderRadius:9999, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <span style={{ fontSize:18 }}>+</span> New booking
            </button>
          </Link>
        </div>
      </div>

      {/* ── View tabs + nav ── */}
      <div style={{ background:'#ffffff', borderBottom:'1px solid rgba(0,0,0,0.08)', padding:'12px 16px' }}>
        {/* Icon toggle + Day/Week/Month pill — same row */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: view === 'map' ? 0 : 10 }}>
          <div style={{ display:'flex', background:'#F5F5F2', borderRadius:8, padding:'2px', gap:'2px', flexShrink:0 }}>
            <button onClick={() => { if (view === 'map') setView('day') }} style={{
              background: view !== 'map' ? '#ffffff' : 'transparent',
              border:'none', borderRadius:6, padding:'5px 7px', cursor:'pointer',
              color: view !== 'map' ? '#006064' : '#9ca3af',
              display:'flex', alignItems:'center',
              boxShadow: view !== 'map' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>
            <button onClick={() => setView('map')} style={{
              background: view === 'map' ? '#ffffff' : 'transparent',
              border:'none', borderRadius:6, padding:'5px 7px', cursor:'pointer',
              color: view === 'map' ? '#006064' : '#9ca3af',
              display:'flex', alignItems:'center',
              boxShadow: view === 'map' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
              </svg>
            </button>
          </div>
          {view !== 'map' && (
            <div style={{ flex:1, display:'flex', background:'#F5F5F2', borderRadius:9999, padding:'3px', gap:'2px' }}>
              {(['day','week','month'] as const).map(v => (
                <button key={v} onClick={() => { setView(v); setCursor(new Date()) }} style={{
                  flex:1, padding:'6px 4px', fontSize:'12px', fontWeight:600,
                  border:'none', borderRadius:9999, cursor:'pointer',
                  background: view === v ? '#ffffff' : 'transparent',
                  color: view === v ? '#0F1923' : '#9ca3af',
                  textTransform:'capitalize',
                }}>
                  {v}
                </button>
              ))}
            </div>
          )}
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
                style={{ background: '#ffffff', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: '1px solid rgba(0,0,0,0.07)', borderLeft: `3px solid ${isPast ? '#D1D5DB' : '#006064'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'pointer', opacity: isPast ? 0.72 : 1 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.destination}
                    </p>
                    <p style={{ fontSize: 11, color: '#6f7979', margin: '0 0 2px' }}>
                      {format(new Date(b.scheduled_at), 'EEE d MMM · HH:mm', { locale: idLocale })}
                    </p>
                    {b.pickup && (
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.pickup} → {b.destination}
                      </p>
                    )}
                  </div>
                  {sc && <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: sc.bg, color: sc.text, flexShrink: 0, marginTop: 1 }}>{(STATUS_LABELS as any)[b.status]}</span>}
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
                    {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}min`}
                  </span>
                  {b.taxi_name
                    ? <span style={{ fontSize: 10, color: '#6f7979', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: b.taxi_color || '#888', display: 'inline-block' }} />
                        {b.taxi_name} · {b.driver_name}
                      </span>
                    : <span style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
                        {b.status === 'pending_coordinator_approval' ? 'Awaiting approval' : 'Unassigned'}
                      </span>
                  }
                </div>
              </div>
            )
          })}
          {hasMoreBk && (
            <Link href="/staff/trips" style={{ textDecoration: 'none', display: 'block' }}>
              <button
                style={{ width: '100%', padding: '13px', marginTop: 10, background: '#ffffff', boxShadow: '0 2px 8px rgba(0,96,100,0.06)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 700, color: '#006064', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Load more
              </button>
            </Link>
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
                const isDone    = b.status === 'completed'
                const durH      = isDone && b.completed_at
                  ? Math.min(Math.max((new Date(b.completed_at).getTime() - dt.getTime()) / 3_600_000, 0.3), HOUR_END - startH)
                  : b.auto_complete_at
                    ? Math.min(Math.max((new Date(b.auto_complete_at).getTime() - dt.getTime()) / 3_600_000, 0.3), HOUR_END - startH)
                    : b.trip_type === 'WAITING'
                      ? Math.min(b.wait_minutes / 60 + 2, HOUR_END - startH)
                      : Math.min(2, HOUR_END - startH)
                const width     = Math.max(durH * HOUR_W - 4, 44)
                const isPending = b.status.includes('pending')
                const blockColor = isDone ? '#94a3b8' : taxi.color
                return (
                  <div
                    key={b.id}
                    onClick={() => onSelectBooking(b)}
                    style={{
                      position:'absolute', left:left+2, top:5,
                      width, height:ROW_H - 10,
                      background: isDone ? '#F1F5F9' : taxi.color + '22',
                      border:`1.5px ${isPending?'dashed':'solid'} ${blockColor}`,
                      borderRadius:'7px', padding:'4px 6px', overflow:'hidden', zIndex:5,
                      cursor: 'pointer',
                      opacity: isDone ? 0.75 : 1,
                    }}
                  >
                    <p style={{ fontSize:'10px', fontWeight:800, color:blockColor, margin:'0 0 1px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {b.passenger_name}
                    </p>
                    <p style={{ fontSize:'9px', color:blockColor, opacity:0.8, margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {isDone && b.completed_at ? `✓ ${format(new Date(b.completed_at),'HH:mm')}` : format(dt,'HH:mm')} · {b.destination}
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
function WeekView({ bookings, cursor, onSelectBooking, dayAssignments = [] }: { bookings: BookingDetail[]; cursor: Date; onSelectBooking: (b: BookingDetail) => void; currentUserId?: string; dayAssignments?: { taxi_id: string; assign_date: string }[] }) {
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
              <div key={d.toISOString()} style={{ borderRight:'1px solid rgba(0,0,0,0.08)', padding:'4px 2px', minHeight:120, background: assignCount > 0 ? 'rgba(254,179,0,0.06)' : 'transparent', overflow:'hidden', minWidth:0 }}>
                {assignCount > 0 && (
                  <div style={{ fontSize:'7px', fontWeight:700, color:'#7e5700', background:'rgba(254,179,0,0.18)', borderRadius:3, padding:'1px 2px', marginBottom:3, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    ★ full day
                  </div>
                )}
                {dayBks.map(b => {
                  const color     = b.taxi_color || '#3f4949'
                  const isPending = b.status.includes('pending')
                  const isDone    = b.status === 'completed'
                  return (
                    <div
                      key={b.id}
                      onClick={() => onSelectBooking(b)}
                      style={{
                        background: isDone ? '#F1F5F9' : color + '20',
                        border:`1px ${isPending?'dashed':'solid'} ${isDone ? '#94a3b8' : color}`,
                        borderRadius:3, padding:'2px 3px', marginBottom:2,
                        fontSize:'8px', fontWeight:700, color: isDone ? '#64748b' : color,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                        width:'100%', boxSizing:'border-box',
                        cursor: 'pointer',
                        opacity: isDone ? 0.75 : 1,
                      }}
                    >
                      {isDone ? '✓' : ''}{format(new Date(b.scheduled_at),'HH:mm')}
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

