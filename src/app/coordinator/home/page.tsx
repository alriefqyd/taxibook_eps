'use client'
import React from 'react'

const PRIMARY = '#006064'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { BookingDetail, User } from '@/types'
import { STATUS_LABELS, STATUS_COLORS } from '@/types'
import GanttCalendar from '@/components/GanttCalendar'
import OnboardingTour from '@/components/OnboardingTour'


interface TaxiRow {
  id: string
  name: string
  plate: string | null
  color: string
  is_available: boolean
  driver_id: string | null
  driver_name: string | null
  trips_today: number
}

export default function CoordinatorHomePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,             setUser]             = useState<User | null>(null)
  const [bookings,         setBookings]         = useState<BookingDetail[]>([])
  const [calendarBookings, setCalendarBookings] = useState<BookingDetail[]>([])
  const [taxis,            setTaxis]            = useState<TaxiRow[]>([])
  const [dayAssignments,   setDayAssignments]   = useState<{ taxi_id: string; assign_date: string }[]>([])
  const [loading,          setLoading]          = useState(true)
  const [view,        setView]        = useState<'list' | 'calendar'>('list')
  const [filter,     setFilter]     = useState<'all' | 'pending' | 'booked' | 'completed'>('all')
  const [rejectId,   setRejectId]   = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)
  const [dateFrom,   setDateFrom]   = useState(new Date().toISOString().slice(0,10))
  const [dateTo,     setDateTo]     = useState(new Date().toISOString().slice(0,10))
  const dateFromRef = React.useRef(new Date().toISOString().slice(0,10))
  const dateToRef   = React.useRef(new Date().toISOString().slice(0,10))
  const [page,        setPage]        = useState(0)
  const [hasMore,     setHasMore]     = useState(false)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const PAGE_SIZE = 10

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  const loadData = useCallback(async (from?: string, to?: string, pageNum = 0, append = false) => {
    const parseDate = (s?: string) => {
      if (!s || typeof s !== 'string') {
        const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate())
      }
      const d = s.split('-').map(Number)
      return new Date(d[0], d[1]-1, d[2])
    }
    const todayStart = parseDate(from); todayStart.setHours(0, 0, 0, 0)
    const todayEnd   = parseDate(to);   todayEnd.setHours(23, 59, 59, 999)

    const [{ data: bks }, { data: allBks }, { data: txs }] = await Promise.all([
      // Paginated list for the Bookings tab
      supabase
        .from('booking_details')
        .select('*')
        .gte('scheduled_at', todayStart.toISOString())
        .lt('scheduled_at', todayEnd.toISOString())
        .not('status', 'in', '("cancelled","rejected")')
        .order('scheduled_at', { ascending: true })
        .range(pageNum * 10, pageNum * 10 + 9),
      // Full list (no limit) for the Calendar tab
      supabase
        .from('booking_details')
        .select('*')
        .gte('scheduled_at', todayStart.toISOString())
        .lt('scheduled_at', todayEnd.toISOString())
        .not('status', 'in', '("cancelled","rejected")')
        .order('scheduled_at', { ascending: true })
        .limit(500),
      supabase
        .from('taxis')
        .select('*, users!driver_id(name)')
        .eq('is_active', true),
    ])

    // Get trips today + declines today per taxi

    const enriched = await Promise.all(
      (txs || []).map(async (t: any) => {
        const { count: trips } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('taxi_id', t.id)
          .eq('status', 'completed')
          .gte('completed_at', todayStart.toISOString())
        return {
          id:           t.id,
          name:         t.name,
          plate:        t.plate,
          color:        t.color,
          is_available: t.is_available,
          driver_id:    t.driver_id,
          driver_name:  t.users?.name || null,
          trips_today:  trips || 0,
        }
      })
    )

    const witaToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
    const { data: dayAssign } = await supabase
      .from('driver_day_assignments')
      .select('taxi_id, assign_date')
      .gte('assign_date', witaToday)

    const newBks = bks || []
    setBookings(prev => append ? [...prev, ...newBks] : newBks)
    setCalendarBookings(allBks || [])
    setHasMore(newBks.length === 10)
    setTaxis(enriched)
    setDayAssignments(dayAssign || [])
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      setUser(p)
      await loadData(new Date().toISOString().slice(0,10), new Date().toISOString().slice(0,10), 0, false)
      setPage(0)
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', p.id).eq('is_read', false).then(({ count }) => setUnreadCount(count || 0))
      setLoading(false)
    }
    init()

    const ch = supabase.channel('coord-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => loadData(dateFromRef.current, dateToRef.current, 0, false))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, () => loadData(dateFromRef.current, dateToRef.current, 0, false))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  async function runCron() {
    const res  = await fetch('/api/cron/auto-complete')
    const data = await res.json()

    if (!res.ok) {
      alert('Cron error: ' + JSON.stringify(data))
      return
    }

    const msg =
      `✅ Cron ran successfully\n\n` +
      `Auto-completed:    ${data.auto_completed}\n` +
      `15min reminders:   ${data.reminded_15min}\n` +
      `Start reminders:   ${data.reminded_start}\n` +
      `Overdue alerts:    ${data.reminded_overdue}\n` +
      `Coord alerts:      ${data.notified_coord}\n\n` +
      (data.reminded_15min === 0 && data.reminded_start === 0
        ? `⚠️ No reminders sent.\nPossible reasons:\n` +
          `• Booking status is not "booked" yet\n` +
          `• Booking time not in 10-15min window\n` +
          `• Reminder already sent before`
        : `🔔 Check notification bell for alerts`)

    alert(msg)
    await loadData(dateFrom, dateTo, 0, false)
  }

  async function handleApprove(bookingId: string) {
    setProcessing(bookingId)
    const token = await getToken()
    await fetch(`/api/bookings/${bookingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'approve' }),
    })
    await loadData(dateFrom, dateTo, 0, false)
    setProcessing(null)
  }

  async function handleReject(bookingId: string) {
    setProcessing(bookingId)
    const token = await getToken()
    await fetch(`/api/bookings/${bookingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'reject', rejection_reason: rejectNote }),
    })
    setRejectId(null)
    setRejectNote('')
    await loadData(dateFrom, dateTo, 0, false)
    setProcessing(null)
  }

  async function handleCancel(bookingId: string) {
    if (!confirm('Cancel this booking?')) return
    setProcessing(bookingId)
    const token = await getToken()
    await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ reason: '' }),
    })
    await loadData(dateFrom, dateTo, 0, false)
    setProcessing(null)
  }

  async function toggleAvailability(taxiId: string, current: boolean) {
    await supabase
      .from('taxis')
      .update({ is_available: !current })
      .eq('id', taxiId)
    await loadData(dateFrom, dateTo, 0, false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(0,96,100,0.15)', borderTop: '3px solid #006064', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const pendingApproval = bookings.filter(b => b.status === 'pending_coordinator_approval')
  // Exclude pending_coordinator_approval from main list — shown separately above
  const mainBookings = bookings.filter(b => b.status !== 'pending_coordinator_approval')
  const filtered = filter === 'all'       ? mainBookings
    : filter === 'pending'  ? mainBookings.filter(b => b.status === 'submitted')
    : filter === 'booked'   ? mainBookings.filter(b => ['booked','on_trip','waiting_trip'].includes(b.status))
    : mainBookings.filter(b => b.status === 'completed')

  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0,2).join('') || 'C'

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight: '100vh', background: '#F5F5F2' }}>

      {/* ── TopAppBar — matches reference design ── */}
      <header style={{
        background: '#F5F5F2',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 1px 4px rgba(0,96,100,0.06)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', height: 64 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/vale-logo.svg" alt="PT Vale" style={{ height: 32, display: 'block' }} />
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.1)' }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: '#006064', margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.3px' }}>TaxiBook EPS</p>
          </div>
          {/* Right: fullscreen + bell + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isFullscreen
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>
              }
            </button>
            <button onClick={() => router.push('/coordinator/notifications')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {unreadCount > 0 && (
                <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, background:'#EF4444', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', border:'1.5px solid #fff', pointerEvents:'none', lineHeight:1 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <div style={{ position: 'relative' }}>
              <div onClick={() => setMenuOpen(o => !o)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#006064', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, border: '2px solid rgba(0,96,100,0.3)', cursor: 'pointer' }}>
                {initials}
              </div>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{ position: 'absolute', top: 44, right: 0, background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 99, minWidth: 220, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#F5F5F2' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: '#1a1c1b' }}>{user?.name}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Coordinator</p>
                    </div>
                    <button onClick={() => { setMenuOpen(false); window.open('/board', '_blank') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#006064' }}>Dispatch Board</p>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/coordinator/locations') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#D97706' }}>Saved Locations</p>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/coordinator/report') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#006064' }}>Trip Report</p>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/coordinator/profile') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
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
      <OnboardingTour role="coordinator" />

      <div style={{ padding: '16px' }}>
        {/* New booking CTA */}
        <button
          onClick={() => router.push('/coordinator/book')}
          style={{ width: '100%', padding: '14px', background: '#feb300', color: '#3d2c00', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}
        >
          <span style={{ fontSize: 18 }}>+</span> New booking
        </button>

        {/* ── View tabs ── */}
        <div style={{ display: 'flex', background: '#ECEAE4', borderRadius: 9999, padding: 3, gap: 2, marginBottom: 14 }}>
          {([
            { key: 'list',     label: 'Bookings' },
            { key: 'calendar', label: 'Calendar' },
          ] as const).map(v => (
            <button key={v.key} onClick={() => setView(v.key)} style={{
              flex: 1, padding: '7px 4px', fontSize: 12, fontWeight: 600, border: 'none',
              borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit',
              background: view === v.key ? '#ffffff' : 'transparent',
              color: view === v.key ? '#006064' : '#9ca3af',
              boxShadow: view === v.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>{v.label}</button>
          ))}
        </div>

        {/* ── BOOKINGS TAB ── */}
        {view === 'list' && (
          <>
            {/* Pending approval — pinned at top */}
            {pendingApproval.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#D97706', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                    {pendingApproval.length}
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#7e5700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Needs approval
                  </p>
                </div>
                {pendingApproval.map(b => (
                  <BookingCard key={b.id} booking={b} isProcessing={processing === b.id} onApprove={() => handleApprove(b.id)} onReject={() => setRejectId(b.id)} onReassign={() => router.push('/coordinator/dispatch')} onCancel={b.created_by === user?.id ? () => handleCancel(b.id) : undefined} />
                ))}
                <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '14px 0 16px' }} />
              </div>
            )}

            {/* Status filters + date range in one compact row */}
            <div style={{ marginBottom: 14 }}>
              {/* Status pills */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 2 }}>
                {([
                  { key: 'all',       label: 'All',       count: mainBookings.length },
                  { key: 'pending',   label: 'Pending',   count: mainBookings.filter(b=>b.status==='submitted').length },
                  { key: 'booked',    label: 'Confirmed', count: mainBookings.filter(b=>['booked','on_trip','waiting_trip'].includes(b.status)).length },
                  { key: 'completed', label: 'Done',      count: mainBookings.filter(b=>b.status==='completed').length },
                ] as const).map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key as any)} style={{
                    padding: '5px 12px', fontSize: 12, fontWeight: 600, flexShrink: 0,
                    border: `1.5px solid ${filter === f.key ? '#006064' : 'rgba(0,0,0,0.08)'}`,
                    borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit',
                    background: filter === f.key ? '#006064' : '#fff',
                    color:      filter === f.key ? '#fff'    : '#3f4949',
                  }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Date range — fits content, not full width */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '7px 12px' }}>
                <span style={{ fontSize: 12, flexShrink: 0 }}>📅</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); dateFromRef.current = e.target.value; setPage(0); loadData(e.target.value, dateToRef.current, 0, false) }}
                  style={{ width: 130, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent', color: '#006064' }}
                />
                <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); dateToRef.current = e.target.value; setPage(0); loadData(dateFromRef.current, e.target.value, 0, false) }}
                  style={{ width: 130, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent', color: '#006064' }}
                />
                <button
                  onClick={() => { const today = new Date().toISOString().slice(0,10); setDateFrom(today); setDateTo(today); dateFromRef.current = today; dateToRef.current = today; setPage(0); loadData(today, today, 0, false) }}
                  style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, border: '1px solid rgba(0,0,0,0.08)', background: '#F5F5F2', color: '#6f7979', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                >
                  Today
                </button>
              </div>
            </div>

            {/* Booking list with load more */}
            {filtered.length === 0
              ? <EmptyState label="No bookings for this period" />
              : <>
                  {filtered.map(b => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      isProcessing={processing === b.id}
                      onApprove={() => handleApprove(b.id)}
                      onReject={() => setRejectId(b.id)}
                      onReassign={() => router.push('/coordinator/dispatch')}
                      onCancel={b.created_by === user?.id ? () => handleCancel(b.id) : undefined}
                    />
                  ))}
                  {hasMore && (
                    <button
                      disabled={loadingMore}
                      onClick={async () => {
                        setLoadingMore(true)
                        const nextPage = page + 1
                        setPage(nextPage)
                        await loadData(dateFrom, dateTo, nextPage, true)
                        setLoadingMore(false)
                      }}
                      style={{ width: '100%', padding: '12px', marginTop: 8, background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 600, color: loadingMore ? '#9ca3af' : '#006064', cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                    >
                      {loadingMore ? 'Loading...' : 'Load more'}
                    </button>
                  )}
                </>
            }
          </>
        )}

        {/* ── CALENDAR TAB ── */}
        {view === 'calendar' && (
          <div style={{ margin: '0 -16px' }}>
            <GanttCalendar bookings={calendarBookings} taxis={taxis} showCompleted dayAssignments={dayAssignments} />
          </div>
        )}



        {/* ── FLEET TAB ── */}
        {false && (
          <div>
            {taxis.map(t => (
              <div key={t.id} style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px' }}>{t.name}</p>
                      <p style={{ fontSize: '12px', color: '#6f7979', margin: 0 }}>{t.driver_name || 'No driver'} {t.plate ? `· ${t.plate}` : ''}</p>
                    </div>
                  </div>

                  {/* Availability toggle */}
                  <button
                    onClick={() => toggleAvailability(t.id, t.is_available)}
                    style={{
                      padding: '5px 12px', fontSize: '11px', fontWeight: 700,
                      border: 'none', borderRadius: 9999, cursor: 'pointer',
                      background: t.is_available ? '#D1FAE5' : '#FEE2E2',
                      color:      t.is_available ? '#065F46' : '#991B1B',
                    }}
                  >
                    {t.is_available ? '● Available' : '○ Unavailable'}
                  </button>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ background: '#F5F5F2', borderRadius: '8px', padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                    <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Trips today</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{t.trips_today}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 14px' }}>Reject booking</h2>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>
                Reason (optional)
              </label>
              <input
                type="text"
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="e.g. No drivers available for this time"
                style={{ width: '100%', padding: '11px 14px', fontSize: '14px', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: '10px', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => { setRejectId(null); setRejectNote('') }} style={{ padding: '12px', background: 'transparent', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleReject(rejectId)} style={{ padding: '12px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

function buildWaMessage(b: BookingDetail): string {
  const time = format(new Date(b.scheduled_at), 'EEEE, dd MMMM yyyy · HH:mm', { locale: idLocale })
  const type = b.trip_type === 'DROP' ? 'Drop (antar saja)' : `Waiting ${b.wait_minutes} menit (tunggu penumpang)`
  const taxi = b.taxi_name ? `${b.taxi_name}${b.taxi_plate ? ` (${b.taxi_plate})` : ''}` : null
  return [
    `📋 *TaxiBook – Penugasan Perjalanan*`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔖 Kode Booking: *${b.booking_code}*`,
    ``,
    `👤 *Penumpang*`,
    `   Nama : ${b.passenger_name}`,
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

// ── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({ booking: b, isProcessing, onApprove, onReject, onReassign, onCancel }: {
  booking: BookingDetail
  isProcessing: boolean
  onApprove: () => void
  onReject: () => void
  onReassign?: () => void
  onCancel?: () => void
}) {
  const sc = STATUS_COLORS[b.status]
  const needsApproval = b.status === 'pending_coordinator_approval'
  const canCancel = !!onCancel && ['submitted', 'pending_coordinator_approval', 'booked'].includes(b.status)
  const hasContact = b.driver_phone || b.passenger_phone

  return (
    <div style={{ background: '#ffffff', borderRadius: 16, padding: '14px 16px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,96,100,0.06)', border: `1px solid ${needsApproval ? 'rgba(217,119,6,0.2)' : 'rgba(0,0,0,0.06)'}`, borderLeft: `3px solid ${needsApproval ? '#d97706' : '#006064'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {b.passenger_name}
          </p>
          <p style={{ fontSize: '12px', color: '#6f7979', margin: 0 }}>
            {format(new Date(b.scheduled_at), 'EEE d MMM · HH:mm', { locale: idLocale })}
          </p>
          <p style={{ fontSize: '12px', color: '#6f7979', margin: '2px 0 0' }}>
            {b.pickup} → {b.destination}
          </p>
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 9999, flexShrink: 0, background: sc.bg, color: sc.text }}>
          {STATUS_LABELS[b.status]}
        </span>
      </div>

      {/* Driver + contact icons in one row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: needsApproval || hasContact ? '10px' : '0' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
          {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}min`}
        </span>
        {b.taxi_name
          ? <span style={{ fontSize: '11px', color: '#6f7979', display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.taxi_color || '#888', display: 'inline-block' }} />
              {b.taxi_name} · {b.driver_name}
            </span>
          : <span style={{ fontSize: '11px', color: '#9ca3af', flex: 1 }}>Unassigned</span>
        }
        {/* Quick contact icon buttons */}
        {b.driver_phone && (
          <>
            <a href={`tel:${b.driver_phone}`}
              title={`Call driver: ${b.driver_phone}`}
              style={{ width: 28, height: 28, borderRadius: 8, background: '#EFF6FF', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#0369A1', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.63 4.35 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </a>
            <a href={`https://wa.me/${toWaNumber(b.driver_phone)}?text=${encodeURIComponent(buildWaMessage(b))}`}
              target="_blank" rel="noopener noreferrer"
              title={`WhatsApp driver with booking details`}
              style={{ width: 28, height: 28, borderRadius: 8, background: '#F0FDF4', border: '1px solid #86EFAC', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#15803D', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
            </a>
          </>
        )}
      </div>

      {needsApproval && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 6 }}>
          <button onClick={onReject} disabled={isProcessing} style={{ padding: '9px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            Reject
          </button>
          <button onClick={onApprove} disabled={isProcessing} style={{ padding: '9px', background: '#d8f3dc', color: '#2D6A4F', border: '1px solid #6EE7B7', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            {isProcessing ? '...' : 'Approve'}
          </button>
        </div>
      )}
      {!needsApproval && !['completed','cancelled','rejected'].includes(b.status) && (onReassign || canCancel) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {onReassign && (
            <button onClick={onReassign} style={{ flex: 1, padding: '7px', background: '#F5F5F2', color: '#6f7979', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              🔄 Reassign taxi
            </button>
          )}
          {canCancel && (
            <button onClick={onCancel} disabled={isProcessing} style={{ flex: onReassign ? '0 0 auto' : 1, padding: '7px 12px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color = '#006064', bg = 'rgba(0,0,0,0.04)' }: {
  label: string; value: number; color?: string; bg?: string
}) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color, margin: '0 0 4px', opacity: 0.75 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-1px', lineHeight: 1, color }}>{value}</p>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
      <p style={{ fontSize: '14px', margin: 0 }}>{label}</p>
    </div>
  )
}
