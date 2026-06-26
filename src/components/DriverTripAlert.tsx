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
  const [overdueTrips, setOverdueTrips] = useState<UrgentBooking[]>([])
  const [processing,   setProcessing]   = useState<string | null>(null)
  const [overdueIdx,   setOverdueIdx]   = useState(0)

  async function load() {
    const { data: taxi } = await supabase
      .from('taxis').select('id').eq('driver_id', userId).single()
    if (!taxi) return

    const overdueThreshold = new Date(Date.now() - 10 * 60 * 1000)
    const { data: overdue } = await supabase
      .from('booking_details').select('*')
      .eq('taxi_id', taxi.id).eq('status', 'booked')
      .lte('scheduled_at', overdueThreshold.toISOString())
      .order('scheduled_at', { ascending: true })

    setOverdueTrips(overdue || [])
    setOverdueIdx(0)
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

  if (overdueTrips.length === 0) return null

  return (
    <>
      {/* Overlay */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200 }} />

      {/* Card */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 201 }}>
        <div style={{ background: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          <OverdueCard
            trips={overdueTrips}
            idx={overdueIdx}
            setIdx={setOverdueIdx}
            processing={processing}
            onStart={startTrip}
          />

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
        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', margin: '10px 0 0' }}>
          Cannot dismiss — start the trip to close this
        </p>
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
          <span style={{ fontSize: 12, color: '#6f7979', fontWeight: 600, flexShrink: 0 }}>
            {format(tripAt, 'HH:mm', { locale: idLocale })}
          </span>
        </div>
        {/* Trip type detail */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999,
            background: isWaiting ? '#EDE9FE' : '#DBEAFE',
            color:      isWaiting ? '#4C1D95'  : '#1E3A5F',
          }}>
            {isWaiting ? `⏱ Waiting — ${trip.wait_minutes} min` : '→ Drop only'}
          </span>
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>
            ~{isWaiting ? `${trip.wait_minutes + 30}min total` : '~30min'}
          </span>
        </div>
      </div>

      {/* Route */}
      <div style={{ background: '#F5F5F2', borderRadius: 16, padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#006064', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Pickup</p>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{trip.pickup}</p>
          </div>
        </div>
        <div style={{ width: 1, height: 14, background: '#D1D5DB', marginLeft: 3, marginBottom: 8 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#52B788', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Destination</p>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{trip.destination}</p>
          </div>
        </div>
      </div>

      {/* Waiting detail box */}
      {isWaiting && (
        <div style={{ background: 'rgba(0,96,100,0.1)', border: '1px solid #C4B5FD', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#006064', margin: '0 0 2px' }}>⏱ Waiting trip</p>
          <p style={{ fontSize: 11, color: '#006064', margin: 0 }}>
            You will wait <strong>{trip.wait_minutes} minutes</strong> at destination for passenger to return.
            Estimated total: ~{trip.wait_minutes + 30} min.
          </p>
        </div>
      )}

      {trip.notes && (
        <div style={{ background: '#ffdeac', border: '1px solid #FCD34D', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: '#7e5700', margin: 0 }}>📝 {trip.notes}</p>
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
    border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 800,
    cursor: 'pointer', fontFamily: 'system-ui', letterSpacing: '-0.2px',
  }
}
