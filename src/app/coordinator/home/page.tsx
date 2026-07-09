'use client'
import React from 'react'

const PRIMARY = '#006064'

import { useEffect, useState, useCallback } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { BookingDetail, User } from '@/types'
import { STATUS_LABELS, STATUS_COLORS } from '@/types'
import GanttCalendar from '@/components/GanttCalendar'
import OnboardingTour from '@/components/OnboardingTour'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'

const DriverFleetMap = dynamic(() => import('@/components/map/DriverFleetMap'), { ssr: false })

const MSG = {
  en: {
    role:             'Coordinator',
    viewProfile:      'View profile',
    signOut:          'Sign out',
    dispatchBoard:    'Dispatch Board',
    savedLocations:   'Saved Locations',
    tripReport:       'Trip Report',
    newBooking:       '+ New booking',
    viewCalendar:     'Calendar',
    viewMap:          'Map',
    needsApproval:    'Needs approval',
    noApprovals:      'No pending approvals',
    filterAll:        'All',
    filterPending:    'Pending',
    filterBooked:     'Confirmed',
    filterDone:       'Done',
    today:            'Today',
    noBookings:       'No bookings for this period',
    loadMore:         'Load more',
    loading:          'Loading...',
    unassigned:       'Unassigned',
    reject:           'Reject',
    approve:          'Approve',
    reassign:         '🔄 Reassign taxi',
    cancel:           'Cancel',
    toastConfirmed:   'Booking confirmed',
    toastPending:     'Booking submitted — pending approval',
    rejectBooking:    'Reject booking',
    reasonOptional:   'Reason (optional)',
    reasonPlaceholder:'e.g. No drivers available for this time',
    viewAllBookings:  'View all bookings →',
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
  },
  id: {
    role:             'Koordinator',
    viewProfile:      'Lihat profil',
    signOut:          'Keluar',
    dispatchBoard:    'Papan Dispatch',
    savedLocations:   'Lokasi Tersimpan',
    tripReport:       'Laporan Perjalanan',
    newBooking:       '+ Booking Baru',
    viewCalendar:     'Kalender',
    viewMap:          'Peta',
    needsApproval:    'Butuh persetujuan',
    noApprovals:      'Tidak ada booking yang perlu disetujui',
    filterAll:        'Semua',
    filterPending:    'Menunggu',
    filterBooked:     'Terkonfirmasi',
    filterDone:       'Selesai',
    today:            'Hari ini',
    noBookings:       'Tidak ada booking untuk periode ini',
    loadMore:         'Muat lagi',
    loading:          'Memuat...',
    unassigned:       'Belum ditugaskan',
    reject:           'Tolak',
    approve:          'Setujui',
    reassign:         '🔄 Tugaskan ulang',
    cancel:           'Batal',
    toastConfirmed:   'Booking dikonfirmasi',
    toastPending:     'Booking dikirim — menunggu persetujuan',
    rejectBooking:    'Tolak booking',
    reasonOptional:   'Alasan (opsional)',
    reasonPlaceholder:'mis. Tidak ada driver untuk waktu ini',
    viewAllBookings:  'Lihat semua booking →',
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
  },
}


interface TaxiRow {
  id: string
  name: string
  plate: string | null
  color: string
  is_available: boolean
  driver_id: string | null
  driver_name: string | null
  trips_today: number
}

