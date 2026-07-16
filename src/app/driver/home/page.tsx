'use client'
import React from 'react'

import { useEffect, useState, useCallback } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { User } from '@/types'
import GanttCalendar, { type DayAssignment } from '@/components/GanttCalendar'
import { useGpsReporting } from '@/hooks/useGpsReporting'
import OnboardingTour from '@/components/OnboardingTour'
import PageLoader from '@/components/PageLoader'
import { useLang } from '@/lib/language'

const ActiveTripMap = dynamic(() => import('@/components/map/ActiveTripMap'), { ssr: false })

const FONT = 'Inter, sans-serif'

const MSG = {
  en: {
    offline:              'Offline',
    onDuty:                'On duty',
    driverFallback:        'Driver',
    updating:              'Updating...',
    setOnline:             'Set Online',
    setOffline:            'Set Offline',
    willReceiveTrips:      'You will receive new trips',
    willStopTrips:         'Stop receiving new trips',
    viewProfile:           'View profile',
    signOut:               'Sign out',
    never:                 'never',
    gpsStaleBanner:        (x: string) => `Your location hasn't updated for ${x}. Please check location permissions and keep the app open.`,
    welcomeBack:           'Welcome back',
    today:                 'Today',
    doneLabel:             'done',
    tabTrips:              'My Trips',
    tabActive:             'Active',
    tabCalendar:           'Calendar',
    nextTripAt:            (time: string) => `No active trip — next trip at ${time}`,
    youreFree:             "You're free",
    noActiveOrUpcoming:    'No active or upcoming trips',
    allTrips:              'All trips',
    tripInProgress:        (dest: string) => `Trip in progress — ${dest}`,
    upcomingCount:         (n: number) => `Upcoming — ${n} trip${n > 1 ? 's' : ''}`,
    loadMore:              'Load more',
    loadingMore:           'Loading...',
    recentCompleted:       'Recent completed',
    noTripsAssigned:       'No trips assigned yet',
    notifiedWhenAssigned:  "You'll be notified when a trip is assigned",
    waitingAtDestination:  (min: number) => `⏱ Waiting at destination — ${min} min`,
    tripInProgressStatus:  '🚗 Trip in progress',
    markCompletedBackAtBase: '✓ Mark completed — back at base',
    completing:            'Completing...',
    bookingId:             'Booking ID',
    tripType:              'Trip type',
    dropOneWay:            'Drop — one way',
    waitingMin:            (min: number) => `Waiting — ${min} min`,
    notes:                 'Notes',
    starting:              'Starting...',
    scheduledNotYet:       (time: string) => `⏳ Scheduled at ${time} — not yet`,
    startTripPickup:       '🚗 Start trip — pick up passenger',
    markCompleted:         '✓ Mark completed',
    statusDone:            'Done',
    statusConfirmed:       'Confirmed',
    fromPickup:            (pickup: string) => `from ${pickup}`,
    pickup:                'Pickup',
    destination:           'Destination',
    waitBadge:             (n: number) => `⏱ Wait ${n}m`,
    dropBadge:             '→ Drop',
    errorPrefix:           'Error: ',
    failed:                'Failed',
    callPassenger:         'Call passenger',
    whatsappPassenger:     'WhatsApp',
    waMessage:             (code: string, pickup: string) => `Hi, I'm your driver for booking ${code}. I'm heading to pick you up at ${pickup}.`,
    navigateToPickup:      'Navigate to pickup',
    navigateToDestination: 'Navigate to destination',
    dutyToday:             'Duty Assignment Today',
    dutyFullDay:           'Full-day duty — unavailable for passenger trips',
    dutyTimeRange:         (start: string, end: string) => `Special duty ${start}–${end}`,
    dutyReasonLabel:       'Reason',
    dutyNote:              'Set by your coordinator — you will not be auto-assigned passenger trips during this window.',
    dutyDateLabel:         'Date',
    dutyTimeLabel:         'Time',
    dutyFullDayValue:      'Full day',
    dutyTaxiLabel:         'Taxi',
    dutyPassengerLabel:    'Passenger',
  },
  id: {
    offline:              'Offline',
    onDuty:                'Bertugas',
    driverFallback:        'Driver',
    updating:              'Memperbarui...',
    setOnline:             'Aktifkan',
    setOffline:            'Nonaktifkan',
    willReceiveTrips:      'Anda akan menerima trip baru',
    willStopTrips:         'Berhenti menerima trip baru',
    viewProfile:           'Lihat profil',
    signOut:               'Keluar',
    never:                 'belum pernah',
    gpsStaleBanner:        (x: string) => `Lokasi Anda belum diperbarui selama ${x}. Mohon periksa izin lokasi dan tetap buka aplikasi ini.`,
    welcomeBack:           'Selamat datang kembali',
    today:                 'Hari ini',
    doneLabel:             'selesai',
    tabTrips:              'Trip Saya',
    tabActive:             'Aktif',
    tabCalendar:           'Kalender',
    nextTripAt:            (time: string) => `Tidak ada trip aktif — trip berikutnya pukul ${time}`,
    youreFree:             'Anda sedang bebas',
    noActiveOrUpcoming:    'Tidak ada trip aktif atau mendatang',
    allTrips:              'Semua trip',
    tripInProgress:        (dest: string) => `Trip sedang berlangsung — ${dest}`,
    upcomingCount:         (n: number) => `Mendatang — ${n} trip`,
    loadMore:              'Muat lebih banyak',
    loadingMore:           'Memuat...',
    recentCompleted:       'Baru selesai',
    noTripsAssigned:       'Belum ada trip yang ditugaskan',
    notifiedWhenAssigned:  'Anda akan diberi tahu saat ada trip yang ditugaskan',
    waitingAtDestination:  (min: number) => `⏱ Menunggu di tujuan — ${min} menit`,
    tripInProgressStatus:  '🚗 Trip sedang berlangsung',
    markCompletedBackAtBase: '✓ Tandai selesai — kembali ke pangkalan',
    completing:            'Menyelesaikan...',
    bookingId:             'ID Booking',
    tripType:              'Jenis trip',
    dropOneWay:            'Antar — satu arah',
    waitingMin:            (min: number) => `Menunggu — ${min} menit`,
    notes:                 'Catatan',
    starting:              'Memulai...',
    scheduledNotYet:       (time: string) => `⏳ Dijadwalkan pukul ${time} — belum waktunya`,
    startTripPickup:       '🚗 Mulai trip — jemput penumpang',
    markCompleted:         '✓ Tandai selesai',
    statusDone:            'Selesai',
    statusConfirmed:       'Dikonfirmasi',
    fromPickup:            (pickup: string) => `dari ${pickup}`,
    pickup:                'Jemput',
    destination:           'Tujuan',
    waitBadge:             (n: number) => `⏱ Tunggu ${n}m`,
    dropBadge:             '→ Antar',
    errorPrefix:           'Error: ',
    failed:                'Gagal',
    callPassenger:         'Telepon penumpang',
    whatsappPassenger:     'WhatsApp',
    waMessage:             (code: string, pickup: string) => `Halo, saya driver untuk booking ${code}. Saya sedang menuju ke ${pickup} untuk menjemput Anda.`,
    navigateToPickup:      'Navigasi ke lokasi jemput',
    navigateToDestination: 'Navigasi ke tujuan',
    dutyToday:             'Tugas Hari Ini',
    dutyFullDay:           'Tugas seharian — tidak tersedia untuk trip penumpang',
    dutyTimeRange:         (start: string, end: string) => `Tugas khusus ${start}–${end}`,
    dutyReasonLabel:       'Alasan',
    dutyNote:              'Ditetapkan oleh koordinator Anda — Anda tidak akan menerima trip penumpang otomatis selama periode ini.',
    dutyDateLabel:         'Tanggal',
    dutyTimeLabel:         'Waktu',
    dutyFullDayValue:      'Seharian',
    dutyTaxiLabel:         'Taksi',
    dutyPassengerLabel:    'Penumpang',
  },
}

