'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, differenceInMinutes } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { STATUS_LABELS, STATUS_COLORS } from '@/types'

const PRIMARY = '#006064'

function monthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

interface ReportRow {
  id: string
  booking_code: string
  scheduled_at: string
  completed_at: string | null
  auto_complete_at: string | null
  passenger_name: string
  passenger_phone: string | null
  driver_name: string | null
  driver_phone: string | null
  taxi_name: string | null
  taxi_plate: string | null
  taxi_color: string | null
  taxi_id: string | null
  pickup: string
  destination: string
  trip_type: 'DROP' | 'WAITING'
  wait_minutes: number | null
  status: string
  notes: string | null
  rejection_reason: string | null
  created_at: string
}

interface TaxiOption {
  id: string
  name: string
  driver_name: string | null
}

export default function CoordinatorReportPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [taxis, setTaxis] = useState<TaxiOption[]>([])

  const [dateFrom, setDateFrom] = useState(monthStart())
  const [dateTo, setDateTo] = useState(todayStr())
  const [statusFilter, setStatusFilter] = useState('all')
  const [taxiFilter, setTaxiFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', au.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }

      const { data: txs } = await supabase
        .from('taxis')
        .select('id, name, users!driver_id(name)')
        .eq('is_active', true)
        .order('name')
      setTaxis((txs || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        driver_name: t.users?.name ?? null,
      })))

      await loadData(monthStart(), todayStr())
      setLoading(false)
    }
    init()
  }, [])

  async function loadData(from: string, to: string) {
    const start = new Date(from); start.setHours(0, 0, 0, 0)
    const end   = new Date(to);   end.setHours(23, 59, 59, 999)

    const { data } = await supabase
      .from('booking_details')
      .select('id, booking_code, scheduled_at, completed_at, auto_complete_at, passenger_name, passenger_phone, driver_name, driver_phone, taxi_name, taxi_plate, taxi_color, taxi_id, pickup, destination, trip_type, wait_minutes, status, notes, rejection_reason, created_at')
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString())
      .order('scheduled_at', { ascending: false })
      .limit(1000)

    setRows(data || [])
  }

  // quick-range helpers
  function setRange(from: string, to: string) {
    setDateFrom(from); setDateTo(to); loadData(from, to)
  }
  function thisWeekRange() {
    const d = new Date()
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return { from: mon.toISOString().slice(0, 10), to: todayStr() }
  }

  // client-side filtering
  const filtered = rows.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (taxiFilter !== 'all' && r.taxi_id !== taxiFilter) return false
    if (typeFilter !== 'all' && r.trip_type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const hit = [r.passenger_name, r.booking_code, r.driver_name, r.taxi_name]
        .some(v => v?.toLowerCase().includes(q))
      if (!hit) return false
    }
    return true
  })

  // summary stats
  const total     = filtered.length
  const completed = filtered.filter(r => r.status === 'completed').length
  const cancelled = filtered.filter(r => ['cancelled', 'rejected'].includes(r.status)).length
  const active    = filtered.filter(r => ['booked', 'on_trip', 'waiting_trip', 'submitted', 'pending_coordinator_approval'].includes(r.status)).length

  const completedRows = filtered.filter(r => r.status === 'completed' && r.completed_at)
  const avgMin = completedRows.length > 0
    ? Math.round(completedRows.reduce((s, r) => s + differenceInMinutes(new Date(r.completed_at!), new Date(r.scheduled_at)), 0) / completedRows.length)
    : null

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(0,96,100,0.15)', borderTop: '3px solid #006064', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight: '100vh', background: '#F5F5F2' }}>

      {/* Header */}
      <header style={{ background: '#F5F5F2', borderBottom: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,96,100,0.06)', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 56 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: PRIMARY, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Trip Report</p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{total} record{total !== 1 ? 's' : ''} ditampilkan</p>
          </div>
        </div>
      </header>

      <div style={{ padding: '16px' }}>

        {/* Date range */}
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 8px' }}>Rentang tanggal</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); loadData(e.target.value, dateTo) }}
              style={{ flex: 1, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', color: PRIMARY, fontFamily: 'inherit' }} />
            <span style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>→</span>
            <input type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); loadData(dateFrom, e.target.value) }}
              style={{ flex: 1, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', color: PRIMARY, fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              { label: 'Hari ini', action: () => setRange(todayStr(), todayStr()) },
              { label: 'Minggu ini', action: () => { const { from, to } = thisWeekRange(); setRange(from, to) } },
              { label: 'Bulan ini', action: () => setRange(monthStart(), todayStr()) },
            ]).map(q => (
              <button key={q.label} onClick={q.action}
                style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 9999, background: '#F5F5F2', color: '#6f7979', cursor: 'pointer', fontFamily: 'inherit' }}>
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Total trip', value: total, color: PRIMARY, bg: 'rgba(0,96,100,0.08)' },
            { label: 'Selesai', value: completed, color: '#059669', bg: '#D1FAE5' },
            { label: 'Batal / Ditolak', value: cancelled, color: '#DC2626', bg: '#FEE2E2' },
            { label: avgMin != null ? `Rata-rata durasi` : 'Aktif / Pending', value: avgMin != null ? `${avgMin}m` : active, color: '#D97706', bg: '#FEF3C7' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.color, margin: '0 0 4px', opacity: 0.8 }}>{s.label}</p>
              <p style={{ fontSize: 24, fontWeight: 800, margin: 0, color: s.color, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
          {/* Search */}
          <input
            type="search"
            placeholder="Cari nama penumpang, kode booking, driver..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, outline: 'none', boxSizing: 'border-box', marginBottom: 12, fontFamily: 'inherit' }}
          />

          {/* Status */}
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 6px' }}>Status</p>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10 }}>
            {([
              { key: 'all',       label: 'Semua' },
              { key: 'completed', label: 'Selesai' },
              { key: 'on_trip',   label: 'On Trip' },
              { key: 'waiting_trip', label: 'Waiting' },
              { key: 'booked',    label: 'Booked' },
              { key: 'cancelled', label: 'Batal' },
              { key: 'rejected',  label: 'Ditolak' },
              { key: 'submitted', label: 'Submitted' },
            ]).map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 600, flexShrink: 0,
                border: `1.5px solid ${statusFilter === f.key ? PRIMARY : 'rgba(0,0,0,0.08)'}`,
                borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit',
                background: statusFilter === f.key ? PRIMARY : '#fff',
                color:      statusFilter === f.key ? '#fff' : '#3f4949',
              }}>{f.label}</button>
            ))}
          </div>

          {/* Trip type */}
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 6px' }}>Jenis perjalanan</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {([{ key: 'all', label: 'Semua' }, { key: 'DROP', label: 'Drop' }, { key: 'WAITING', label: 'Waiting' }]).map(f => (
              <button key={f.key} onClick={() => setTypeFilter(f.key)} style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 600,
                border: `1.5px solid ${typeFilter === f.key ? PRIMARY : 'rgba(0,0,0,0.08)'}`,
                borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit',
                background: typeFilter === f.key ? PRIMARY : '#fff',
                color:      typeFilter === f.key ? '#fff' : '#3f4949',
              }}>{f.label}</button>
            ))}
          </div>

          {/* Driver / Taxi */}
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 6px' }}>Driver / Taxi</p>
          <select value={taxiFilter} onChange={e => setTaxiFilter(e.target.value)}
            style={{ width: '100%', padding: '9px 10px', fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, outline: 'none', background: '#fff', fontFamily: 'inherit' }}>
            <option value="all">Semua driver</option>
            {taxis.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.driver_name ? ` — ${t.driver_name}` : ''}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af' }}>
            <p style={{ fontSize: 14, margin: 0 }}>Tidak ada data untuk filter ini</p>
          </div>
        ) : (
          filtered.map(r => <ReportCard key={r.id} row={r} />)
        )}
      </div>
    </div>
  )
}

