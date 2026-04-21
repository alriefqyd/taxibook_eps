'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { User } from '@/types'
import GanttCalendar from '@/components/GanttCalendar'

const FONT = "'DM Sans', -apple-system, sans-serif"

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
  const [myTaxi,     setMyTaxi]     = useState<any | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [selected,   setSelected]   = useState<DriverBooking | null>(null)
  const [tab,        setTab]        = useState<Tab>('trips')
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
    const { data } = await supabase
      .from('booking_details').select('*')
      .eq('taxi_id', taxi.id)
      .not('status', 'in', '("cancelled","rejected")')
      .order('scheduled_at', { ascending: true })
    setTrips(data || [])
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
    if (!res.ok) alert('Error: ' + ((await res.json().catch(() => ({}))).error || 'Failed'))
    setSelected(null)
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
    if (user) await loadTrips(user.id)
    setProcessing(null)
  }

  const now        = new Date()
  const activeTrip = trips.find(t => ['on_trip','waiting_trip'].includes(t.status))
  const nextTrip   = trips.find(t => t.status === 'booked')
  const upcoming   = trips.filter(t => t.status === 'booked')
  const past       = trips.filter(t => t.status === 'completed').slice(-5).reverse()
  const doneToday  = trips.filter(t => t.status === 'completed' && new Date(t.scheduled_at).toDateString() === now.toDateString()).length
  const hasActive  = !!activeTrip

  // Auto-switch to active tab when trip starts — MUST be before any early return
  useEffect(() => {
    if (hasActive) setTab('active')
  }, [hasActive])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, background: '#F4F3EF' }}>
      <p style={{ color: '#A8A6A0' }}>Loading...</p>
    </div>
  )

  const initials = user?.name?.split(' ').map(n => n[0]).slice(0,2).join('') || '?'

  const tabColor = myTaxi?.color || '#2563EB'

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F4F3EF', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Header ── */}
      <div style={{ background: '#fff', padding: '16px 20px 0', borderBottom: '1px solid #E0DED8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            {/* Avatar — tap to open menu */}
            <div
              onClick={() => setMenuOpen(o => !o)}
              style={{ width: 40, height: 40, borderRadius: '50%', background: myTaxi?.is_available === false ? '#FEE2E2' : '#D8F3DC', color: myTaxi?.is_available === false ? '#991B1B' : '#2D6A4F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer', position: 'relative', flexShrink: 0 }}
            >
              {initials}
              {/* Status dot */}
              <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', border: '2px solid #fff', display: 'block' }} />
            </div>

            <div>
              <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.2px' }}>{user?.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: myTaxi?.is_available === false ? '#991B1B' : '#2D6A4F', fontWeight: 600 }}>
                  {myTaxi?.is_available === false ? 'Offline' : 'On duty'}
                </span>
                {myTaxi && <span style={{ fontSize: 12, color: '#A8A6A0' }}>· {myTaxi.name}</span>}
              </div>
            </div>

            {/* Dropdown menu */}
            {menuOpen && (
              <>
                {/* Backdrop */}
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                <div style={{ position: 'absolute', top: 48, left: 0, background: '#fff', borderRadius: 14, border: '1px solid #E0DED8', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 99, minWidth: 200, overflow: 'hidden' }}>
                  {/* User info */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0EEE8' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px' }}>{user?.name}</p>
                    <p style={{ fontSize: 11, color: '#A8A6A0', margin: 0 }}>{myTaxi?.name || 'Driver'}</p>
                  </div>

                  {/* Status toggle */}
                  <button
                    onClick={toggleAvailability}
                    disabled={toggling}
                    style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', flexShrink: 0, display: 'inline-block' }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 1px', color: '#0F0F0F' }}>
                        {toggling ? 'Updating...' : myTaxi?.is_available === false ? 'Set Online' : 'Set Offline'}
                      </p>
                      <p style={{ fontSize: 11, color: '#A8A6A0', margin: 0 }}>
                        {myTaxi?.is_available === false ? 'You will receive new trips' : 'Stop receiving new trips'}
                      </p>
                    </div>
                  </button>

                  {/* Divider */}
                  <div style={{ height: 1, background: '#F0EEE8' }} />

                  {/* Profile link */}
                  <button
                    onClick={() => { setMenuOpen(false); router.push('/driver/profile') }}
                    style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT }}
                  >
                    <span style={{ fontSize: 16 }}>👤</span>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#0F0F0F' }}>View profile</p>
                  </button>

                  {/* Sign out */}
                  <button
                    onClick={async () => { setMenuOpen(false); await supabase.auth.signOut(); router.push('/login') }}
                    style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT }}
                  >
                    <span style={{ fontSize: 16 }}>🚪</span>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#991B1B' }}>Sign out</p>
                  </button>
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ background: '#F4F3EF', borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: '#A8A6A0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 1px' }}>Today</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>{doneToday} <span style={{ fontSize: 11, fontWeight: 500, color: '#A8A6A0' }}>done</span></p>
            </div>

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
                border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: FONT,
                color: active ? '#0F0F0F' : '#A8A6A0',
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
        <div style={{ padding: '20px 16px 32px' }}>
          {activeTrip ? (
            <ActiveTripCard
              trip={activeTrip}
              processing={processing}
              onComplete={complete}
            />
          ) : nextTrip ? (
            <div>
              <div style={{ background: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1E3A5F', margin: 0 }}>
                  No active trip — next trip at {format(new Date(nextTrip.scheduled_at), 'HH:mm')}
                </p>
              </div>
              <TripDetailCard trip={nextTrip} processing={processing} onStart={startTrip} />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #E0DED8' }}>
              <p style={{ fontSize: 32, margin: '0 0 12px' }}>🟢</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0F0F0F', margin: '0 0 4px' }}>You're free</p>
              <p style={{ fontSize: 13, color: '#6B6963', margin: 0 }}>No active or upcoming trips</p>
            </div>
          )}
        </div>
      )}

      {/* ── TRIPS TAB ── */}
      {tab === 'trips' && (
        <div style={{ padding: '16px 16px 32px' }}>

          {/* Active trip mini banner */}
          {activeTrip && (
            <button
              onClick={() => setTab('active')}
              style={{ width: '100%', background: '#D8F3DC', border: '1px solid #B7E4C7', borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: FONT }}
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
          {upcoming.length > 0 && (
            <>
              <SLabel>Upcoming — {upcoming.length} trip{upcoming.length > 1 ? 's' : ''}</SLabel>
              {upcoming.map(t => (
                <TripRow key={t.id} trip={t} onTap={() => setSelected(t)} />
              ))}
            </>
          )}

          {/* Past */}
          {past.length > 0 && (
            <>
              <SLabel>Recent completed</SLabel>
              {past.map(t => (
                <TripRow key={t.id} trip={t} done />
              ))}
            </>
          )}

          {trips.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#A8A6A0' }}>
              <p style={{ fontSize: 14, margin: '0 0 4px' }}>No trips assigned yet</p>
              <p style={{ fontSize: 12, margin: 0 }}>You'll be notified when a trip is assigned</p>
            </div>
          )}
        </div>
      )}

      {/* ── CALENDAR TAB ── */}
      {tab === 'calendar' && myTaxi && (
        <GanttCalendar
          bookings={trips.filter(t => ['booked','on_trip','waiting_trip'].includes(t.status)) as any}
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
            style={{ background: '#fff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E0DED8', margin: '0 auto 20px' }} />
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
    <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E0DED8', overflow: 'hidden' }}>
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
            <p style={{ fontSize: 12, color: '#6B6963', margin: 0 }}>{t.booking_code}</p>
          </div>
          <TypeBadge type={t.trip_type} wait={t.wait_minutes} />
        </div>

        {/* Route */}
        <RouteBlock pickup={t.pickup} destination={t.destination} />

        {t.notes && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', margin: '12px 0' }}>
            <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>📝 {t.notes}</p>
          </div>
        )}

        <button
          onClick={() => onComplete(t.id)}
          disabled={processing === t.id}
          style={{ width: '100%', marginTop: 14, padding: '14px', background: processing === t.id ? '#E0DED8' : '#0F0F0F', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: processing === t.id ? 'not-allowed' : 'pointer', fontFamily: FONT }}
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
          <p style={{ fontSize: 13, color: '#6B6963', margin: 0 }}>
            {format(new Date(t.scheduled_at), 'EEE, d MMM · HH:mm', { locale: idLocale })}
          </p>
        </div>
        <TypeBadge type={t.trip_type} wait={t.wait_minutes} />
      </div>

      <RouteBlock pickup={t.pickup} destination={t.destination} />

      <div style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: 12, overflow: 'hidden', margin: '12px 0' }}>
        {[
          { l: 'Booking ID', v: t.booking_code },
          { l: 'Trip type',  v: t.trip_type === 'DROP' ? 'Drop — one way' : `Waiting — ${t.wait_minutes} min` },
          ...(t.notes ? [{ l: 'Notes', v: t.notes }] : []),
        ].map((r, i, arr) => (
          <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid #F4F3EF' : 'none' }}>
            <span style={{ fontSize: 12, color: '#6B6963' }}>{r.l}</span>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: r.l === 'Booking ID' ? 'monospace' : FONT, textAlign: 'right', maxWidth: '60%' }}>{r.v}</span>
          </div>
        ))}
      </div>

      {t.status === 'booked' && onStart && (
        <button
          onClick={() => onStart(t.id)}
          disabled={processing === t.id}
          style={{ width: '100%', padding: '13px', background: processing === t.id ? '#E0DED8' : '#0F0F0F', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
        >
          {processing === t.id ? 'Starting...' : '🚗 Start trip — pick up passenger'}
        </button>
      )}

      {['on_trip','waiting_trip'].includes(t.status) && onComplete && (
        <button
          onClick={() => onComplete(t.id)}
          disabled={processing === t.id}
          style={{ width: '100%', padding: '13px', background: processing === t.id ? '#E0DED8' : '#2D6A4F', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
        >
          {processing === t.id ? 'Completing...' : '✓ Mark completed'}
        </button>
      )}
    </div>
  )
}

// ── Trip row in list ────────────────────────────────────────
function TripRow({ trip: t, onTap, done }: { trip: DriverBooking; onTap?: () => void; done?: boolean }) {
  return (
    <div
      onClick={onTap}
      style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: 14, padding: '12px 14px', marginBottom: 8, cursor: onTap ? 'pointer' : 'default', opacity: done ? 0.6 : 1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.passenger_name}
          </p>
          <p style={{ fontSize: 12, color: '#6B6963', margin: 0 }}>
            {format(new Date(t.scheduled_at), 'HH:mm')} · {t.destination}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <TypeBadge type={t.trip_type} wait={t.wait_minutes} small />
          {done && <span style={{ fontSize: 9, fontWeight: 700, color: '#A8A6A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Done</span>}
        </div>
      </div>
    </div>
  )
}

// ── Route block ─────────────────────────────────────────────
function RouteBlock({ pickup, destination }: { pickup: string; destination: string }) {
  return (
    <div style={{ background: '#F4F3EF', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0F0F0F', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 10, color: '#A8A6A0', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Pickup</p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{pickup}</p>
        </div>
      </div>
      <div style={{ width: 1, height: 14, background: '#D1D5DB', marginLeft: 3, marginBottom: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#52B788', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 10, color: '#A8A6A0', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Destination</p>
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
      borderRadius: 999, flexShrink: 0,
      background: isWait ? '#EDE9FE' : '#DBEAFE',
      color:      isWait ? '#4C1D95'  : '#1E3A5F',
    }}>
      {isWait ? `⏱ Wait ${wait}m` : '→ Drop'}
    </span>
  )
}

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A6A0', margin: '16px 0 8px' }}>
      {children}
    </p>
  )
}