interface DriverBooking {
  id:             string
  booking_code:   string
  passenger_name: string
  passenger_phone: string | null
  pickup:         string
  destination:    string
  trip_type:      string
  wait_minutes:   number
  scheduled_at:   string
  status:         string
  notes:          string | null
  taxi_id:        string | null
  taxi_name:      string | null
  taxi_color:     string | null
  pickup_lat:     number | null
  pickup_lng:     number | null
  destination_lat: number | null
  destination_lng: number | null
}

type Tab = 'trips' | 'active' | 'calendar'

export default function DriverHomePage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [user,       setUser]       = useState<User | null>(null)
  const [upcoming,   setUpcoming]   = useState<DriverBooking[]>([])
  const [past,       setPast]       = useState<DriverBooking[]>([])
  const [activeTrip,  setActiveTrip]  = useState<DriverBooking | null>(null)
  const [myTaxi,        setMyTaxi]        = useState<any | null>(null)
  const [dayAssignments, setDayAssignments] = useState<DayAssignment[]>([])
  const [loading,    setLoading]    = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [selected,   setSelected]   = useState<DriverBooking | null>(null)
  const [tab,        setTab]        = useState<Tab>('trips')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [upPage,      setUpPage]      = useState(0)
  const [hasMoreUp,   setHasMoreUp]   = useState(false)
  const [pastPage,    setPastPage]    = useState(0)
  const [hasMorePast, setHasMorePast] = useState(false)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [menuOpen,   setMenuOpen]   = useState(false)
  const uidRef = React.useRef('')
  const taxiIdRef = React.useRef<string | null>(null)
  const [toggling,   setToggling]   = useState(false)
  const [, setTick] = useState(0) // forces periodic re-render so the GPS-stale banner's elapsed time stays live

  // Broadcast GPS to Supabase whenever driver has a taxi assigned
  useGpsReporting(myTaxi?.id ?? null)

  // Re-render every 30s so the GPS staleness banner's elapsed time keeps ticking, and re-fetch
  // the taxi row directly as a fallback — if the realtime channel below ever drops, myTaxi
  // would otherwise stay frozen on a stale location_updated_at and the red banner would never
  // clear even after GPS reporting actually resumes.
  useEffect(() => {
    const id = setInterval(async () => {
      setTick(t => t + 1)
      if (!uidRef.current) return
      const { data: taxi } = await supabase
        .from('taxis').select('*, users!driver_id(name)').eq('driver_id', uidRef.current).single()
      if (taxi) setMyTaxi({ ...taxi, driver_name: taxi.users?.name || '' })
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  async function toggleAvailability() {
    if (!myTaxi || toggling) return
    setToggling(true)
    const newVal = !myTaxi.is_available
    const { error } = await supabase
      .from('taxis').update({ is_available: newVal }).eq('id', myTaxi.id)
    if (!error) {
      const { data: t } = await supabase
        .from('taxis').select('*, users!driver_id(name)').eq('id', myTaxi.id).single()
      if (t) setMyTaxi({ ...t, driver_name: t.users?.name || '' })
    }
    setToggling(false)
    setMenuOpen(false)
  }

  const loadDayAssignments = useCallback(async (taxiId: string) => {
    const witaToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
    const { data } = await supabase.from('driver_day_assignments')
      .select('taxi_id, assign_date, start_time, end_time, reason, passenger_id, passenger_name_other, taxis(name, plate, users!driver_id(name))')
      .eq('taxi_id', taxiId).gte('assign_date', witaToday)

    const rows = data || []
    const passengerIds = Array.from(new Set(rows.filter((a: any) => a.passenger_id).map((a: any) => a.passenger_id as string)))
    let passengerNames: Record<string, string> = {}
    if (passengerIds.length > 0) {
      const { data: pUsers } = await supabase.from('users').select('id, name').in('id', passengerIds)
      if (pUsers) pUsers.forEach((u: any) => { passengerNames[u.id] = u.name })
    }

    setDayAssignments(rows.map((a: any) => ({
      taxi_id:        a.taxi_id,
      assign_date:    a.assign_date,
      start_time:     a.start_time ?? null,
      end_time:       a.end_time ?? null,
      reason:         a.reason ?? null,
      taxi_name:      a.taxis?.name ?? null,
      taxi_plate:     a.taxis?.plate ?? null,
      driver_name:    a.taxis?.users?.name ?? null,
      passenger_name: a.passenger_id ? (passengerNames[a.passenger_id] ?? null) : (a.passenger_name_other ?? null),
    })))
  }, [supabase])

  const loadTrips = useCallback(async (userId: string) => {
    const { data: taxi } = await supabase
      .from('taxis').select('id').eq('driver_id', userId).single()
    if (!taxi) return
    // Fetch upcoming (booked) and past (completed) separately
    const [{ data: upData }, { data: pastData }, { data: activeData }] = await Promise.all([
      supabase.from('booking_details').select('*')
        .eq('taxi_id', taxi.id).eq('status', 'booked')
        .order('scheduled_at', { ascending: true }).range(0, 9),
      supabase.from('booking_details').select('*')
        .eq('taxi_id', taxi.id).eq('status', 'completed')
        .order('scheduled_at', { ascending: false }).range(0, 4),
      supabase.from('booking_details').select('*')
        .eq('taxi_id', taxi.id).in('status', ['on_trip','waiting_trip']).limit(1),
    ])
    const newActiveTrip = (activeData || [])[0] || null
    const upcomingList = upData || []
    setUpcoming(upcomingList)
    setPast(pastData || [])
    setActiveTrip(newActiveTrip)
    setUpPage(0)
    setPastPage(0)
    setHasMoreUp(upcomingList.length === 10)
    setHasMorePast((pastData || []).length === 5)
    // Auto switch tab when trip becomes active
    if (newActiveTrip) setTab('active')
    // Auto-show popup for overdue trips (booked but past scheduled time)
    const now = new Date()
    const overdueTrip = upcomingList.find((t: any) => {
      const scheduled = new Date(t.scheduled_at)
      return scheduled < now && t.status === 'booked'
    })
    if (overdueTrip) {
      setSelected(overdueTrip)
      setTab('trips')
    }
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const au = session?.user
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      if (p?.role !== 'driver') { router.push('/login'); return }
      uidRef.current = au.id; setUser(p)
      await loadTrips(au.id)
      const { data: taxi } = await supabase
        .from('taxis').select('*, users!driver_id(name)').eq('driver_id', au.id).single()
      if (taxi) {
        setMyTaxi({ ...taxi, driver_name: taxi.users?.name || p.name })
        taxiIdRef.current = taxi.id
        loadDayAssignments(taxi.id)
      }
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', au.id).eq('is_read', false).then(({ count }) => setUnreadCount(count || 0))
      setLoading(false)
    }
    init()
    const ch = supabase.channel('driver-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' },
        () => { if (uidRef.current) loadTrips(uidRef.current) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'taxis' },
        async () => {
          if (!uidRef.current) return
          const { data: taxi } = await supabase
            .from('taxis').select('*, users!driver_id(name)').eq('driver_id', uidRef.current).single()
          if (taxi) setMyTaxi({ ...taxi, driver_name: taxi.users?.name || '' })
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_day_assignments' },
        () => { if (taxiIdRef.current) loadDayAssignments(taxiIdRef.current) })
      .subscribe()

    // Mobile browsers commonly suspend the realtime websocket while the app is
    // backgrounded and don't reliably resume delivering missed events — force
    // a refresh whenever the tab/app becomes visible or regains focus again,
    // so data doesn't go stale until the driver manually reloads.
    const refreshOnReturn = () => {
      if (document.visibilityState !== 'visible' || !uidRef.current) return
      loadTrips(uidRef.current)
      if (taxiIdRef.current) loadDayAssignments(taxiIdRef.current)
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', refreshOnReturn)

    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', refreshOnReturn)
    }
  }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  async function startTrip(id: string) {
    setProcessing(id)
    const token = await getToken()
    const res = await fetch(`/api/bookings/${id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) { alert(t.errorPrefix + ((await res.json().catch(() => ({}))).error || t.failed)); setProcessing(null); return }
    setSelected(null)
    setTab('active')  // switch immediately, don't wait for reload
    if (user) await loadTrips(user.id)
    setProcessing(null)
  }

  async function complete(id: string) {
    setProcessing(id)
    const token = await getToken()
    const res = await fetch(`/api/bookings/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) { alert(t.errorPrefix + ((await res.json().catch(() => ({}))).error || t.failed)); setProcessing(null); return }
    setSelected(null)
    setTab('trips')  // switch back to trips after completing
    if (user) await loadTrips(user.id)
    setProcessing(null)
  }

  const now        = new Date()

  const nextTrip   = upcoming[0] || null

  // Coordinator-assigned duty for today (full-day or partial window) — gets the
  // same "info card in Active" treatment as a regular now/scheduled booking.
  const witaTodayStr = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const todayDuty  = dayAssignments.find(d => d.assign_date === witaTodayStr) || null

  const filterByDate = (list: DriverBooking[]) => list.filter(t => {
    if (!dateFrom && !dateTo) return true
    const d = new Date(t.scheduled_at)
    if (dateFrom && d < new Date(dateFrom + 'T00:00:00')) return false
    if (dateTo   && d > new Date(dateTo   + 'T23:59:59')) return false
    return true
  })
  const filteredUpcoming = filterByDate(upcoming)
  const filteredPast     = filterByDate(past)
  const doneToday        = past.filter(t => new Date(t.scheduled_at).toDateString() === now.toDateString()).length
  const hasActive        = !!activeTrip

  // Auto-switch to active tab when trip starts — MUST be before any early return
  useEffect(() => {
    if (hasActive) setTab('active')
  }, [hasActive])

  if (loading) return <PageLoader />

  const initials = user?.name?.split(' ').map(n => n[0]).slice(0,2).join('') || '?'

  const tabColor = myTaxi?.color || '#2563EB'

  // GPS staleness — only nag while on duty; matches the 1h server-side threshold.
  // Also only during operating hours (07:00–16:00 WITA), same as the server-side cron —
  // otherwise a driver who forgets to tap "Set Offline" gets nagged all night.
  const nowWitaHour = new Date(Date.now() + 8 * 3600000).getUTCHours()
  const inOperatingHours = nowWitaHour >= 7 && nowWitaHour < 16
  const gpsStaleMinutes = myTaxi && myTaxi.is_available !== false
    ? (myTaxi.location_updated_at
        ? Math.floor((Date.now() - new Date(myTaxi.location_updated_at).getTime()) / 60000)
        : Infinity)
    : null
  const showGpsStaleBanner = inOperatingHours && gpsStaleMinutes !== null && gpsStaleMinutes >= 60
  const gpsStaleText = gpsStaleMinutes === Infinity
    ? t.never
    : gpsStaleMinutes !== null
      ? gpsStaleMinutes >= 60
        ? `${Math.floor(gpsStaleMinutes / 60)}h ${gpsStaleMinutes % 60}m`
        : `${gpsStaleMinutes}m`
      : ''

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#F5F5F2', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Header ── */}
      <header style={{ background: '#F5F5F2', borderBottom: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,96,100,0.06)', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/icon-192.png" alt="" style={{ width: 26, height: 26, borderRadius: 7, display: 'block' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#006064', letterSpacing: '-0.3px' }}>Ridr</span>
              <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 500, marginTop: 2 }}>PT Vale Indonesia</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => router.push('/driver/notifications')} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {unreadCount > 0 && (
                <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, background:'#EF4444', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', border:'1.5px solid #fff', pointerEvents:'none', lineHeight:1 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <div style={{ position: 'relative' }}>
              <div onClick={() => setMenuOpen(o => !o)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#006064', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '2px solid rgba(0,96,100,0.3)', position: 'relative', flexShrink: 0 }}>
                {initials}
                <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', border: '2px solid #F5F5F2', display: 'block' }} />
              </div>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{ position: 'absolute', top: 44, right: 0, background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 99, minWidth: 220, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#F5F5F2' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: '#1a1c1b' }}>{user?.name}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{myTaxi?.name || t.driverFallback}</p>
                    </div>
                    <button onClick={toggleAvailability} disabled={toggling} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', flexShrink: 0, display: 'inline-block' }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 1px', color: '#006064' }}>{toggling ? t.updating : myTaxi?.is_available === false ? t.setOnline : t.setOffline}</p>
                        <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{myTaxi?.is_available === false ? t.willReceiveTrips : t.willStopTrips}</p>
                      </div>
                    </button>
                    <button onClick={() => { setMenuOpen(false); router.push('/driver/profile') }} style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
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
      <OnboardingTour role="driver" />

      {/* ── GPS stale warning ── */}
      {showGpsStaleBanner && (
        <div style={{ background: '#DC2626', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
            {t.gpsStaleBanner(gpsStaleText)}
          </p>
        </div>
      )}

      {/* ── Driver hero card ── */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', margin: '0 0 3px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t.welcomeBack}</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#006064', margin: '0 0 4px', letterSpacing: '-0.5px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{user?.name?.split(' ')[0]}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: myTaxi?.is_available === false ? '#EF4444' : '#52B788', display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: '#3f4949', fontWeight: 600 }}>
                {myTaxi?.is_available === false ? t.offline : t.onDuty}
              </span>
              {myTaxi && <span style={{ fontSize: 13, color: '#9ca3af' }}>· {myTaxi.name}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'center', background: 'rgba(0,96,100,0.06)', borderRadius: 12, padding: '10px 16px', position: 'relative' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#006064', margin: '0 0 3px', opacity: 0.75 }}>{t.today}</p>
            <p style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#006064', letterSpacing: '-1px', lineHeight: 1 }}>{doneToday}</p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{t.doneLabel}</p>
          </div>
        </div>



        {/* ── Tabs ── */}
        <div style={{ display: 'flex' }}>
          {([
            { key: 'trips',    label: t.tabTrips },
            { key: 'active',   label: t.tabActive, dot: !!activeTrip || !!nextTrip || !!todayDuty },
            { key: 'calendar', label: t.tabCalendar },
          ] as { key: Tab; label: string; dot?: boolean }[]).map(({ key, label, dot }) => {
            const active = tab === key
            return (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: '9px 6px', fontSize: 13, fontWeight: 600,
                border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                color: active ? '#006064' : '#9ca3af',
                borderBottom: active ? `2.5px solid ${tabColor}` : '2.5px solid transparent',
                marginBottom: -1, position: 'relative',
              }}>
                {label}
                {dot && !active && (
                  <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 18px)', width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── ACTIVE TAB ── */}
      {tab === 'active' && (
        <div style={{ padding: '16px 16px 100px' }}>
          {todayDuty && <DutyAssignmentCard duty={todayDuty} />}
          {activeTrip ? (
            <ActiveTripCard
              trip={activeTrip}
              processing={processing}
              onComplete={complete}
            />
          ) : nextTrip ? (
            <div style={{ background: '#ffffff', borderRadius: 18, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ background: 'rgba(0,96,100,0.1)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15 }}>📋</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#006064', margin: 0 }}>
                  {t.nextTripAt(format(new Date(nextTrip.scheduled_at), 'HH:mm'))}
                </p>
              </div>
              <div style={{ padding: '18px 16px' }}>
                <TripDetailCard trip={nextTrip} processing={processing} onStart={startTrip} />
              </div>
            </div>
          ) : !todayDuty ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: 18, border: '1px solid rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 32, margin: '0 0 12px' }}>🟢</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#006064', margin: '0 0 4px' }}>{t.youreFree}</p>
              <p style={{ fontSize: 13, color: '#6f7979', margin: 0 }}>{t.noActiveOrUpcoming}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* ── TRIPS TAB ── */}
      {tab === 'trips' && (
        <div style={{ padding: '16px 16px 100px' }}>

          {/* Compact date filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: 0 }}>{t.allTrips}</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '5px 10px' }}>
              <span style={{ fontSize: 11 }}>📅</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ width: 116, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'Inter, sans-serif', background: 'transparent', color: '#006064' }} />
              <span style={{ fontSize: 10, color: '#9ca3af' }}>→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ width: 116, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'Inter, sans-serif', background: 'transparent', color: '#006064' }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo('') }}
                  style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, border: '1px solid rgba(0,0,0,0.08)', background: '#F5F5F2', color: '#6f7979', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Active trip mini banner */}
          {activeTrip && (
            <button
              onClick={() => setTab('active')}
              style={{ width: '100%', background: '#d8f3dc', border: '1px solid #B7E4C7', borderRadius: 16, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🚗</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#2D6A4F', margin: 0 }}>
                  {t.tripInProgress(activeTrip.destination)}
                </p>
              </div>
              <span style={{ fontSize: 13, color: '#2D6A4F' }}>→</span>
            </button>
          )}

          {/* Duty assignment mini banner */}
          {todayDuty && (
            <button
              onClick={() => setTab('active')}
              style={{ width: '100%', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 16, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: 0 }}>
                  {t.dutyToday}
                </p>
              </div>
              <span style={{ fontSize: 13, color: '#92400E' }}>→</span>
            </button>
          )}

          {/* Upcoming */}
          {filteredUpcoming.length > 0 && (
            <>
              <SLabel>{t.upcomingCount(filteredUpcoming.length)}</SLabel>
              {filteredUpcoming.map(trip => (
                <TripRow key={trip.id} trip={trip} onTap={() => setSelected(trip)} />
              ))}
              {hasMoreUp && (
                <button disabled={loadingMore} onClick={async () => {
                  setLoadingMore(true)
                  const { data: taxi } = await supabase.from('taxis').select('id').eq('driver_id', user!.id).single()
                  if (taxi) {
                    const nextPage = upPage + 1
                    const { data } = await supabase.from('booking_details').select('*')
                      .eq('taxi_id', taxi.id).eq('status', 'booked')
                      .order('scheduled_at', { ascending: true })
                      .range(nextPage * 10, nextPage * 10 + 9)
                    if (data) { setUpcoming(prev => [...prev, ...data]); setHasMoreUp(data.length === 10); setUpPage(nextPage) }
                  }
                  setLoadingMore(false)
                }} style={{ width: '100%', padding: '11px', marginTop: 4, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 600, color: loadingMore ? '#9ca3af' : '#006064', cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {loadingMore ? t.loadingMore : t.loadMore}
                </button>
              )}
            </>
          )}

          {/* Past */}
          {filteredPast.length > 0 && (
            <>
              <SLabel>{t.recentCompleted}</SLabel>
              {filteredPast.map(trip => (
                <TripRow key={trip.id} trip={trip} done />
              ))}
              {hasMorePast && (
                <button disabled={loadingMore} onClick={async () => {
                  setLoadingMore(true)
                  const { data: taxi } = await supabase.from('taxis').select('id').eq('driver_id', user!.id).single()
                  if (taxi) {
                    const nextPage = pastPage + 1
                    const { data } = await supabase.from('booking_details').select('*')
                      .eq('taxi_id', taxi.id).eq('status', 'completed')
                      .order('scheduled_at', { ascending: false })
                      .range(nextPage * 5, nextPage * 5 + 4)
                    if (data) { setPast(prev => [...prev, ...data]); setHasMorePast(data.length === 5); setPastPage(nextPage) }
                  }
                  setLoadingMore(false)
                }} style={{ width: '100%', padding: '11px', marginTop: 4, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 600, color: loadingMore ? '#9ca3af' : '#006064', cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {loadingMore ? t.loadingMore : t.loadMore}
                </button>
              )}
            </>
          )}

          {filteredUpcoming.length === 0 && filteredPast.length === 0 && !activeTrip && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
              <p style={{ fontSize: 14, margin: '0 0 4px' }}>{t.noTripsAssigned}</p>
              <p style={{ fontSize: 12, margin: 0 }}>{t.notifiedWhenAssigned}</p>
            </div>
          )}
        </div>
      )}

      {/* ── CALENDAR TAB ── */}
      {tab === 'calendar' && myTaxi && (
        <GanttCalendar
          bookings={[...upcoming, ...(activeTrip ? [activeTrip] : []), ...past] as any}
          taxis={[myTaxi]}
          showCompleted
          dayAssignments={dayAssignments}
          currentUserId={user?.id}
        />
      )}

      {/* ── Trip detail sheet ── */}
      {selected && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 1100 }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: 'calc(100dvh - 20px)', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', margin: '0 auto 20px' }} />
            <TripDetailCard trip={selected} processing={processing} onStart={startTrip} onComplete={complete} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Duty assignment card (coordinator-assigned full-day/special duty) ──
function DutyAssignmentCard({ duty }: { duty: DayAssignment }) {
  const lang = useLang()
  const t    = MSG[lang]
  const isFullDay = !duty.start_time || !duty.end_time
  const dateLabel = format(new Date(duty.assign_date + 'T00:00:00'), 'EEE, d MMM yyyy', { locale: idLocale })
  const timeValue = isFullDay ? t.dutyFullDayValue : `${duty.start_time!.slice(0, 5)}–${duty.end_time!.slice(0, 5)}`

  const rows = [
    { l: t.dutyDateLabel, v: dateLabel },
    { l: t.dutyTimeLabel, v: timeValue },
    ...(duty.taxi_name ? [{ l: t.dutyTaxiLabel, v: `${duty.taxi_name}${duty.taxi_plate ? ` · ${duty.taxi_plate}` : ''}` }] : []),
    ...(duty.passenger_name ? [{ l: t.dutyPassengerLabel, v: duty.passenger_name }] : []),
    ...(duty.reason ? [{ l: t.dutyReasonLabel, v: duty.reason }] : []),
  ]

  return (
    <div style={{ background: '#ffffff', borderRadius: 18, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ background: '#FEF3C7', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>📋</span>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: 0 }}>{t.dutyToday}</p>
      </div>
      <div style={{ padding: '14px 16px' }}>
        <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: '#1a1c1b' }}>
          {isFullDay ? t.dutyFullDay : t.dutyTimeRange(duty.start_time!.slice(0, 5), duty.end_time!.slice(0, 5))}
        </p>

        <div style={{ background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
          {rows.map((r, i) => (
            <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < rows.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
              <span style={{ fontSize: 12, color: '#6f7979' }}>{r.l}</span>
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{r.v}</span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>{t.dutyNote}</p>
      </div>
    </div>
  )
}

// ── Active trip card (prominent) ────────────────────────────
function ActiveTripCard({ trip: b, processing, onComplete }: {
  trip: DriverBooking; processing: string | null; onComplete: (id: string) => void
}) {
  const lang = useLang()
  const t    = MSG[lang]
  const isWait   = b.trip_type === 'WAITING'
  const statusBg = isWait ? '#EDE9FE' : '#D8F3DC'
  const statusC  = isWait ? '#4C1D95' : '#2D6A4F'
  const statusTx = isWait ? t.waitingAtDestination(b.wait_minutes) : t.tripInProgressStatus

  return (
    <div style={{ background: '#ffffff', borderRadius: 18, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
      {/* Status strip */}
      <div style={{ background: statusBg, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: statusC, margin: 0 }}>{statusTx}</p>
        <span style={{ fontSize: 12, color: statusC, opacity: 0.7, fontWeight: 500 }}>
          {format(new Date(b.scheduled_at), 'HH:mm')}
        </span>
      </div>

      <div style={{ padding: '18px 16px' }}>
        {/* Passenger */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.3px' }}>{b.passenger_name}</p>
            <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{b.booking_code}</p>
          </div>
          <TypeBadge type={b.trip_type} wait={b.wait_minutes} />
        </div>

        {/* Contact passenger */}
        <ContactPassengerButtons trip={b} />

        {/* Route */}
        <RouteBlock pickup={b.pickup} destination={b.destination} />

        <NavigateButton lat={b.destination_lat} lng={b.destination_lng} address={b.destination} label={t.navigateToDestination} />

        {b.notes && (
          <div style={{ background: '#ffdeac', border: '1px solid #FDE68A', borderRadius: 10, padding: '8px 12px', margin: '12px 0' }}>
            <p style={{ fontSize: 12, color: '#7e5700', margin: 0 }}>📝 {b.notes}</p>
          </div>
        )}

        {/* Map inside card */}
        <ActiveTripMap
          pickup={b.pickup}
          destination={b.destination}
          status={b.status}
          taxiColor={b.taxi_color || '#006064'}
          pickupLat={b.pickup_lat}
          pickupLng={b.pickup_lng}
          destLat={b.destination_lat}
          destLng={b.destination_lng}
        />

        <button
          onClick={() => onComplete(b.id)}
          disabled={processing === b.id}
          style={{ width: '100%', marginTop: 14, padding: '14px', background: processing === b.id ? 'rgba(0,0,0,0.08)' : '#006064', color: '#fff', border: 'none', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: processing === b.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          {processing === b.id ? t.completing : t.markCompletedBackAtBase}
        </button>
      </div>
    </div>
  )
}

// ── Trip detail card (for sheet + active tab next trip) ─────
function TripDetailCard({ trip: b, processing, onStart, onComplete }: {
  trip: DriverBooking; processing: string | null
  onStart?: (id: string) => void; onComplete?: (id: string) => void
}) {
  const lang = useLang()
  const t    = MSG[lang]
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 19, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.3px' }}>{b.passenger_name}</p>
          <p style={{ fontSize: 13, color: '#6f7979', margin: 0 }}>
            {format(new Date(b.scheduled_at), 'EEE, d MMM · HH:mm', { locale: idLocale })}
          </p>
        </div>
        <TypeBadge type={b.trip_type} wait={b.wait_minutes} />
      </div>

      <ContactPassengerButtons trip={b} />

      <RouteBlock pickup={b.pickup} destination={b.destination} />

      {b.status === 'booked' ? (
        <NavigateButton lat={b.pickup_lat} lng={b.pickup_lng} address={b.pickup} label={t.navigateToPickup} />
      ) : ['on_trip', 'waiting_trip'].includes(b.status) ? (
        <NavigateButton lat={b.destination_lat} lng={b.destination_lng} address={b.destination} label={t.navigateToDestination} />
      ) : null}

      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', margin: '12px 0' }}>
        {[
          { l: t.bookingId, v: b.booking_code },
          { l: t.tripType,  v: b.trip_type === 'DROP' ? t.dropOneWay : t.waitingMin(b.wait_minutes) },
          ...(b.notes ? [{ l: t.notes, v: b.notes }] : []),
        ].map((r, i, arr) => (
          <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
            <span style={{ fontSize: 12, color: '#6f7979' }}>{r.l}</span>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: r.l === t.bookingId ? 'monospace' : FONT, textAlign: 'right', maxWidth: '60%' }}>{r.v}</span>
          </div>
        ))}
      </div>

      {b.status === 'booked' && onStart && (() => {
        const earliestStart = new Date(b.scheduled_at).getTime() - 10 * 60 * 1000
        const tooEarly = Date.now() < earliestStart
        const isDisabled = processing === b.id || tooEarly
        return (
          <button
            onClick={() => !tooEarly && onStart(b.id)}
            disabled={isDisabled}
            style={{ width: '100%', padding: '13px', background: isDisabled ? 'rgba(0,0,0,0.08)' : '#006064', color: isDisabled ? '#9ca3af' : '#fff', border: 'none', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            {processing === b.id ? t.starting : tooEarly ? t.scheduledNotYet(format(new Date(b.scheduled_at), 'HH:mm')) : t.startTripPickup}
          </button>
        )
      })()}

      {['on_trip','waiting_trip'].includes(b.status) && onComplete && (
        <button
          onClick={() => onComplete(b.id)}
          disabled={processing === b.id}
          style={{ width: '100%', padding: '13px', background: processing === b.id ? 'rgba(0,0,0,0.08)' : '#2D6A4F', color: '#fff', border: 'none', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          {processing === b.id ? t.completing : t.markCompleted}
        </button>
      )}
    </div>
  )
}

// ── Trip row in list ────────────────────────────────────────
function TripRow({ trip: b, onTap, done }: { trip: DriverBooking; onTap?: () => void; done?: boolean }) {
  const lang = useLang()
  const t    = MSG[lang]
  const statusColor = done
    ? { bg: '#d8f3dc', color: '#344500', label: t.statusDone }
    : { bg: 'rgba(0,96,100,0.1)', color: '#006064', label: t.statusConfirmed }
  return (
    <div
      onClick={onTap}
      style={{
        background: '#ffffff',
        border: '1px solid rgba(0,0,0,0.06)',
        borderLeft: `3px solid ${done ? '#52B788' : '#006064'}`,
        borderRadius: 16,
        padding: '14px 14px 14px 14px',
        marginBottom: 10,
        cursor: onTap ? 'pointer' : 'default',
        boxShadow: '0 2px 8px rgba(0,96,100,0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 3px', color: '#1a1c1b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {b.passenger_name}
          </p>
          <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>
            {format(new Date(b.scheduled_at), 'EEE, d MMM · HH:mm', { locale: idLocale })} · {b.destination}
          </p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: statusColor.bg, color: statusColor.color, flexShrink: 0 }}>
          {statusColor.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8 }}>
        <TypeBadge type={b.trip_type} wait={b.wait_minutes} small />
        {b.pickup && <span style={{ fontSize: 11, color: '#9ca3af' }}>{t.fromPickup(b.pickup)}</span>}
      </div>
    </div>
  )
}

// ── Route block ─────────────────────────────────────────────
function RouteBlock({ pickup, destination }: { pickup: string; destination: string }) {
  const lang = useLang()
  const t    = MSG[lang]
  return (
    <div style={{ background: '#F5F5F2', borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#006064', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{t.pickup}</p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{pickup}</p>
        </div>
      </div>
      <div style={{ width: 1, height: 14, background: '#D1D5DB', marginLeft: 3, marginBottom: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#52B788', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{t.destination}</p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{destination}</p>
        </div>
      </div>
    </div>
  )
}

// ── Type badge ──────────────────────────────────────────────
function TypeBadge({ type, wait, small }: { type: string; wait: number; small?: boolean }) {
  const lang = useLang()
  const t    = MSG[lang]
  const isWait = type === 'WAITING'
  return (
    <span style={{
      fontSize: small ? 10 : 11, fontWeight: 700,
      padding: small ? '2px 7px' : '3px 10px',
      borderRadius: 9999, flexShrink: 0,
      background: isWait ? '#EDE9FE' : '#DBEAFE',
      color:      isWait ? '#4C1D95'  : '#1E3A5F',
    }}>
      {isWait ? t.waitBadge(wait) : t.dropBadge}
    </span>
  )
}

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '16px 0 8px' }}>
      {children}
    </p>
  )
}

// ── Passenger contact buttons (call + WhatsApp) ──────────────
function ContactPassengerButtons({ trip: b }: { trip: DriverBooking }) {
  const lang = useLang()
  const t    = MSG[lang]
  if (!b.passenger_phone) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
      <a
        href={`tel:${b.passenger_phone}`}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '12px 8px', background: '#EFF6FF', color: '#0369A1', border: '1px solid #BAE6FD', borderRadius: 16, fontSize: 13, fontWeight: 700, textDecoration: 'none', boxSizing: 'border-box', fontFamily: FONT }}
      >
        {t.callPassenger}
      </a>
      <a
        href={`https://wa.me/${toWaNumber(b.passenger_phone)}?text=${encodeURIComponent(t.waMessage(b.booking_code, b.pickup))}`}
        target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '12px 8px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 16, fontSize: 13, fontWeight: 700, textDecoration: 'none', boxSizing: 'border-box', fontFamily: FONT }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
        </svg>
        {t.whatsappPassenger}
      </a>
    </div>
  )
}

function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

// ── One-tap turn-by-turn navigation (opens Google Maps app or web) ──
function NavigateButton({ lat, lng, address, label }: {
  lat: number | null; lng: number | null; address: string; label: string
}) {
  const dest = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(address)
  const href = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`
  return (
    <a
      href={href}
      target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '12px 8px', background: '#EFF6FF', color: '#0369A1', border: '1px solid #BAE6FD', borderRadius: 16, fontSize: 13, fontWeight: 700, textDecoration: 'none', boxSizing: 'border-box', fontFamily: FONT, marginTop: 10 }}
    >
      🧭 {label}
    </a>
  )
}
