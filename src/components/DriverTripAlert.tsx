'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

interface UrgentBooking {
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
  taxi_color:     string | null
}

interface Props { userId: string }

export default function DriverTripAlert({ userId }: Props) {
  const supabase = createClient()
  const [overdueTrips,  setOverdueTrips]  = useState<UrgentBooking[]>([])
  const [pendingTrips,  setPendingTrips]  = useState<UrgentBooking[]>([])
  const [upcomingTrips, setUpcomingTrips] = useState<UrgentBooking[]>([])
  const [processing,    setProcessing]    = useState<string | null>(null)
  const [overdueIdx,    setOverdueIdx]    = useState(0)
  const [pendingIdx,    setPendingIdx]    = useState(0)

  async function load() {
    const { data: taxi } = await supabase
      .from('taxis').select('id').eq('driver_id', userId).single()
    if (!taxi) return

    const now = new Date()

    // 1. Overdue — booked but not started past scheduled time
    const { data: overdue } = await supabase
      .from('booking_details').select('*')
      .eq('taxi_id', taxi.id).eq('status', 'booked')
      .lte('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })

    // 2. Pending driver approval — needs accept/decline
    const { data: pending } = await supabase
      .from('booking_details').select('*')
      .eq('taxi_id', taxi.id).eq('status', 'pending_driver_approval')
      .order('scheduled_at', { ascending: true })

    // 3. Upcoming confirmed (for warning on pending)
    const { data: upcoming } = await supabase
      .from('booking_details').select('*')
      .eq('taxi_id', taxi.id).eq('status', 'booked')
      .gt('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })

    setOverdueTrips(overdue  || [])
    setPendingTrips(pending  || [])
    setUpcomingTrips(upcoming || [])
    setOverdueIdx(0)
    setPendingIdx(0)
  }

  useEffect(() => {
    if (!userId) return
    load()
    const interval = setInterval(load, 30000)
    const ch = supabase.channel('driver-alert')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, load)
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
  }, [userId])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  async function startTrip(bookingId: string) {
    setProcessing(bookingId)
    const token = await getToken()
    const res = await fetch(`/api/bookings/${bookingId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert('Error: ' + (d.error || 'Failed'))
    }
    await load()
    setProcessing(null)
  }

  async function respond(bookingId: string, action: 'accept' | 'decline') {
    setProcessing(bookingId)
    const token = await getToken()
    const res = await fetch(`/api/bookings/${bookingId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert('Error: ' + (d.error || 'Failed'))
    }
    await load()
    setProcessing(null)
  }

  // Show overdue first (cannot dismiss), then pending (can accept/decline)
  const showOverdue  = overdueTrips.length > 0
  const showPending  = !showOverdue && pendingTrips.length > 0

  if (!showOverdue && !showPending) return null

  return (
    <>
      {/* Overlay */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200 }} />

      {/* Card */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 201 }}>
        <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          {showOverdue && <OverdueCard
            trips={overdueTrips}
            idx={overdueIdx}
            setIdx={setOverdueIdx}
            processing={processing}
            onStart={startTrip}
          />}

          {showPending && <PendingCard
            trips={pendingTrips}
            idx={pendingIdx}
            setIdx={setPendingIdx}
            upcomingTrips={upcomingTrips}
            processing={processing}
            onRespond={respond}
          />}

        </div>
      </div>
    </>
  )
}

