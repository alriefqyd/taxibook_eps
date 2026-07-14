'use client'
import { useEffect, useState, useMemo } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, differenceInMinutes, eachDayOfInterval } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'

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
    topDrivers:   'Top Drivers',
    noData:       'No data in this range',
    statusBreakdown: 'Status Breakdown',
    completed:    'Completed',
    cancelled:    'Cancelled',
    rejected:     'Rejected',
    active:       'Active / Pending',
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
    topDrivers:   'Driver Teratas',
    noData:       'Tidak ada data di rentang ini',
    statusBreakdown: 'Rincian Status',
    completed:    'Selesai',
    cancelled:    'Dibatalkan',
    rejected:     'Ditolak',
    active:       'Aktif / Menunggu',
  },
}

type RangeKey = '7' | '30' | '90'

interface Row {
  id: string; status: string; scheduled_at: string; completed_at: string | null
  pickup: string; destination: string; driver_name: string | null
}

export default function CoordinatorAnalyticsPage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [loading, setLoading] = useState(true)
  const [range,   setRange]   = useState<RangeKey>('30')
  const [rows,    setRows]    = useState<Row[]>([])
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
      const { data } = await supabase
        .from('booking_details')
        .select('id, status, scheduled_at, completed_at, pickup, destination, driver_name')
        .gte('scheduled_at', start.toISOString())
        .order('scheduled_at', { ascending: true })
      setRows((data as any) || [])
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

  const topDrivers = useMemo(() => {
    const map: Record<string, number> = {}
    rows.filter(r => r.driver_name).forEach(r => {
      map[r.driver_name!] = (map[r.driver_name!] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])

  if (loading) return <PageLoader />

  const maxTrend = Math.max(1, ...trend.map(d => d.count))
  const maxRoute = Math.max(1, ...topRoutes.map(([, c]) => c))
  const maxDriver = Math.max(1, ...topDrivers.map(([, c]) => c))

  const statusRows = [
    { label: t.completed, count: stats.completed, color: STATUS.good },
    { label: t.active,    count: stats.active,    color: STATUS.warning },
    { label: t.cancelled, count: stats.cancelled, color: STATUS.serious },
    { label: t.rejected,  count: stats.rejected,  color: STATUS.critical },
  ]
  const maxStatus = Math.max(1, ...statusRows.map(s => s.count))

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
          <StatTile label={t.totalTrips} value={stats.total.toLocaleString()} />
          <StatTile label={t.completionRate} value={`${stats.completionRate}%`} />
          <StatTile label={t.avgDuration} value={t.min(stats.avgDuration)} />
          <StatTile label={t.activePending} value={stats.active.toLocaleString()} />
        </div>

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

        {/* Status breakdown — fixed status palette, icon+label never color alone */}
        <ChartCard title={t.statusBreakdown}>
          {stats.total === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {statusRows.map(s => (
                <HBarRow key={s.label} label={s.label} value={s.count} max={maxStatus} color={s.color} />
              ))}
            </div>
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

        {/* Top drivers */}
        <ChartCard title={t.topDrivers}>
          {topDrivers.length === 0 ? <EmptyState text={t.noData} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topDrivers.map(([name, count]) => (
                <HBarRow key={name} label={name} value={count} max={maxDriver} color={SEQ_400} />
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px' }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: INK_MUT, margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: INK, letterSpacing: '-0.5px' }}>{value}</p>
    </div>
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
function HBarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max((value / max) * 100, 2)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, color: INK, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{label}</span>
        <span style={{ fontSize: 12.5, color: INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{value}</span>
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
