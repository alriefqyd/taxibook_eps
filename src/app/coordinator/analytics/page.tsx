'use client'
import { useEffect, useState, useMemo } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, differenceInMinutes, eachDayOfInterval } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'
import { AUTO_CANCEL_REASON } from '@/lib/autoCancel'

const FONT = "'Plus Jakarta Sans', sans-serif"
const BG      = '#F5F5F2'
const SURF    = '#ffffff'
const BORDER  = 'rgba(0,0,0,0.08)'
const INK     = '#0b0b0b'
const INK_SUB = '#52514e'
const INK_MUT = '#898781'
const GRID    = '#e1e0d9'
const PRIMARY = '#006064'

// Sequential blue ramp (magnitude) — from the dataviz skill's validated reference palette
const SEQ_400 = '#3987e5'
const SEQ_WASH = 'rgba(57,135,229,0.10)'

// Fixed status palette (state, never themed) — from the dataviz skill's reference palette
const STATUS = {
  good:     '#0ca30c',
  warning:  '#fab219',
  serious:  '#ec835a',
  critical: '#d03b3b',
}

const MSG = {
  en: {
    title:        'Analytics',
    subtitle:     'Trip volume, routes, and drivers',
    range7:       'Last 7 days',
    range30:      'Last 30 days',
    range90:      'Last 90 days',
    totalTrips:   'Total trips',
    completionRate: 'Completion rate',
    avgDuration:  'Avg. duration',
    activePending:'Active / pending',
    min:          (n: number) => `${n} min`,
    trend:        'Trips per day',
    showTable:    'Show table',
    hideTable:    'Hide table',
    date:         'Date',
    trips:        'Trips',
    topRoutes:    'Top Routes',
    noData:       'No data in this range',
    statusBreakdown: 'Status Breakdown',
    completed:    'Completed',
    cancelled:    'Cancelled',
    rejected:     'Rejected',
    active:       'Active / Pending',
    topUsers:     'Most Frequent Users',
    topCancellers:'Most Frequent Cancellers',
    peakHours:    'Busiest Hours',
    hourLabel:    (h: number) => `${h.toString().padStart(2, '0')}:00`,
    sectionDemand:      'Demand',
    sectionReliability: 'Reliability',
    sectionCapacity:    'Fleet Capacity',
    sectionPeople:      'Users & Drivers',
    vsPrevPeriod:  (pct: number) => `${pct >= 0 ? '+' : ''}${pct}% vs previous period`,
    topDestinations: 'Top Destinations',
    leadTime:      'Booking Lead Time',
    leadNow:       'Right now (<10 min)',
    lead1h:        '10 min – 1 hour ahead',
    lead4h:        '1 – 4 hours ahead',
    leadLong:      'More than 4 hours ahead',
    tripTypeBreakdown: 'Trip Type',
    dropType:      (n: number) => `Drop (one-way) — ${n}`,
    waitType:      (n: number, avg: number) => `Waiting — ${n} (avg ${avg} min wait)`,
    autoCancelled: 'Auto-cancelled (driver late)',
    manualCancelled: 'Cancelled (by user/coordinator)',
    capacityUsed:  'Capacity Used by Special/Full-Day Duty',
    capacityDesc:  (pct: number) => `${pct}% of taxi-days in this range are blocked by driver duty assignments, unavailable for auto-assign.`,
    driverRanking: 'Driver Ranking',
    colDriver:        'Driver',
    colCompleted:     'Completed',
    colCompletionRate:'Completion',
    colAutoCancel:    'Auto-cancelled',
  },
  id: {
    title:        'Analitik',
    subtitle:     'Volume trip, rute, dan driver',
    range7:       '7 hari terakhir',
    range30:      '30 hari terakhir',
    range90:      '90 hari terakhir',
    totalTrips:   'Total trip',
    completionRate: 'Tingkat selesai',
    avgDuration:  'Rata-rata durasi',
    activePending:'Aktif / menunggu',
    min:          (n: number) => `${n} menit`,
    trend:        'Trip per hari',
    showTable:    'Lihat tabel',
    hideTable:    'Sembunyikan tabel',
    date:         'Tanggal',
    trips:        'Trip',
    topRoutes:    'Rute Teratas',
    noData:       'Tidak ada data di rentang ini',
    statusBreakdown: 'Rincian Status',
    completed:    'Selesai',
    cancelled:    'Dibatalkan',
    rejected:     'Ditolak',
    active:       'Aktif / Menunggu',
    topUsers:     'Pengguna Paling Sering',
    topCancellers:'Paling Sering Membatalkan',
    peakHours:    'Jam Tersibuk',
    hourLabel:    (h: number) => `${h.toString().padStart(2, '0')}:00`,
    sectionDemand:      'Permintaan',
    sectionReliability: 'Keandalan',
    sectionCapacity:    'Kapasitas Armada',
    sectionPeople:      'Pengguna & Driver',
    vsPrevPeriod:  (pct: number) => `${pct >= 0 ? '+' : ''}${pct}% vs periode sebelumnya`,
    topDestinations: 'Tujuan Terpopuler',
    leadTime:      'Jarak Waktu Booking',
    leadNow:       'Sekarang (<10 menit)',
    lead1h:        '10 menit – 1 jam sebelumnya',
    lead4h:        '1 – 4 jam sebelumnya',
    leadLong:      'Lebih dari 4 jam sebelumnya',
    tripTypeBreakdown: 'Jenis Trip',
    dropType:      (n: number) => `Antar (satu arah) — ${n}`,
    waitType:      (n: number, avg: number) => `Menunggu — ${n} (rata-rata ${avg} menit)`,
    autoCancelled: 'Otomatis dibatalkan (driver telat)',
    manualCancelled: 'Dibatalkan (oleh user/koordinator)',
    capacityUsed:  'Kapasitas Terpakai Tugas Khusus/Seharian',
    capacityDesc:  (pct: number) => `${pct}% taksi-hari di rentang ini terpakai oleh tugas khusus driver, tidak tersedia untuk auto-assign.`,
    driverRanking: 'Peringkat Driver',
    colDriver:        'Driver',
    colCompleted:     'Selesai',
    colCompletionRate:'Tingkat Selesai',
    colAutoCancel:    'Otomatis Dibatalkan',
  },
}

