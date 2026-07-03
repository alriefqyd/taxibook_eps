'use client'
import { useEffect, useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import { format, differenceInMinutes } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { STATUS_LABELS, STATUS_COLORS } from '@/types'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'

const PRIMARY = '#006064'

const MSG = {
  en: {
    title:            'Trip Report',
    recordCount:      (n: number) => `${n} record${n !== 1 ? 's' : ''} shown`,
    dateRange:        'Date range',
    today:            'Today',
    thisWeek:         'This week',
    thisMonth:        'This month',
    statTotal:        'Total trips',
    statDone:         'Completed',
    statCancelled:    'Cancelled / Rejected',
    statAvgDuration:  'Avg. duration',
    statActivePending:'Active / Pending',
    searchPlaceholder:'Search passenger, booking code, driver...',
    statusLabel:      'Status',
    tripTypeLabel:    'Trip type',
    driverTaxiLabel:  'Driver / Taxi',
    allDrivers:       'All drivers',
    filterAll:        'All',
    filterCompleted:  'Completed',
    filterOnTrip:     'On Trip',
    filterWaiting:    'Waiting',
    filterBooked:     'Booked',
    filterCancelled:  'Cancelled',
    filterRejected:   'Rejected',
    filterSubmitted:  'Submitted',
    noData:           'No data for this filter',
    loadMore:         'Load More',
    loading:          'Loading...',
    scheduledLabel:   'Scheduled',
    durationLabel:    'Duration',
    passengerLabel:   'Passenger',
    driverLabel:      'Driver',
    sectionTime:      'Time',
    sectionPassenger: 'Passenger',
    sectionDriver:    'Driver & Vehicle',
    sectionRoute:     'Trip Route',
    sectionNotes:     'Notes',
    rowCreated:       'Created',
    rowScheduled:     'Scheduled',
    rowCompleted:     'Completed',
    rowWindowEnd:     'Window end',
    rowActualDuration:'Actual duration',
    rowBookingWindow: 'Booking window',
    rowName:          'Name',
    rowPhone:         'Phone',
    rowDriver:        'Driver',
    rowDriverPhone:   "Driver's phone",
    rowTaxi:          'Taxi',
    rowPlate:         'Plate',
    rowTaxiColor:     'Taxi color',
    rowFrom:          'From',
    rowDest:          'Destination',
    rowTripType:      'Trip type',
    rowNotes:         'Notes',
    rowRejectReason:  'Rejection reason',
    notAssigned:      'Not assigned',
    dropTrip:         'Drop (one way)',
    waitTrip:         (n: number) => `Waiting — ${n} min`,
    minutes:          (n: number) => `${n} min`,
    reassignTitle:    'Reassign driver',
    reassignConfirm:  'Confirm reassign',
    reassignCancel:   'Cancel',
    currentTaxi:      'Current',
    noDriver:         'No driver',
  },
  id: {
    title:            'Laporan Trip',
    recordCount:      (n: number) => `${n} data ditampilkan`,
    dateRange:        'Rentang tanggal',
    today:            'Hari ini',
    thisWeek:         'Minggu ini',
    thisMonth:        'Bulan ini',
    statTotal:        'Total trip',
    statDone:         'Selesai',
    statCancelled:    'Batal / Ditolak',
    statAvgDuration:  'Rata-rata durasi',
    statActivePending:'Aktif / Pending',
    searchPlaceholder:'Cari nama penumpang, kode booking, driver...',
    statusLabel:      'Status',
    tripTypeLabel:    'Jenis perjalanan',
    driverTaxiLabel:  'Driver / Taxi',
    allDrivers:       'Semua driver',
    filterAll:        'Semua',
    filterCompleted:  'Selesai',
    filterOnTrip:     'On Trip',
    filterWaiting:    'Waiting',
    filterBooked:     'Booked',
    filterCancelled:  'Batal',
    filterRejected:   'Ditolak',
    filterSubmitted:  'Submitted',
    noData:           'Tidak ada data untuk filter ini',
    loadMore:         'Muat lagi',
    loading:          'Memuat...',
    scheduledLabel:   'Dijadwalkan',
    durationLabel:    'Durasi',
    passengerLabel:   'Penumpang',
    driverLabel:      'Driver',
    sectionTime:      'Waktu',
    sectionPassenger: 'Penumpang',
    sectionDriver:    'Driver & Kendaraan',
    sectionRoute:     'Rute Perjalanan',
    sectionNotes:     'Keterangan',
    rowCreated:       'Dibuat',
    rowScheduled:     'Dijadwalkan',
    rowCompleted:     'Selesai',
    rowWindowEnd:     'Batas window',
    rowActualDuration:'Durasi aktual',
    rowBookingWindow: 'Window booking',
    rowName:          'Nama',
    rowPhone:         'No. HP',
    rowDriver:        'Driver',
    rowDriverPhone:   'No. HP driver',
    rowTaxi:          'Taksi',
    rowPlate:         'Plat',
    rowTaxiColor:     'Warna taksi',
    rowFrom:          'Dari',
    rowDest:          'Tujuan',
    rowTripType:      'Jenis trip',
    rowNotes:         'Catatan',
    rowRejectReason:  'Alasan batal/tolak',
    notAssigned:      'Belum assigned',
    dropTrip:         'Drop (antar saja)',
    waitTrip:         (n: number) => `Waiting — ${n} menit tunggu`,
    minutes:          (n: number) => `${n} menit`,
    reassignTitle:    'Ganti driver',
    reassignConfirm:  'Konfirmasi ganti',
    reassignCancel:   'Batal',
    currentTaxi:      'Saat ini',
    noDriver:         'Tanpa driver',
  },
}

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
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [loading,      setLoading]      = useState(true)
  const [rows,         setRows]         = useState<ReportRow[]>([])
  const [taxis,        setTaxis]        = useState<TaxiOption[]>([])
  const [selectedRow,  setSelectedRow]  = useState<ReportRow | null>(null)
  const [reassignRow,  setReassignRow]  = useState<ReportRow | null>(null)
  const [reassignTaxiId, setReassignTaxiId] = useState('')
  const [reassigning,  setReassigning]  = useState(false)
  const [page,         setPage]         = useState(0)
  const [hasMore,      setHasMore]      = useState(false)
  const [loadingMore,  setLoadingMore]  = useState(false)

  const [dateFrom,      setDateFrom]      = useState(monthStart())
  const [dateTo,        setDateTo]        = useState(todayStr())
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [taxiFilter,    setTaxiFilter]    = useState('all')
  const [typeFilter,    setTypeFilter]    = useState('all')
  const [search,        setSearch]        = useState('')

  const PAGE_SIZE = 20

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
      setTaxis((txs || []).map((taxi: any) => ({
        id: taxi.id,
        name: taxi.name,
        driver_name: taxi.users?.name ?? null,
      })))

      await loadData(monthStart(), todayStr(), 0, false)
      setLoading(false)
    }
    init()
  }, [])

  async function loadData(from: string, to: string, pageNum = 0, append = false) {
    const start = new Date(from); start.setHours(0, 0, 0, 0)
    const end   = new Date(to);   end.setHours(23, 59, 59, 999)

    const { data } = await supabase
      .from('booking_details')
      .select('id, booking_code, scheduled_at, completed_at, auto_complete_at, passenger_name, passenger_phone, driver_name, driver_phone, taxi_name, taxi_plate, taxi_color, taxi_id, pickup, destination, trip_type, wait_minutes, status, notes, rejection_reason, created_at')
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString())
      .order('scheduled_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1)

    const fetched = data || []
    setRows(prev => append ? [...prev, ...fetched] : fetched)
    setHasMore(fetched.length === PAGE_SIZE)
  }

  async function handleReassign() {
    if (!reassignRow || !reassignTaxiId) return
    setReassigning(true)
    await supabase.from('bookings').update({ taxi_id: reassignTaxiId }).eq('id', reassignRow.id)
    await loadData(dateFrom, dateTo, page, false)
    setReassignRow(null)
    setReassignTaxiId('')
    setReassigning(false)
  }

  function setRange(from: string, to: string) {
    setPage(0)
    setDateFrom(from); setDateTo(to); loadData(from, to, 0, false)
  }
  function thisWeekRange() {
    const d = new Date()
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return { from: mon.toISOString().slice(0, 10), to: todayStr() }
  }

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

  const total     = filtered.length
  const completed = filtered.filter(r => r.status === 'completed').length
  const cancelled = filtered.filter(r => ['cancelled', 'rejected'].includes(r.status)).length
  const active    = filtered.filter(r => ['booked', 'on_trip', 'waiting_trip', 'submitted', 'pending_coordinator_approval'].includes(r.status)).length

  const completedRows = filtered.filter(r => r.status === 'completed' && r.completed_at)
  const avgMin = completedRows.length > 0
    ? Math.round(completedRows.reduce((s, r) => s + differenceInMinutes(new Date(r.completed_at!), new Date(r.scheduled_at)), 0) / completedRows.length)
    : null

  if (loading) return <PageLoader />

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
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: PRIMARY, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t.title}</p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{t.recordCount(total)}</p>
          </div>
        </div>
      </header>

      <div style={{ padding: '16px' }}>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: t.statTotal,                                                   value: total,     color: PRIMARY,   bg: 'rgba(0,96,100,0.08)' },
            { label: t.statDone,                                                    value: completed, color: '#059669', bg: '#D1FAE5' },
            { label: t.statCancelled,                                               value: cancelled, color: '#DC2626', bg: '#FEE2E2' },
            { label: avgMin != null ? t.statAvgDuration : t.statActivePending,      value: avgMin != null ? t.minutes(avgMin) : active, color: '#D97706', bg: '#FEF3C7' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.color, margin: '0 0 4px', opacity: 0.8 }}>{s.label}</p>
              <p style={{ fontSize: 24, fontWeight: 800, margin: 0, color: s.color, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters — single card */}
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px', marginBottom: 12 }}>

          {/* Date row + shortcuts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input type="date" value={dateFrom}
              onChange={e => { setPage(0); setDateFrom(e.target.value); loadData(e.target.value, dateTo, 0, false) }}
              style={{ flex: 1, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', color: PRIMARY, fontFamily: 'inherit' }} />
            <span style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>→</span>
            <input type="date" value={dateTo}
              onChange={e => { setPage(0); setDateTo(e.target.value); loadData(dateFrom, e.target.value, 0, false) }}
              style={{ flex: 1, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', color: PRIMARY, fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {([
              { label: t.today,     action: () => setRange(todayStr(), todayStr()) },
              { label: t.thisWeek,  action: () => { const { from, to } = thisWeekRange(); setRange(from, to) } },
              { label: t.thisMonth, action: () => setRange(monthStart(), todayStr()) },
            ]).map(q => (
              <button key={q.label} onClick={q.action}
                style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 9999, background: '#F5F5F2', color: '#6f7979', cursor: 'pointer', fontFamily: 'inherit' }}>
                {q.label}
              </button>
            ))}
          </div>

          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', marginBottom: 12 }} />

          {/* Search */}
          <input
            type="search"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, outline: 'none', boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit' }}
          />

          {/* Status + Trip type dropdowns side by side */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ flex: 1, padding: '9px 10px', fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, outline: 'none', background: '#fff', fontFamily: 'inherit', color: statusFilter !== 'all' ? PRIMARY : 'inherit' }}>
              <option value="all">{t.statusLabel}: {t.filterAll}</option>
              <option value="completed">{t.filterCompleted}</option>
              <option value="on_trip">{t.filterOnTrip}</option>
              <option value="waiting_trip">{t.filterWaiting}</option>
              <option value="booked">{t.filterBooked}</option>
              <option value="cancelled">{t.filterCancelled}</option>
              <option value="rejected">{t.filterRejected}</option>
              <option value="submitted">{t.filterSubmitted}</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ flex: 1, padding: '9px 10px', fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, outline: 'none', background: '#fff', fontFamily: 'inherit', color: typeFilter !== 'all' ? PRIMARY : 'inherit' }}>
              <option value="all">{t.tripTypeLabel}: {t.filterAll}</option>
              <option value="DROP">Drop</option>
              <option value="WAITING">Waiting</option>
            </select>
          </div>

          {/* Driver/taxi */}
          <select value={taxiFilter} onChange={e => setTaxiFilter(e.target.value)}
            style={{ width: '100%', padding: '9px 10px', fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, outline: 'none', background: '#fff', fontFamily: 'inherit', color: taxiFilter !== 'all' ? PRIMARY : 'inherit' }}>
            <option value="all">{t.driverTaxiLabel}: {t.allDrivers}</option>
            {taxis.map(taxi => (
              <option key={taxi.id} value={taxi.id}>{taxi.name}{taxi.driver_name ? ` — ${taxi.driver_name}` : ''}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af' }}>
            <p style={{ fontSize: 14, margin: 0 }}>{t.noData}</p>
          </div>
        ) : (
          <>
            {filtered.map(r => (
              <ReportCard
                key={r.id} row={r}
                onClick={() => setSelectedRow(r)}
                onReassign={['submitted','booked','on_trip','waiting_trip'].includes(r.status)
                  ? () => { setReassignRow(r); setReassignTaxiId(r.taxi_id ?? '') }
                  : undefined}
              />
            ))}
            {hasMore && (
              <button
                disabled={loadingMore}
                onClick={async () => {
                  setLoadingMore(true)
                  const next = page + 1
                  setPage(next)
                  await loadData(dateFrom, dateTo, next, true)
                  setLoadingMore(false)
                }}
                style={{ width: '100%', padding: '13px', marginTop: 4, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 600, color: loadingMore ? '#9ca3af' : PRIMARY, cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {loadingMore ? t.loading : t.loadMore}
              </button>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {selectedRow && (
        <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}

      {/* Reassign modal */}
      {reassignRow && (
        <div onClick={() => setReassignRow(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', borderRadius: '20px 20px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.12)' }} />
            </div>
            {/* Header */}
            <div style={{ padding: '4px 20px 14px', borderBottom: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: '0 0 2px', color: PRIMARY, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t.reassignTitle}</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{reassignRow.booking_code} · {reassignRow.passenger_name}</p>
            </div>
            {/* Taxi list */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '10px 16px' }}>
              {taxis.map(taxi => {
                const isCurrent  = taxi.id === reassignRow.taxi_id
                const isSelected = taxi.id === reassignTaxiId
                return (
                  <div
                    key={taxi.id}
                    onClick={() => setReassignTaxiId(taxi.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, marginBottom: 6, cursor: 'pointer', border: `1.5px solid ${isSelected ? PRIMARY : 'rgba(0,0,0,0.08)'}`, background: isSelected ? 'rgba(0,96,100,0.06)' : '#fff' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: isSelected ? PRIMARY : '#F5F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isSelected ? '#fff' : '#6f7979'} strokeWidth="2"><path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: isSelected ? PRIMARY : '#1a1c1b' }}>{taxi.name}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{taxi.driver_name ?? t.noDriver}</p>
                    </div>
                    {isCurrent && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: '#FEF3C7', color: '#92400E', flexShrink: 0 }}>{t.currentTaxi}</span>
                    )}
                    {isSelected && !isCurrent && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 16px 28px', borderTop: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}>
              <button onClick={() => setReassignRow(null)} style={{ padding: '13px', background: '#F5F5F2', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t.reassignCancel}
              </button>
              <button
                disabled={!reassignTaxiId || reassigning}
                onClick={handleReassign}
                style={{ padding: '13px', background: reassignTaxiId && !reassigning ? PRIMARY : '#d1d5db', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, color: '#fff', cursor: reassignTaxiId && !reassigning ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
              >
                {reassigning ? '...' : t.reassignConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compact card (list) ───────────────────────────────────────────────────────
function ReportCard({ row: r, onClick, onReassign }: { row: ReportRow; onClick: () => void; onReassign?: () => void }) {
  const lang  = useLang()
  const t     = MSG[lang]
  const sc    = STATUS_COLORS[r.status as keyof typeof STATUS_COLORS] ?? { bg: '#f3f4f6', text: '#374151' }
  const label = STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status
  const durationMin = r.completed_at
    ? differenceInMinutes(new Date(r.completed_at), new Date(r.scheduled_at))
    : null

  return (
    <div
      onClick={onClick}
      style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,96,100,0.06)', border: '1px solid rgba(0,0,0,0.06)', borderLeft: `3px solid ${PRIMARY}`, cursor: 'pointer' }}
    >
      {/* Code + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, margin: 0, letterSpacing: '0.04em' }}>{r.booking_code}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, background: sc.bg, color: sc.text }}>{label}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>

      {/* Time row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.scheduledLabel}</p>
          <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{format(new Date(r.scheduled_at), 'dd MMM yyyy · HH:mm', { locale: idLocale })}</p>
        </div>
        {durationMin != null && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.durationLabel}</p>
            <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: PRIMARY }}>{durationMin}m</p>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '0 0 8px' }} />

      {/* Passenger + driver */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.passengerLabel}</p>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.passenger_name}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.driverLabel}</p>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.driver_name ?? '—'}</p>
        </div>
      </div>

      {/* Route */}
      <p style={{ fontSize: 12, margin: 0, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600 }}>{r.pickup}</span>
        <span style={{ color: '#9ca3af', margin: '0 4px' }}>→</span>
        <span style={{ fontWeight: 600 }}>{r.destination}</span>
      </p>

      {onReassign && (
        <button
          onClick={e => { e.stopPropagation(); onReassign() }}
          style={{ marginTop: 10, width: '100%', padding: '8px', background: 'rgba(0,96,100,0.06)', border: '1px solid rgba(0,96,100,0.15)', borderRadius: 10, fontSize: 12, fontWeight: 700, color: PRIMARY, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/></svg>
          {t.reassignTitle}
        </button>
      )}
    </div>
  )
}

// ── Detail modal (bottom-sheet) ───────────────────────────────────────────────
function DetailModal({ row: r, onClose }: { row: ReportRow; onClose: () => void }) {
  const lang  = useLang()
  const t     = MSG[lang]
  const sc    = STATUS_COLORS[r.status as keyof typeof STATUS_COLORS] ?? { bg: '#f3f4f6', text: '#374151' }
  const label = STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status

  const durationMin = r.completed_at
    ? differenceInMinutes(new Date(r.completed_at), new Date(r.scheduled_at))
    : null

  const windowMin = r.auto_complete_at
    ? differenceInMinutes(new Date(r.auto_complete_at), new Date(r.scheduled_at))
    : null

  const fmtWita = (iso: string) =>
    format(new Date(iso), 'EEEE, dd MMMM yyyy · HH:mm', { locale: idLocale })

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', borderRadius: '20px 20px 0 0', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', padding: '0 0 32px' }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* Modal header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 20px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px', color: PRIMARY, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.02em' }}>{r.booking_code}</p>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: sc.bg, color: sc.text }}>{label}</span>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#F5F5F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Time ── */}
          <Section title={t.sectionTime}>
            <DetailRow label={t.rowCreated}      value={fmtWita(r.created_at)} />
            <DetailRow label={t.rowScheduled}    value={fmtWita(r.scheduled_at)} highlight />
            {r.completed_at && (
              <DetailRow label={t.rowCompleted}  value={fmtWita(r.completed_at)} valueColor="#059669" />
            )}
            {r.auto_complete_at && (
              <DetailRow label={t.rowWindowEnd}  value={fmtWita(r.auto_complete_at)} valueColor="#6f7979" />
            )}
            {durationMin != null && (
              <DetailRow label={t.rowActualDuration} value={t.minutes(durationMin)} highlight />
            )}
            {windowMin != null && (
              <DetailRow label={t.rowBookingWindow}  value={t.minutes(windowMin)} />
            )}
          </Section>

          {/* ── Passenger ── */}
          <Section title={t.sectionPassenger}>
            <DetailRow label={t.rowName}  value={r.passenger_name} highlight />
            {r.passenger_phone && (
              <DetailRow label={t.rowPhone} value={r.passenger_phone} link={`tel:${r.passenger_phone}`} />
            )}
          </Section>

          {/* ── Driver & Vehicle ── */}
          <Section title={t.sectionDriver}>
            <DetailRow label={t.rowDriver}  value={r.driver_name ?? t.notAssigned} highlight={!!r.driver_name} />
            {r.driver_phone && (
              <DetailRow label={t.rowDriverPhone} value={r.driver_phone} link={`tel:${r.driver_phone}`} />
            )}
            <DetailRow label={t.rowTaxi}   value={r.taxi_name ?? '—'} />
            {r.taxi_plate && <DetailRow label={t.rowPlate} value={r.taxi_plate} />}
            {r.taxi_color && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, fontWeight: 600 }}>{t.rowTaxiColor}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: r.taxi_color, border: '1px solid rgba(0,0,0,0.1)' }} />
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{r.taxi_color}</p>
                </div>
              </div>
            )}
          </Section>

          {/* ── Route ── */}
          <Section title={t.sectionRoute}>
            <DetailRow label={t.rowFrom}     value={r.pickup}      highlight />
            <DetailRow label={t.rowDest}     value={r.destination} highlight />
            <DetailRow
              label={t.rowTripType}
              value={r.trip_type === 'DROP' ? t.dropTrip : t.waitTrip(r.wait_minutes ?? 0)}
            />
          </Section>

          {/* ── Notes ── */}
          {(r.notes || r.rejection_reason) && (
            <Section title={t.sectionNotes}>
              {r.notes && <DetailRow label={t.rowNotes} value={r.notes} />}
              {r.rejection_reason && (
                <DetailRow label={t.rowRejectReason} value={r.rejection_reason} valueColor="#DC2626" />
              )}
            </Section>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#F5F5F2', borderRadius: 14, overflow: 'hidden' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: PRIMARY, margin: 0, padding: '10px 14px 6px', opacity: 0.8 }}>{title}</p>
      <div style={{ padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {children}
      </div>
    </div>
  )
}

function DetailRow({ label, value, highlight, valueColor, link }: {
  label: string
  value: string
  highlight?: boolean
  valueColor?: string
  link?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.05)', gap: 12 }}>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, fontWeight: 600, flexShrink: 0 }}>{label}</p>
      {link ? (
        <a href={link} style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, margin: 0, textAlign: 'right', color: PRIMARY, textDecoration: 'none' }}>{value}</a>
      ) : (
        <p style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, margin: 0, textAlign: 'right', color: valueColor ?? '#1a1c1b', lineHeight: 1.4 }}>{value}</p>
      )}
    </div>
  )
}
