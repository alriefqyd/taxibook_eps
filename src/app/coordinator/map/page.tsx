'use client'

import { useEffect, useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useDriverLocations, type DriverLocation } from '@/hooks/useDriverLocations'
import { getRoute } from '@/lib/routing'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import BottomNav from '@/components/BottomNav'
import { useLang } from '@/lib/language'
import { sphereGradient, SPHERE_SHADOW } from '@/components/map/carIcon'

const MSG = {
  en: {
    loading:         'Loading map...',
    pageTitle:       'Fleet Map',
    online:          (n: number) => `${n} online`,
    offline:         (n: number) => `${n} offline`,
    gps:             (n: number) => `${n} GPS`,
    boardTitle:      (n: number) => `Driver Board · ${n} unit${n !== 1 ? 's' : ''}`,
    tripBadge:       'trip',
    offBadge:        'off',
    noDriver:        'No driver',
    statusOffline:   'Offline',
    statusOnTrip:    'On Trip',
    statusWaiting:   'Waiting',
    statusBooked:    'Booked',
    statusAvailable: 'Available',
    loadingBooking:  'Loading...',
    passengerLabel:  'Passenger',
    scheduledLabel:  'Scheduled',
    routeLabel:      'Route',
    noGps:           'Driver GPS location unavailable',
    driverAvail:     'Driver available',
    driverOffline:   'Driver offline',
    noActiveTrip:    'No active trip',
    close:           'Close',
  },
  id: {
    loading:         'Memuat peta...',
    pageTitle:       'Peta Armada',
    online:          (n: number) => `${n} online`,
    offline:         (n: number) => `${n} offline`,
    gps:             (n: number) => `${n} GPS`,
    boardTitle:      (n: number) => `Papan Driver · ${n} unit`,
    tripBadge:       'jalan',
    offBadge:        'off',
    noDriver:        'Tanpa driver',
    statusOffline:   'Offline',
    statusOnTrip:    'Dalam Perjalanan',
    statusWaiting:   'Menunggu',
    statusBooked:    'Dipesan',
    statusAvailable: 'Tersedia',
    loadingBooking:  'Memuat...',
    passengerLabel:  'Penumpang',
    scheduledLabel:  'Dijadwalkan',
    routeLabel:      'Rute',
    noGps:           'Lokasi GPS driver tidak tersedia',
    driverAvail:     'Driver tersedia',
    driverOffline:   'Driver offline',
    noActiveTrip:    'Tidak ada perjalanan aktif',
    close:           'Tutup',
  },
}

const DriverFleetMap   = dynamic(() => import('@/components/map/DriverFleetMap'),   { ssr: false })
const DriverTripMiniMap = dynamic(() => import('@/components/map/DriverTripMiniMap'), { ssr: false })

const GPS_STALE_MS = 10 * 60 * 1000

function isGpsActive(ts: string | null): boolean {
  if (!ts) return false
  return Date.now() - new Date(ts).getTime() < GPS_STALE_MS
}

function minsAgo(ts: string | null): number | null {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
}

function relativeTime(ts: string | null): string {
  const m = minsAgo(ts)
  if (m === null) return 'never'
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

function stalenessColor(ts: string | null): string {
  const m = minsAgo(ts)
  if (m === null)  return '#9ca3af'
  if (m < 5)       return '#059669'
  if (m < 15)      return '#D97706'
  if (m < 60)      return '#DC2626'
  return '#6b7280'
}

function GpsIcon({ active }: { active: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={active ? '#059669' : '#9ca3af'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
    </svg>
  )
}

function CarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" style={{ display: 'block', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.4))' }}>
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H8a2 2 0 0 1-4 0H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h1zm2.1 0h9.8l-1-3H8.1l-1 3z"/>
      <circle cx="7" cy="17" r="1.6"/>
      <circle cx="17" cy="17" r="1.6"/>
    </svg>
  )
}

interface BookingExtra {
  booking_code: string
  passenger_name: string
  passenger_phone: string | null
  scheduled_at: string
}

