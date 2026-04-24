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

interface TaxiRow {
  id: string
  name: string
  plate: string | null
  color: string
  is_available: boolean
  driver_id: string | null
  driver_name: string | null
  trips_today: number
  declines_today: number
}

export default function CoordinatorHomePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,       setUser]       = useState<User | null>(null)
  const [bookings,   setBookings]   = useState<BookingDetail[]>([])
  const [taxis,      setTaxis]      = useState<TaxiRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showCalendar, setShowCalendar] = useState(false)
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
  const [loadingMore, setLoadingMore] = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const PAGE_SIZE = 10

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

    const [{ data: bks }, { data: txs }] = await Promise.all([
      supabase
        .from('booking_details')
        .select('*')
        .gte('scheduled_at', todayStart.toISOString())
        .lt('scheduled_at', todayEnd.toISOString())
        .not('status', 'in', '("cancelled","rejected")')
        .order('scheduled_at', { ascending: true })
        .range(pageNum * 10, pageNum * 10 + 9),
      supabase
        .from('taxis')
        .select('*, users!driver_id(name)')
        .eq('is_active', true),
    ])

    // Get trips today + declines today per taxi

    const enriched = await Promise.all(
      (txs || []).map(async (t: any) => {
        const [{ count: trips }, { count: declines }] = await Promise.all([
          supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('taxi_id', t.id)
            .eq('status', 'completed')
            .gte('completed_at', todayStart.toISOString()),
          supabase
            .from('booking_responses')
            .select('id', { count: 'exact', head: true })
            .eq('taxi_id', t.id)
            .eq('response', 'declined')
            .gte('responded_at', todayStart.toISOString()),
        ])
        return {
          id:           t.id,
          name:         t.name,
          plate:        t.plate,
          color:        t.color,
          is_available: t.is_available,
          driver_id:    t.driver_id,
          driver_name:  t.users?.name || null,
          trips_today:  trips || 0,
          declines_today: declines || 0,
        }
      })
    )

    const newBks = bks || []
    setBookings(prev => append ? [...prev, ...newBks] : newBks)
    setHasMore(newBks.length === 10)
    setTaxis(enriched)
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
    : filter === 'pending'  ? mainBookings.filter(b => ['submitted','pending_driver_approval'].includes(b.status))
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: '#006064', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '2px', fontFamily: 'Arial Black, sans-serif' }}>VALE</span>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#006064', margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.3px', lineHeight: 1 }}>TaxiBook EPS</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#344500', display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: '#6f7979', fontWeight: 500 }}>Coordinator</span>
              </div>
            </div>
          </div>
          {/* Right: bell + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => router.push('/coordinator/notifications')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
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



      <div style={{ padding: '16px' }}>

        {/* ── BOOKINGS TAB ── */}
        {!showCalendar && (
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
                  <BookingCard key={b.id} booking={b} isProcessing={processing === b.id} onApprove={() => handleApprove(b.id)} onReject={() => setRejectId(b.id)} onReassign={() => router.push('/coordinator/dispatch')} />
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
                  { key: 'pending',   label: 'Pending',   count: mainBookings.filter(b=>['submitted','pending_driver_approval'].includes(b.status)).length },
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
        {showCalendar && (
          <div style={{ margin: '0 -16px' }}>
            <GanttCalendar bookings={bookings} taxis={taxis} />
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
                  <div style={{ background: t.declines_today >= 2 ? '#FEE2E2' : 'rgba(0,0,0,0.04)', borderRadius: '8px', padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                    <p style={{ fontSize: '10px', color: t.declines_today >= 2 ? '#991B1B' : '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Declines</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: t.declines_today >= 2 ? '#991B1B' : '#006064' }}>{t.declines_today}</p>
                  </div>
                </div>

                {t.declines_today >= 2 && (
                  <p style={{ fontSize: '11px', color: '#991B1B', margin: '8px 0 0', background: '#ffdad6', padding: '6px 10px', borderRadius: '6px' }}>
                    ⚠ {t.driver_name} has declined {t.declines_today} trips today. Consider marking unavailable.
                  </p>
                )}
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

// ── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({ booking: b, isProcessing, onApprove, onReject, onReassign }: {
  booking: BookingDetail
  isProcessing: boolean
  onApprove: () => void
  onReject: () => void
  onReassign?: () => void
}) {
  const sc = STATUS_COLORS[b.status]
  const needsApproval = b.status === 'pending_coordinator_approval'

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

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: needsApproval ? '10px' : '0' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
          {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}min`}
        </span>
        {b.taxi_name
          ? <span style={{ fontSize: '11px', color: '#6f7979', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.taxi_color || '#888', display: 'inline-block' }} />
              {b.taxi_name} · {b.driver_name}
            </span>
          : <span style={{ fontSize: '11px', color: '#9ca3af' }}>Unassigned</span>
        }
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
      {!needsApproval && !['completed','cancelled','rejected'].includes(b.status) && onReassign && (
        <button onClick={onReassign} style={{ width: '100%', padding: '7px', background: '#F5F5F2', color: '#6f7979', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
          🔄 Reassign taxi
        </button>
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