function ReportCard({ row: r }: { row: ReportRow }) {
  const sc    = STATUS_COLORS[r.status as keyof typeof STATUS_COLORS] ?? { bg: '#f3f4f6', text: '#374151' }
  const label = STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status

  const durationMin = r.completed_at
    ? differenceInMinutes(new Date(r.completed_at), new Date(r.scheduled_at))
    : null

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,96,100,0.06)', border: '1px solid rgba(0,0,0,0.06)', borderLeft: `3px solid ${PRIMARY}` }}>

      {/* Booking code + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, margin: 0, letterSpacing: '0.04em' }}>{r.booking_code}</p>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, background: sc.bg, color: sc.text, flexShrink: 0 }}>{label}</span>
      </div>

      {/* Scheduled + completed + duration */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Dijadwalkan</p>
          <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{format(new Date(r.scheduled_at), 'dd MMM yyyy · HH:mm', { locale: idLocale })}</p>
        </div>
        {r.completed_at && (
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Selesai</p>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: '#059669' }}>{format(new Date(r.completed_at), 'dd MMM yyyy · HH:mm', { locale: idLocale })}</p>
          </div>
        )}
        {durationMin != null && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Durasi</p>
            <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: PRIMARY }}>{durationMin}m</p>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '0 0 10px' }} />

      {/* Passenger */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Penumpang</p>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.passenger_name}</p>
          {r.passenger_phone && <p style={{ fontSize: 11, color: '#6f7979', margin: 0 }}>{r.passenger_phone}</p>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Driver / Taxi</p>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.driver_name ?? 'Unassigned'}</p>
          <p style={{ fontSize: 11, color: '#6f7979', margin: 0 }}>
            {r.taxi_name ?? '—'}{r.taxi_plate ? ` · ${r.taxi_plate}` : ''}
          </p>
        </div>
      </div>

      {/* Route */}
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rute</p>
        <p style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>{r.pickup}</span>
          <span style={{ color: '#9ca3af', margin: '0 4px' }}>→</span>
          <span style={{ fontWeight: 600 }}>{r.destination}</span>
        </p>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 9999, background: r.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: r.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
          {r.trip_type === 'DROP' ? 'Drop' : `Waiting ${r.wait_minutes ?? 0}min`}
        </span>
        {r.notes && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 9px', borderRadius: 9999, background: '#FEF3C7', color: '#92400E', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.notes}
          </span>
        )}
        {r.rejection_reason && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 9px', borderRadius: 9999, background: '#FEE2E2', color: '#991B1B', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Alasan: {r.rejection_reason}
          </span>
        )}
      </div>
    </div>
  )
}
