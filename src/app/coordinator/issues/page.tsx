'use client'
import { useEffect, useState, useCallback } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'

const FONT    = "'Plus Jakarta Sans', sans-serif"
const PRIMARY = '#006064'
const RED     = '#DC2626'
const RED_BG  = '#FEE2E2'
const AMBER   = '#D97706'
const AMBER_BG= '#FEF3C7'
const GRAY    = '#6b7280'
const SURF    = '#ffffff'
const BORDER  = 'rgba(0,0,0,0.08)'
const BG      = '#F5F5F2'

const MSG = {
  en: {
    title:        'Issues',
    subtitle:     'Everything that needs attention, right now',
    lastChecked:  (s: string) => `Last checked ${s}`,
    refresh:      'Refresh',
    refreshing:   'Refreshing…',
    allClear:     'All clear! 🎉',
    allClearSub:  'No outstanding issues right now.',
    gpsStale:     'GPS Stale',
    gpsStaleDesc: 'On-duty drivers whose location has not updated in over an hour',
    overdue:      'Overdue Trips',
    overdueDesc:  'Booked trips past their scheduled time that the driver has not started',
    pending:      'Pending Approval',
    pendingDesc:  'Bookings waiting for coordinator approval',
    offlineUpcoming:    'Driver Offline, Trip Soon',
    offlineUpcomingDesc:'Assigned drivers who are offline but have an upcoming trip',
    never:        'never',
    minAgo:       (n: number) => `${n}m ago`,
    hAgo:         (h: number, m: number) => `${h}h ${m}m ago`,
    minLate:      (n: number) => `${n} min late`,
    waitingSince: (s: string) => `Waiting since ${s}`,
    noDriver:     'No driver',
  },
  id: {
    title:        'Masalah',
    subtitle:     'Semua yang perlu perhatian, saat ini juga',
    lastChecked:  (s: string) => `Terakhir dicek ${s}`,
    refresh:      'Segarkan',
    refreshing:   'Menyegarkan…',
    allClear:     'Aman semua! 🎉',
    allClearSub:  'Tidak ada masalah saat ini.',
    gpsStale:     'GPS Tidak Update',
    gpsStaleDesc: 'Driver aktif yang lokasinya tidak update lebih dari 1 jam',
    overdue:      'Trip Terlambat',
    overdueDesc:  'Booking yang sudah lewat jadwal tapi belum di-start driver',
    pending:      'Menunggu Persetujuan',
    pendingDesc:  'Booking yang menunggu persetujuan koordinator',
    offlineUpcoming:    'Driver Offline, Trip Segera',
    offlineUpcomingDesc:'Driver yang ditugaskan tapi offline padahal ada trip segera',
    never:        'belum pernah',
    minAgo:       (n: number) => `${n}m lalu`,
    hAgo:         (h: number, m: number) => `${h}j ${m}m lalu`,
    minLate:      (n: number) => `Telat ${n} menit`,
    waitingSince: (s: string) => `Menunggu sejak ${s}`,
    noDriver:     'Tidak ada driver',
  },
}

function minsAgo(ts: string | null, now: number): number | null {
  if (!ts) return null
  return Math.floor((now - new Date(ts).getTime()) / 60000)
}

interface GpsStaleTaxi {
  id: string; name: string; plate: string | null; color: string
  driver_name: string | null; location_updated_at: string | null
}
interface TripRow {
  id: string; booking_code: string; passenger_name: string; destination: string
  scheduled_at: string; created_at: string; taxi_name: string | null; driver_name: string | null
  wait_minutes: number; trip_type: string
}
interface OfflineUpcoming {
  id: string; booking_code: string; passenger_name: string; destination: string
  scheduled_at: string; taxi_name: string | null; driver_name: string | null
}