export default function CoordinatorMapPage() {
  const lang     = useLang()
  const t        = MSG[lang]
  const router   = useRouter()
  const supabase = createClient()
  const [ready,          setReady]          = useState(false)
  const [panelOpen,      setPanelOpen]      = useState(true)
  const [selectedDriver, setSelectedDriver] = useState<DriverLocation | null>(null)
  const [bookingExtra,   setBookingExtra]   = useState<BookingExtra | null>(null)
  const [miniRoute,      setMiniRoute]      = useState<[number, number][] | undefined>(undefined)
  const drivers = useDriverLocations()

  useEffect(() => {
    async function guard() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      setReady(true)
    }
    guard()
  }, [])

  async function openDriver(d: DriverLocation) {
    setSelectedDriver(d)
    setBookingExtra(null)
    setMiniRoute(undefined)

    // Fetch passenger info if on trip
    if (d.active_booking) {
      const { data } = await supabase
        .from('booking_details')
        .select('booking_code, passenger_name, passenger_phone, scheduled_at')
        .eq('id', d.active_booking.id)
        .single()
      if (data) setBookingExtra(data as BookingExtra)
    }

    // Fetch full trip route for mini-map: driver position → pickup → destination.
    // Only once the trip has actually started (on_trip/waiting_trip) — a 'booked'
    // (assigned, not yet started) trip has no route to show yet.
    const bk = d.active_booking?.status !== 'booked' ? d.active_booking : null
    if (d.latitude && d.longitude && bk && bk.pickup_lat != null && bk.pickup_lng != null
        && bk.destination_lat != null && bk.destination_lng != null) {
      const [leg1, leg2] = await Promise.all([
        getRoute({ lat: d.latitude, lng: d.longitude }, { lat: bk.pickup_lat, lng: bk.pickup_lng }),
        getRoute({ lat: bk.pickup_lat, lng: bk.pickup_lng }, { lat: bk.destination_lat, lng: bk.destination_lng }),
      ])
      const coords = [...(leg1?.coordinates ?? []), ...(leg2?.coordinates ?? [])]
      if (coords.length > 1) setMiniRoute(coords)
    }
  }

  function closeSheet() {
    setSelectedDriver(null)
    setBookingExtra(null)
    setMiniRoute(undefined)
  }

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F2', fontFamily: "'Inter', sans-serif" }}>
      <p style={{ color: '#9ca3af' }}>{t.loading}</p>
    </div>
  )

  const onlineCount  = drivers.filter(d => d.is_available && d.driver_id).length
  const offlineCount = drivers.filter(d => !d.is_available || !d.driver_id).length
  const gpsCount     = drivers.filter(d => isGpsActive(d.location_updated_at)).length

  const sorted = [...drivers].sort((a, b) => {
    const rank = (d: typeof a) => d.is_on_trip ? 0 : (d.is_available && d.driver_id) ? 1 : 2
    return rank(a) - rank(b)
  })

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', touchAction: 'manipulation' }}>

      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '12px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/coordinator/home')} style={{ width: 32, height: 32, borderRadius: '50%', background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.2px' }}>{t.pageTitle}</h1>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#2D6A4F', background: '#D8F3DC', borderRadius: 6, padding: '1px 7px' }}>{t.online(onlineCount)}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', background: '#FEE2E2', borderRadius: 6, padding: '1px 7px' }}>{t.offline(offlineCount)}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', borderRadius: 6, padding: '1px 7px', display: 'flex', alignItems: 'center', gap: 3 }}>
                <GpsIcon active={true} />{t.gps(gpsCount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <DriverFleetMap style={{ borderRadius: 0 }} />

        {/* Driver board */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000,
          background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          transition: 'transform 0.25s ease',
          transform: panelOpen ? 'translateY(0)' : 'translateY(calc(100% - 36px))',
        }}>
          {/* Toggle bar */}
          <div
            onClick={() => setPanelOpen(o => !o)}
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: 0 }}>
              {t.boardTitle(drivers.length)}
            </p>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{panelOpen ? '▼' : '▲'}</span>
          </div>

          {/* 5-column compact grid — tap to open detail */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, padding: '0 12px 10px' }}>
            {sorted.map(d => {
              const isOnline = d.is_available && !!d.driver_id
              const hasGps   = isGpsActive(d.location_updated_at)
              const onTrip   = d.is_on_trip && d.active_booking
              return (
                <div
                  key={d.id}
                  onClick={() => openDriver(d)}
                  style={{
                    borderTop: `3px solid ${isOnline ? d.color : '#D1D5DB'}`,
                    background: onTrip ? `${d.color}18` : '#F9FAFB',
                    borderRadius: '0 0 8px 8px',
                    padding: '5px 4px 4px',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 1 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: isOnline ? d.color : '#D1D5DB', flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#006064', wordBreak: 'break-word', lineHeight: 1.3 }}>{d.driver_name || d.name}</span>
                  </div>
                  <p style={{ fontSize: 8, color: '#6f7979', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.name}
                  </p>
                  <p style={{ fontSize: 7, fontWeight: 700, color: stalenessColor(d.location_updated_at), margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {relativeTime(d.location_updated_at)}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    {onTrip && <span style={{ fontSize: 7, fontWeight: 700, color: d.color }}>{t.tripBadge}</span>}
                    {!isOnline && !onTrip && <span style={{ fontSize: 7, color: '#9ca3af' }}>{t.offBadge}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Trip detail sheet */}
      {selectedDriver && (
        <TripDetailSheet
          driver={selectedDriver}
          bookingExtra={bookingExtra}
          miniRoute={miniRoute}
          onClose={closeSheet}
        />
      )}

      <BottomNav role="coordinator" />
    </div>
  )
}

// ── Trip detail sheet ────────────────────────────────────────
function TripDetailSheet({ driver: d, bookingExtra, miniRoute, onClose }: {
  driver: DriverLocation
  bookingExtra: BookingExtra | null
  miniRoute: [number, number][] | undefined
  onClose: () => void
}) {
  const lang     = useLang()
  const m        = MSG[lang]
  const bk       = d.active_booking
  const isOnline = d.is_available && !!d.driver_id
  const hasGps   = isGpsActive(d.location_updated_at)
  const hasMap   = d.latitude != null && d.longitude != null

  const statusLabel = !isOnline
    ? { text: m.statusOffline,   bg: '#FEE2E2', color: '#DC2626' }
    : bk?.status === 'on_trip'
    ? { text: m.statusOnTrip,   bg: `${d.color}20`, color: d.color }
    : bk?.status === 'waiting_trip'
    ? { text: m.statusWaiting,  bg: '#FEF3C7', color: '#D97706' }
    : bk?.status === 'booked'
    ? { text: m.statusBooked,   bg: '#EDE9FE', color: '#7C3AED' }
    : { text: m.statusAvailable, bg: '#D1FAE5', color: '#059669' }

  // Route/pickup/destination info only once the trip has actually started —
  // 'booked' (assigned, not yet started) keeps the "Booked" status label above,
  // but shows the same "no active trip" panel as a free driver until it starts.
  const startedBk = bk && bk.status !== 'booked' ? bk : null

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 74, background: 'rgba(0,0,0,0.4)', zIndex: 1100 }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 72, left: 0, right: 0, zIndex: 1101,
        background: '#fff', borderRadius: '20px 20px 0 0',
        maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
      }}>
        {/* Handle */}
        <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'rgba(0,0,0,0.12)', margin: '0 auto' }} />
        </div>

        <div style={{ padding: '12px 16px 24px' }}>
          {/* Driver header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: sphereGradient(d.color), boxShadow: SPHERE_SHADOW, border: '2.5px solid rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CarIcon size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.driver_name ?? m.noDriver}</p>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: statusLabel.bg, color: statusLabel.color, flexShrink: 0 }}>
                  {statusLabel.text}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#6f7979', margin: '2px 0 0' }}>
                {d.name}{d.plate ? ` · ${d.plate}` : ''}
              </p>
              <p style={{ fontSize: 11, fontWeight: 600, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4, color: stalenessColor(d.location_updated_at) }}>
                <GpsIcon active={hasGps} />
                {relativeTime(d.location_updated_at)}
                {d.location_updated_at && (
                  <span style={{ fontWeight: 400, color: '#9ca3af' }}>
                    ({format(new Date(d.location_updated_at), 'HH:mm:ss')})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Trip info — only once the trip has actually started */}
          {startedBk ? (
            <>
              <div style={{ background: `${d.color}0D`, border: `1px solid ${d.color}30`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                {/* Booking code */}
                {bookingExtra ? (
                  <p style={{ fontSize: 11, fontWeight: 700, color: d.color, margin: '0 0 8px', letterSpacing: '0.04em' }}>{bookingExtra.booking_code}</p>
                ) : (
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 8px' }}>{m.loadingBooking}</p>
                )}

                {/* Passenger */}
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 2px' }}>{m.passengerLabel}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{bookingExtra?.passenger_name ?? '—'}</p>
                  {bookingExtra?.passenger_phone && (
                    <p style={{ fontSize: 11, color: '#6f7979', margin: 0 }}>{bookingExtra.passenger_phone}</p>
                  )}
                </div>

                {/* Scheduled */}
                {bookingExtra?.scheduled_at && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 2px' }}>{m.scheduledLabel}</p>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{format(new Date(bookingExtra.scheduled_at), 'EEEE, dd MMM · HH:mm', { locale: idLocale })}</p>
                  </div>
                )}

                {/* Route */}
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 4px' }}>{m.routeLabel}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>🟢</span>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{startedBk.pickup}</p>
                    </div>
                    <div style={{ marginLeft: 10, width: 2, height: 10, background: `${d.color}40` }} />
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>📍</span>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: d.color }}>{startedBk.destination}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mini map */}
              {hasMap && (
                <div style={{ height: 200, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', marginBottom: 4 }}>
                  <DriverTripMiniMap
                    driverLat={d.latitude!}
                    driverLng={d.longitude!}
                    pickupLat={startedBk.pickup_lat}
                    pickupLng={startedBk.pickup_lng}
                    destLat={startedBk.destination_lat}
                    destLng={startedBk.destination_lng}
                    color={d.color}
                    route={miniRoute}
                    status={startedBk.status}
                  />
                </div>
              )}

              {!hasMap && (
                <div style={{ background: '#F5F5F2', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{m.noGps}</p>
                </div>
              )}
            </>
          ) : (
            /* No active trip */
            <div style={{ background: '#F5F5F2', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#6f7979', margin: '0 0 4px' }}>
                {isOnline ? m.driverAvail : m.driverOffline}
              </p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{m.noActiveTrip}</p>
              {hasMap && (
                <div style={{ height: 160, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', marginTop: 12 }}>
                  <DriverTripMiniMap
                    driverLat={d.latitude!}
                    driverLng={d.longitude!}
                    color={d.color}
                  />
                </div>
              )}
            </div>
          )}

          <button onClick={onClose} style={{ width: '100%', marginTop: 14, padding: '12px', background: '#006064', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {m.close}
          </button>
        </div>
      </div>
    </>
  )
}
