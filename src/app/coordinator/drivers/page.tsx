'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import { format, differenceInCalendarDays } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'
import SwitchRow from '@/components/SwitchRow'

const DriverLastLocationMap = dynamic(() => import('@/components/map/DriverLastLocationMap'), { ssr: false })

// ── Design tokens (DESIGN.md "Fleet Modernist") ─────────────
const FONT     = "'Plus Jakarta Sans', sans-serif"
const PRIMARY  = '#006972'
const PRIM_DK  = '#005159'
const BG       = '#f7faf9'
const SURF     = '#ffffff'
const SURF_LOW = '#f1f4f3'
const TEXT     = '#181c1c'
const TEXT_SUB = '#3f494a'
const TEXT_MUT = '#6f797a'
const BORDER   = '#bec8ca'
const AMBER    = '#feaa00'
const AMBER_T  = '#684300'
const AMBER_BG = '#fff8e6'
const ONLINE   = '#059669'
const OFFLINE  = '#ba1a1a'
const CARD_SH  = '0 2px 8px rgba(0,0,0,0.04)'

const MSG = {
  en: {
    fleetMgmt:       'Fleet Management',
    title:           'Drivers',
    statOnDuty:      'On Duty',
    statActive:      'Active Now',
    statOffline:     'Offline',
    tabDrivers:      'Drivers',
    tabSchedule:     'Schedule',
    trips:           'trips',
    scheduled:       'Scheduled',
    lastLocation:    'Last location',
    noGpsYet:        'No GPS data yet',
    todayTrips:      "Today's trips",
    fullDayDuty:     'Full Day Duty',
    assignDay:       'Assign Day',
    noUpcomingDuty:  'No upcoming full day duty scheduled',
    fullDayToday:    'Full Day Today',
    today:           'Today',
    free:            'Free',
    noDriver:        'No driver',
    offline:         'Offline',
    statusFree:      'Free',
    statusOffline:   'Offline',
    statusNoDriver:  'No driver',
    onDuty:          'On duty',
    total:           'Total',
    pending:         'Pending',
    active:          'Active',
    done:            'Done',
    noTrips:         'No trips',
    noBookingsDate:  'No bookings for this date',
    unassigned:      'Unassigned',
    assign:          'Assign',
    assignFullDay:   'Assign Full Day Duty',
    date:            'Date',
    repeatSwitch:     'Repeat every day',
    repeatSwitchDesc: 'Assign the same duty daily until an end date',
    untilDate:       'Until',
    recurringInfo:   (n: number) => `This will assign the driver for ${n} day${n === 1 ? '' : 's'} in a row.`,
    rangeSwitch:      'Limit to specific hours',
    rangeSwitchDesc:  'Only block auto-assign during these hours, not the whole day',
    startTime:       'Start time',
    endTime:         'End time',
    dutyDesc:            'Duty description (optional)',
    dutyDescPlaceholder: 'e.g. VIP escort, site visit, security duty...',
    dutyWarning:         'Driver will not appear in auto-assign for this date. Coordinator can still manually assign them if needed.',
    dutyWarningRange:    (s: string, e: string) => `Driver will not appear in auto-assign between ${s}–${e} on this date. Coordinator can still manually assign them if needed.`,
    passenger:           'Passenger (optional)',
    passengerSearch:     'Search passenger...',
    passengerOthers:     'Others (not in system)',
    passengerOtherName:  'Passenger name',
    cancel:              'Cancel',
    assigning:           'Assigning...',
    confirmFullDay:      'Confirm Full Day Duty',
    reassignTitle:   'Reassign trip',
    selectTaxi:      'Select taxi',
    reasonOpt:       'Reason (optional)',
    reasonPlaceholder: 'e.g. Driver unavailable...',
    conflictWarning: 'Schedule conflict — driver will be notified',
    conflictWithTrip: (name: string, time: string) => `Conflicts with ${name}'s trip at ${time}`,
    swapHint:        'Swap trips instead — both drivers trade their assigned passenger, no one is double-booked.',
    swapTrips:       'Swap Trips',
    swapping:        'Swapping...',
    confirm:         'Confirm',
    saving:          'Saving...',
    release:         'Release',
    offlineTaxi:     'Offline',
    freeTaxi:        'Free at this time',
    conflictTaxi:    'Has conflict',
    current:         'Current',
    addDriver:       'Add Driver',
    removeDriver:    'Remove Driver',
    selectDriver:    'Select Driver',
    noDriversAvail:  'No available drivers',
    confirmRemove:   'Remove driver from this taxi?',
    adding:          'Adding...',
    removing:        'Removing...',
    confirmSetFree:    'Set this taxi to free/online?',
    confirmSetOffline: 'Set this taxi to offline?',
    setFreeDesc:       'It will start receiving new trip assignments again.',
    setOfflineDesc:    'It will stop receiving new trip assignments.',
    confirmReleaseDuty: 'Release this duty assignment?',
    releasing:          'Releasing...',
    setFree:            'Set Free',
    setOffline:         'Set Offline',
  },
  id: {
    fleetMgmt:       'Manajemen Armada',
    title:           'Driver',
    statOnDuty:      'Bertugas',
    statActive:      'Aktif Sekarang',
    statOffline:     'Offline',
    tabDrivers:      'Driver',
    tabSchedule:     'Jadwal',
    trips:           'trip',
    scheduled:       'Dijadwalkan',
    lastLocation:    'Lokasi terakhir',
    noGpsYet:        'Belum ada data GPS',
    todayTrips:      'Trip hari ini',
    fullDayDuty:     'Tugas Seharian',
    assignDay:       'Assign Hari',
    noUpcomingDuty:  'Tidak ada tugas seharian yang dijadwalkan',
    fullDayToday:    'Tugas Hari Ini',
    today:           'Hari ini',
    free:            'Bebas',
    noDriver:        'Tidak ada driver',
    offline:         'Offline',
    statusFree:      'Bebas',
    statusOffline:   'Offline',
    statusNoDriver:  'Tidak ada driver',
    onDuty:          'Bertugas',
    total:           'Total',
    pending:         'Pending',
    active:          'Aktif',
    done:            'Selesai',
    noTrips:         'Tidak ada trip',
    noBookingsDate:  'Tidak ada booking untuk tanggal ini',
    unassigned:      'Belum diassign',
    assign:          'Assign',
    assignFullDay:   'Assign Tugas Seharian',
    date:            'Tanggal',
    repeatSwitch:     'Ulangi setiap hari',
    repeatSwitchDesc: 'Tugaskan hal yang sama tiap hari sampai tanggal akhir',
    untilDate:       'Sampai',
    recurringInfo:   (n: number) => `Ini akan menugaskan driver selama ${n} hari berturut-turut.`,
    rangeSwitch:      'Batasi ke jam tertentu',
    rangeSwitchDesc:  'Hanya blokir auto-assign selama jam ini, bukan sepanjang hari',
    startTime:       'Jam mulai',
    endTime:         'Jam selesai',
    dutyDesc:            'Keterangan tugas (opsional)',
    dutyDescPlaceholder: 'mis. Pengawalan VIP, kunjungan site, tugas keamanan...',
    dutyWarning:         'Driver tidak akan muncul di auto-assign untuk tanggal ini. Koordinator tetap bisa assign manual jika dibutuhkan.',
    dutyWarningRange:    (s: string, e: string) => `Driver tidak akan muncul di auto-assign antara ${s}–${e} pada tanggal ini. Koordinator tetap bisa assign manual jika dibutuhkan.`,
    passenger:           'Penumpang (opsional)',
    passengerSearch:     'Cari penumpang...',
    passengerOthers:     'Lainnya (tidak ada di sistem)',
    passengerOtherName:  'Nama penumpang',
    cancel:              'Batal',
    assigning:           'Mengassign...',
    confirmFullDay:      'Konfirmasi Tugas Seharian',
    reassignTitle:   'Atur ulang trip',
    selectTaxi:      'Pilih taksi',
    reasonOpt:       'Alasan (opsional)',
    reasonPlaceholder: 'mis. Driver tidak tersedia...',
    conflictWarning: 'Konflik jadwal — driver akan diberitahu',
    conflictWithTrip: (name: string, time: string) => `Bentrok dengan trip ${name} pukul ${time}`,
    swapHint:        'Tukar trip saja — kedua driver saling bertukar penumpang, tidak ada yang bentrok.',
    swapTrips:       'Tukar Trip',
    swapping:        'Menukar...',
    confirm:         'Konfirmasi',
    saving:          'Menyimpan...',
    release:         'Lepas',
    offlineTaxi:     'Offline',
    freeTaxi:        'Bebas di waktu ini',
    conflictTaxi:    'Ada konflik',
    current:         'Saat ini',
    addDriver:       'Tambah Driver',
    removeDriver:    'Hapus Driver',
    selectDriver:    'Pilih Driver',
    noDriversAvail:  'Tidak ada driver tersedia',
    confirmRemove:   'Hapus driver dari taksi ini?',
    adding:          'Menambahkan...',
    removing:        'Menghapus...',
    confirmSetFree:    'Jadikan taksi ini bebas/online?',
    confirmSetOffline: 'Jadikan taksi ini offline?',
    setFreeDesc:       'Taksi akan kembali menerima penugasan trip baru.',
    setOfflineDesc:    'Taksi akan berhenti menerima penugasan trip baru.',
    confirmReleaseDuty: 'Lepaskan tugas ini?',
    releasing:          'Melepaskan...',
    setFree:            'Jadikan Bebas',
    setOffline:         'Jadikan Offline',
  },
}