export default function CoordinatorHomePage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [user,             setUser]             = useState<User | null>(null)
  const [pendingAll,       setPendingAll]       = useState<BookingDetail[]>([])
  const [calendarBookings, setCalendarBookings] = useState<BookingDetail[]>([])
  const [latestTrips,      setLatestTrips]      = useState<BookingDetail[]>([])
  const [tripsToday,       setTripsToday]       = useState(0)
  const [taxis,            setTaxis]            = useState<TaxiRow[]>([])
  const [dayAssignments,   setDayAssignments]   = useState<import('@/components/GanttCalendar').DayAssignment[]>([])
  const [loading,          setLoading]          = useState(true)
  const [view,        setView]        = useState<'calendar' | 'map'>('calendar')
  const [rejectId,   setRejectId]   = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)
  const [processingAction, setProcessingAction] = useState<'approve' | 'reject' | 'cancel' | null>(null)
  const [cancelConfirmId,  setCancelConfirmId]  = useState<string | null>(null)
  const [cancelNote,       setCancelNote]       = useState('')
  const [cancellingModal,  setCancellingModal]  = useState(false)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [bookingToast, setBookingToast] = useState<{ code: string; taxi?: string; driver?: string; pending?: boolean } | null>(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const code = p.get('booked')
    if (!code) return
    const taxi    = p.get('taxi')    || undefined
    const driver  = p.get('driver')  || undefined
    const pending = p.get('pending') === '1'
    setBookingToast({ code, taxi, driver, pending })
    window.history.replaceState({}, '', '/coordinator/home')
    const toastTimer = setTimeout(() => setBookingToast(null), 8000)
    return () => clearTimeout(toastTimer)
  }, [])


  const loadData = useCallback(async () => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const calStart = new Date(); calStart.setHours(0, 0, 0, 0); calStart.setDate(calStart.getDate() - 7)
    const calEnd   = new Date(); calEnd.setHours(23, 59, 59, 999); calEnd.setDate(calEnd.getDate() + 90)
    const witaDate       = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
    const todayWitaStart = new Date(`${witaDate}T00:00:00+08:00`).toISOString()
    const todayWitaEnd   = new Date(`${witaDate}T23:59:59+08:00`).toISOString()

    const [{ data: allBks }, { data: txs }, { data: pendingBks }, { data: latestBks }, { count: todayCount }] = await Promise.all([
      // Wide window for Calendar tab
      supabase
        .from('booking_details')
        .select('*')
        .gte('scheduled_at', calStart.toISOString())
        .lt('scheduled_at', calEnd.toISOString())
        .not('status', 'in', '("cancelled","rejected")')
        .order('scheduled_at', { ascending: true })
        .limit(1000),
      supabase
        .from('taxis')
        .select('*, users!driver_id(name)')
        .eq('is_active', true),
      supabase
        .from('booking_details')
        .select('*')
        .eq('status', 'pending_coordinator_approval')
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('booking_details')
        .select('*')
        .not('status', 'in', '("cancelled","rejected")')
        .order('scheduled_at', { ascending: false })
        .limit(5),
      supabase
        .from('booking_details')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_at', todayWitaStart)
        .lte('scheduled_at', todayWitaEnd)
        .not('status', 'in', '("cancelled","rejected")'),
    ])

    const enriched = await Promise.all(
      (txs || []).map(async (taxi: any) => {
        const { count: trips } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('taxi_id', taxi.id)
          .eq('status', 'completed')
          .gte('completed_at', todayStart.toISOString())
        return {
          id:           taxi.id,
          name:         taxi.name,
          plate:        taxi.plate,
          color:        taxi.color,
          is_available: taxi.is_available,
          driver_id:    taxi.driver_id,
          driver_name:  taxi.users?.name || null,
          trips_today:  trips || 0,
        }
      })
    )

    const witaToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
    const { data: dayAssign } = await supabase
      .from('driver_day_assignments')
      .select('taxi_id, assign_date, reason, passenger_name_other, passenger_id, taxis(name, plate, users!driver_id(name))')
      .gte('assign_date', witaToday)

    // Resolve registered passenger names in one batch query
    const passengerIds = Array.from(new Set((dayAssign || []).filter((a: any) => a.passenger_id).map((a: any) => a.passenger_id as string)))
    let passengerNames: Record<string, string> = {}
    if (passengerIds.length > 0) {
      const { data: pUsers } = await supabase.from('users').select('id, name').in('id', passengerIds)
      if (pUsers) pUsers.forEach((u: any) => { passengerNames[u.id] = u.name })
    }

    setPendingAll(pendingBks || [])
    setCalendarBookings(allBks || [])
    setLatestTrips(latestBks || [])
    setTripsToday(todayCount || 0)
    setTaxis(enriched)
    setDayAssignments((dayAssign || []).map((a: any) => ({
      taxi_id:        a.taxi_id,
      assign_date:    a.assign_date,
      reason:         a.reason ?? null,
      taxi_name:      a.taxis?.name ?? null,
      taxi_plate:     a.taxis?.plate ?? null,
      driver_name:    (a.taxis as any)?.users?.name ?? null,
      passenger_name: a.passenger_id ? (passengerNames[a.passenger_id] ?? null) : (a.passenger_name_other ?? null),
    })))
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      setUser(p)
      await loadData()
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', p.id).eq('is_read', false).then(({ count }) => setUnreadCount(count || 0))
      setLoading(false)
    }
    init()

    const ch = supabase.channel('coord-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  async function runCron() {
    const res  = await fetch('/api/cron/auto-complete')
    const data = await res.json()

    if (!res.ok) {
      alert('Cron error: ' + JSON.stringify(data))
      return
    }

    const msg =
      `✅ Cron ran successfully\n\n` +
      `Auto-completed:    ${data.auto_completed}\n` +
      `15min reminders:   ${data.reminded_15min}\n` +
      `Start reminders:   ${data.reminded_start}\n` +
      `Overdue alerts:    ${data.reminded_overdue}\n` +
      `Coord alerts:      ${data.notified_coord}\n\n` +
      (data.reminded_15min === 0 && data.reminded_start === 0
        ? `⚠️ No reminders sent.\nPossible reasons:\n` +
          `• Booking status is not "booked" yet\n` +
          `• Booking time not in 10-15min window\n` +
          `• Reminder already sent before`
        : `🔔 Check notification bell for alerts`)

    alert(msg)
    await loadData()
  }

  async function handleApprove(bookingId: string) {
    setProcessing(bookingId); setProcessingAction('approve')
    const token = await getToken()
    await fetch(`/api/bookings/${bookingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'approve' }),
    })
    await loadData()
    setProcessing(null); setProcessingAction(null)
  }

  async function handleReject(bookingId: string) {
    setProcessing(bookingId); setProcessingAction('reject')
    const token = await getToken()
    await fetch(`/api/bookings/${bookingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'reject', rejection_reason: rejectNote }),
    })
    setRejectId(null)
    setRejectNote('')
    await loadData()
    setProcessing(null); setProcessingAction(null)
  }

  function handleCancel(bookingId: string) {
    setCancelConfirmId(bookingId)
    setCancelNote('')
  }

  async function confirmCancel() {
    if (!cancelConfirmId) return
    setCancellingModal(true)
    setProcessing(cancelConfirmId); setProcessingAction('cancel')
    const token = await getToken()
    await fetch(`/api/bookings/${cancelConfirmId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ reason: cancelNote }),
    })
    setCancelConfirmId(null); setCancelNote(''); setCancellingModal(false)
    await loadData()
    setProcessing(null); setProcessingAction(null)
  }

  async function toggleAvailability(taxiId: string, current: boolean) {
    await supabase.from('taxis').update({ is_available: !current }).eq('id', taxiId)
    await loadData()
  }

  if (loading) return <PageLoader />

  const pendingApproval = pendingAll

  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0,2).join('') || 'C'

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", height: '100dvh', background: '#F5F5F2', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Booking success toast ── */}
      {bookingToast && (
        <div style={{ position: 'fixed', top: 16, left: 16, right: 16, zIndex: 9999, background: bookingToast.pending ? '#FEF3C7' : '#D8F3DC', border: `1px solid ${bookingToast.pending ? '#FDE68A' : '#B7E4C7'}`, borderRadius: 16, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{bookingToast.pending ? '⏳' : '✅'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: bookingToast.pending ? '#92400E' : '#2D6A4F' }}>
              {bookingToast.pending ? t.toastPending : t.toastConfirmed}
            </p>
            <p style={{ fontSize: 12, color: bookingToast.pending ? '#92400E' : '#2D6A4F', margin: 0, opacity: 0.8 }}>
              {bookingToast.code}
              {bookingToast.taxi && ` · ${bookingToast.taxi}`}
              {bookingToast.driver && ` · ${bookingToast.driver}`}
            </p>
          </div>
          <button onClick={() => setBookingToast(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: bookingToast.pending ? '#92400E' : '#2D6A4F', opacity: 0.6, padding: 0, flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* ── TopAppBar — in normal flow; flex layout keeps it above the scroll area ── */}
      <header style={{
        background: '#F5F5F2',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 1px 4px rgba(0,96,100,0.06)',
        flexShrink: 0, position: 'relative', zIndex: 1000,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', height: 64 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/vale-logo.svg" alt="PT Vale" style={{ height: 32, display: 'block' }} />
          </div>
          {/* Right: fullscreen + bell + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => router.push('/coordinator/notifications')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {unreadCount > 0 && (
                <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, background:'#EF4444', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', border:'1.5px solid #fff', pointerEvents:'none', lineHeight:1 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <div style={{ position: 'relative' }}>
              <div onClick={() => setMenuOpen(o => !o)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#006064', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, border: '2px solid rgba(0,96,100,0.3)', cursor: 'pointer' }}>
                {initials}
              </div>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
                  <div style={{ position: 'absolute', top: 44, right: 0, background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 1099, minWidth: 220, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#F5F5F2' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: '#1a1c1b' }}>{user?.name}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{t.role}</p>
                    </div>
                    <button onClick={() => { setMenuOpen(false); window.open('/board', '_blank') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#006064' }}>{t.dispatchBoard}</p>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/coordinator/users') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#006064' }}>{lang === 'id' ? 'Pengguna' : 'Users'}</p>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/coordinator/locations') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#D97706' }}>{t.savedLocations}</p>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/coordinator/report') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#006064' }}>{t.tripReport}</p>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/coordinator/profile') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#006064' }}>{t.viewProfile}</p>
                    </button>
                    <button onClick={async () => { setMenuOpen(false); await supabase.auth.signOut(); router.push('/login') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ba1a1a" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#ba1a1a' }}>{t.signOut}</p>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Scrollable content below header ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 72 }}>
      <OnboardingTour role="coordinator" />

      {/* ── Greeting hero ── */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', margin: '0 0 3px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {lang === 'id' ? 'Selamat datang' : 'Welcome back'}
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: PRIMARY, margin: '0 0 4px', letterSpacing: '-0.5px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {user?.name?.split(' ')[0]}
            </h1>
            <p style={{ fontSize: 13, color: '#6f7979', margin: 0, fontWeight: 500 }}>{t.role}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ textAlign: 'center', background: pendingApproval.length > 0 ? '#FEF3C7' : '#F5F5F2', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: pendingApproval.length > 0 ? '#92400E' : '#9ca3af', margin: '0 0 2px', opacity: 0.8 }}>
                {lang === 'id' ? 'Approval' : 'Approval'}
              </p>
              <p style={{ fontSize: 26, fontWeight: 800, margin: 0, color: pendingApproval.length > 0 ? '#D97706' : '#9ca3af', letterSpacing: '-1px', lineHeight: 1 }}>{pendingApproval.length}</p>
              <p style={{ fontSize: 11, color: pendingApproval.length > 0 ? '#92400E' : '#9ca3af', margin: '2px 0 0', opacity: 0.7 }}>{lang === 'id' ? 'menunggu' : 'pending'}</p>
            </div>
            <div style={{ textAlign: 'center', background: 'rgba(0,96,100,0.06)', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: PRIMARY, margin: '0 0 2px', opacity: 0.75 }}>
                {lang === 'id' ? 'Trip' : 'Trips'}
              </p>
              <p style={{ fontSize: 26, fontWeight: 800, margin: 0, color: PRIMARY, letterSpacing: '-1px', lineHeight: 1 }}>{tripsToday}</p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{lang === 'id' ? 'hari ini' : 'today'}</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        {/* ── Pending approval — hidden when empty ── */}
        {pendingApproval.length > 0 && (
          <div style={{ marginBottom: 16, paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#D97706', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                {pendingApproval.length}
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#7e5700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {t.needsApproval}
              </p>
            </div>
            {pendingApproval.map(b => (
              <BookingCard key={b.id} booking={b} isProcessing={processing === b.id} processingAction={processing === b.id ? processingAction : null} onApprove={() => handleApprove(b.id)} onReject={() => setRejectId(b.id)} onCancel={b.created_by === user?.id ? () => handleCancel(b.id) : undefined} />
            ))}
          </div>
        )}

        {/* ── CALENDAR / MAP ── */}
        <div style={{ margin: '0 -16px', background: '#fff', borderTop: '1px solid rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(0,0,0,0.08)', position: 'relative', zIndex: 0 }}>
          <GanttCalendar
            bookings={calendarBookings} taxis={taxis} showCompleted dayAssignments={dayAssignments}
            onMapClick={() => setView(view === 'map' ? 'calendar' : 'map')}
            mapActive={view === 'map'}
            currentUserId={user?.id}
            onRefresh={loadData}
          />
          {view === 'map' && (
            <div style={{ height: 'calc(100dvh - 260px - 72px)', minHeight: 300 }}>
              <DriverFleetMap style={{ borderRadius: 0, height: '100%' }} />
            </div>
          )}
        </div>

        {view === 'calendar' && (
          <>
            {/* ── Latest 5 trips ── */}
            {latestTrips.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#6f7979', margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {lang === 'id' ? 'Trip terbaru' : 'Latest trips'}
                  </p>
                  <button
                    onClick={() => router.push('/coordinator/report')}
                    style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                  >
                    {t.viewAllBookings}
                  </button>
                </div>
                {latestTrips.map(b => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    isProcessing={processing === b.id}
                    processingAction={processing === b.id ? processingAction : null}
                    onApprove={() => handleApprove(b.id)}
                    onReject={() => setRejectId(b.id)}
                    onCancel={b.created_by === user?.id && ['submitted','booked','pending_coordinator_approval'].includes(b.status) ? () => handleCancel(b.id) : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── FLEET TAB ── */}
        {false && (
          <div>
            {taxis.map(t => (
              <div key={t.id} style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px' }}>{t.name}</p>
                      <p style={{ fontSize: '12px', color: '#6f7979', margin: 0 }}>{t.driver_name || 'No driver'} {t.plate ? `· ${t.plate}` : ''}</p>
                    </div>
                  </div>

                  {/* Availability toggle */}
                  <button
                    onClick={() => toggleAvailability(t.id, t.is_available)}
                    style={{
                      padding: '5px 12px', fontSize: '11px', fontWeight: 700,
                      border: 'none', borderRadius: 9999, cursor: 'pointer',
                      background: t.is_available ? '#D1FAE5' : '#FEE2E2',
                      color:      t.is_available ? '#065F46' : '#991B1B',
                    }}
                  >
                    {t.is_available ? '● Available' : '○ Unavailable'}
                  </button>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ background: '#F5F5F2', borderRadius: '8px', padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                    <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Trips today</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{t.trips_today}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>{/* end scrollable content */}

      {/* Reject modal */}
      {rejectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 1100 }}>
          <style>{`@keyframes card-spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 14px' }}>{t.rejectBooking}</h2>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>
                {t.reasonOptional}
              </label>
              <input
                type="text"
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder={t.reasonPlaceholder}
                style={{ width: '100%', padding: '11px 14px', fontSize: '14px', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: '10px', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => { setRejectId(null); setRejectNote('') }} style={{ padding: '12px', background: 'transparent', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleReject(rejectId)} disabled={processing === rejectId} style={{ padding: '12px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: processing === rejectId ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {processing === rejectId && (
                  <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(153,27,27,0.3)', borderTopColor: '#991B1B', display: 'inline-block', animation: 'card-spin 0.7s linear infinite', flexShrink: 0 }} />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancelConfirmId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 1200 }}
          onClick={() => !cancellingModal && setCancelConfirmId(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', boxSizing: 'border-box' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.1)', margin: '0 auto 20px' }} />
            <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 16px', color: '#991B1B' }}>
              {lang === 'id' ? 'Batalkan booking ini?' : 'Cancel this booking?'}
            </p>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 8px' }}>
              {lang === 'id' ? 'Alasan (opsional)' : 'Reason (optional)'}
            </p>
            <input
              type="text"
              value={cancelNote}
              onChange={e => setCancelNote(e.target.value)}
              placeholder={lang === 'id' ? 'mis. Trip sudah tidak diperlukan' : 'e.g. Trip no longer needed'}
              style={{ width: '100%', padding: '12px 14px', fontSize: 14, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 12, outline: 'none', marginBottom: 16, boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setCancelConfirmId(null)} disabled={cancellingModal}
                style={{ padding: '13px', background: 'transparent', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {lang === 'id' ? 'Kembali' : 'Back'}
              </button>
              <button onClick={confirmCancel} disabled={cancellingModal}
                style={{ padding: '13px', background: cancellingModal ? '#9ca3af' : '#991B1B', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: cancellingModal ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {cancellingModal ? (lang === 'id' ? 'Membatalkan...' : 'Cancelling...') : (lang === 'id' ? 'Batalkan Booking' : 'Cancel Booking')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

function buildWaMessage(b: BookingDetail): string {
  const time = format(new Date(b.scheduled_at), 'EEEE, dd MMMM yyyy · HH:mm', { locale: idLocale })
  const type = b.trip_type === 'DROP' ? 'Drop (antar saja)' : `Waiting ${b.wait_minutes} menit (tunggu penumpang)`
  const taxi = b.taxi_name ? `${b.taxi_name}${b.taxi_plate ? ` (${b.taxi_plate})` : ''}` : null
  return [
    `📋 *TaxiBook – Penugasan Perjalanan*`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔖 Kode Booking: *${b.booking_code}*`,
    ``,
    `👤 *Penumpang*`,
    `   Nama : ${b.passenger_name}`,
    ...(b.passenger_phone ? [`   HP   : ${b.passenger_phone}`] : []),
    ``,
    `📍 *Rute Perjalanan*`,
    `   Dari    : ${b.pickup}`,
    `   Tujuan  : ${b.destination}`,
    ``,
    `🕐 *Jadwal*`,
    `   ${time}`,
    ``,
    `🚗 *Detail Trip*`,
    `   Jenis : ${type}`,
    ...(taxi ? [`   Taksi : ${taxi}`] : []),
    ...(b.notes ? [`   Catatan : ${b.notes}`] : []),
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `Mohon konfirmasi kesiapan Anda untuk perjalanan ini. Terima kasih! 🙏`,
  ].join('\n')
}

// ── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({ booking: b, isProcessing, processingAction, onApprove, onReject, onReassign, onCancel }: {
  booking: BookingDetail
  isProcessing: boolean
  processingAction?: 'approve' | 'reject' | 'cancel' | null
  onApprove: () => void
  onReject: () => void
  onReassign?: () => void
  onCancel?: () => void
}) {
  const lang = useLang()
  const t    = MSG[lang]
  const sc = STATUS_COLORS[b.status]
  const needsApproval = b.status === 'pending_coordinator_approval'
  const canCancel = !!onCancel && ['submitted', 'pending_coordinator_approval', 'booked'].includes(b.status)
  const hasContact = b.driver_phone || b.passenger_phone

  return (
    <div style={{ background: '#ffffff', borderRadius: 16, padding: '14px 16px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,96,100,0.06)', border: `1px solid ${needsApproval ? 'rgba(217,119,6,0.2)' : 'rgba(0,0,0,0.06)'}`, borderLeft: `3px solid ${needsApproval ? '#d97706' : '#006064'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {b.passenger_name}
          </p>
          <p style={{ fontSize: '12px', color: '#6f7979', margin: 0 }}>
            {format(new Date(b.scheduled_at), 'EEE d MMM · HH:mm', { locale: idLocale })}
          </p>
          <p style={{ fontSize: '12px', color: '#6f7979', margin: '2px 0 0' }}>
            {b.pickup} → {b.destination}
          </p>
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 9999, flexShrink: 0, background: sc.bg, color: sc.text }}>
          {STATUS_LABELS[b.status]}
        </span>
      </div>

      {/* Driver + contact icons in one row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: needsApproval || hasContact ? '10px' : '0' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
          {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}min`}
        </span>
        {b.taxi_name
          ? <span style={{ fontSize: '11px', color: '#6f7979', display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.taxi_color || '#888', display: 'inline-block' }} />
              {b.taxi_name} · {b.driver_name}
            </span>
          : <span style={{ fontSize: '11px', color: '#9ca3af', flex: 1 }}>{t.unassigned}</span>
        }
        {/* Quick contact icon buttons */}
        {b.driver_phone && (
          <>
            <a href={`tel:${b.driver_phone}`}
              title={`Call driver: ${b.driver_phone}`}
              style={{ width: 28, height: 28, borderRadius: 8, background: '#EFF6FF', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#0369A1', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.63 4.35 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </a>
            <a href={`https://wa.me/${toWaNumber(b.driver_phone)}?text=${encodeURIComponent(buildWaMessage(b))}`}
              target="_blank" rel="noopener noreferrer"
              title={`WhatsApp driver with booking details`}
              style={{ width: 28, height: 28, borderRadius: 8, background: '#F0FDF4', border: '1px solid #86EFAC', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#15803D', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
            </a>
          </>
        )}
      </div>

      {needsApproval && (
        <>
          <style>{`@keyframes card-spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 6 }}>
            <button onClick={onReject} disabled={isProcessing} style={{ padding: '9px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: isProcessing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              {t.reject}
            </button>
            <button onClick={onApprove} disabled={isProcessing} style={{ padding: '9px', background: '#d8f3dc', color: '#2D6A4F', border: '1px solid #6EE7B7', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: isProcessing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              {processingAction === 'approve' && (
                <span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid rgba(45,106,79,0.3)', borderTopColor: '#2D6A4F', display: 'inline-block', animation: 'card-spin 0.7s linear infinite', flexShrink: 0 }} />
              )}
              {t.approve}
            </button>
          </div>
        </>
      )}
      {!needsApproval && !['completed','cancelled','rejected'].includes(b.status) && (onReassign || canCancel) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {onReassign && (
            <button onClick={onReassign} style={{ flex: 1, padding: '7px', background: '#F5F5F2', color: '#6f7979', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              {t.reassign}
            </button>
          )}
          {canCancel && (
            <button onClick={onCancel} disabled={isProcessing} style={{ flex: onReassign ? '0 0 auto' : 1, padding: '7px 12px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              {t.cancel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color = '#006064', bg = 'rgba(0,0,0,0.04)' }: {
  label: string; value: number; color?: string; bg?: string
}) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color, margin: '0 0 4px', opacity: 0.75 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-1px', lineHeight: 1, color }}>{value}</p>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
      <p style={{ fontSize: '14px', margin: 0 }}>{label}</p>
    </div>
  )
}