export default function CoordinatorIssuesPage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [gpsStale,        setGpsStale]        = useState<GpsStaleTaxi[]>([])
  const [overdue,         setOverdue]         = useState<TripRow[]>([])
  const [pending,         setPending]         = useState<TripRow[]>([])
  const [offlineUpcoming, setOfflineUpcoming] = useState<OfflineUpcoming[]>([])

  const loadIssues = useCallback(async () => {
    const now = new Date()
    const staleCutoff = new Date(now.getTime() - 60 * 60 * 1000)
    const upcomingWindow = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    const [{ data: taxis }, { data: overdueBks }, { data: pendingBks }, { data: upcomingBks }] = await Promise.all([
      supabase.from('taxis')
        .select('id, name, plate, color, is_available, driver_id, location_updated_at, users!driver_id(name)')
        .eq('is_active', true)
        .not('driver_id', 'is', null),
      supabase.from('booking_details').select('*')
        .eq('status', 'booked')
        .lt('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true }),
      supabase.from('booking_details').select('*')
        .eq('status', 'pending_coordinator_approval')
        .order('created_at', { ascending: true }),
      supabase.from('booking_details').select('*')
        .eq('status', 'booked')
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', upcomingWindow.toISOString())
        .order('scheduled_at', { ascending: true }),
    ])

    const allTaxis = taxis || []

    setGpsStale(
      allTaxis
        .filter((tx: any) => tx.is_available && (!tx.location_updated_at || new Date(tx.location_updated_at) < staleCutoff))
        .map((tx: any) => ({
          id: tx.id, name: tx.name, plate: tx.plate, color: tx.color,
          driver_name: tx.users?.name || null, location_updated_at: tx.location_updated_at,
        }))
    )

    setOverdue((overdueBks || []) as any)
    setPending((pendingBks || []) as any)

    const offlineTaxiIds = new Set(allTaxis.filter((tx: any) => tx.is_available === false).map((tx: any) => tx.id))
    setOfflineUpcoming(
      ((upcomingBks || []) as any[]).filter(b => b.taxi_id && offlineTaxiIds.has(b.taxi_id))
    )

    setLastChecked(now)
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const au = session?.user
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', au.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      await loadIssues()
      setLoading(false)
    }
    init()
    const interval = setInterval(loadIssues, 30000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true)
    await loadIssues()
    setRefreshing(false)
  }

  if (loading) return <PageLoader />

  const now = Date.now()
  const relTime = (ts: string | null) => {
    const m = minsAgo(ts, now)
    if (m === null) return t.never
    if (m < 60) return t.minAgo(m)
    return t.hAgo(Math.floor(m / 60), m % 60)
  }
  const totalIssues = gpsStale.length + overdue.length + pending.length + offlineUpcoming.length

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", minHeight: '100vh', background: BG, WebkitFontSmoothing: 'antialiased' }}>
      {/* Header */}
      <div style={{ background: SURF, borderBottom: `1px solid ${BORDER}`, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <button
              onClick={() => router.back()}
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: -8, marginTop: -2 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </button>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.2px', fontFamily: FONT }}>{t.title}</h1>
              <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{t.subtitle}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: refreshing ? '#e5e7eb' : `${PRIMARY}12`, border: `1px solid ${PRIMARY}30`, borderRadius: 10, fontSize: 12, fontWeight: 700, color: refreshing ? '#9ca3af' : PRIMARY, cursor: refreshing ? 'not-allowed' : 'pointer', fontFamily: FONT, flexShrink: 0 }}
          >
            <span style={{ display: 'flex', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </span>
            {refreshing ? t.refreshing : t.refresh}
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        {lastChecked && (
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '8px 0 0' }}>
            {t.lastChecked(format(lastChecked, 'HH:mm:ss'))}
          </p>
        )}
      </div>

      <div style={{ padding: '16px 16px 100px' }}>
        {totalIssues === 0 ? (
          <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 20, margin: '0 0 6px' }}>{t.allClear}</p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{t.allClearSub}</p>
          </div>
        ) : (
          <>
            <IssueSection title={t.gpsStale} desc={t.gpsStaleDesc} count={gpsStale.length} color={GRAY} colorBg="#f3f4f6">
              {gpsStale.map(tx => (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: SURF, borderRadius: 10, marginBottom: 6, border: `1px solid ${BORDER}` }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: tx.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{tx.name}{tx.plate ? ` · ${tx.plate}` : ''}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{tx.driver_name || t.noDriver}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: GRAY, flexShrink: 0 }}>{relTime(tx.location_updated_at)}</span>
                </div>
              ))}
            </IssueSection>

            <IssueSection title={t.overdue} desc={t.overdueDesc} count={overdue.length} color={RED} colorBg={RED_BG}>
              {overdue.map(b => {
                const lateMin = Math.floor((now - new Date(b.scheduled_at).getTime()) / 60000)
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: SURF, borderRadius: 10, marginBottom: 6, border: `1px solid ${BORDER}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{b.passenger_name} → {b.destination}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{b.taxi_name || t.noDriver}{b.driver_name ? ` · ${b.driver_name}` : ''} · {b.booking_code}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: RED, flexShrink: 0 }}>{t.minLate(lateMin)}</span>
                  </div>
                )
              })}
            </IssueSection>

            <IssueSection title={t.pending} desc={t.pendingDesc} count={pending.length} color={AMBER} colorBg={AMBER_BG}>
              {pending.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: SURF, borderRadius: 10, marginBottom: 6, border: `1px solid ${BORDER}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{b.passenger_name} → {b.destination}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>
                      {format(new Date(b.scheduled_at), 'd MMM, HH:mm', { locale: idLocale })} · {b.trip_type === 'WAITING' ? `Waiting ${b.wait_minutes}m` : 'Drop'}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: AMBER, flexShrink: 0 }}>{t.waitingSince(format(new Date(b.created_at), 'HH:mm'))}</span>
                </div>
              ))}
            </IssueSection>

            <IssueSection title={t.offlineUpcoming} desc={t.offlineUpcomingDesc} count={offlineUpcoming.length} color={RED} colorBg={RED_BG}>
              {offlineUpcoming.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: SURF, borderRadius: 10, marginBottom: 6, border: `1px solid ${BORDER}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{b.taxi_name} · {b.driver_name || t.noDriver}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{b.passenger_name} → {b.destination}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: RED, flexShrink: 0 }}>{format(new Date(b.scheduled_at), 'HH:mm')}</span>
                </div>
              ))}
            </IssueSection>
          </>
        )}
      </div>
    </div>
  )
}

function IssueSection({ title, desc, count, color, colorBg, children }: {
  title: string; desc: string; count: number; color: string; colorBg: string; children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 700, margin: 0, fontFamily: FONT }}>{title}</p>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 9999, background: colorBg, color }}>{count}</span>
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 10px' }}>{desc}</p>
      {children}
    </div>
  )
}