// ── Icons ───────────────────────────────────────────────────
const IconShuffle = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
    <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
  </svg>
)
const IconChevron = ({ up }: { up?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points={up ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/>
  </svg>
)
const IconClock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconCalendarPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
  </svg>
)
const IconX = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconCar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 17H3v-5l2-5h14l2 5v5h-2"/>
    <circle cx="7.5" cy="17" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/>
  </svg>
)

interface TaxiRow {
  id: string; name: string; plate: string | null; color: string
  is_available: boolean; driver_id: string | null; driver_name: string | null
  trips_today: number
  active_booking: any | null; next_booking: any | null
  latitude: number | null; longitude: number | null; location_updated_at: string | null
}
interface DayAssignment {
  id: string; taxi_id: string; assign_date: string; reason: string | null
  passenger_id: string | null; passenger_name_other: string | null
  start_time: string | null; end_time: string | null
}
interface Booking {
  id: string; booking_code: string; passenger_name: string
  pickup: string; destination: string; trip_type: string
  wait_minutes: number; scheduled_at: string; status: string
  notes: string | null; taxi_id: string | null; taxi_name: string | null
  taxi_color: string | null; driver_name: string | null; passenger_id: string
}
type Section = 'fleet' | 'schedule'

// Minutes since last GPS update
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

// Staleness color: green → amber → red → gray
function stalenessColor(ts: string | null): string {
  const m = minsAgo(ts)
  if (m === null)  return '#9ca3af' // never
  if (m < 5)       return '#059669' // green
  if (m < 15)      return '#D97706' // amber
  if (m < 60)      return '#DC2626' // red
  return '#6b7280'                  // gray (very stale)
}

