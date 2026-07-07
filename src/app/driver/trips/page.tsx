'use client'

import React, { useEffect, useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import PageLoader from '@/components/PageLoader'

interface DriverBooking {
  id:               string
  booking_code:     string
  passenger_name:   string
  passenger_email:  string
  passenger_phone:  string | null
  pickup:           string
  destination:      string
  trip_type:        string
  wait_minutes:     number
  scheduled_at:     string
  created_at:       string
  assigned_at:      string | null
  completed_at:     string | null
  completed_by:     string | null
  auto_complete_at: string | null
  status:           string
  notes:            string | null
  rejection_reason: string | null
  taxi_name:        string | null
  taxi_plate:       string | null
  taxi_color:       string | null
  driver_name:      string | null
  driver_phone:     string | null
}

type StatusGroup = 'all' | 'completed' | 'upcoming'

const PRIMARY = '#006064'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  completed:    { bg: '#d8f3dc', color: '#344500', label: 'Done' },
  booked:       { bg: 'rgba(0,96,100,0.1)', color: '#006064', label: 'Confirmed' },
  on_trip:      { bg: '#FEF3C7', color: '#92400E', label: 'On trip' },
  waiting_trip: { bg: '#EDE9FE', color: '#4C1D95', label: 'Waiting' },
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 6px' }}>
      {children}
    </p>
  )
}

function DetailTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
      {rows.map((row, i) => (
        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '11px 14px', borderBottom: i < rows.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#6f7979', flexShrink: 0 }}>{row.label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: '#1a1c1b', maxWidth: '65%' }}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function matchesGroup(status: string, group: StatusGroup) {
  if (group === 'all')       return true
  if (group === 'completed') return status === 'completed'
  if (group === 'upcoming')  return ['booked', 'on_trip', 'waiting_trip'].includes(status)
  return true
}

export default function DriverTripsPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [bookings,    setBookings]    = useState<DriverBooking[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [taxiId,      setTaxiId]      = useState<string | null>(null)
  const [userId,      setUserId]      = useState<string | null>(null)

  const [statusGroup, setStatusGroup] = useState<StatusGroup>('all')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [page,         setPage]         = useState(0)
  const [hasMore,      setHasMore]      = useState(false)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [selectedTrip, setSelectedTrip] = useState<DriverBooking | null>(null)

  const PAGE_SIZE = 20

  async function loadData(tid: string, reset = true) {
    const currentPage = reset ? 0 : page + 1
    const { data } = await supabase
      .from('booking_details')
      .select('*')
      .eq('taxi_id', tid)
      .not('status', 'in', '("cancelled","rejected")')
      .order('scheduled_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1)

    if (reset) {
      setBookings(data || [])
      setPage(0)
    } else {
      setBookings(prev => [...prev, ...(data || [])])
      setPage(currentPage)
    }
    setHasMore((data || []).length === PAGE_SIZE)
    setLoading(false)
  }

  async function refresh() {
    if (!taxiId || refreshing) return
    setRefreshing(true)
    await loadData(taxiId, true)
    setRefreshing(false)
  }

  useEffect(() => {
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', au.id).single()
      if (p?.role !== 'driver') { router.push('/login'); return }
      setUserId(au.id)
      const { data: taxi } = await supabase.from('taxis').select('id').eq('driver_id', au.id).single()
      if (!taxi) { setLoading(false); return }
      setTaxiId(taxi.id)
      await loadData(taxi.id, true)
    }
    init()
  }, [])

  const filtered = bookings.filter(b => {
    if (!matchesGroup(b.status, statusGroup)) return false
    if (dateFrom) {
      if (new Date(b.scheduled_at) < new Date(dateFrom + 'T00:00:00')) return false
    }
    if (dateTo) {
      if (new Date(b.scheduled_at) > new Date(dateTo + 'T23:59:59')) return false
    }
    return true
  })

  const hasDateFilter = !!(dateFrom || dateTo)

  const GROUPS: { key: StatusGroup; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'upcoming',  label: 'Upcoming' },
    { key: 'completed', label: 'Completed' },
  ]

  if (loading) return <PageLoader />

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F2', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Header ── */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', margin: '0 0 3px' }}>My trips</p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: PRIMARY, margin: 0, letterSpacing: '-0.5px' }}>Trip history</h1>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{ marginTop: 4, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(0,96,100,0.08)', color: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <span style={{ display: 'flex', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </span>
          </button>
        </div>

        {/* ── Status chips ── */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 14, scrollbarWidth: 'none' as any }}>
          {GROUPS.map(sg => {
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
                  background: active ? PRIMARY : '#ffffff',
                  color: active ? '#ffffff' : '#6f7979',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'inherit',
                }}
              >
                {sg.label}
                <span style={{
                  fontSize: 10, fontWeight: 800, minWidth: 18, height: 18,
                  borderRadius: 9, padding: '0 4px',
                  background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.07)',
                  color: active ? '#ffffff' : '#6f7979',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Date range ── */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '0 0 14px' }}>
          <div style={{ flex: 1, background: '#F5F5F2', borderRadius: 12, padding: '10px 12px' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 4px' }}>From</p>
            <input
              type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: 'transparent', color: PRIMARY }}
            />
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
          <div style={{ flex: 1, background: '#F5F5F2', borderRadius: 12, padding: '10px 12px' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 4px' }}>To</p>
            <input
              type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: 'transparent', color: PRIMARY }}
            />
          </div>
          {hasDateFilter && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.06)', color: '#6f7979', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Filter summary ── */}
      {(statusGroup !== 'all' || hasDateFilter) && (
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 11, color: '#6f7979', margin: 0 }}>
            Showing <strong style={{ color: PRIMARY }}>{filtered.length}</strong> result{filtered.length !== 1 ? 's' : ''}
            {statusGroup !== 'all' && <> · <span style={{ color: PRIMARY }}>{GROUPS.find(g => g.key === statusGroup)?.label}</span></>}
            {hasDateFilter && <> · date range</>}
          </p>
          <button
            onClick={() => { setStatusGroup('all'); setDateFrom(''); setDateTo('') }}
            style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── List ── */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ background: '#ffffff', borderRadius: 16, padding: '32px 24px', border: '1px solid rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block' }}>
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', margin: '0 0 4px' }}>No trips found</p>
            <p style={{ fontSize: 11, color: '#c4c9c9', margin: 0 }}>Try changing your filter</p>
          </div>
        ) : (
          filtered.map(b => {
            const st    = STATUS_STYLE[b.status] || { bg: '#F3F4F6', color: '#6B7280', label: b.status }
            const isPast = b.status === 'completed'
            return (
              <div
                key={b.id}
                onClick={() => setSelectedTrip(b)}
                style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '14px',
                  border: '1px solid rgba(0,0,0,0.07)',
                  borderLeft: `3px solid ${isPast ? '#52B788' : PRIMARY}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  opacity: isPast ? 0.85 : 1,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.passenger_name}
                    </p>
                    <p style={{ fontSize: 11, color: '#6f7979', margin: 0 }}>
                      {format(new Date(b.scheduled_at), 'EEE, d MMM yyyy · HH:mm', { locale: idLocale })}
                    </p>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: st.bg, color: st.color, flexShrink: 0, marginTop: 1 }}>
                    {st.label}
                  </span>
                </div>

                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 2px' }}>
                    <span style={{ fontWeight: 600, color: '#6f7979' }}>{b.pickup}</span>
                    {' → '}
                    <span style={{ fontWeight: 600, color: '#6f7979' }}>{b.destination}</span>
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                      background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE',
                      color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95',
                    }}>
                      {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes} min`}
                    </span>
                    <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{b.booking_code}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Load more */}
        {hasMore && filtered.length === bookings.length && !hasDateFilter && statusGroup === 'all' && (
          <button
            disabled={loadingMore}
            onClick={async () => {
              if (!taxiId) return
              setLoadingMore(true)
              await loadData(taxiId, false)
              setLoadingMore(false)
            }}
            style={{ width: '100%', padding: '13px', background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 600, color: loadingMore ? '#9ca3af' : PRIMARY, cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>

      {/* ── Detail sheet ── */}
      {selectedTrip && (
        <div
          onClick={() => setSelectedTrip(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 1100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '20px 20px 40px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', margin: '0 auto 20px' }} />

            {/* Status + code */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              {(() => {
                const st = STATUS_STYLE[selectedTrip.status] || { bg: '#F3F4F6', color: '#6B7280', label: selectedTrip.status }
                return <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 9999, background: st.bg, color: st.color }}>{st.label}</span>
              })()}
              <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{selectedTrip.booking_code}</span>
            </div>

            {/* ── Passenger ── */}
            <SectionLabel>Passenger</SectionLabel>
            <div style={{ background: '#F5F5F2', borderRadius: 14, padding: '14px', marginBottom: 14 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: '#1a1c1b', margin: '0 0 6px', letterSpacing: '-0.3px' }}>{selectedTrip.passenger_name}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedTrip.passenger_phone && (
                  <a href={`tel:${selectedTrip.passenger_phone}`} style={{ fontSize: 12, color: PRIMARY, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.63 4.35 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    {selectedTrip.passenger_phone}
                  </a>
                )}
                {selectedTrip.passenger_email && (
                  <span style={{ fontSize: 12, color: '#6f7979' }}>{selectedTrip.passenger_email}</span>
                )}
              </div>
            </div>

            {/* ── Route ── */}
            <SectionLabel>Trip route</SectionLabel>
            <div style={{ background: '#F5F5F2', borderRadius: 14, padding: '14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIMARY, flexShrink: 0, marginTop: 4 }} />
                <div>
                  <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Pickup</p>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{selectedTrip.pickup}</p>
                </div>
              </div>
              <div style={{ width: 1, height: 12, background: '#D1D5DB', marginLeft: 3, marginBottom: 10 }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#52B788', flexShrink: 0, marginTop: 4 }} />
                <div>
                  <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Destination</p>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{selectedTrip.destination}</p>
                </div>
              </div>
            </div>

            {/* ── Time ── */}
            <SectionLabel>Time</SectionLabel>
            <DetailTable rows={[
              { label: 'Scheduled',   value: format(new Date(selectedTrip.scheduled_at), 'EEE, d MMM yyyy · HH:mm', { locale: idLocale }) },
              { label: 'Created',     value: format(new Date(selectedTrip.created_at),   'EEE, d MMM yyyy · HH:mm', { locale: idLocale }) },
              ...(selectedTrip.assigned_at     ? [{ label: 'Assigned',   value: format(new Date(selectedTrip.assigned_at),   'EEE, d MMM yyyy · HH:mm', { locale: idLocale }) }] : []),
              ...(selectedTrip.completed_at    ? [{ label: 'Completed',  value: format(new Date(selectedTrip.completed_at),  'EEE, d MMM yyyy · HH:mm', { locale: idLocale }) }] : []),
              ...(selectedTrip.completed_by    ? [{ label: 'Completed by', value: selectedTrip.completed_by }] : []),
              ...(selectedTrip.auto_complete_at ? [{ label: 'Auto-complete at', value: format(new Date(selectedTrip.auto_complete_at), 'EEE, d MMM yyyy · HH:mm', { locale: idLocale }) }] : []),
            ]} />

            {/* ── Trip detail ── */}
            <SectionLabel>Trip detail</SectionLabel>
            <DetailTable rows={[
              { label: 'Trip type', value: selectedTrip.trip_type === 'DROP' ? 'Drop — one way' : `Waiting — ${selectedTrip.wait_minutes} min` },
              ...(selectedTrip.notes ? [{ label: 'Notes', value: selectedTrip.notes }] : []),
              ...(selectedTrip.rejection_reason ? [{ label: 'Rejection reason', value: selectedTrip.rejection_reason }] : []),
            ]} />

            {/* ── Vehicle ── */}
            {selectedTrip.taxi_name && (
              <>
                <SectionLabel>Vehicle</SectionLabel>
                <DetailTable rows={[
                  { label: 'Taxi',   value: selectedTrip.taxi_name },
                  ...(selectedTrip.taxi_plate ? [{ label: 'Plate',  value: selectedTrip.taxi_plate }] : []),
                  ...(selectedTrip.driver_name ? [{ label: 'Driver', value: selectedTrip.driver_name }] : []),
                  ...(selectedTrip.driver_phone ? [{ label: "Driver's phone", value: selectedTrip.driver_phone }] : []),
                ]} />
              </>
            )}

            {/* Close */}
            <button
              onClick={() => setSelectedTrip(null)}
              style={{ width: '100%', marginTop: 8, padding: '13px', background: '#F5F5F2', border: 'none', borderRadius: 14, fontSize: 13, fontWeight: 700, color: '#6f7979', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
