'use client'

import { useEffect, useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { differenceInCalendarDays } from 'date-fns'
import type { Coords } from '@/lib/geocode'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'
import SwitchRow from '@/components/SwitchRow'
import DateTimePicker from '@/components/DateTimePicker'
import CalendarDatePicker from '@/components/CalendarDatePicker'

const MSG = {
  en: {
    title:         'Book a trip',
    step:          (n: number) => `Step ${n} of 3`,
    kindLabel:     'Booking type',
    kindTrip:      'Trip',
    kindDuty:      'Driver duty',
    selectTaxi:    'Select taxi',
    noTaxiForDuty: 'No taxis with a driver assigned',
    dutyDate:      'Date',
    repeatSwitch:     'Repeat every day',
    repeatSwitchDesc: 'Assign the same duty daily until an end date',
    untilDate:     'Until',
    recurringInfo: (n: number) => `This will assign the driver for ${n} day${n === 1 ? '' : 's'} in a row.`,
    rangeSwitch:      'Limit to specific hours',
    rangeSwitchDesc:  'Only block auto-assign during these hours, not the whole day',
    startTime:     'Start time',
    endTime:       'End time',
    dutyReason:      'Duty description (optional)',
    dutyReasonPh:    'e.g. VIP escort, site visit, security duty...',
    dutyWarning:      'Driver will not appear in auto-assign for this date. Coordinator can still manually assign them if needed.',
    dutyWarningRange: (s: string, e: string) => `Driver will not appear in auto-assign between ${s}–${e} on this date. Coordinator can still manually assign them if needed.`,
    confirmDuty:   'Confirm duty',
    errTaxi:       'Please select a taxi',
    errDutyDate:   'Please select a date',
    nextReviewDuty: 'Next — Review →',
    passenger:     'Passenger',
    when:          'When',
    now:           '⚡  Now',
    schedule:      '📅  Schedule',
    taxiAssigned:  'Taxi will be assigned immediately after submission',
    noTaxiNow:     '⚠ No taxi available right now',
    dateTime:      'Date & time',
    pickupLoc:     'Pickup location',
    destination:   'Destination',
    notes:         'Notes (optional)',
    tapMap:        'Tap to pick on map...',
    change:        'Change',
    specialReq:    'Any special requests...',
    pickup:        'Pickup',
    dest:          'Destination',
    selectTrip:    'Select trip type',
    drop:          'Drop',
    dropSub:       'One-way, driver leaves',
    waiting:       'Waiting',
    waitSub:       'Driver waits for passenger',
    waitDuration:  'Waiting duration (minutes)',
    needsApproval: '⚠ Coordinator approval required',
    autoAssigned:  '✓ Auto-assigned',
    over60:        'Waiting trips over 45 min need approval first.',
    bestDriver:    'Best available driver will be assigned automatically.',
    reviewConfirm: 'Review & confirm',
    passengerLabel:'Passenger',
    whenLabel:     'When',
    rightNow:      '⚡ Right now',
    driverLock:    '🔒 Driver can start trip only from this time',
    tripType:      'Trip type',
    dropOneWay:    'Drop — one way',
    waitMin:       (n: number) => `Waiting — ${n} min`,
    sentCoord:     '⏳ Sent to coordinator for approval first.',
    assignedNow:   '⚡ Driver will be assigned immediately.',
    assignedAuto:  '✓ Driver will be assigned automatically.',
    nextTripType:  'Next — Trip type →',
    nextReview:    'Next — Review →',
    checkingAvail: 'Checking availability...',
    confirmBook:   'Confirm booking',
    findingDriver: 'Assigning driver',
    pleaseWait:    'Please wait a moment...',
    errPassenger:  'Please select a passenger',
    errPickup:     'Please pick a pickup location on the map',
    errDest:       'Please pick a destination on the map',
    errDateTime:   'Please select date and time',
    errFuture:     'Booking time must be in the future.',
    errRestTime:   'Booking is not available between 12:00–13:00 (lunch/prayer break). Please choose another time.',
    noTaxiAll:     'No taxis available. All drivers are off duty.',
    checkFailed:   'Failed to check availability.',
  },
  id: {
    title:         'Buat Booking',
    step:          (n: number) => `Langkah ${n} dari 3`,
    kindLabel:     'Jenis booking',
    kindTrip:      'Perjalanan',
    kindDuty:      'Tugas Driver',
    selectTaxi:    'Pilih taksi',
    noTaxiForDuty: 'Tidak ada taksi dengan driver',
    dutyDate:      'Tanggal',
    repeatSwitch:     'Ulangi setiap hari',
    repeatSwitchDesc: 'Tugaskan hal yang sama tiap hari sampai tanggal akhir',
    untilDate:     'Sampai',
    recurringInfo: (n: number) => `Ini akan menugaskan driver selama ${n} hari berturut-turut.`,
    rangeSwitch:      'Batasi ke jam tertentu',
    rangeSwitchDesc:  'Hanya blokir auto-assign selama jam ini, bukan sepanjang hari',
    startTime:     'Jam mulai',
    endTime:       'Jam selesai',
    dutyReason:      'Keterangan tugas (opsional)',
    dutyReasonPh:    'mis. Pengawalan VIP, kunjungan site, tugas keamanan...',
    dutyWarning:      'Driver tidak akan muncul di auto-assign untuk tanggal ini. Koordinator tetap bisa assign manual jika dibutuhkan.',
    dutyWarningRange: (s: string, e: string) => `Driver tidak akan muncul di auto-assign antara ${s}–${e} pada tanggal ini. Koordinator tetap bisa assign manual jika dibutuhkan.`,
    confirmDuty:   'Konfirmasi tugas',
    errTaxi:       'Pilih taksi terlebih dahulu',
    errDutyDate:   'Pilih tanggal terlebih dahulu',
    nextReviewDuty: 'Lanjut — Tinjau →',
    passenger:     'Penumpang',
    when:          'Kapan',
    now:           '⚡  Sekarang',
    schedule:      '📅  Jadwalkan',
    taxiAssigned:  'Taksi akan langsung ditugaskan setelah dikirim',
    noTaxiNow:     '⚠ Tidak ada taksi tersedia saat ini',
    dateTime:      'Tanggal & waktu',
    pickupLoc:     'Lokasi Penjemputan',
    destination:   'Tujuan',
    notes:         'Catatan (opsional)',
    tapMap:        'Ketuk untuk pilih di peta...',
    change:        'Ubah',
    specialReq:    'Permintaan khusus...',
    pickup:        'Penjemputan',
    dest:          'Tujuan',
    selectTrip:    'Pilih jenis perjalanan',
    drop:          'Drop',
    dropSub:       'Satu arah, driver langsung pergi',
    waiting:       'Tunggu',
    waitSub:       'Driver menunggu penumpang',
    waitDuration:  'Durasi tunggu (menit)',
    needsApproval: '⚠ Perlu persetujuan koordinator',
    autoAssigned:  '✓ Otomatis ditugaskan',
    over60:        'Perjalanan tunggu lebih dari 45 menit perlu persetujuan.',
    bestDriver:    'Driver terbaik yang tersedia akan ditugaskan secara otomatis.',
    reviewConfirm: 'Tinjau & konfirmasi',
    passengerLabel:'Penumpang',
    whenLabel:     'Kapan',
    rightNow:      '⚡ Sekarang juga',
    driverLock:    '🔒 Driver hanya bisa mulai perjalanan dari waktu ini',
    tripType:      'Jenis perjalanan',
    dropOneWay:    'Drop — satu arah',
    waitMin:       (n: number) => `Tunggu — ${n} menit`,
    sentCoord:     '⏳ Dikirim ke koordinator untuk persetujuan terlebih dahulu.',
    assignedNow:   '⚡ Driver akan langsung ditugaskan.',
    assignedAuto:  '✓ Driver akan ditugaskan otomatis.',
    nextTripType:  'Lanjut — Jenis Perjalanan →',
    nextReview:    'Lanjut — Tinjau →',
    checkingAvail: 'Memeriksa ketersediaan...',
    confirmBook:   'Konfirmasi Booking',
    findingDriver: 'Menugaskan Driver',
    pleaseWait:    'Mohon tunggu sebentar...',
    errPassenger:  'Pilih penumpang terlebih dahulu',
    errPickup:     'Pilih lokasi penjemputan di peta',
    errDest:       'Pilih tujuan di peta',
    errDateTime:   'Pilih tanggal dan waktu',
    errFuture:     'Waktu booking harus di masa mendatang.',
    errRestTime:   'Booking tidak tersedia antara jam 12:00–13:00 (istirahat/sholat). Silakan pilih waktu lain.',
    noTaxiAll:     'Tidak ada taksi tersedia. Semua driver sedang tidak bertugas.',
    checkFailed:   'Gagal memeriksa ketersediaan.',
  },
}

const LocationPickerMap = dynamic(() => import('@/components/map/LocationPickerMap'), { ssr: false })

type Step = 1 | 2 | 3
type TripType = 'DROP' | 'WAITING'
type BookingMode = 'now' | 'schedule'
type BookingKind = 'trip' | 'duty'

interface StaffUser { id: string; name: string; email: string; role: string }
interface DutyTaxi { id: string; name: string; plate: string | null; driver_name: string | null }

interface FormData {
  mode:         BookingMode
  pickup:       string
  destination:  string
  notes:        string
  scheduled_at: string
  trip_type:    TripType
  wait_minutes: number
  passenger_id: string
}

const FONT = "var(--font-inter), 'Inter', sans-serif"

const C = {
  black:       '#006064',
  white:       '#f9f9f6',
  surface:     'rgba(0,0,0,0.04)',
  surface2:    '#ECEAE4',
  border:      'rgba(0,0,0,0.08)',
  border2:     '#C8C6C0',
  textPrimary: '#006064',
  textSecond:  '#3f4949',
  textTert:    '#9ca3af',
  green:       '#2D6A4F',
  greenBg:     '#D8F3DC',
  greenMid:    '#52B788',
  amber:       '#92400E',
  amberBg:     '#FEF3C7',
  red:         '#991B1B',
  redBg:       '#FEE2E2',
}

export default function CoordinatorBookPage() {
  const router   = useRouter()
  const supabase = createClient()

  const lang = useLang()
  const t    = MSG[lang]

  const [step,          setStep]          = useState<Step>(1)
  const [pageLoading,   setPageLoading]   = useState(true)
  const [loading,       setLoading]       = useState(false)
  const [checkingNow,   setCheckingNow]   = useState(false)
  const [error,         setError]         = useState('')
  const [noTaxiMsg,     setNoTaxiMsg]     = useState('')
  const [pickerField,   setPickerField]   = useState<'pickup' | 'destination' | null>(null)
  const [pickupCoords,  setPickupCoords]  = useState<Coords | null>(null)
  const [destCoords,    setDestCoords]    = useState<Coords | null>(null)
  const [staffUsers,      setStaffUsers]      = useState<StaffUser[]>([])
  const [passengerSearch, setPassengerSearch] = useState('')
  const [passengerFocused, setPassengerFocused] = useState(false)
  const [form,            setForm]            = useState<FormData>({
    mode:         'schedule',
    pickup:       '',
    destination:  '',
    notes:        '',
    scheduled_at: defaultDateTime(),
    trip_type:    'DROP',
    wait_minutes: 30,
    passenger_id: '',
  })

  // ── Driver duty (full-day / periodic) mode ──────────────────
  const [bookingKind,     setBookingKind]     = useState<BookingKind>('trip')
  const [dutyTaxis,       setDutyTaxis]       = useState<DutyTaxi[]>([])
  const [dutyTaxiId,      setDutyTaxiId]      = useState('')
  const [dutyTaxiSearch,  setDutyTaxiSearch]  = useState('')
  const [dutyTaxiFocused, setDutyTaxiFocused] = useState(false)
  const [dutyDate,        setDutyDate]        = useState(defaultDateOnly())
  const [dutyRepeat,      setDutyRepeat]      = useState(false)
  const [dutyEndDate,     setDutyEndDate]     = useState(defaultDateOnly())
  const [dutyRange,       setDutyRange]       = useState(false)
  const [dutyStartTime,   setDutyStartTime]   = useState('08:00')
  const [dutyEndTime,     setDutyEndTime]     = useState('17:00')
  const [dutyReason,      setDutyReason]      = useState('')

  useEffect(() => {
    async function loadUsers() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPageLoading(false); return }
      const res = await fetch('/api/users?roles=staff,coordinator', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const json = await res.json()
        const users = json.users || []
        setStaffUsers(users)
      }
      setPageLoading(false)
    }
    loadUsers()

    supabase
      .from('taxis')
      .select('id, name, plate, driver_id, users!driver_id(name)')
      .eq('is_active', true)
      .not('driver_id', 'is', null)
      .order('name')
      .then(({ data }) => {
        const rows = (data || []).map((tx: any) => ({
          id: tx.id, name: tx.name, plate: tx.plate, driver_name: tx.users?.name || null,
        }))
        setDutyTaxis(rows)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'mode') { setNoTaxiMsg(''); setError('') }
  }

  async function checkNowAvailability(): Promise<boolean> {
    setCheckingNow(true)
    setNoTaxiMsg('')
    try {
      const now = new Date()
      const { data: taxis } = await supabase
        .from('taxis').select('id, name')
        .eq('is_active', true).eq('is_available', true)
        .not('driver_id', 'is', null)

      if (!taxis?.length) {
        setNoTaxiMsg(t.noTaxiAll)
        setCheckingNow(false); return false
      }

      let freeTaxi: any = null
      let nextFreeAt: Date | null = null
      let nextName = ''

      for (const taxi of taxis) {
        const { data: inProgress } = await supabase
          .from('bookings').select('auto_complete_at')
          .eq('taxi_id', taxi.id)
          .in('status', ['booked','on_trip','waiting_trip'])
          .lte('scheduled_at', now.toISOString())
          .gte('auto_complete_at', now.toISOString())
          .limit(1).maybeSingle()

        if (!inProgress) { freeTaxi = taxi; break }
        const freeAt = new Date(inProgress.auto_complete_at)
        if (!nextFreeAt || freeAt < nextFreeAt) { nextFreeAt = freeAt; nextName = taxi.name }
      }

      setCheckingNow(false)
      if (freeTaxi) return true

      const nextTime = nextFreeAt
        ? nextFreeAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        : ''
      setNoTaxiMsg(`${t.noTaxiNow.replace('⚠ ', '')}${nextTime ? ` Next: ${nextName} at ${nextTime}.` : ''}`)
      return false
    } catch {
      setNoTaxiMsg(t.checkFailed)
      setCheckingNow(false); return false
    }
  }

  async function handleNext() {
    setError('')

    if (bookingKind === 'duty') {
      if (!dutyTaxiId)  { setError(t.errTaxi); return }
      if (!dutyDate)    { setError(t.errDutyDate); return }
      if (dutyRepeat && !dutyEndDate) { setError(t.errDutyDate); return }
      if (dutyRange && (!dutyStartTime || !dutyEndTime || dutyEndTime <= dutyStartTime)) { setError(t.errDutyDate); return }
      setStep(3) // duty mode has no trip-type step — skip straight to review
      return
    }

    if (step === 1) {
      if (!form.passenger_id) { setError(t.errPassenger); return }
      if (!pickupCoords) { setError(t.errPickup); return }
      if (!destCoords)   { setError(t.errDest); return }
      if (form.mode === 'schedule' && !form.scheduled_at) { setError(t.errDateTime); return }
      const checkDate = form.mode === 'now' ? new Date(Date.now() + 2 * 60000) : new Date(form.scheduled_at)
      const checkWitaHour = new Date(checkDate.getTime() + 8 * 3600000).getUTCHours()
      if (checkWitaHour === 12) { setError(t.errRestTime); return }
      if (form.mode === 'now') {
        const ok = await checkNowAvailability()
        if (!ok) return
      }
    }
    setStep(prev => (prev + 1) as Step)
  }

  async function submitDuty() {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const res = await fetch('/api/driver-day-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          taxi_id:      dutyTaxiId,
          assign_date:  dutyDate,
          repeat_until: dutyRepeat ? dutyEndDate : null,
          start_time:   dutyRange ? dutyStartTime : null,
          end_time:     dutyRange ? dutyEndTime : null,
          reason:       dutyReason || null,
          passenger_id: form.passenger_id || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to submit'); setLoading(false); return
      }

      const taxiInfo = dutyTaxis.find(tx => tx.id === dutyTaxiId)
      const params = new URLSearchParams({
        kind:  'duty',
        taxi:  taxiInfo?.name || '',
        driver: taxiInfo?.driver_name || '',
        date:  dutyDate,
        ...(dutyRepeat ? { endDate: dutyEndDate } : {}),
        ...(dutyRange ? { startTime: dutyStartTime, endTime: dutyEndTime } : {}),
        ...(dutyReason ? { reason: dutyReason } : {}),
      })
      router.push(`/coordinator/success?${params.toString()}`)
    } catch (e: any) {
      setError('Error: ' + e.message); setLoading(false)
    }
  }

  async function submit() {
    if (bookingKind === 'duty') { await submitDuty(); return }

    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const scheduledDate = form.mode === 'now'
        ? new Date(Date.now() + 2 * 60000)
        : new Date(form.scheduled_at)

      // Coordinators are exempt from overlap/destination conflict checks entirely — they may need
      // to serve multiple (possibly different) vendors with overlapping windows at once.
      // Server also skips this check for coordinators; see /api/bookings.

      const needsApproval = form.trip_type === 'WAITING' && form.wait_minutes > 45
      const bookingStatus = needsApproval ? 'pending_coordinator_approval' : 'submitted'

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          pickup:          form.pickup,
          destination:     form.destination,
          trip_type:       form.trip_type,
          wait_minutes:    form.trip_type === 'WAITING' ? form.wait_minutes : 0,
          notes:           form.notes || null,
          scheduled_at:    scheduledDate.toISOString(),
          status:          bookingStatus,
          is_now_trip:     form.mode === 'now',
          pickup_lat:      pickupCoords!.lat,
          pickup_lng:      pickupCoords!.lng,
          destination_lat: destCoords!.lat,
          destination_lng: destCoords!.lng,
          passenger_id:    form.passenger_id,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to submit'); setLoading(false); return
      }

      // Build success redirect URL with booking result info — same shape as the staff success page
      const code = data.booking.booking_code
      const assigned = data.assigned
        ? `&taxi=${encodeURIComponent(data.taxi_name)}&driver=${encodeURIComponent(data.driver_name)}${data.driver_phone ? `&phone=${encodeURIComponent(data.driver_phone)}` : ''}` : ''
      const extra = `&pickup=${encodeURIComponent(form.pickup)}&dest=${encodeURIComponent(form.destination)}&time=${encodeURIComponent(scheduledDate.toISOString())}&type=${form.trip_type}${form.trip_type === 'WAITING' ? `&wait=${form.wait_minutes}` : ''}${form.notes ? `&notes=${encodeURIComponent(form.notes)}` : ''}`

      router.push(`/coordinator/success?code=${code}${assigned}${extra}`)
    } catch (e: any) {
      setError('Error: ' + e.message); setLoading(false)
    }
  }

  const needsApproval = form.trip_type === 'WAITING' && form.wait_minutes > 45
  if (pageLoading) return <PageLoader />

  const selectedPassenger = staffUsers.find(u => u.id === form.passenger_id)
  const selectedDutyTaxi = dutyTaxis.find(tx => tx.id === dutyTaxiId)

  const totalSteps  = bookingKind === 'duty' ? 2 : 3
  const displayStep = bookingKind === 'duty' ? (step === 3 ? 2 : 1) : step
  const stepLabel = lang === 'id' ? `Langkah ${displayStep} dari ${totalSteps}` : `Step ${displayStep} of ${totalSteps}`

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: C.surface, WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Submit loading overlay ── */}
      {loading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#F5F5F2',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT,
        }}>
          <style>{`
            @keyframes carSlide { 0%{transform:translateX(-72px)} 42%{transform:translateX(72px)} 50%{transform:translateX(72px)} 92%{transform:translateX(-72px)} 100%{transform:translateX(-72px)} }
            @keyframes roadMove { from{background-position-x:0} to{background-position-x:36px} }
            @keyframes dotBounce { 0%,80%,100%{transform:translateY(0);opacity:0.25} 40%{transform:translateY(-10px);opacity:1} }
          `}</style>
          <div style={{ width: 200, height: 72, position: 'relative', marginBottom: 20 }}>
            <div style={{ position: 'absolute', top: 4, left: '50%', marginLeft: -18, fontSize: 36, lineHeight: 1, animation: 'carSlide 2.4s ease-in-out infinite', display: 'inline-block' }}>🚕</div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: '#374151', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 3, transform: 'translateY(-50%)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.6) 0,rgba(255,255,255,0.6) 16px,transparent 16px,transparent 32px)', animation: 'roadMove 0.5s linear infinite' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {([0, 0.2, 0.4] as number[]).map((delay, i) => (
              <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: '#006064', animation: `dotBounce 1s ${delay}s ease-in-out infinite` }} />
            ))}
          </div>
          <p style={{ fontSize: 20, fontWeight: 700, color: '#1a1c1b', margin: '0 0 6px', letterSpacing: '-0.3px' }}>{t.findingDriver}</p>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{t.pleaseWait}</p>
        </div>
      )}

      {pickerField && (
        <LocationPickerMap
          title={pickerField === 'pickup' ? t.pickupLoc : t.destination}
          autoGps={pickerField === 'pickup'}
          onClose={() => setPickerField(null)}
          onConfirm={(address, coords) => {
            if (pickerField === 'pickup') { update('pickup', address); setPickupCoords(coords) }
            else { update('destination', address); setDestCoords(coords) }
            setPickerField(null)
          }}
        />
      )}

      {/* Header */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '12px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14 }}>
          <button
            onClick={() => {
              if (step === 1) { router.push('/coordinator/home') }
              else if (bookingKind === 'duty' && step === 3) { setStep(1) }
              else { setStep(p => (p - 1) as Step) }
            }}
            style={{ width: 34, height: 34, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 16, color: C.textSecond, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >←</button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-0.2px', color: C.textPrimary }}>{t.title}</p>
            <p style={{ fontSize: 12, color: C.textTert, margin: 0 }}>{stepLabel}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, paddingBottom: 0 }}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(i => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= displayStep ? C.black : C.border, transition: 'background 0.2s' }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 12px' }}>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 24, padding: '18px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 12 }}>

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            {/* Booking type toggle */}
            <FG label={t.kindLabel}>
              <div style={{ background: C.surface2, borderRadius: 16, padding: 4, display: 'flex', gap: 4 }}>
                {(['trip','duty'] as BookingKind[]).map(k => (
                  <button key={k} onClick={() => { setBookingKind(k); setError('') }} style={{ flex: 1, padding: '10px 8px', border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13, background: bookingKind === k ? C.white : 'transparent', color: bookingKind === k ? C.textPrimary : C.textTert, boxShadow: bookingKind === k ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                    {k === 'trip' ? t.kindTrip : t.kindDuty}
                  </button>
                ))}
              </div>
            </FG>

            {/* Passenger selector — select-style dropdown, empty by default, filters by name */}
            <FG label={t.passenger}>
              <input
                type="text"
                value={passengerSearch}
                onFocus={() => setPassengerFocused(true)}
                onBlur={() => setPassengerFocused(false)}
                onChange={e => { setPassengerSearch(e.target.value); update('passenger_id', '') }}
                placeholder={lang === 'id' ? 'Pilih penumpang...' : 'Select passenger...'}
                style={{ ...inputSt, borderColor: form.passenger_id ? C.black : C.border2 }}
              />
              {passengerFocused && (
                <div
                  onMouseDown={e => e.preventDefault()}
                  style={{ border: `1px solid ${C.border2}`, borderRadius: 12, marginTop: 4, overflow: 'hidden', background: '#fff', maxHeight: 200, overflowY: 'auto' }}
                >
                  {staffUsers
                    .filter(u => !passengerSearch || u.name.toLowerCase().includes(passengerSearch.toLowerCase()))
                    .map(u => (
                      <div
                        key={u.id}
                        onClick={() => { update('passenger_id', u.id); setPassengerSearch(u.name); setPassengerFocused(false) }}
                        style={{ padding: '11px 14px', fontSize: 14, cursor: 'pointer', borderBottom: `1px solid ${C.border}`, color: C.textPrimary, fontWeight: 500 }}
                      >
                        {u.name}
                      </div>
                    ))}
                  {staffUsers.filter(u => !passengerSearch || u.name.toLowerCase().includes(passengerSearch.toLowerCase())).length === 0 && (
                    <div style={{ padding: '11px 14px', fontSize: 13, color: C.textTert }}>
                      {lang === 'id' ? 'Tidak ditemukan' : 'No results'}
                    </div>
                  )}
                </div>
              )}
            </FG>

            {bookingKind === 'duty' ? (
              <>
                {/* Taxi selector — select-style dropdown, empty by default, filters by taxi or driver name */}
                <FG label={t.selectTaxi}>
                  {dutyTaxis.length === 0 ? (
                    <p style={{ fontSize: 13, color: C.textTert, margin: 0 }}>{t.noTaxiForDuty}</p>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={dutyTaxiSearch}
                        onFocus={() => setDutyTaxiFocused(true)}
                        onBlur={() => setDutyTaxiFocused(false)}
                        onChange={e => { setDutyTaxiSearch(e.target.value); setDutyTaxiId('') }}
                        placeholder={lang === 'id' ? 'Pilih taksi...' : 'Select taxi...'}
                        style={{ ...inputSt, borderColor: dutyTaxiId ? C.black : C.border2 }}
                      />
                      {dutyTaxiFocused && (
                        <div
                          onMouseDown={e => e.preventDefault()}
                          style={{ border: `1px solid ${C.border2}`, borderRadius: 12, marginTop: 4, overflow: 'hidden', background: '#fff', maxHeight: 220, overflowY: 'auto' }}
                        >
                          {dutyTaxis
                            .filter(tx => !dutyTaxiSearch
                              || tx.name.toLowerCase().includes(dutyTaxiSearch.toLowerCase())
                              || (tx.driver_name || '').toLowerCase().includes(dutyTaxiSearch.toLowerCase()))
                            .map(tx => (
                              <div
                                key={tx.id}
                                onClick={() => { setDutyTaxiId(tx.id); setDutyTaxiSearch(`${tx.name}${tx.driver_name ? ` — ${tx.driver_name}` : ''}`); setDutyTaxiFocused(false) }}
                                style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
                              >
                                <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: C.textPrimary }}>{tx.name}{tx.plate ? ` · ${tx.plate}` : ''}</p>
                                <p style={{ fontSize: 12, color: C.textSecond, margin: '2px 0 0' }}>{tx.driver_name}</p>
                              </div>
                            ))}
                          {dutyTaxis.filter(tx => !dutyTaxiSearch
                            || tx.name.toLowerCase().includes(dutyTaxiSearch.toLowerCase())
                            || (tx.driver_name || '').toLowerCase().includes(dutyTaxiSearch.toLowerCase())).length === 0 && (
                            <div style={{ padding: '11px 14px', fontSize: 13, color: C.textTert }}>
                              {lang === 'id' ? 'Tidak ditemukan' : 'No results'}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </FG>

                <FG label={t.dutyDate}>
                  <CalendarDatePicker
                    value={dutyDate}
                    onChange={v => { setDutyDate(v); if (dutyEndDate < v) setDutyEndDate(v) }}
                    min={defaultDateOnly()}
                    lang={lang}
                    color={C.black}
                    border={C.border}
                    textPrimary={C.textPrimary}
                    textTert={C.textTert}
                  />
                </FG>

                <SwitchRow
                  label={t.repeatSwitch} description={t.repeatSwitchDesc}
                  checked={dutyRepeat} onChange={setDutyRepeat}
                  color={C.black} border={C.border2} text={C.textPrimary} textMuted={C.textTert} surface={C.white}
                />
                {dutyRepeat && (
                  <div style={{ marginTop: -6, marginBottom: 14, paddingLeft: 4 }}>
                    <FG label={t.untilDate}>
                      <CalendarDatePicker
                        value={dutyEndDate}
                        onChange={setDutyEndDate}
                        min={dutyDate}
                        lang={lang}
                        color={C.black}
                        border={C.border}
                        textPrimary={C.textPrimary}
                        textTert={C.textTert}
                      />
                    </FG>
                    {dutyDate && dutyEndDate && (
                      <p style={{ fontSize: 12, color: C.textTert, margin: '-10px 0 0' }}>
                        {t.recurringInfo(differenceInCalendarDays(new Date(dutyEndDate), new Date(dutyDate)) + 1)}
                      </p>
                    )}
                  </div>
                )}

                <SwitchRow
                  label={t.rangeSwitch} description={t.rangeSwitchDesc}
                  checked={dutyRange} onChange={setDutyRange}
                  color={C.black} border={C.border2} text={C.textPrimary} textMuted={C.textTert} surface={C.white}
                />
                {dutyRange && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: -6, marginBottom: 14, paddingLeft: 4 }}>
                    <FG label={t.startTime}>
                      <input type="time" value={dutyStartTime} onChange={e => setDutyStartTime(e.target.value)} style={inputSt} />
                    </FG>
                    <FG label={t.endTime}>
                      <input type="time" value={dutyEndTime} onChange={e => setDutyEndTime(e.target.value)} style={inputSt} />
                    </FG>
                  </div>
                )}

                <FG label={t.dutyReason}>
                  <input type="text" value={dutyReason} onChange={e => setDutyReason(e.target.value)} placeholder={t.dutyReasonPh} style={inputSt} />
                </FG>

                <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid #FDE68A`, background: C.amberBg }}>
                  <p style={{ fontSize: 12, color: C.amber, margin: 0 }}>
                    {dutyRange ? t.dutyWarningRange(dutyStartTime, dutyEndTime) : t.dutyWarning}
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Mode toggle */}
                <FG label={t.when}>
                  <div style={{ background: C.surface2, borderRadius: 16, padding: 4, display: 'flex', gap: 4 }}>
                    {(['now','schedule'] as BookingMode[]).map(m => (
                      <button key={m} onClick={() => update('mode', m)} style={{ flex: 1, padding: '10px 8px', border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13, background: form.mode === m ? C.white : 'transparent', color: form.mode === m ? C.textPrimary : C.textTert, boxShadow: form.mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                        {m === 'now' ? t.now : t.schedule}
                      </button>
                    ))}
                  </div>
                </FG>

                {/* Now status */}
                {form.mode === 'now' && !noTaxiMsg && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: C.greenBg, border: `1px solid #B7E4C7`, borderRadius: 12, marginBottom: 16 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenMid, flexShrink: 0, display: 'inline-block' }} />
                    <p style={{ fontSize: 12, color: C.green, margin: 0, fontWeight: 500 }}>
                      {t.taxiAssigned}
                    </p>
                  </div>
                )}

                {/* No taxi error */}
                {noTaxiMsg && (
                  <div style={{ padding: '10px 14px', background: C.redBg, border: `1px solid #FECACA`, borderRadius: 12, marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: C.red, margin: '0 0 2px' }}>{t.noTaxiNow}</p>
                    <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{noTaxiMsg}</p>
                  </div>
                )}

                {form.mode === 'schedule' && (
                  <FG label={t.dateTime}>
                    <DateTimePicker
                      value={form.scheduled_at}
                      onChange={v => update('scheduled_at', v)}
                      min={defaultDateTime()}
                      lang={lang}
                      color={C.black}
                      border={C.border}
                      textPrimary={C.textPrimary}
                      textTert={C.textTert}
                    />
                  </FG>
                )}

                <FG label={t.pickupLoc}>
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: C.white, border: `1.5px solid ${pickupCoords ? C.black : C.border}`, borderRadius: 16, padding: '12px 14px', fontFamily: FONT }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>📍</span>
                    {pickupCoords ? (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 10, color: C.textTert, margin: '0 0 2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.pickup}</p>
                        <input
                          type="text"
                          value={form.pickup}
                          onChange={e => update('pickup', e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', padding: 0, fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FONT }}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPickerField('pickup')}
                        style={{ flex: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}
                      >
                        <p style={{ fontSize: 14, color: C.textTert, margin: 0 }}>{t.tapMap}</p>
                      </button>
                    )}
                    {pickupCoords && (
                      <button
                        type="button"
                        onClick={() => setPickerField('pickup')}
                        style={{ fontSize: 11, color: C.textTert, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT }}
                      >
                        {t.change}
                      </button>
                    )}
                  </div>
                </FG>

                <FG label={t.destination}>
                  <button
                    type="button"
                    onClick={() => setPickerField('destination')}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: C.white, border: `1.5px solid ${destCoords ? C.black : C.border}`, borderRadius: 16, padding: '12px 14px', cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>🏁</span>
                    <div style={{ flex: 1 }}>
                      {destCoords ? (
                        <>
                          <p style={{ fontSize: 10, color: C.textTert, margin: '0 0 2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.dest}</p>
                          <p style={{ fontSize: 13, color: C.textPrimary, margin: 0, fontWeight: 600 }}>{form.destination}</p>
                        </>
                      ) : (
                        <p style={{ fontSize: 14, color: C.textTert, margin: 0 }}>{t.tapMap}</p>
                      )}
                    </div>
                    {destCoords && <span style={{ fontSize: 11, color: C.textTert, flexShrink: 0 }}>{t.change}</span>}
                  </button>
                </FG>

                <FG label={t.notes}>
                  <input type="text" value={form.notes} onChange={e => update('notes', e.target.value)} placeholder={t.specialReq} style={inputSt} />
                </FG>
              </>
            )}
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 20px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.selectTrip}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {([
                { val: 'DROP'    as TripType, icon: '→', title: t.drop,    sub: t.dropSub },
                { val: 'WAITING' as TripType, icon: '⏱', title: t.waiting, sub: t.waitSub },
              ]).map(({ val, icon, title, sub }) => {
                const sel = form.trip_type === val
                return (
                  <div key={val} onClick={() => update('trip_type', val)} style={{ border: `${sel ? 2 : 1.5}px solid ${sel ? C.black : C.border}`, borderRadius: 16, padding: '18px 14px', textAlign: 'center', cursor: 'pointer', background: sel ? C.surface : C.white }}>
                    <p style={{ fontSize: 26, margin: '0 0 10px' }}>{icon}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, margin: '0 0 4px' }}>{title}</p>
                    <p style={{ fontSize: 11, color: C.textSecond, margin: 0, lineHeight: 1.4 }}>{sub}</p>
                  </div>
                )
              })}
            </div>

            {form.trip_type === 'WAITING' && (
              <FG label={t.waitDuration}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => update('wait_minutes', Math.max(15, form.wait_minutes - 15))} style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${C.border}`, background: C.white, fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textPrimary }}>−</button>
                  <input type="number" min={1} max={480} value={form.wait_minutes} onChange={e => update('wait_minutes', parseInt(e.target.value) || 30)} style={{ ...inputSt, textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
                  <button onClick={() => update('wait_minutes', Math.min(480, form.wait_minutes + 15))} style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${C.border}`, background: C.white, fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textPrimary }}>+</button>
                </div>
              </FG>
            )}

            <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${needsApproval ? '#FDE68A' : '#B7E4C7'}`, background: needsApproval ? C.amberBg : C.greenBg }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: needsApproval ? C.amber : C.green, margin: '0 0 2px' }}>
                {needsApproval ? t.needsApproval : t.autoAssigned}
              </p>
              <p style={{ fontSize: 11, color: needsApproval ? C.amber : C.green, margin: 0 }}>
                {needsApproval ? t.over60 : t.bestDriver}
              </p>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && bookingKind === 'duty' && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 16px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.reviewConfirm}</p>
            <div style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border2}`, background: C.surface2 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textTert, margin: '0 0 4px' }}>{t.selectTaxi}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0 }}>{selectedDutyTaxi?.name || '—'}</p>
                <p style={{ fontSize: 12, color: C.textSecond, margin: '2px 0 0' }}>{selectedDutyTaxi?.driver_name}</p>
              </div>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textTert, margin: '0 0 4px' }}>{t.dutyDate}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0, letterSpacing: '-0.2px' }}>
                  {dutyRepeat ? `${formatDateOnly(dutyDate)} – ${formatDateOnly(dutyEndDate)}` : formatDateOnly(dutyDate)}
                </p>
                {dutyRange && (
                  <p style={{ fontSize: 12, color: C.textTert, margin: '3px 0 0' }}>{dutyStartTime}–{dutyEndTime}</p>
                )}
              </div>
              {[
                { label: t.passengerLabel, value: selectedPassenger?.name || '—' },
                ...(dutyReason ? [{ label: t.dutyReason.replace(' (optional)', '').replace(' (opsional)', ''), value: dutyReason }] : []),
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ fontSize: 12, color: C.textSecond }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, textAlign: 'right', maxWidth: '60%' }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #FDE68A', background: C.amberBg }}>
              <p style={{ fontSize: 12, color: C.amber, margin: 0 }}>
                {dutyRange ? t.dutyWarningRange(dutyStartTime, dutyEndTime) : t.dutyWarning}
              </p>
            </div>
          </div>
        )}

        {step === 3 && bookingKind === 'trip' && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 16px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.reviewConfirm}</p>
            <div style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border2}`, background: C.surface2 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textTert, margin: '0 0 4px' }}>{t.passengerLabel}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0 }}>{selectedPassenger?.name || '—'}</p>
              </div>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textTert, margin: '0 0 4px' }}>{t.whenLabel}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: '0 0 3px', letterSpacing: '-0.2px' }}>
                  {form.mode === 'now' ? t.rightNow : formatDateTime(form.scheduled_at)}
                </p>
                {form.mode === 'schedule' && (
                  <p style={{ fontSize: 11, color: C.textTert, margin: 0 }}>
                    {t.driverLock}
                  </p>
                )}
              </div>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.black, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 10, color: C.textTert, margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.pickup}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, margin: 0 }}>{form.pickup}</p>
                  </div>
                </div>
                <div style={{ width: 1, height: 14, background: C.border, marginLeft: 3, marginBottom: 10 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.greenMid, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 10, color: C.textTert, margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.dest}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, margin: 0 }}>{form.destination}</p>
                  </div>
                </div>
              </div>
              {[
                { label: t.tripType, value: form.trip_type === 'DROP' ? t.dropOneWay : t.waitMin(form.wait_minutes) },
                ...(form.notes ? [{ label: 'Notes', value: form.notes }] : []),
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ fontSize: 12, color: C.textSecond }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, textAlign: 'right', maxWidth: '60%' }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${needsApproval ? '#FDE68A' : '#B7E4C7'}`, background: needsApproval ? C.amberBg : C.greenBg, marginBottom: 4 }}>
              <p style={{ fontSize: 12, color: needsApproval ? C.amber : C.green, margin: 0 }}>
                {needsApproval
                  ? t.sentCoord
                  : form.mode === 'now'
                    ? t.assignedNow
                    : t.assignedAuto}
              </p>
            </div>
          </div>
        )}

        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: C.redBg, border: `1px solid #FECACA`, borderRadius: 12, marginTop: 12 }}>
            <p style={{ fontSize: 12, color: C.red, margin: 0, fontWeight: 500 }}>{error}</p>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {step < 3 ? (
            <button
              onClick={handleNext}
              disabled={checkingNow}
              style={{ width: '100%', padding: '14px 20px', background: checkingNow ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: checkingNow ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
              {checkingNow ? t.checkingAvail : bookingKind === 'duty' ? t.nextReviewDuty : step === 1 ? t.nextTripType : t.nextReview}
            </button>
          ) : (
            <button onClick={submit} disabled={loading} style={{ width: '100%', padding: '14px 20px', background: loading ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
              {loading ? t.checkingAvail : bookingKind === 'duty' ? t.confirmDuty : t.confirmBook}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FG({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function defaultDateTime() {
  const d = new Date(); d.setSeconds(0, 0)
  // toISOString() is UTC — shift by the local offset first so the sliced
  // string reflects the browser's local wall-clock time (what <input type="datetime-local"> expects).
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function formatDateTime(s: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// WITA-aware 'yyyy-MM-dd' for date-only pickers (driver duty)
function defaultDateOnly() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function formatDateOnly(s: string) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 14,
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 16,
  background: '#F5F5F2', color: '#006064',
  boxSizing: 'border-box', outline: 'none',
}