type RangeKey = '7' | '30' | '90'

interface Row {
  id: string; status: string; scheduled_at: string; completed_at: string | null; created_at: string
  auto_complete_at: string | null; completed_by: string | null
  pickup: string; destination: string; driver_name: string | null; passenger_name: string | null
  trip_type: string; wait_minutes: number | null; rejection_reason: string | null
}

export default function CoordinatorAnalyticsPage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [loading, setLoading] = useState(true)
  const [range,   setRange]   = useState<RangeKey>('30')
  const [rows,    setRows]    = useState<Row[]>([])
  const [prevTotal, setPrevTotal] = useState<number | null>(null)
  const [dutyTaxiDays, setDutyTaxiDays] = useState(0)
  const [activeTaxiCount, setActiveTaxiCount] = useState(0)
  const [showTable, setShowTable] = useState(false)
  const [hoverIdx,  setHoverIdx]  = useState<number | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const au = session?.user
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', au.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const days  = parseInt(range, 10)
      const start = subDays(new Date(), days - 1)
      start.setHours(0, 0, 0, 0)
      const prevStart = subDays(start, days)

      const [{ data }, { count: prevCount }, { data: duties }, { count: taxiCount }] = await Promise.all([
        supabase
          .from('booking_details')
          .select('id, status, scheduled_at, completed_at, created_at, auto_complete_at, pickup, destination, driver_name, passenger_name, trip_type, wait_minutes, rejection_reason')
          .gte('scheduled_at', start.toISOString())
          .order('scheduled_at', { ascending: true }),
        // Same-length window immediately before the current range, for growth comparison
        supabase
          .from('booking_details')
          .select('id', { count: 'exact', head: true })
          .gte('scheduled_at', prevStart.toISOString())
          .lt('scheduled_at', start.toISOString()),
        // Driver-day-assignments (full-day/special duty) inside the current range —
        // used to show how much fleet capacity is consumed outside auto-assign
        supabase
          .from('driver_day_assignments')
          .select('assign_date, start_time, end_time')
          .gte('assign_date', format(start, 'yyyy-MM-dd'))
          .lte('assign_date', format(new Date(), 'yyyy-MM-dd')),
        supabase
          .from('taxis')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
      ])

      setRows((data as any) || [])
      setPrevTotal(prevCount ?? null)
      setActiveTaxiCount(taxiCount || 0)

      const taxiDays = (duties || []).reduce((sum: number, d: any) => {
        if (!d.start_time || !d.end_time) return sum + 1 // full day
        const [sh, sm] = d.start_time.split(':').map(Number)
        const [eh, em] = d.end_time.split(':').map(Number)
        const hours = (eh * 60 + em - (sh * 60 + sm)) / 60
        return sum + Math.max(hours, 0) / 24
      }, 0)
      setDutyTaxiDays(taxiDays)
    }
    load()
  }, [range]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const total     = rows.length
    const completed = rows.filter(r => r.status === 'completed').length
    const cancelled = rows.filter(r => r.status === 'cancelled').length
    const rejected  = rows.filter(r => r.status === 'rejected').length
    const active    = rows.filter(r => ['booked', 'on_trip', 'waiting_trip', 'submitted', 'pending_coordinator_approval'].includes(r.status)).length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    const durations = rows
      .filter(r => r.status === 'completed' && r.completed_at)
      .map(r => differenceInMinutes(new Date(r.completed_at!), new Date(r.scheduled_at)))
      .filter(m => m >= 0)
    const avgDuration = durations.length ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length) : 0

    return { total, completed, cancelled, rejected, active, completionRate, avgDuration }
  }, [rows])

  const trend = useMemo(() => {
    const days  = parseInt(range, 10)
    const start = subDays(new Date(), days - 1)
    const dayList = eachDayOfInterval({ start, end: new Date() })
    const counts: Record<string, number> = {}
    rows.forEach(r => {
      const key = format(new Date(r.scheduled_at), 'yyyy-MM-dd')
      counts[key] = (counts[key] || 0) + 1
    })
    return dayList.map(d => {
      const key = format(d, 'yyyy-MM-dd')
      return { date: d, key, count: counts[key] || 0 }
    })
  }, [rows, range])

  const topRoutes = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => {
      const key = `${r.pickup} → ${r.destination}`
      map[key] = (map[key] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])

  // Ranking on raw completed-trip count rewards whoever worked the most shifts, not who's
  // actually reliable — a driver who did 3/3 trips perfectly would always rank below one who
  // did 15/20 with several auto-cancels. Completion rate (completed ÷ everything ever assigned
  // to them) already accounts for that: auto-cancelled trips stay in the denominator, so
  // reliability is baked into the rate itself rather than needing a separate weighted factor.
  const driverScores = useMemo(() => {
    const map: Record<string, { totalAssigned: number; completed: number; autoCancelled: number }> = {}

    rows.forEach(r => {
      if (!r.driver_name) return
      const e = map[r.driver_name] ?? (map[r.driver_name] = { totalAssigned: 0, completed: 0, autoCancelled: 0 })
      e.totalAssigned++
      if (r.status === 'completed') e.completed++
      if (r.status === 'cancelled' && r.rejection_reason === AUTO_CANCEL_REASON) e.autoCancelled++
    })

    return Object.entries(map).map(([name, v]) => ({
      name,
      completed:      v.completed,
      completionRate: v.totalAssigned > 0 ? v.completed / v.totalAssigned : 0,
      autoCancelled:  v.autoCancelled,
    })).sort((a, b) => b.completionRate - a.completionRate)
  }, [rows])

  const topUsers = useMemo(() => {
    const map: Record<string, number> = {}
    rows.filter(r => r.passenger_name).forEach(r => {
      map[r.passenger_name!] = (map[r.passenger_name!] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])

  const topCancellers = useMemo(() => {
    const map: Record<string, number> = {}
    rows.filter(r => r.status === 'cancelled' && r.passenger_name).forEach(r => {
      map[r.passenger_name!] = (map[r.passenger_name!] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])

  const peakHours = useMemo(() => {
    const map: Record<number, number> = {}
    rows.forEach(r => {
      const h = new Date(r.scheduled_at).getHours()
      map[h] = (map[h] || 0) + 1
    })
    return Object.entries(map)
      .map(([h, c]) => [`${h.toString().padStart(2, '0')}:00`, c] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [rows])

  const topDestinations = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => { map[r.destination] = (map[r.destination] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])

  const leadTime = useMemo(() => {
    const buckets = { now: 0, h1: 0, h4: 0, long: 0 }
    rows.forEach(r => {
      const mins = differenceInMinutes(new Date(r.scheduled_at), new Date(r.created_at))
      if (mins < 10) buckets.now++
      else if (mins < 60) buckets.h1++
      else if (mins < 240) buckets.h4++
      else buckets.long++
    })
    return buckets
  }, [rows])

  const tripTypeStats = useMemo(() => {
    const drop = rows.filter(r => r.trip_type === 'DROP').length
    const waiting = rows.filter(r => r.trip_type === 'WAITING')
    const avgWait = waiting.length
      ? Math.round(waiting.reduce((s, r) => s + (r.wait_minutes || 0), 0) / waiting.length)
      : 0
    return { drop, waitingCount: waiting.length, avgWait }
  }, [rows])

  const cancelBreakdown = useMemo(() => {
    const cancelledRows = rows.filter(r => r.status === 'cancelled')
    const auto   = cancelledRows.filter(r => r.rejection_reason === AUTO_CANCEL_REASON).length
    const manual = cancelledRows.length - auto
    return { auto, manual }
  }, [rows])

  const growthPct = useMemo(() => {
    if (prevTotal === null || prevTotal === 0) return null
    return Math.round(((rows.length - prevTotal) / prevTotal) * 100)
  }, [rows, prevTotal])

  const capacityPct = useMemo(() => {
    const days = parseInt(range, 10)
    const totalTaxiDays = activeTaxiCount * days
    if (totalTaxiDays === 0) return 0
    return Math.round((dutyTaxiDays / totalTaxiDays) * 100)
  }, [range, activeTaxiCount, dutyTaxiDays])

  if (loading) return <PageLoader />

  const maxTrend = Math.max(1, ...trend.map(d => d.count))
  const maxRoute = Math.max(1, ...topRoutes.map(([, c]) => c))
  const maxUser = Math.max(1, ...topUsers.map(([, c]) => c))
  const maxCanceller = Math.max(1, ...topCancellers.map(([, c]) => c))
  const maxPeakHour = Math.max(1, ...peakHours.map(([, c]) => c))

  const statusRows = [
    { label: t.completed,      count: stats.completed,       color: STATUS.good },
    { label: t.active,         count: stats.active,          color: STATUS.warning },
    { label: t.autoCancelled,  count: cancelBreakdown.auto,   color: STATUS.critical },
    { label: t.manualCancelled,count: cancelBreakdown.manual, color: STATUS.serious },
    { label: t.rejected,       count: stats.rejected,         color: STATUS.critical },
  ]
  const maxStatus = Math.max(1, ...statusRows.map(s => s.count))

  const maxDestination = Math.max(1, ...topDestinations.map(([, c]) => c))
  const maxLeadTime = Math.max(1, leadTime.now, leadTime.h1, leadTime.h4, leadTime.long)

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", minHeight: '100vh', background: BG, WebkitFontSmoothing: 'antialiased' }}>
      {/* Header */}
      <div style={{ background: SURF, borderBottom: `1px solid ${BORDER}`, padding: '16px 20px' }}>
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

        {/* Date range filter — one row, above the charts */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {(['7', '30', '90'] as RangeKey[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '7px 13px', borderRadius: 9999, cursor: 'pointer', fontFamily: FONT,
                fontSize: 12.5, fontWeight: 700,
                border: range === r ? `1.5px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                background: range === r ? `${PRIMARY}12` : SURF,
                color: range === r ? PRIMARY : INK_SUB,
              }}
            >
              {r === '7' ? t.range7 : r === '30' ? t.range30 : t.range90}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 20 }}>
          <StatTile label={t.totalTrips} value={stats.total.toLocaleString()} delta={growthPct !== null ? t.vsPrevPeriod(growthPct) : null} />
          <StatTile label={t.completionRate} value={`${stats.completionRate}%`} />
          <StatTile label={t.avgDuration} value={t.min(stats.avgDuration)} />
          <StatTile label={t.activePending} value={stats.active.toLocaleString()} />
        </div>

        <SectionHeader title={t.sectionDemand} />

        {/* Trend line chart */}
        <ChartCard title={t.trend}>
          {trend.every(d => d.count === 0) ? (
            <EmptyState text={t.noData} />
          ) : (
            <>
              <TrendChart data={trend} max={maxTrend} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} lang={lang} />
              <button
                onClick={() => setShowTable(v => !v)}
                style={{ marginTop: 10, background: 'none', border: 'none', color: PRIMARY, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: FONT }}
              >
                {showTable ? t.hideTable : t.showTable}
              </button>
              {showTable && (
                <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f9f9f7' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: INK_MUT, fontWeight: 700 }}>{t.date}</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: INK_MUT, fontWeight: 700 }}>{t.trips}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map(d => (
                        <tr key={d.key} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '7px 12px', color: INK }}>{format(d.date, 'd MMM yyyy', { locale: idLocale })}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: INK }}>{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </ChartCard>

        {/* Top routes */}
        <ChartCard title={t.topRoutes}>
          {topRoutes.length === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topRoutes.map(([route, count]) => (
                <HBarRow key={route} label={route} value={count} max={maxRoute} color={SEQ_400} />
              ))}
            </div>
          )}
        </ChartCard>

        {/* Top destinations (destination alone, not full route pairs) */}
        <ChartCard title={t.topDestinations}>
          {topDestinations.length === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topDestinations.map(([dest, count]) => (
                <HBarRow key={dest} label={dest} value={count} max={maxDestination} color={SEQ_400} />
              ))}
            </div>
          )}
        </ChartCard>

        {/* Busiest hours */}
        <ChartCard title={t.peakHours}>
          {peakHours.length === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {peakHours.map(([hour, count]) => (
                <HBarRow key={hour} label={hour} value={count} max={maxPeakHour} color={SEQ_400} />
              ))}
            </div>
          )}
        </ChartCard>

        {/* Booking lead time — how far ahead people book */}
        <ChartCard title={t.leadTime}>
          {stats.total === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <HBarRow label={t.leadNow}  value={leadTime.now}  max={maxLeadTime} color={SEQ_400} total={stats.total} />
              <HBarRow label={t.lead1h}   value={leadTime.h1}   max={maxLeadTime} color={SEQ_400} total={stats.total} />
              <HBarRow label={t.lead4h}   value={leadTime.h4}   max={maxLeadTime} color={SEQ_400} total={stats.total} />
              <HBarRow label={t.leadLong} value={leadTime.long} max={maxLeadTime} color={SEQ_400} total={stats.total} />
            </div>
          )}
        </ChartCard>

        {/* Trip type mix */}
        <ChartCard title={t.tripTypeBreakdown}>
          {stats.total === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <HBarRow
                label={t.dropType(tripTypeStats.drop)}
                value={tripTypeStats.drop}
                max={Math.max(1, tripTypeStats.drop, tripTypeStats.waitingCount)}
                color={SEQ_400}
                total={stats.total}
              />
              <HBarRow
                label={t.waitType(tripTypeStats.waitingCount, tripTypeStats.avgWait)}
                value={tripTypeStats.waitingCount}
                max={Math.max(1, tripTypeStats.drop, tripTypeStats.waitingCount)}
                color={SEQ_400}
                total={stats.total}
              />
            </div>
          )}
        </ChartCard>

        <SectionHeader title={t.sectionReliability} />

        {/* Status breakdown — fixed status palette, icon+label never color alone.
            Cancelled is split into auto (driver failed to start) vs manual, since
            those point to very different problems. */}
        <ChartCard title={t.statusBreakdown}>
          {stats.total === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {statusRows.map(s => (
                <HBarRow key={s.label} label={s.label} value={s.count} max={maxStatus} color={s.color} total={stats.total} />
              ))}
            </div>
          )}
        </ChartCard>

        <SectionHeader title={t.sectionCapacity} />

        {/* Fleet capacity consumed by full-day/special duty assignments — these
            taxis are unavailable for auto-assign for that window. */}
        <ChartCard title={t.capacityUsed}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={{ fontSize: 28, fontWeight: 800, margin: 0, color: capacityPct > 30 ? STATUS.serious : INK, letterSpacing: '-0.5px' }}>
              {capacityPct}%
            </p>
          </div>
          <div style={{ height: 10, background: '#f0efec', borderRadius: 5, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${Math.max(capacityPct, 2)}%`, background: capacityPct > 30 ? STATUS.serious : SEQ_400, borderRadius: 5 }} />
          </div>
          <p style={{ fontSize: 12, color: INK_MUT, margin: 0, lineHeight: 1.4 }}>{t.capacityDesc(capacityPct)}</p>
        </ChartCard>

        <SectionHeader title={t.sectionPeople} />

        {/* Driver ranking — by completion rate (completed ÷ everything ever assigned to
            them), not raw completed-trip count, so a driver who worked fewer shifts but
            finished everything reliably doesn't get buried under one who just works more. */}
        <ChartCard title={t.driverRanking}>
          {driverScores.length === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f9f9f7' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: INK_MUT, fontWeight: 700 }}>{t.colDriver}</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: INK_MUT, fontWeight: 700 }}>{t.colCompleted}</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: INK_MUT, fontWeight: 700 }}>{t.colCompletionRate}</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: INK_MUT, fontWeight: 700 }}>{t.colAutoCancel}</th>
                  </tr>
                </thead>
                <tbody>
                  {driverScores.slice(0, 8).map(d => (
                    <tr key={d.name} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '8px 12px', color: INK, fontWeight: 600, whiteSpace: 'nowrap' }}>{d.name}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>
                        {d.completed}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: PRIMARY, fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(d.completionRate * 100)}%
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: d.autoCancelled > 0 ? STATUS.critical : INK_MUT, fontVariantNumeric: 'tabular-nums' }}>
                        {d.autoCancelled}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        {/* Most frequent users */}
        <ChartCard title={t.topUsers}>
          {topUsers.length === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topUsers.map(([name, count]) => (
                <HBarRow key={name} label={name} value={count} max={maxUser} color={SEQ_400} />
              ))}
            </div>
          )}
        </ChartCard>

        {/* Most frequent cancellers */}
        <ChartCard title={t.topCancellers}>
          {topCancellers.length === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topCancellers.map(([name, count]) => (
                <HBarRow key={name} label={name} value={count} max={maxCanceller} color={STATUS.serious} />
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function StatTile({ label, value, delta }: { label: string; value: string; delta?: string | null }) {
  const deltaUp = delta?.startsWith('+')
  return (
    <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px' }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: INK_MUT, margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: INK, letterSpacing: '-0.5px' }}>{value}</p>
      {delta && (
        <p style={{ fontSize: 10.5, fontWeight: 700, margin: '4px 0 0', color: deltaUp ? STATUS.good : STATUS.serious }}>{delta}</p>
      )}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: PRIMARY, margin: '4px 0 10px' }}>
      {title}
    </p>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '16px', marginBottom: 14 }}>
      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 14px', fontFamily: FONT, color: INK }}>{title}</p>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p style={{ fontSize: 12.5, color: INK_MUT, margin: 0, textAlign: 'center', padding: '20px 0' }}>{text}</p>
}

// Ranked-magnitude horizontal bar: single sequential hue, 4px rounded tip,
// value at the bar end (outside if it wouldn't fit inside).
// `total` is optional — pass it for part-of-whole composition data (status
// breakdown, trip type, lead time) so the value shows "N (X%)" instead of a
// bare count the reader would otherwise have to sum themselves. Omit it for
// ranked "Top N" lists (routes, drivers, users, hours) where a bare count is
// what you actually want to compare.
function HBarRow({ label, value, max, color, total }: { label: string; value: number; max: number; color: string; total?: number }) {
  const pct = Math.max((value / max) * 100, 2)
  const pctOfTotal = total && total > 0 ? Math.round((value / total) * 100) : null
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, color: INK, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{label}</span>
        <span style={{ fontSize: 12.5, color: INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {value}{pctOfTotal !== null ? ` (${pctOfTotal}%)` : ''}
        </span>
      </div>
      <div style={{ height: 8, background: '#f0efec', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}

// Line + area trend chart with a crosshair that snaps to the nearest day, and a
// tooltip listing the value — the hover layer the skill requires by default.
function TrendChart({ data, max, hoverIdx, setHoverIdx, lang }: {
  data: { date: Date; key: string; count: number }[]
  max: number
  hoverIdx: number | null
  setHoverIdx: (i: number | null) => void
  lang: 'en' | 'id'
}) {
  const W = 100 // percent-based viewBox width
  const H = 140
  const PAD_TOP = 10
  const PAD_BOTTOM = 20
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const n = data.length
  const stepX = n > 1 ? W / (n - 1) : 0

  const points = data.map((d, i) => {
    const x = n > 1 ? i * stepX : W / 2
    const y = PAD_TOP + plotH - (d.count / max) * plotH
    return { x, y, ...d }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? 0} ${PAD_TOP + plotH} L ${points[0]?.x ?? 0} ${PAD_TOP + plotH} Z`

  // Y-axis ticks: 0 and max, rounded
  const yTicks = [0, Math.round(max / 2), max]

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    let nearest = 0
    let bestDist = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(p.x - relX)
      if (d < bestDist) { bestDist = d; nearest = i }
    })
    setHoverIdx(nearest)
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 160, display: 'block', overflow: 'visible' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Gridlines — hairline, recessive */}
        {yTicks.map((tick, i) => {
          const y = PAD_TOP + plotH - (tick / max) * plotH
          return (
            <g key={i}>
              <line x1={0} y1={y} x2={W} y2={y} stroke={GRID} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              <text x={0} y={y - 2} fontSize={4.5} fill={INK_MUT}>{tick}</text>
            </g>
          )
        })}

        {/* Area wash */}
        <path d={areaPath} fill={SEQ_WASH} stroke="none" />
        {/* Line */}
        <path d={linePath} fill="none" stroke={SEQ_400} strokeWidth={0.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {/* Crosshair */}
        {hovered && (
          <>
            <line x1={hovered.x} y1={PAD_TOP} x2={hovered.x} y2={PAD_TOP + plotH} stroke={INK_MUT} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
            <circle cx={hovered.x} cy={hovered.y} r={2} fill={SEQ_400} stroke={SURF} strokeWidth={1} />
          </>
        )}

        {/* Invisible hit layer already covered by onMouseMove on the svg itself */}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute', top: 4, left: `${Math.min(Math.max(hovered.x, 15), 85)}%`, transform: 'translateX(-50%)',
          background: INK, color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, pointerEvents: 'none',
          whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}>
          <div style={{ fontWeight: 700 }}>{hovered.count} {lang === 'id' ? 'trip' : 'trips'}</div>
          <div style={{ opacity: 0.75, fontSize: 10.5 }}>{format(hovered.date, 'EEE, d MMM', { locale: lang === 'id' ? idLocale : undefined })}</div>
        </div>
      )}

      {/* X-axis: first / mid / last date labels only — selective, not every point */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: INK_MUT }}>{format(data[0].date, 'd MMM', { locale: idLocale })}</span>
        {data.length > 2 && (
          <span style={{ fontSize: 10, color: INK_MUT }}>{format(data[Math.floor(data.length / 2)].date, 'd MMM', { locale: idLocale })}</span>
        )}
        <span style={{ fontSize: 10, color: INK_MUT }}>{format(data[data.length - 1].date, 'd MMM', { locale: idLocale })}</span>
      </div>
    </div>
  )
}