// ── OVERDUE card — cannot dismiss ──────────────────────────
function OverdueCard({ trips, idx, setIdx, processing, onStart }: {
  trips: UrgentBooking[]
  idx: number
  setIdx: (i: number) => void
  processing: string | null
  onStart: (id: string) => void
}) {
  const trip = trips[idx]
  if (!trip) return null
  const scheduledTime = new Date(trip.scheduled_at)
  const minutesLate   = Math.round((Date.now() - scheduledTime.getTime()) / 60000)

  return (
    <>
      <div style={{ background: '#EF4444', padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>
              Trip overdue — {minutesLate} min late
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
              Passenger is waiting. Start now.
            </p>
          </div>
        </div>
        <Dots count={trips.length} current={idx} onSelect={setIdx} />
      </div>
      <TripBody trip={trip} />
      <div style={{ padding: '0 20px 20px' }}>
        <button
          onClick={() => onStart(trip.id)}
          disabled={processing === trip.id}
          style={btnStyle('#EF4444')}
        >
          {processing === trip.id ? 'Starting...' : '🚗 Start trip now'}
        </button>
        <p style={{ fontSize: 11, color: '#A8A6A0', textAlign: 'center', margin: '10px 0 0' }}>
          Cannot dismiss — start the trip to close this
        </p>
      </div>
    </>
  )
}

// ── PENDING card — accept or decline ──────────────────────
function PendingCard({ trips, idx, setIdx, upcomingTrips, processing, onRespond }: {
  trips: UrgentBooking[]
  idx: number
  setIdx: (i: number) => void
  upcomingTrips: UrgentBooking[]
  processing: string | null
  onRespond: (id: string, action: 'accept' | 'decline') => void
}) {
  const trip = trips[idx]
  if (!trip) return null

  const isNow        = new Date(trip.scheduled_at) <= new Date(Date.now() + 5 * 60000)
  const scheduledAt  = new Date(trip.scheduled_at)

  // Warn about upcoming bookings that might conflict
  // Find ALL upcoming trips that could conflict (within 4 hours)
  const conflicts = upcomingTrips.filter(u => {
    const diff = (new Date(u.scheduled_at).getTime() - scheduledAt.getTime()) / 60000
    return diff > 0 && diff < 240 // within 4 hours
  }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  const conflictWarning = conflicts[0] // nearest conflict

  return (
    <>
      {/* Header */}
      <div style={{ background: isNow ? '#0F0F0F' : '#2563EB', padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{isNow ? '⚡' : '🚗'}</span>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>
              {isNow ? 'New trip — RIGHT NOW' : 'New trip assigned'}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
              {isNow
                ? 'Accept if you can make it back in time'
                : format(scheduledAt, 'EEE d MMM · HH:mm', { locale: idLocale })}
            </p>
          </div>
        </div>
        <Dots count={trips.length} current={idx} onSelect={setIdx} />
      </div>

      <TripBody trip={trip} />

      {/* Conflict warnings — show all upcoming trips that could conflict */}
      {conflicts.length > 0 && (
        <div style={{ margin: '0 20px 16px' }}>
          <div style={{ padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E', margin: '0 0 8px' }}>
              ⚠ Upcoming schedule conflict{conflicts.length > 1 ? 's' : ''}
            </p>
            {conflicts.map((u, i) => {
              const diffMin = Math.round((new Date(u.scheduled_at).getTime() - new Date(trip.scheduled_at).getTime()) / 60000)
              const uIsWait = u.trip_type === 'WAITING'
              return (
                <div key={u.id} style={{ paddingTop: i > 0 ? 6 : 0, marginTop: i > 0 ? 6 : 0, borderTop: i > 0 ? '1px solid #FDE68A' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E', margin: 0 }}>
                      {format(new Date(u.scheduled_at), 'HH:mm')} — {u.destination}
                    </p>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FDE68A', padding: '1px 7px', borderRadius: 999 }}>
                      in {diffMin}min
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: '#92400E', margin: '2px 0 0' }}>
                    {uIsWait ? `⏱ Waiting ${u.wait_minutes}min` : '→ Drop'} · Decline if you can't make it back
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          onClick={() => onRespond(trip.id, 'decline')}
          disabled={processing === trip.id}
          style={{ padding: '13px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui' }}
        >
          Decline
        </button>
        <button
          onClick={() => onRespond(trip.id, 'accept')}
          disabled={processing === trip.id}
          style={{ padding: '13px', background: '#065F46', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui' }}
        >
          {processing === trip.id ? '...' : 'Accept'}
        </button>
      </div>
    </>
  )
}

// ── Shared trip body ───────────────────────────────────────
function TripBody({ trip }: { trip: UrgentBooking }) {
  const isWaiting   = trip.trip_type === 'WAITING'
  const estDuration = isWaiting ? (2 * 60 + trip.wait_minutes) : 120 // rough estimate in minutes
  const tripAt      = new Date(trip.scheduled_at)

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Passenger + scheduled time */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
            {trip.passenger_name}
          </p>
          <span style={{ fontSize: 12, color: '#6B6963', fontWeight: 600, flexShrink: 0 }}>
            {format(tripAt, 'HH:mm', { locale: idLocale })}
          </span>
        </div>
        {/* Trip type detail */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            background: isWaiting ? '#EDE9FE' : '#DBEAFE',
            color:      isWaiting ? '#4C1D95'  : '#1E3A5F',
          }}>
            {isWaiting ? `⏱ Waiting — ${trip.wait_minutes} min` : '→ Drop only'}
          </span>
          <span style={{ fontSize: 11, color: '#A8A6A0', fontWeight: 500 }}>
            ~{isWaiting ? `${trip.wait_minutes + 30}min total` : '~30min'}
          </span>
        </div>
      </div>

      {/* Route */}
      <div style={{ background: '#F4F3EF', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0F0F0F', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 10, color: '#A8A6A0', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Pickup</p>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{trip.pickup}</p>
          </div>
        </div>
        <div style={{ width: 1, height: 14, background: '#D1D5DB', marginLeft: 3, marginBottom: 8 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#52B788', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 10, color: '#A8A6A0', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Destination</p>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{trip.destination}</p>
          </div>
        </div>
      </div>

      {/* Waiting detail box */}
      {isWaiting && (
        <div style={{ background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#4C1D95', margin: '0 0 2px' }}>⏱ Waiting trip</p>
          <p style={{ fontSize: 11, color: '#4C1D95', margin: 0 }}>
            You will wait <strong>{trip.wait_minutes} minutes</strong> at destination for passenger to return.
            Estimated total: ~{trip.wait_minutes + 30} min.
          </p>
        </div>
      )}

      {trip.notes && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>📝 {trip.notes}</p>
        </div>
      )}
    </div>
  )
}

// ── Dots indicator ─────────────────────────────────────────
function Dots({ count, current, onSelect }: { count: number; current: number; onSelect: (i: number) => void }) {
  if (count <= 1) return null
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} onClick={() => onSelect(i)} style={{ width: i === current ? 20 : 8, height: 8, borderRadius: 4, background: i === current ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'width 0.2s' }} />
      ))}
    </div>
  )
}

// ── Button style helper ────────────────────────────────────
function btnStyle(bg: string): React.CSSProperties {
  return {
    width: '100%', padding: '14px', background: bg, color: '#fff',
    border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
    cursor: 'pointer', fontFamily: 'system-ui', letterSpacing: '-0.2px',
  }
}