export default function DriversPage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [taxis,        setTaxis]        = useState<TaxiRow[]>([])
  const [bookings,     setBookings]     = useState<Booking[]>([])
  const [loading,      setLoading]      = useState(true)
  const [section,      setSection]      = useState<Section>('fleet')
  const [toggling,     setToggling]     = useState<string | null>(null)
  const [detailTaxiId, setDetailTaxiId] = useState<string | null>(null)
  const [reassigning,  setReassigning]  = useState<Booking | null>(null)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const [conflictBookings, setConflictBookings] = useState<Record<string, { id: string; booking_code: string; passenger_name: string; scheduled_at: string } | null>>({})
  const [newTaxiId,    setNewTaxiId]    = useState('')
  const [reason,       setReason]       = useState('')
  const [saving,       setSaving]       = useState(false)
  const [dateFilter,   setDateFilter]   = useState(new Date().toISOString().slice(0, 10))

  const [dayAssignments,      setDayAssignments]      = useState<Record<string, DayAssignment[]>>({})
  const [assigningTaxi,       setAssigningTaxi]       = useState<TaxiRow | null>(null)
  const [assignMode,          setAssignMode]          = useState<'once' | 'recurring'>('once')
  const [assignDate,          setAssignDate]          = useState('')
  const [assignEndDate,       setAssignEndDate]       = useState('')
  const [assignDuration,      setAssignDuration]      = useState<'full' | 'range'>('full')
  const [assignStartTime,     setAssignStartTime]     = useState('08:00')
  const [assignEndTime,       setAssignEndTime]       = useState('17:00')
  const [assignReason,        setAssignReason]        = useState('')
  const [savingAssign,        setSavingAssign]        = useState(false)
  const [passengerList,       setPassengerList]       = useState<{ id: string; name: string }[]>([])
  const [passengerSearch,     setPassengerSearch]     = useState('')
  const [assignPassengerId,   setAssignPassengerId]   = useState<string>('')
  const [assignPassengerOther, setAssignPassengerOther] = useState('')

  const [addDriverTaxi,   setAddDriverTaxi]   = useState<TaxiRow | null>(null)
  const [driverList,      setDriverList]      = useState<{ id: string; name: string }[]>([])
  const [selectedDriver,  setSelectedDriver]  = useState('')
  const [savingDriver,    setSavingDriver]    = useState(false)
  const [removingDriver,  setRemovingDriver]  = useState<string | null>(null)
  const [pendingRemove,   setPendingRemove]   = useState<TaxiRow | null>(null)
  const [pendingToggle,   setPendingToggle]   = useState<TaxiRow | null>(null)
  const [pendingRelease,  setPendingRelease]  = useState<DayAssignment | null>(null)
  const [releasingId,     setReleasingId]     = useState<string | null>(null)

  const loadData = useCallback(async (date?: string) => {
    const d = date || dateFilter
    const start = new Date(d); start.setHours(0,0,0,0)
    const end   = new Date(d); end.setHours(23,59,59,999)
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const witaToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)

    const [{ data: txs }, { data: bks }, { data: dayAssignRaw }] = await Promise.all([
      supabase.from('taxis').select('*, users!driver_id(name)').eq('is_active', true).order('name'),
      supabase.from('booking_details').select('*')
        .gte('scheduled_at', start.toISOString())
        .lte('scheduled_at', end.toISOString())
        .not('status', 'in', '("cancelled","rejected")')
        .order('scheduled_at', { ascending: true }),
      supabase.from('driver_day_assignments').select('*').gte('assign_date', witaToday).order('assign_date', { ascending: true }),
    ])

    const assignMap: Record<string, DayAssignment[]> = {}
    for (const a of (dayAssignRaw || [])) {
      if (!assignMap[a.taxi_id]) assignMap[a.taxi_id] = []
      assignMap[a.taxi_id].push(a)
    }
    setDayAssignments(assignMap)
    setBookings(bks || [])
    if (!txs) return

    const enriched = await Promise.all(txs.map(async (taxi: any) => {
      const [{ count: trips }, { data: activeBk }, { data: nextBk }] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true })
          .eq('taxi_id', taxi.id).eq('status', 'completed').gte('completed_at', todayStart.toISOString()),
        supabase.from('booking_details').select('*')
          .eq('taxi_id', taxi.id).in('status', ['on_trip','waiting_trip']).maybeSingle(),
        supabase.from('booking_details').select('*')
          .eq('taxi_id', taxi.id).eq('status', 'booked')
          .gt('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      ])
      return {
        id: taxi.id, name: taxi.name, plate: taxi.plate, color: taxi.color,
        is_available: taxi.is_available,
        driver_id: taxi.driver_id, driver_name: taxi.users?.name || null,
        trips_today: trips || 0, active_booking: activeBk || null, next_booking: nextBk || null,
        latitude: taxi.latitude ?? null, longitude: taxi.longitude ?? null,
        location_updated_at: taxi.location_updated_at ?? null,
      }
    }))
    setTaxis(enriched)
    setLoading(false)
  }, [supabase, dateFilter])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      await loadData()
    }
    init()
    const ch = supabase.channel('fleet-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxis' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function doToggleAvail() {
    if (!pendingToggle) return
    const taxi = pendingToggle
    setToggling(taxi.id)
    await supabase.from('taxis').update({ is_available: !taxi.is_available }).eq('id', taxi.id)
    await loadData()
    setToggling(null)
    setPendingToggle(null)
  }

  async function openReassign(booking: Booking) {
    setReassigning(booking)
    setNewTaxiId(booking.taxi_id || '')
    setReason('')
    const scheduledTime = new Date(booking.scheduled_at)
    const avail: Record<string, boolean> = {}
    const conflicts: Record<string, { id: string; booking_code: string; passenger_name: string; scheduled_at: string } | null> = {}
    for (const taxi of taxis) {
      if (!taxi.driver_id || !taxi.is_available) { avail[taxi.id] = false; conflicts[taxi.id] = null; continue }
      const { data: conflict } = await supabase.from('booking_details').select('id, booking_code, passenger_name, scheduled_at')
        .eq('taxi_id', taxi.id).neq('id', booking.id)
        .in('status', ['booked','on_trip','waiting_trip','pending_driver_approval'])
        .gt('auto_complete_at', scheduledTime.toISOString())
        .lte('scheduled_at', new Date(scheduledTime.getTime() + 2 * 3600000).toISOString())
        .limit(1).maybeSingle()
      avail[taxi.id] = !conflict
      conflicts[taxi.id] = conflict || null
    }
    setAvailability(avail)
    setConflictBookings(conflicts)
  }

  async function confirmReassign() {
    if (!reassigning || !newTaxiId) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    // Picking a taxi that already has a conflicting trip switches this into a
    // swap — trade the two trips between drivers instead of a plain reassign,
    // which would otherwise just fail on the same conflict.
    const conflictBooking = availability[newTaxiId] === false ? conflictBookings[newTaxiId] : null
    const useSwap = !!conflictBooking

    const res = await fetch(
      useSwap ? `/api/bookings/${reassigning.id}/swap` : `/api/bookings/${reassigning.id}/reassign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(useSwap ? { swap_with_booking_id: conflictBooking!.id } : { new_taxi_id: newTaxiId, reason }),
      }
    )
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert('Error: ' + (d.error || 'Failed to reassign'))
    } else { setReassigning(null); await loadData() }
    setSaving(false)
  }

  async function openAssignFullDay(taxi: TaxiRow) {
    setAssigningTaxi(taxi)
    setAssignMode('once')
    setAssignDuration('full')
    setAssignStartTime('08:00')
    setAssignEndTime('17:00')
    const startDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
    setAssignDate(startDate)
    setAssignEndDate(startDate)
    setAssignReason('')
    setAssignPassengerId('')
    setAssignPassengerOther('')
    setPassengerSearch('')
    const { data } = await supabase
      .from('users').select('id, name').eq('role', 'staff').eq('is_active', true).order('name')
    setPassengerList(data || [])
  }

  async function confirmAssignFullDay() {
    if (!assigningTaxi || !assignDate) return
    if (assignMode === 'recurring' && !assignEndDate) return
    if (assignDuration === 'range' && (!assignStartTime || !assignEndTime || assignEndTime <= assignStartTime)) return
    setSavingAssign(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSavingAssign(false); return }
    const res = await fetch('/api/driver-day-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({
        taxi_id:              assigningTaxi.id,
        assign_date:          assignDate,
        repeat_until:         assignMode === 'recurring' ? assignEndDate : null,
        start_time:           assignDuration === 'range' ? assignStartTime : null,
        end_time:             assignDuration === 'range' ? assignEndTime : null,
        reason:               assignReason || null,
        passenger_id:         assignPassengerId && assignPassengerId !== 'others' ? assignPassengerId : null,
        passenger_name_other: assignPassengerId === 'others' ? assignPassengerOther || null : null,
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Failed to assign')
    } else {
      setAssigningTaxi(null)
      await loadData()
    }
    setSavingAssign(false)
  }

  async function doReleaseFullDay() {
    if (!pendingRelease) return
    setReleasingId(pendingRelease.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setReleasingId(null); return }
    await fetch(`/api/driver-day-assignments/${pendingRelease.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    await loadData()
    setReleasingId(null)
    setPendingRelease(null)
  }

  async function openAddDriver(taxi: TaxiRow) {
    setAddDriverTaxi(taxi)
    setSelectedDriver('')
    // Filter out already-assigned drivers client-side rather than building a
    // `.not('id', 'in', ...)` string — when no taxi has a driver yet that list
    // is empty, producing a malformed `not.in.()` filter that Supabase rejects
    // and silently returns zero drivers every time.
    const assignedDriverIds = new Set(taxis.filter(t => t.driver_id).map(t => t.driver_id))
    const { data } = await supabase
      .from('users').select('id, name')
      .eq('role', 'driver').eq('is_active', true)
      .order('name')
    setDriverList((data || []).filter((d: any) => !assignedDriverIds.has(d.id)))
  }

  async function confirmAddDriver() {
    if (!addDriverTaxi || !selectedDriver) return
    setSavingDriver(true)
    await supabase.from('taxis').update({ driver_id: selectedDriver }).eq('id', addDriverTaxi.id)
    setAddDriverTaxi(null)
    await loadData()
    setSavingDriver(false)
  }

  function handleRemoveDriver(taxi: TaxiRow) {
    setPendingRemove(taxi)
  }

  async function doRemoveDriver() {
    if (!pendingRemove) return
    const taxi = pendingRemove
    setPendingRemove(null)
    setRemovingDriver(taxi.id)
    await supabase.from('taxis').update({ driver_id: null, is_available: false }).eq('id', taxi.id)
    await loadData()
    setRemovingDriver(null)
  }

  if (loading) return <PageLoader />

  const witaTodayStr = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const available  = taxis.filter(taxi => taxi.is_available && taxi.driver_id).length
  const active     = taxis.filter(taxi => taxi.active_booking).length
  const offline    = taxis.filter(taxi => !taxi.is_available || !taxi.driver_id).length
  const pendingBks = bookings.filter(b => b.status.includes('pending'))
  const activeBks  = bookings.filter(b => ['booked','on_trip','waiting_trip'].includes(b.status))
  const doneBks    = bookings.filter(b => b.status === 'completed')

  const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
    completed:                    { bg: `${ONLINE}20`,  color: ONLINE,    label: t.done },
    booked:                       { bg: `${PRIMARY}15`, color: PRIM_DK,   label: 'Confirmed' },
    on_trip:                      { bg: `${ONLINE}20`,  color: ONLINE,    label: 'On trip' },
    waiting_trip:                 { bg: `${AMBER}25`,   color: AMBER_T,   label: 'Waiting' },
    pending_driver_approval:      { bg: `${AMBER}25`,   color: AMBER_T,   label: 'Pending driver' },
    pending_coordinator_approval: { bg: `${AMBER}25`,   color: AMBER_T,   label: 'Pending approval' },
    submitted:                    { bg: SURF_LOW,       color: TEXT_MUT,  label: 'Submitted' },
  }

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: BG, WebkitFontSmoothing: 'antialiased' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* ── Header ── */}
      <div style={{ background: SURF, borderBottom: `1px solid ${BORDER}`, padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_MUT, margin: '0 0 3px' }}>{t.fleetMgmt}</p>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.3px', lineHeight: '32px' }}>{t.title}</h1>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `${PRIMARY}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PRIMARY }}>
            <IconCar />
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: t.statOnDuty,  value: available, bg: `${ONLINE}12`,  color: ONLINE,  dot: ONLINE  },
            { label: t.statActive,  value: active,    bg: `${AMBER}18`,   color: AMBER_T, dot: AMBER   },
            { label: t.statOffline, value: offline,   bg: `${OFFLINE}10`, color: OFFLINE, dot: OFFLINE },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '10px 12px', border: `1px solid ${s.color}20` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: s.color, margin: 0 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: s.color, letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {([
            { key: 'fleet',    label: t.tabDrivers  },
            { key: 'schedule', label: t.tabSchedule },
          ] as { key: Section; label: string }[]).map(s => (
            <button key={s.key} onClick={() => setSection(s.key)} style={{
              flex: 1, padding: '10px 6px', fontSize: 13, fontWeight: section === s.key ? 700 : 500,
              border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: FONT,
              color: section === s.key ? PRIMARY : TEXT_MUT,
              borderBottom: section === s.key ? `2.5px solid ${PRIMARY}` : '2.5px solid transparent',
              marginBottom: -1,
            }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── FLEET TAB ── */}
      {section === 'fleet' && (
        <div style={{ padding: '16px 16px 100px' }}>
          {taxis.map((taxi) => {
            const isOn       = taxi.is_available && !!taxi.driver_id
            const isActive   = !!taxi.active_booking
            const isToggling = toggling === taxi.id
            const taxiBks    = bookings.filter(b => b.taxi_id === taxi.id)
            const taxiAssignments = dayAssignments[taxi.id] || []
            const hasAssignmentToday = taxiAssignments.some(a => a.assign_date === witaTodayStr)

            return (
              <div key={taxi.id} style={{
                background: SURF,
                borderRadius: 14,
                marginBottom: 10,
                overflow: 'hidden',
                boxShadow: CARD_SH,
                border: `1px solid ${hasAssignmentToday ? AMBER : isActive ? `${PRIMARY}40` : BORDER}`,
                borderLeft: isActive ? `3px solid ${PRIMARY}` : hasAssignmentToday ? `3px solid ${AMBER}` : `1px solid ${BORDER}`,
              }}>
                {/* Main row — tap to open detail card */}
                <div onClick={() => setDetailTaxiId(taxi.id)}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>

                  {/* Color circle */}
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${taxi.color}20`, border: `2px solid ${taxi.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: taxi.color, display: 'inline-block' }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: TEXT, letterSpacing: '-0.2px' }}>{taxi.name}</p>
                      {taxi.plate && (
                        <span style={{ fontSize: 10, color: TEXT_MUT, background: SURF_LOW, padding: '2px 7px', borderRadius: 6, fontWeight: 600, border: `1px solid ${BORDER}` }}>{taxi.plate}</span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: TEXT_MUT, margin: '0 0 5px' }}>{taxi.driver_name || t.statusNoDriver}</p>

                    {/* Full Day badge */}
                    {hasAssignmentToday && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: AMBER_T, background: AMBER_BG, padding: '2px 8px', borderRadius: 9999, border: `1px solid ${AMBER}`, marginBottom: 3 }}>
                        ★ {t.fullDayToday}
                      </span>
                    )}

                    {/* Status pill */}
                    {isActive ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: ONLINE, background: `${ONLINE}15`, padding: '3px 8px', borderRadius: 9999 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: ONLINE, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                        {taxi.active_booking.status === 'waiting_trip' ? '⏱ ' : '→ '}{taxi.active_booking.destination}
                      </span>
                    ) : taxi.next_booking ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: PRIMARY, background: `${PRIMARY}12`, padding: '3px 8px', borderRadius: 9999 }}>
                        <IconClock /> {format(new Date(taxi.next_booking.scheduled_at), 'HH:mm')} → {taxi.next_booking.destination}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: isOn ? ONLINE : !taxi.driver_id ? TEXT_MUT : OFFLINE }}>
                        {isOn ? `● ${t.free}` : !taxi.driver_id ? `— ${t.noDriver}` : `○ ${t.offline}`}
                      </span>
                    )}
                  </div>

                  {/* Right: trips count + toggle + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ textAlign: 'center', background: `${PRIMARY}10`, borderRadius: 10, padding: '6px 10px' }}>
                      <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: PRIMARY, letterSpacing: '-0.5px', lineHeight: 1 }}>{taxi.trips_today}</p>
                      <p style={{ fontSize: 9, color: PRIMARY, fontWeight: 600, textTransform: 'uppercase', margin: '2px 0 0', letterSpacing: '0.05em' }}>{t.trips}</p>
                    </div>

                    {taxi.driver_id ? (
                      <div onClick={e => { e.stopPropagation(); if (!isToggling) setPendingToggle(taxi) }}
                        style={{
                          width: 44, height: 24, borderRadius: 12, flexShrink: 0,
                          background: isToggling ? BORDER : isOn ? PRIMARY : BORDER,
                          position: 'relative', cursor: isToggling ? 'not-allowed' : 'pointer',
                          transition: 'background 0.2s',
                        }}>
                        <div style={{
                          position: 'absolute', top: 2,
                          left: isOn ? 22 : 2,
                          width: 20, height: 20, borderRadius: '50%',
                          background: SURF,
                          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
                        }} />
                      </div>
                    ) : (
                      <div style={{ width: 44, height: 24, borderRadius: 12, background: SURF_LOW, border: `1px dashed ${BORDER}` }} />
                    )}

                    <div style={{ color: TEXT_MUT, transform: 'rotate(-90deg)' }}>
                      <IconChevron />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Taxi detail card (popup) ── */}
      {detailTaxiId && (() => {
        const taxi = taxis.find(t => t.id === detailTaxiId)
        if (!taxi) return null
        const isOn       = taxi.is_available && !!taxi.driver_id
        const isActive   = !!taxi.active_booking
        const isToggling = toggling === taxi.id
        const taxiBks    = bookings.filter(b => b.taxi_id === taxi.id)
        const taxiAssignments = dayAssignments[taxi.id] || []
        const hasAssignmentToday = taxiAssignments.some(a => a.assign_date === witaTodayStr)

        return (
          <div onClick={() => setDetailTaxiId(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: SURF, width: '100%', borderRadius: '20px 20px 0 0', maxHeight: 'calc(100dvh - 20px)', display: 'flex', flexDirection: 'column' }}>
              {/* Handle */}
              <div style={{ padding: '10px 20px 0', flexShrink: 0 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '0 auto 10px' }} />
              </div>

              {/* Header — identity + status + on/off toggle, all in one row */}
              <div style={{ padding: '0 20px 12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${taxi.color}20`, border: `2px solid ${taxi.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: taxi.color, display: 'inline-block' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: TEXT, letterSpacing: '-0.2px' }}>{taxi.name}</p>
                      {taxi.plate && (
                        <span style={{ fontSize: 10, color: TEXT_MUT, background: SURF_LOW, padding: '2px 7px', borderRadius: 6, fontWeight: 600, border: `1px solid ${BORDER}` }}>{taxi.plate}</span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: TEXT_MUT, margin: '2px 0 6px' }}>{taxi.driver_name || t.statusNoDriver}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {hasAssignmentToday && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: AMBER_T, background: AMBER_BG, padding: '2px 8px', borderRadius: 9999, border: `1px solid ${AMBER}` }}>
                          ★ {t.fullDayToday}
                        </span>
                      )}
                      {isActive ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: ONLINE, background: `${ONLINE}15`, padding: '3px 8px', borderRadius: 9999 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: ONLINE, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                          {taxi.active_booking!.status === 'waiting_trip' ? '⏱ ' : '→ '}{taxi.active_booking!.destination}
                        </span>
                      ) : taxi.next_booking ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: PRIMARY, background: `${PRIMARY}12`, padding: '3px 8px', borderRadius: 9999 }}>
                          <IconClock /> {format(new Date(taxi.next_booking.scheduled_at), 'HH:mm')} → {taxi.next_booking.destination}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: isOn ? ONLINE : !taxi.driver_id ? TEXT_MUT : OFFLINE }}>
                          {isOn ? `● ${t.free}` : !taxi.driver_id ? `— ${t.noDriver}` : `○ ${t.offline}`}
                        </span>
                      )}
                    </div>
                  </div>
                  {taxi.driver_id && (
                    <div onClick={() => !isToggling && setPendingToggle(taxi)}
                      style={{
                        width: 44, height: 24, borderRadius: 12, flexShrink: 0, marginTop: 4,
                        background: isToggling ? BORDER : isOn ? PRIMARY : BORDER,
                        position: 'relative', cursor: isToggling ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s',
                      }}>
                      <div style={{
                        position: 'absolute', top: 2, left: isOn ? 22 : 2,
                        width: 20, height: 20, borderRadius: '50%', background: SURF,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
                      }} />
                    </div>
                  )}
                  <button onClick={() => setDetailTaxiId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT, padding: 4, flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

                {/* Compact stat row + location, side by side on wide-enough screens, stacked tightly otherwise */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 10 }}>
                  <div style={{ background: SURF_LOW, borderRadius: 12, padding: '8px 10px', textAlign: 'center', border: `1px solid ${BORDER}` }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT_MUT, margin: '0 0 2px' }}>{t.today}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: PRIMARY, letterSpacing: '-0.5px' }}>{taxi.trips_today}</p>
                  </div>
                  <div style={{ background: SURF_LOW, borderRadius: 12, padding: '8px 10px', textAlign: 'center', border: `1px solid ${BORDER}` }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT_MUT, margin: '0 0 2px' }}>{t.scheduled}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: PRIMARY, letterSpacing: '-0.5px' }}>{taxiBks.filter(b => b.status === 'booked').length}</p>
                  </div>
                </div>

                {/* Last location — compact row + small map */}
                {taxi.driver_id && (
                  <div style={{ background: SURF_LOW, borderRadius: 12, marginBottom: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: stalenessColor(taxi.location_updated_at), flexShrink: 0 }} />
                        <p style={{ fontSize: 11, fontWeight: 600, color: TEXT, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {taxi.latitude && taxi.longitude
                            ? `${taxi.latitude.toFixed(5)}, ${taxi.longitude.toFixed(5)}`
                            : t.noGpsYet}
                        </p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: stalenessColor(taxi.location_updated_at), flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {relativeTime(taxi.location_updated_at)}
                      </span>
                    </div>
                    {taxi.latitude && taxi.longitude && (
                      <div style={{ height: 110, borderTop: `1px solid ${BORDER}` }}>
                        <DriverLastLocationMap lat={taxi.latitude} lng={taxi.longitude} color={taxi.color} />
                      </div>
                    )}
                  </div>
                )}

                {/* Today's trips — compact single-line rows with inline reassign icon */}
                {taxiBks.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT_MUT, margin: '0 0 6px' }}>{t.todayTrips}</p>
                    {taxiBks.map(b => {
                      const sc = STATUS_CONFIG[b.status] || { bg: SURF_LOW, color: TEXT_MUT, label: b.status }
                      const canReassign = !['completed','cancelled','rejected','on_trip','waiting_trip'].includes(b.status)
                      return (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: SURF_LOW, borderRadius: 10, marginBottom: 5, border: `1px solid ${BORDER}`, padding: '7px 8px 7px 12px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.passenger_name}</p>
                            <p style={{ fontSize: 10.5, color: TEXT_MUT, margin: 0 }}>{format(new Date(b.scheduled_at), 'HH:mm')} → {b.destination}</p>
                          </div>
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>
                          {canReassign && (
                            <button
                              onClick={() => openReassign(b)}
                              title={t.reassignTitle}
                              style={{ width: 28, height: 28, borderRadius: 8, background: `${PRIMARY}12`, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: PRIMARY, flexShrink: 0 }}>
                              <IconShuffle />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Full Day Duty — compact chips */}
                <div style={{ borderTop: taxiBks.length > 0 ? `1px solid ${BORDER}` : 'none', paddingTop: taxiBks.length > 0 ? 10 : 0, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT_MUT, margin: 0 }}>{t.fullDayDuty}</p>
                    {taxi.driver_id && (
                      <button onClick={() => openAssignFullDay(taxi)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 8, background: AMBER, color: AMBER_T, border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                        <IconCalendarPlus /> {t.assignDay}
                      </button>
                    )}
                  </div>
                  {taxiAssignments.length > 0 ? (
                    taxiAssignments.map(a => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px 7px 10px', background: a.assign_date === witaTodayStr ? AMBER_BG : SURF_LOW, borderRadius: 10, marginBottom: 5, border: `1px solid ${a.assign_date === witaTodayStr ? AMBER : BORDER}` }}>
                        <span style={{ fontSize: 12, color: AMBER_T, flexShrink: 0 }}>★</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11.5, fontWeight: 700, color: AMBER_T, margin: 0 }}>
                            {format(new Date(a.assign_date + 'T12:00:00'), 'd MMM', { locale: idLocale })}
                            {a.start_time && a.end_time && ` · ${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}`}
                            {a.assign_date === witaTodayStr && (
                              <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, color: AMBER_T, background: AMBER, padding: '1px 5px', borderRadius: 4 }}>{t.today.toUpperCase()}</span>
                            )}
                          </p>
                          {(a.passenger_id || a.passenger_name_other || a.reason) && (
                            <p style={{ fontSize: 10.5, color: AMBER_T, margin: '1px 0 0', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[
                                (a.passenger_name_other || passengerList.find(p => p.id === a.passenger_id)?.name) && `👤 ${a.passenger_name_other || passengerList.find(p => p.id === a.passenger_id)?.name}`,
                                a.reason,
                              ].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <button onClick={() => setPendingRelease(a)}
                          disabled={releasingId === a.id}
                          style={{ width: 26, height: 26, borderRadius: 7, background: `${OFFLINE}12`, color: OFFLINE, border: `1px solid ${OFFLINE}40`, cursor: releasingId === a.id ? 'not-allowed' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconX />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: 11.5, color: TEXT_MUT, margin: 0, padding: '2px 0' }}>{t.noUpcomingDuty}</p>
                  )}
                </div>
              </div>

              {/* Sticky footer — driver management */}
              <div style={{ padding: '10px 16px 24px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
                {taxi.driver_id ? (
                  <button
                    onClick={() => handleRemoveDriver(taxi)}
                    disabled={removingDriver === taxi.id}
                    style={{ width: '100%', padding: '10px', fontSize: 12, fontWeight: 700, border: `1px solid ${OFFLINE}40`, borderRadius: 10, background: `${OFFLINE}10`, color: OFFLINE, cursor: removingDriver === taxi.id ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                    {removingDriver === taxi.id ? t.removing : `✕ ${t.removeDriver}`}
                  </button>
                ) : (
                  <button
                    onClick={() => openAddDriver(taxi)}
                    style={{ width: '100%', padding: '10px', fontSize: 12, fontWeight: 700, border: `1px solid ${PRIMARY}40`, borderRadius: 10, background: `${PRIMARY}10`, color: PRIMARY, cursor: 'pointer', fontFamily: FONT }}>
                    + {t.addDriver}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}
      {/* ── SCHEDULE TAB ── */}
      {section === 'schedule' && (
        <div style={{ padding: '16px 16px 100px' }}>

          {/* Date filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: SURF, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '9px 14px', boxShadow: CARD_SH, flex: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <input type="date" value={dateFilter}
                onChange={e => { setDateFilter(e.target.value); loadData(e.target.value) }}
                style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: FONT, background: 'transparent', color: PRIMARY, fontWeight: 600, flex: 1 }} />
            </div>
            <button onClick={() => { const d = new Date().toISOString().slice(0,10); setDateFilter(d); loadData(d) }}
              style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: 10, background: SURF, color: TEXT_MUT, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
              {t.today}
            </button>
          </div>

          {/* Day summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 18 }}>
            {[
              { label: t.total,   value: bookings.length,   bg: SURF_LOW,         color: TEXT_SUB  },
              { label: t.pending, value: pendingBks.length, bg: `${AMBER}18`,     color: AMBER_T   },
              { label: t.active,  value: activeBks.length,  bg: `${PRIMARY}12`,   color: PRIM_DK   },
              { label: t.done,    value: doneBks.length,    bg: `${ONLINE}15`,    color: ONLINE    },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '8px', textAlign: 'center', border: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.5px', color: s.color }}>{s.value}</p>
                <p style={{ fontSize: 9, fontWeight: 700, color: s.color, opacity: 0.75, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Grouped by taxi */}
          {taxis.map(taxi => {
            const taxiBks = bookings.filter(b => b.taxi_id === taxi.id)
            if (taxiBks.length === 0) return null
            return (
              <div key={taxi.id} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '0 4px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: taxi.color, flexShrink: 0 }} />
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: TEXT }}>{taxi.name}</p>
                  <p style={{ fontSize: 12, color: TEXT_MUT, margin: 0 }}>· {taxi.driver_name}</p>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: taxi.is_available ? `${ONLINE}15` : `${OFFLINE}12`, color: taxi.is_available ? ONLINE : OFFLINE }}>
                    {taxi.is_available ? t.onDuty : t.statusOffline}
                  </span>
                </div>
                {taxiBks.map(b => {
                  const sc = STATUS_CONFIG[b.status] || { bg: SURF_LOW, color: TEXT_MUT, label: b.status }
                  const canReassign = !['completed','cancelled','rejected','on_trip','waiting_trip'].includes(b.status)
                  return (
                    <div key={b.id} style={{ background: SURF, borderRadius: 12, padding: '12px 14px', marginBottom: 6, borderLeft: `3px solid ${taxi.color}`, boxShadow: CARD_SH, border: `1px solid ${BORDER}`, borderLeftColor: taxi.color, borderLeftWidth: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px', color: TEXT }}>{b.passenger_name}</p>
                          <p style={{ fontSize: 12, color: TEXT_MUT, margin: 0 }}>{format(new Date(b.scheduled_at), 'HH:mm')} · {b.pickup} → {b.destination}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: sc.bg, color: sc.color }}>{sc.label}</span>
                          {canReassign && (
                            <button onClick={() => openReassign(b)} title="Reassign taxi"
                              style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: SURF_LOW, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT_MUT, padding: 0 }}>
                              <IconShuffle />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Unassigned */}
          {bookings.filter(b => !b.taxi_id).length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '0 4px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: OFFLINE, flexShrink: 0 }} />
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: OFFLINE }}>{t.unassigned}</p>
              </div>
              {bookings.filter(b => !b.taxi_id).map(b => (
                <div key={b.id} style={{ background: SURF, borderRadius: 12, padding: '12px 14px', marginBottom: 6, borderLeft: `3px solid ${OFFLINE}`, boxShadow: CARD_SH, border: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px', color: TEXT }}>{b.passenger_name}</p>
                      <p style={{ fontSize: 12, color: TEXT_MUT, margin: 0 }}>{format(new Date(b.scheduled_at), 'HH:mm')} · {b.destination}</p>
                    </div>
                    <button onClick={() => openReassign(b)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                      <IconShuffle /> {t.assign}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {bookings.length === 0 && (
            <div style={{ textAlign: 'center', padding: '52px 20px', background: SURF, borderRadius: 14, border: `1px solid ${BORDER}`, boxShadow: CARD_SH }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${PRIMARY}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: PRIMARY }}>
                <IconCar />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: '0 0 4px' }}>{t.noTrips}</p>
              <p style={{ fontSize: 13, color: TEXT_MUT, margin: 0 }}>{t.noBookingsDate}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Assign Full Day sheet ── */}
      {assigningTaxi && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 1100 }}
          onClick={() => setAssigningTaxi(null)}>
          <div style={{ background: SURF, width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', maxHeight: 'calc(100dvh - 20px)', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '0 auto 20px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${AMBER}25`, border: `1.5px solid ${AMBER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: AMBER_T }}>★</div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: TEXT, letterSpacing: '-0.3px' }}>{t.assignFullDay}</p>
                <p style={{ fontSize: 12, color: TEXT_MUT, margin: '2px 0 0' }}>{assigningTaxi.name} · {assigningTaxi.driver_name}</p>
              </div>
            </div>

            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '0 0 8px' }}>{t.date}</p>
            <input type="date" value={assignDate}
              onChange={e => {
                setAssignDate(e.target.value)
                if (assignEndDate < e.target.value) setAssignEndDate(e.target.value)
              }}
              min={new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}
              style={{ width: '100%', padding: '12px 14px', fontSize: 14, fontWeight: 600, border: `1.5px solid ${BORDER}`, borderRadius: 12, outline: 'none', marginBottom: 14, boxSizing: 'border-box', fontFamily: FONT, color: PRIMARY, background: SURF }} />

            <SwitchRow
              label={t.repeatSwitch}
              description={t.repeatSwitchDesc}
              checked={assignMode === 'recurring'}
              onChange={v => setAssignMode(v ? 'recurring' : 'once')}
              color={PRIMARY} border={BORDER} text={TEXT} textMuted={TEXT_MUT} surface={SURF}
            />
            {assignMode === 'recurring' && (
              <div style={{ marginTop: -6, marginBottom: 14, paddingLeft: 4 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '0 0 8px' }}>{t.untilDate}</p>
                <input type="date" value={assignEndDate}
                  onChange={e => setAssignEndDate(e.target.value)}
                  min={assignDate}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 14, fontWeight: 600, border: `1.5px solid ${BORDER}`, borderRadius: 12, outline: 'none', marginBottom: 8, boxSizing: 'border-box', fontFamily: FONT, color: PRIMARY, background: SURF }} />
                {assignDate && assignEndDate && (
                  <p style={{ fontSize: 12, color: TEXT_MUT, margin: 0 }}>
                    {t.recurringInfo(differenceInCalendarDays(new Date(assignEndDate), new Date(assignDate)) + 1)}
                  </p>
                )}
              </div>
            )}

            <SwitchRow
              label={t.rangeSwitch}
              description={t.rangeSwitchDesc}
              checked={assignDuration === 'range'}
              onChange={v => setAssignDuration(v ? 'range' : 'full')}
              color={PRIMARY} border={BORDER} text={TEXT} textMuted={TEXT_MUT} surface={SURF}
            />
            {assignDuration === 'range' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: -6, marginBottom: 14, paddingLeft: 4 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '0 0 8px' }}>{t.startTime}</p>
                  <input type="time" value={assignStartTime}
                    onChange={e => setAssignStartTime(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 14, fontWeight: 600, border: `1.5px solid ${BORDER}`, borderRadius: 12, outline: 'none', boxSizing: 'border-box', fontFamily: FONT, color: PRIMARY, background: SURF }} />
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '0 0 8px' }}>{t.endTime}</p>
                  <input type="time" value={assignEndTime}
                    onChange={e => setAssignEndTime(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 14, fontWeight: 600, border: `1.5px solid ${BORDER}`, borderRadius: 12, outline: 'none', boxSizing: 'border-box', fontFamily: FONT, color: PRIMARY, background: SURF }} />
                </div>
              </div>
            )}

            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '0 0 8px' }}>{t.dutyDesc}</p>
            <input type="text" value={assignReason}
              onChange={e => setAssignReason(e.target.value)}
              placeholder={t.dutyDescPlaceholder}
              style={{ width: '100%', padding: '12px 14px', fontSize: 14, border: `1.5px solid ${BORDER}`, borderRadius: 12, outline: 'none', marginBottom: 16, boxSizing: 'border-box', fontFamily: FONT, background: SURF }} />

            {/* ── Passenger selector ── */}
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '0 0 8px' }}>{t.passenger}</p>
            <input
              type="text"
              value={passengerSearch}
              onChange={e => setPassengerSearch(e.target.value)}
              placeholder={t.passengerSearch}
              style={{ width: '100%', padding: '10px 14px', fontSize: 13, border: `1.5px solid ${assignPassengerId ? PRIMARY : BORDER}`, borderRadius: 12, outline: 'none', marginBottom: 6, boxSizing: 'border-box', fontFamily: FONT, background: SURF }}
            />
            <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 16, background: SURF }}>
              {passengerList
                .filter(p => !passengerSearch || p.name.toLowerCase().includes(passengerSearch.toLowerCase()))
                .map(p => (
                  <div key={p.id} onClick={() => { setAssignPassengerId(p.id); setPassengerSearch(p.name); setAssignPassengerOther('') }}
                    style={{ padding: '10px 14px', fontSize: 13, fontWeight: assignPassengerId === p.id ? 700 : 500, cursor: 'pointer', background: assignPassengerId === p.id ? `${PRIMARY}12` : 'transparent', color: assignPassengerId === p.id ? PRIMARY : TEXT, borderBottom: `1px solid ${BORDER}` }}>
                    {p.name}
                  </div>
                ))}
              <div onClick={() => { setAssignPassengerId('others'); setPassengerSearch('') }}
                style={{ padding: '10px 14px', fontSize: 13, fontWeight: assignPassengerId === 'others' ? 700 : 500, cursor: 'pointer', background: assignPassengerId === 'others' ? `${AMBER}20` : 'transparent', color: assignPassengerId === 'others' ? AMBER_T : TEXT_MUT, fontStyle: 'italic' }}>
                {t.passengerOthers}
              </div>
            </div>
            {assignPassengerId === 'others' && (
              <input type="text" value={assignPassengerOther}
                onChange={e => setAssignPassengerOther(e.target.value)}
                placeholder={t.passengerOtherName}
                style={{ width: '100%', padding: '12px 14px', fontSize: 14, border: `1.5px solid ${AMBER}`, borderRadius: 12, outline: 'none', marginBottom: 16, boxSizing: 'border-box', fontFamily: FONT, background: AMBER_BG }} />
            )}

            <div style={{ background: AMBER_BG, border: `1px solid ${AMBER}`, borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: AMBER_T, margin: 0, fontWeight: 500 }}>
                {assignDuration === 'range' ? t.dutyWarningRange(assignStartTime, assignEndTime) : t.dutyWarning}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAssigningTaxi(null)}
                style={{ flex: 1, padding: '14px', fontSize: 14, fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: 12, background: SURF_LOW, color: TEXT_MUT, cursor: 'pointer', fontFamily: FONT }}>
                {t.cancel}
              </button>
              {(() => {
                const invalid = !assignDate || savingAssign
                  || (assignMode === 'recurring' && !assignEndDate)
                  || (assignDuration === 'range' && (!assignStartTime || !assignEndTime || assignEndTime <= assignStartTime))
                return (
                  <button onClick={confirmAssignFullDay} disabled={invalid}
                    style={{ flex: 2, padding: '14px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 12, background: invalid ? BORDER : PRIMARY, color: '#fff', cursor: invalid ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                    {savingAssign ? t.assigning : t.confirmFullDay}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Add Driver sheet ── */}
      {addDriverTaxi && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 1100 }}
          onClick={() => setAddDriverTaxi(null)}>
          <div style={{ background: SURF, width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', maxHeight: 'calc(100dvh - 20px)', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '0 auto 20px' }} />

            <p style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: TEXT, letterSpacing: '-0.3px' }}>{t.addDriver}</p>
            <p style={{ fontSize: 13, color: TEXT_MUT, margin: '0 0 20px' }}>{addDriverTaxi.name}</p>

            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '0 0 10px' }}>{t.selectDriver}</p>

            {driverList.length === 0 ? (
              <p style={{ fontSize: 13, color: TEXT_MUT, textAlign: 'center', padding: '20px 0' }}>{t.noDriversAvail}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {driverList.map(d => (
                  <div key={d.id} onClick={() => setSelectedDriver(d.id)}
                    style={{ padding: '13px 14px', borderRadius: 12, cursor: 'pointer', border: `${selectedDriver === d.id ? 2 : 1}px solid ${selectedDriver === d.id ? PRIMARY : BORDER}`, background: selectedDriver === d.id ? `${PRIMARY}10` : SURF_LOW, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: TEXT }}>{d.name}</p>
                    {selectedDriver === d.id && <span style={{ color: PRIMARY, fontWeight: 700, fontSize: 16 }}>✓</span>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAddDriverTaxi(null)}
                style={{ flex: 1, padding: '14px', fontSize: 14, fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: 12, background: SURF_LOW, color: TEXT_MUT, cursor: 'pointer', fontFamily: FONT }}>
                {t.cancel}
              </button>
              <button onClick={confirmAddDriver} disabled={!selectedDriver || savingDriver}
                style={{ flex: 2, padding: '14px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 12, background: !selectedDriver || savingDriver ? BORDER : PRIMARY, color: '#fff', cursor: !selectedDriver || savingDriver ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                {savingDriver ? t.adding : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reassign sheet ── */}
      {reassigning && (() => {
        const withDriver = taxis.filter(taxi => taxi.driver_id)
        const freeTaxis     = withDriver.filter(tx => tx.is_available && availability[tx.id])
        const conflictTaxis = withDriver.filter(tx => tx.is_available && !availability[tx.id])
        const offlineTaxis  = withDriver.filter(tx => !tx.is_available)
        const hasConflict   = newTaxiId ? availability[newTaxiId] === false && taxis.find(tx => tx.id === newTaxiId)?.is_available : false
        const conflictBooking = hasConflict ? conflictBookings[newTaxiId] : null

        const TaxiOption = ({ taxi }: { taxi: TaxiRow }) => {
          const isSelected = newTaxiId === taxi.id
          const isCurrent  = reassigning.taxi_id === taxi.id
          const isFree     = availability[taxi.id]
          const isOffline  = !taxi.is_available
          return (
            <div onClick={() => !isOffline && setNewTaxiId(taxi.id)}
              style={{
                padding: '12px 14px', borderRadius: 12,
                cursor: isOffline ? 'default' : 'pointer',
                border: `${isSelected ? 2 : 1}px solid ${isSelected ? PRIMARY : isCurrent ? `${AMBER}80` : BORDER}`,
                background: isSelected ? `${PRIMARY}10` : isCurrent ? AMBER_BG : SURF,
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: isOffline ? 0.45 : 1,
                marginBottom: 6,
              }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: taxi.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: TEXT }}>{taxi.name}</p>
                  {isCurrent && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999, background: `${AMBER}30`, color: AMBER_T }}>{t.current}</span>}
                </div>
                <p style={{ fontSize: 11, margin: '2px 0 0', color: TEXT_MUT }}>{taxi.driver_name}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                  background: isOffline ? `${OFFLINE}12` : isFree ? `${ONLINE}15` : `${AMBER}20`,
                  color: isOffline ? OFFLINE : isFree ? ONLINE : AMBER_T,
                }}>
                  {isOffline ? t.offlineTaxi : isFree ? t.freeTaxi : t.conflictTaxi}
                </span>
                {isSelected && <span style={{ color: PRIMARY, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>✓</span>}
              </div>
            </div>
          )
        }

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 1100 }}
            onClick={() => setReassigning(null)}>
            <div style={{ background: SURF, width: '100%', borderRadius: '20px 20px 0 0', maxHeight: 'calc(100dvh - 20px)', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>

              {/* Handle */}
              <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '0 auto 16px' }} />
              </div>

              {/* Trip context header */}
              <div style={{ padding: '0 20px 14px', flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_MUT, margin: '0 0 6px' }}>{t.reassignTitle}</p>
                <div style={{ background: SURF_LOW, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 3px', color: TEXT }}>{reassigning.passenger_name}</p>
                      <p style={{ fontSize: 12, color: TEXT_MUT, margin: 0 }}>
                        {format(new Date(reassigning.scheduled_at), 'EEE, d MMM · HH:mm', { locale: idLocale })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: TEXT_SUB, margin: '0 0 2px' }}>{reassigning.pickup}</p>
                      <p style={{ fontSize: 11, color: TEXT_MUT, margin: 0 }}>→ {reassigning.destination}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable taxi list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 0' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '0 0 10px' }}>{t.selectTaxi}</p>

                {freeTaxis.length > 0 && (
                  <>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: ONLINE, margin: '0 0 6px', textTransform: 'uppercase' }}>✓ {t.freeTaxi}</p>
                    {freeTaxis.map(tx => <TaxiOption key={tx.id} taxi={tx} />)}
                  </>
                )}
                {conflictTaxis.length > 0 && (
                  <>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: AMBER_T, margin: '10px 0 6px', textTransform: 'uppercase' }}>⚠ {t.conflictTaxi}</p>
                    {conflictTaxis.map(tx => <TaxiOption key={tx.id} taxi={tx} />)}
                  </>
                )}
                {offlineTaxis.length > 0 && (
                  <>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: OFFLINE, margin: '10px 0 6px', textTransform: 'uppercase' }}>○ {t.offlineTaxi}</p>
                    {offlineTaxis.map(tx => <TaxiOption key={tx.id} taxi={tx} />)}
                  </>
                )}

                {hasConflict && (
                  <div style={{ background: `${AMBER}18`, border: `1px solid ${AMBER}`, borderRadius: 12, padding: '10px 14px', margin: '8px 0' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: AMBER_T, margin: 0 }}>
                      ⚠ {conflictBooking
                        ? t.conflictWithTrip(conflictBooking.passenger_name, format(new Date(conflictBooking.scheduled_at), 'HH:mm'))
                        : t.conflictWarning}
                    </p>
                    {conflictBooking && (
                      <p style={{ fontSize: 11, color: AMBER_T, margin: '4px 0 0', opacity: 0.85 }}>{t.swapHint}</p>
                    )}
                  </div>
                )}

                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUT, margin: '12px 0 6px' }}>{t.reasonOpt}</p>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={t.reasonPlaceholder}
                  style={{ width: '100%', padding: '11px 14px', fontSize: 13, border: `1.5px solid ${BORDER}`, borderRadius: 12, fontFamily: FONT, outline: 'none', boxSizing: 'border-box', background: SURF }} />
                <div style={{ height: 16 }} />
              </div>

              {/* Sticky action bar */}
              <div style={{ padding: '12px 20px 32px', borderTop: `1px solid ${BORDER}`, background: SURF, flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                <button onClick={() => setReassigning(null)}
                  style={{ padding: '13px', background: SURF_LOW, color: TEXT_SUB, border: `1px solid ${BORDER}`, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                  {t.cancel}
                </button>
                <button onClick={confirmReassign} disabled={!newTaxiId || saving || newTaxiId === reassigning.taxi_id}
                  style={{ padding: '13px', background: (!newTaxiId || saving || newTaxiId === reassigning.taxi_id) ? BORDER : PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: (!newTaxiId || saving || newTaxiId === reassigning.taxi_id) ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                  {conflictBooking ? (saving ? t.swapping : t.swapTrips) : (saving ? t.saving : t.confirm)}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Remove driver confirmation modal */}
      {pendingRemove && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setPendingRemove(null)}>
          <div style={{ background: SURF, borderRadius: 20, padding: '24px', maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: TEXT, fontFamily: FONT }}>{t.removeDriver}</h3>
            <p style={{ margin: '0 0 6px', fontSize: 14, color: TEXT_SUB, fontFamily: FONT }}>{t.confirmRemove}</p>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: TEXT_MUT, fontFamily: FONT }}>{pendingRemove.driver_name} · {pendingRemove.name}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setPendingRemove(null)}
                style={{ padding: '13px', background: SURF_LOW, color: TEXT_SUB, border: `1px solid ${BORDER}`, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                {t.cancel}
              </button>
              <button onClick={doRemoveDriver}
                style={{ padding: '13px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                {t.removeDriver}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle free/offline confirmation modal */}
      {pendingToggle && (() => {
        const willGoFree = !pendingToggle.is_available
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={() => !toggling && setPendingToggle(null)}>
            <div style={{ background: SURF, borderRadius: 20, padding: '24px', maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: willGoFree ? `${ONLINE}18` : `${OFFLINE}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={willGoFree ? ONLINE : OFFLINE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M12 7v5l3 3"/>
                </svg>
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: TEXT, fontFamily: FONT }}>
                {willGoFree ? t.setFree : t.setOffline}
              </h3>
              <p style={{ margin: '0 0 6px', fontSize: 14, color: TEXT_SUB, fontFamily: FONT }}>
                {willGoFree ? t.confirmSetFree : t.confirmSetOffline}
              </p>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: TEXT_MUT, fontFamily: FONT }}>
                {pendingToggle.name} · {pendingToggle.driver_name}
                <br />{willGoFree ? t.setFreeDesc : t.setOfflineDesc}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={() => setPendingToggle(null)} disabled={!!toggling}
                  style={{ padding: '13px', background: SURF_LOW, color: TEXT_SUB, border: `1px solid ${BORDER}`, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: toggling ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                  {t.cancel}
                </button>
                <button onClick={doToggleAvail} disabled={!!toggling}
                  style={{ padding: '13px', background: willGoFree ? ONLINE : OFFLINE, color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: toggling ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                  {toggling ? t.saving : (willGoFree ? t.setFree : t.setOffline)}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Release duty confirmation modal */}
      {pendingRelease && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => !releasingId && setPendingRelease(null)}>
          <div style={{ background: SURF, borderRadius: 20, padding: '24px', maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: TEXT, fontFamily: FONT }}>{t.release}</h3>
            <p style={{ margin: '0 0 6px', fontSize: 14, color: TEXT_SUB, fontFamily: FONT }}>{t.confirmReleaseDuty}</p>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: TEXT_MUT, fontFamily: FONT }}>
              {format(new Date(pendingRelease.assign_date + 'T12:00:00'), 'EEE, d MMM yyyy', { locale: idLocale })}
              {pendingRelease.start_time && pendingRelease.end_time && ` · ${pendingRelease.start_time.slice(0, 5)}–${pendingRelease.end_time.slice(0, 5)}`}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setPendingRelease(null)} disabled={!!releasingId}
                style={{ padding: '13px', background: SURF_LOW, color: TEXT_SUB, border: `1px solid ${BORDER}`, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: releasingId ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                {t.cancel}
              </button>
              <button onClick={doReleaseFullDay} disabled={!!releasingId}
                style={{ padding: '13px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: releasingId ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                {releasingId ? t.releasing : t.release}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
