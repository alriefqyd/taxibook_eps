'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { User } from '@/types'
import GanttCalendar from '@/components/GanttCalendar'

const FONT = 'Inter, sans-serif'

interface DriverBooking {
  id:             string
  booking_code:   string
  passenger_name: string
  pickup:         string
  destination:    string
  trip_type:      string
  wait_minutes:   number
  scheduled_at:   string
  status:         string
  notes:          string | null
  taxi_id:        string | null
  taxi_name:      string | null
  taxi_color:     string | null
}

type Tab = 'trips' | 'active' | 'calendar'

export default function DriverHomePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,       setUser]       = useState<User | null>(null)
  const [trips,      setTrips]      = useState<DriverBooking[]>([])
  const [upcoming,   setUpcoming]   = useState<DriverBooking[]>([])
  const [past,       setPast]       = useState<DriverBooking[]>([])
  const [activeTrip,  setActiveTrip]  = useState<DriverBooking | null>(null)
  const [myTaxi,     setMyTaxi]     = useState<any | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [selected,   setSelected]   = useState<DriverBooking | null>(null)
  const [tab,        setTab]        = useState<Tab>('trips')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [upPage,      setUpPage]      = useState(0)
  const [hasMoreUp,   setHasMoreUp]   = useState(false)
  const [pastPage,    setPastPage]    = useState(0)
  const [hasMorePast, setHasMorePast] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [toggling,   setToggling]   = useState(false)


  async function toggleAvailability() {
    if (!myTaxi || toggling) return
    setToggling(true)
    const newVal = !myTaxi.is_available
    const { error } = await supabase
      .from('taxis').update({ is_available: newVal }).eq('id', myTaxi.id)
    if (!error) {
      const { data: t } = await supabase
        .from('taxis').select('*, users!driver_id(name)').eq('id', myTaxi.id).single()
      if (t) setMyTaxi({ ...t, driver_name: t.users?.name || '' })
    }
    setToggling(false)
    setMenuOpen(false)
  }

  const loadTrips = useCallback(async (userId: string) => {
    const { data: taxi } = await supabase
      .from('taxis').select('id').eq('driver_id', userId).single()
    if (!taxi) return
    // Fetch upcoming (booked) and past (completed) separately
    const [{ data: upData }, { data: pastData }, { data: activeData }] = await Promise.all([
      supabase.from('booking_details').select('*')
        .eq('taxi_id', taxi.id).eq('status', 'booked')
        .order('scheduled_at', { ascending: true }).range(0, 9),
      supabase.from('booking_details').select('*')
        .eq('taxi_id', taxi.id).eq('status', 'completed')
        .order('scheduled_at', { ascending: false }).range(0, 4),
      supabase.from('booking_details').select('*')
        .eq('taxi_id', taxi.id).in('status', ['on_trip','waiting_trip']).limit(1),
    ])
    setUpcoming(upData || [])
    setPast(pastData || [])
    setActiveTrip((activeData || [])[0] || null)
    setUpPage(0)
    setPastPage(0)
    setHasMoreUp((upData || []).length === 10)
    setHasMorePast((pastData || []).length === 5)
  }, [supabase])

  useEffect(() => {
    let uid = ''
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      if (p?.role !== 'driver') { router.push('/login'); return }
      uid = au.id; setUser(p)
      await loadTrips(au.id)
      const { data: taxi } = await supabase
        .from('taxis').select('*, users!driver_id(name)').eq('driver_id', au.id).single()
      if (taxi) setMyTaxi({ ...taxi, driver_name: taxi.users?.name || p.name })
      setLoading(false)
    }
    init()
    const ch = supabase.channel('driver-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' },
        () => { if (uid) loadTrips(uid) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_details' },
        () => { if (uid) loadTrips(uid) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'taxis' },
        async () => {
          if (!uid) return
          const { data: taxi } = await supabase
            .from('taxis').select('*, users!driver_id(name)').eq('driver_id', uid).single()
          if (taxi) setMyTaxi({ ...taxi, driver_name: taxi.users?.name || '' })
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  async function startTrip(id: string) {
    setProcessing(id)
    const token = await getToken()
    const res = await fetch(`/api/bookings/${id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) { alert('Error: ' + ((await res.json().catch(() => ({}))).error || 'Failed')); setProcessing(null); return }
    setSelected(null)
    setTab('active')  // switch immediately, don't wait for reload
    if (user) await loadTrips(user.id)
    setProcessing(null)
  }

  async function complete(id: string) {
    setProcessing(id)
    const token = await getToken()
    const res = await fetch(`/api/bookings/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) { alert('Error: ' + ((await res.json().catch(() => ({}))).error || 'Failed')); setProcessing(null); return }
    setSelected(null)
    setTab('trips')  // switch back to trips after completing
    if (user) await loadTrips(user.id)
    setProcessing(null)
  }

  const now        = new Date()

  const nextTrip   = upcoming[0] || null

  const filterByDate = (list: DriverBooking[]) => list.filter(t => {
    if (!dateFrom && !dateTo) return true
    const d = new Date(t.scheduled_at)
    if (dateFrom && d < new Date(dateFrom + 'T00:00:00')) return false
    if (dateTo   && d > new Date(dateTo   + 'T23:59:59')) return false
    return true
  })
  const filteredUpcoming = filterByDate(upcoming)
  const filteredPast     = filterByDate(past)
  const doneToday        = past.filter(t => new Date(t.scheduled_at).toDateString() === now.toDateString()).length
  const hasActive        = !!activeTrip

  // Auto-switch to active tab when trip starts — MUST be before any early return
  useEffect(() => {
    if (hasActive) setTab('active')
  }, [hasActive])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: "'Inter',sans-serif", background: '#F5F5F2' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(0,96,100,0.15)', borderTop: '3px solid #006064', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const initials = user?.name?.split(' ').map(n => n[0]).slice(0,2).join('') || '?'

  const tabColor = myTaxi?.color || '#2563EB'

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#F5F5F2', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Header ── */}
      <header style={{ background: '#F5F5F2', borderBottom: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,96,100,0.06)', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: '#006064', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '2px', fontFamily: 'Arial Black, sans-serif' }}>VALE</span>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#006064', margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.3px', lineHeight: 1 }}>TaxiBook EPS</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: myTaxi?.is_available === false ? '#ba1a1a' : '#344500', display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: '#6f7979', fontWeight: 500 }}>{myTaxi?.is_available === false ? 'Offline' : 'On duty'}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => router.push('/driver/notifications')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
            <div style={{ position: 'relative' }}>
              <div onClick={() => setMenuOpen(o => !o)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#006064', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '2px solid rgba(0,96,100,0.3)', position: 'relative', flexShrink: 0 }}>
                {initials}
                <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', border: '2px solid #F5F5F2', display: 'block' }} />
              </div>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{ position: 'absolute', top: 44, right: 0, background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 99, minWidth: 220, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#F5F5F2' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: '#1a1c1b' }}>{user?.name}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{myTaxi?.name || 'Driver'}</p>
                    </div>
                    <button onClick={toggleAvailability} disabled={toggling} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', flexShrink: 0, display: 'inline-block' }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 1px', color: '#006064' }}>{toggling ? 'Updating...' : myTaxi?.is_available === false ? 'Set Online' : 'Set Offline'}</p>
                        <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{myTaxi?.is_available === false ? 'You will receive new trips' : 'Stop receiving new trips'}</p>
                      </div>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/driver/profile') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
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

      {/* ── Driver hero card ── */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', margin: '0 0 3px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Welcome back</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#006064', margin: '0 0 4px', letterSpacing: '-0.5px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{user?.name?.split(' ')[0]}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: '#3f4949', fontWeight: 600 }}>
                {myTaxi?.is_available === false ? 'Offline' : 'On duty'}
              </span>
              {myTaxi && <span style={{ fontSize: 13, color: '#9ca3af' }}>· {myTaxi.name}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'center', background: 'rgba(0,96,100,0.06)', borderRadius: 12, padding: '10px 16px', position: 'relative' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#006064', margin: '0 0 3px', opacity: 0.75 }}>Today</p>
            <p style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#006064', letterSpacing: '-1px', lineHeight: 1 }}>{doneToday}</p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>done</p>
          </div>
        </div>



        {/* ── Tabs ── */}
        <div style={{ display: 'flex' }}>
          {([
            { key: 'trips',    label: 'My Trips' },
            { key: 'active',   label: activeTrip ? '🚗 Active' : 'Active', dot: !!activeTrip },
            { key: 'calendar', label: 'Calendar' },
          ] as { key: Tab; label: string; dot?: boolean }[]).map(({ key, label, dot }) => {
            const active = tab === key
            return (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: '9px 6px', fontSize: 13, fontWeight: 600,
                border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                color: active ? '#006064' : '#9ca3af',
                borderBottom: active ? `2.5px solid ${tabColor}` : '2.5px solid transparent',
                marginBottom: -1, position: 'relative',
              }}>
                {label}
                {dot && !active && (
                  <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 18px)', width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── ACTIVE TAB ── */}
      {tab === 'active' && (
        <div style={{ padding: '16px 16px 100px' }}>
          {activeTrip ? (
            <ActiveTripCard
              trip={activeTrip}
              processing={processing}
              onComplete={complete}
            />
          ) : nextTrip ? (
            <div>
              <div style={{ background: 'rgba(0,96,100,0.1)', border: '1px solid #93C5FD', borderRadius: 16, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#006064', margin: 0 }}>
                  No active trip — next trip at {format(new Date(nextTrip.scheduled_at), 'HH:mm')}
                </p>
              </div>
              <TripDetailCard trip={nextTrip} processing={processing} onStart={startTrip} />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 32, margin: '0 0 12px' }}>🟢</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#006064', margin: '0 0 4px' }}>You're free</p>
              <p style={{ fontSize: 13, color: '#6f7979', margin: 0 }}>No active or upcoming trips</p>
            </div>
          )}
        </div>
      )}

      {/* ── TRIPS TAB ── */}
      {tab === 'trips' && (
        <div style={{ padding: '16px 16px 100px' }}>

          {/* Compact date filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: 0 }}>All trips</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '5px 10px' }}>
              <span style={{ fontSize: 11 }}>📅</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ width: 116, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'Inter, sans-serif', background: 'transparent', color: '#006064' }} />
              <span style={{ fontSize: 10, color: '#9ca3af' }}>→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ width: 116, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'Inter, sans-serif', background: 'transparent', color: '#006064' }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo('') }}
                  style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, border: '1px solid rgba(0,0,0,0.08)', background: '#F5F5F2', color: '#6f7979', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Active trip mini banner */}
          {activeTrip && (
            <button
              onClick={() => setTab('active')}
              style={{ width: '100%', background: '#d8f3dc', border: '1px solid #B7E4C7', borderRadius: 16, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🚗</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#2D6A4F', margin: 0 }}>
                  Trip in progress — {activeTrip.destination}
                </p>
              </div>
              <span style={{ fontSize: 13, color: '#2D6A4F' }}>→</span>
            </button>
          )}

          {/* Upcoming */}
          {filteredUpcoming.length > 0 && (
            <>
              <SLabel>Upcoming — {filteredUpcoming.length} trip{filteredUpcoming.length > 1 ? 's' : ''}</SLabel>
              {filteredUpcoming.map(t => (
                <TripRow key={t.id} trip={t} onTap={() => setSelected(t)} />
              ))}
              {hasMoreUp && (
                <button disabled={loadingMore} onClick={async () => {
                  setLoadingMore(true)
                  const { data: taxi } = await supabase.from('taxis').select('id').eq('driver_id', user!.id).single()
                  if (taxi) {
                    const nextPage = upPage + 1
                    const { data } = await supabase.from('booking_details').select('*')
                      .eq('taxi_id', taxi.id).eq('status', 'booked')
                      .order('scheduled_at', { ascending: true })
                      .range(nextPage * 10, nextPage * 10 + 9)
                    if (data) { setUpcoming(prev => [...prev, ...data]); setHasMoreUp(data.length === 10); setUpPage(nextPage) }
                  }
                  setLoadingMore(false)
                }} style={{ width: '100%', padding: '11px', marginTop: 4, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 600, color: loadingMore ? '#9ca3af' : '#006064', cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}

          {/* Past */}
          {filteredPast.length > 0 && (
            <>
              <SLabel>Recent completed</SLabel>
              {filteredPast.map(t => (
                <TripRow key={t.id} trip={t} done />
              ))}
              {hasMorePast && (
                <button disabled={loadingMore} onClick={async () => {
                  setLoadingMore(true)
                  const { data: taxi } = await supabase.from('taxis').select('id').eq('driver_id', user!.id).single()
                  if (taxi) {
                    const nextPage = pastPage + 1
                    const { data } = await supabase.from('booking_details').select('*')
                      .eq('taxi_id', taxi.id).eq('status', 'completed')
                      .order('scheduled_at', { ascending: false })
                      .range(nextPage * 5, nextPage * 5 + 4)
                    if (data) { setPast(prev => [...prev, ...data]); setHasMorePast(data.length === 5); setPastPage(nextPage) }
                  }
                  setLoadingMore(false)
                }} style={{ width: '100%', padding: '11px', marginTop: 4, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 600, color: loadingMore ? '#9ca3af' : '#006064', cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}

          {filteredUpcoming.length === 0 && filteredPast.length === 0 && !activeTrip && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
              <p style={{ fontSize: 14, margin: '0 0 4px' }}>No trips assigned yet</p>
              <p style={{ fontSize: 12, margin: 0 }}>You'll be notified when a trip is assigned</p>
            </div>
          )}
        </div>
      )}

      {/* ── CALENDAR TAB ── */}
      {tab === 'calendar' && myTaxi && (
        <GanttCalendar
          bookings={[...upcoming, ...(activeTrip ? [activeTrip] : [])] as any}
          taxis={[myTaxi]}
        />
      )}

      {/* ── Trip detail sheet ── */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', margin: '0 auto 20px' }} />
            <TripDetailCard trip={selected} processing={processing} onStart={startTrip} onComplete={complete} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Active trip card (prominent) ────────────────────────────
function ActiveTripCard({ trip: t, processing, onComplete }: {
  trip: DriverBooking; processing: string | null; onComplete: (id: string) => void
}) {
  const isWait   = t.trip_type === 'WAITING'
  const statusBg = isWait ? '#EDE9FE' : '#D8F3DC'
  const statusC  = isWait ? '#4C1D95' : '#2D6A4F'
  const statusTx = isWait ? `⏱ Waiting at destination — ${t.wait_minutes} min` : '🚗 Trip in progress'

  return (
    <div style={{ background: '#ffffff', borderRadius: 18, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
      {/* Status strip */}
      <div style={{ background: statusBg, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: statusC, margin: 0 }}>{statusTx}</p>
        <span style={{ fontSize: 12, color: statusC, opacity: 0.7, fontWeight: 500 }}>
          {format(new Date(t.scheduled_at), 'HH:mm')}
        </span>
      </div>

      <div style={{ padding: '18px 16px' }}>
        {/* Passenger */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.3px' }}>{t.passenger_name}</p>
            <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{t.booking_code}</p>
          </div>
          <TypeBadge type={t.trip_type} wait={t.wait_minutes} />
        </div>

        {/* Route */}
        <RouteBlock pickup={t.pickup} destination={t.destination} />

        {t.notes && (
          <div style={{ background: '#ffdeac', border: '1px solid #FDE68A', borderRadius: 10, padding: '8px 12px', margin: '12px 0' }}>
            <p style={{ fontSize: 12, color: '#7e5700', margin: 0 }}>📝 {t.notes}</p>
          </div>
        )}

        <button
          onClick={() => onComplete(t.id)}
          disabled={processing === t.id}
          style={{ width: '100%', marginTop: 14, padding: '14px', background: processing === t.id ? 'rgba(0,0,0,0.08)' : '#006064', color: '#fff', border: 'none', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: processing === t.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          {processing === t.id ? 'Completing...' : '✓ Mark completed — back at base'}
        </button>
      </div>
    </div>
  )
}

// ── Trip detail card (for sheet + active tab next trip) ─────
function TripDetailCard({ trip: t, processing, onStart, onComplete }: {
  trip: DriverBooking; processing: string | null
  onStart?: (id: string) => void; onComplete?: (id: string) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 19, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.3px' }}>{t.passenger_name}</p>
          <p style={{ fontSize: 13, color: '#6f7979', margin: 0 }}>
            {format(new Date(t.scheduled_at), 'EEE, d MMM · HH:mm', { locale: idLocale })}
          </p>
        </div>
        <TypeBadge type={t.trip_type} wait={t.wait_minutes} />
      </div>

      <RouteBlock pickup={t.pickup} destination={t.destination} />

      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', margin: '12px 0' }}>
        {[
          { l: 'Booking ID', v: t.booking_code },
          { l: 'Trip type',  v: t.trip_type === 'DROP' ? 'Drop — one way' : `Waiting — ${t.wait_minutes} min` },
          ...(t.notes ? [{ l: 'Notes', v: t.notes }] : []),
        ].map((r, i, arr) => (
          <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
            <span style={{ fontSize: 12, color: '#6f7979' }}>{r.l}</span>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: r.l === 'Booking ID' ? 'monospace' : FONT, textAlign: 'right', maxWidth: '60%' }}>{r.v}</span>
          </div>
        ))}
      </div>

      {t.status === 'booked' && onStart && (
        <button
          onClick={() => onStart(t.id)}
          disabled={processing === t.id}
          style={{ width: '100%', padding: '13px', background: processing === t.id ? 'rgba(0,0,0,0.08)' : '#006064', color: '#fff', border: 'none', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          {processing === t.id ? 'Starting...' : '🚗 Start trip — pick up passenger'}
        </button>
      )}

      {['on_trip','waiting_trip'].includes(t.status) && onComplete && (
        <button
          onClick={() => onComplete(t.id)}
          disabled={processing === t.id}
          style={{ width: '100%', padding: '13px', background: processing === t.id ? 'rgba(0,0,0,0.08)' : '#2D6A4F', color: '#fff', border: 'none', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          {processing === t.id ? 'Completing...' : '✓ Mark completed'}
        </button>
      )}
    </div>
  )
}

// ── Trip row in list ────────────────────────────────────────
function TripRow({ trip: t, onTap, done }: { trip: DriverBooking; onTap?: () => void; done?: boolean }) {
  const statusColor = done
    ? { bg: '#d8f3dc', color: '#344500', label: 'Done' }
    : { bg: 'rgba(0,96,100,0.1)', color: '#006064', label: 'Confirmed' }
  return (
    <div
      onClick={onTap}
      style={{
        background: '#ffffff',
        border: '1px solid rgba(0,0,0,0.06)',
        borderLeft: `3px solid ${done ? '#52B788' : '#006064'}`,
        borderRadius: 16,
        padding: '14px 14px 14px 14px',
        marginBottom: 10,
        cursor: onTap ? 'pointer' : 'default',
        boxShadow: '0 2px 8px rgba(0,96,100,0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 3px', color: '#1a1c1b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {t.passenger_name}
          </p>
          <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>
            {format(new Date(t.scheduled_at), 'EEE, d MMM · HH:mm', { locale: idLocale })} · {t.destination}
          </p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: statusColor.bg, color: statusColor.color, flexShrink: 0 }}>
          {statusColor.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8 }}>
        <TypeBadge type={t.trip_type} wait={t.wait_minutes} small />
        {t.pickup && <span style={{ fontSize: 11, color: '#9ca3af' }}>from {t.pickup}</span>}
      </div>
    </div>
  )
}

// ── Route block ─────────────────────────────────────────────
function RouteBlock({ pickup, destination }: { pickup: string; destination: string }) {
  return (
    <div style={{ background: '#F5F5F2', borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#006064', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Pickup</p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{pickup}</p>
        </div>
      </div>
      <div style={{ width: 1, height: 14, background: '#D1D5DB', marginLeft: 3, marginBottom: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#52B788', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Destination</p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{destination}</p>
        </div>
      </div>
    </div>
  )
}

// ── Type badge ──────────────────────────────────────────────
function TypeBadge({ type, wait, small }: { type: string; wait: number; small?: boolean }) {
  const isWait = type === 'WAITING'
  return (
    <span style={{
      fontSize: small ? 10 : 11, fontWeight: 700,
      padding: small ? '2px 7px' : '3px 10px',
      borderRadius: 9999, flexShrink: 0,
      background: isWait ? '#EDE9FE' : '#DBEAFE',
      color:      isWait ? '#4C1D95'  : '#1E3A5F',
    }}>
      {isWait ? `⏱ Wait ${wait}m` : '→ Drop'}
    </span>
  )
}

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '16px 0 8px' }}>
      {children}
    </p>
  )
}
