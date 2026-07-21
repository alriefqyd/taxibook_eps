'use client'

import { useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { Coords } from '@/lib/geocode'
import { useLang } from '@/lib/language'
import DateTimePicker from '@/components/DateTimePicker'

const MSG = {
  en: {
    title:          'New booking',
    step:           (n: number) => `Step ${n} of 3`,
    now:            '⚡  Now',
    schedule:       '📅  Schedule',
    taxiAssigned:   'Taxi will be assigned immediately after submission',
    noTaxiNow:      '⚠ No taxi available right now',
    dateTime:       'Date & time',
    pickupLoc:      'Pickup location',
    destination:    'Destination',
    notes:          'Notes (optional)',
    tapMap:         'Tap to pick on map...',
    change:         'Change',
    specialReq:     'Any special requests...',
    pickup:         'Pickup',
    dest:           'Destination',
    selectTrip:     'Select trip type',
    drop:           'Drop',
    dropSub:        'One-way, driver leaves',
    waiting:        'Waiting',
    waitSub:        'Driver waits for you',
    waitDuration:   'Waiting duration (minutes)',
    needsApproval:  '⚠ Coordinator approval required',
    autoAssigned:   '✓ Auto-assigned',
    over60:         'Waiting trips over 45 min need approval first.',
    bestDriver:     'Best available driver will be assigned automatically.',
    reviewConfirm:  'Review & confirm',
    when:           'When',
    rightNow:       '⚡ Right now',
    driverLock:     '🔒 Driver can start trip only from this time',
    tripType:       'Trip type',
    dropOneWay:     'Drop — one way',
    waitMin:        (n: number) => `Waiting — ${n} min`,
    sentCoord:      '⏳ Sent to coordinator for approval first.',
    assignedNow:    '⚡ Driver will be assigned immediately.',
    assignedAuto:   '✓ Driver will be assigned automatically.',
    nextTripType:   'Next — Trip type →',
    nextReview:     'Next — Review →',
    checkingAvail:  'Checking availability...',
    confirmBook:    'Confirm booking',
    findingDriver:  'Finding a Driver',
    pleaseWait:     'Please wait a moment...',
    errPickup:      'Please pick a pickup location on the map',
    errDest:        'Please pick a destination on the map',
    errDateTime:    'Please select date and time',
    errFuture:      'Booking time must be in the future.',
    errRestTime:    'Booking is not available between 12:00–13:00 (lunch/prayer break). Please choose another time.',
    noTaxiAll:      'No taxis available. All drivers are off duty.',
    checkFailed:    'Failed to check availability.',
    backToSchedule: 'Back to schedule',
    conflictPassenger: (time: string, dest: string) => `Conflict: you already have a booking at ${time} to ${dest}.`,
    conflictRoute:  (pickup: string, dest: string, time: string, name: string) =>
      `There is already a booking for this route (${pickup} → ${dest}) from ${time} by ${name}. Please join that booking instead.`,
    conflictUnknownPassenger: 'another passenger',
    passengerLabel: 'Passenger',
    driverLabel:    'Driver',
  },
  id: {
    title:          'Booking Baru',
    step:           (n: number) => `Langkah ${n} dari 3`,
    now:            '⚡  Sekarang',
    schedule:       '📅  Jadwalkan',
    taxiAssigned:   'Taksi akan langsung ditugaskan setelah dikirim',
    noTaxiNow:      '⚠ Tidak ada taksi tersedia saat ini',
    dateTime:       'Tanggal & waktu',
    pickupLoc:      'Lokasi Penjemputan',
    destination:    'Tujuan',
    notes:          'Catatan (opsional)',
    tapMap:         'Ketuk untuk pilih di peta...',
    change:         'Ubah',
    specialReq:     'Permintaan khusus...',
    pickup:         'Penjemputan',
    dest:           'Tujuan',
    selectTrip:     'Pilih jenis perjalanan',
    drop:           'Drop',
    dropSub:        'Satu arah, driver langsung pergi',
    waiting:        'Tunggu',
    waitSub:        'Driver menunggu Anda',
    waitDuration:   'Durasi tunggu (menit)',
    needsApproval:  '⚠ Perlu persetujuan koordinator',
    autoAssigned:   '✓ Otomatis ditugaskan',
    over60:         'Perjalanan tunggu lebih dari 45 menit perlu persetujuan.',
    bestDriver:     'Driver terbaik yang tersedia akan ditugaskan secara otomatis.',
    reviewConfirm:  'Tinjau & konfirmasi',
    when:           'Kapan',
    rightNow:       '⚡ Sekarang juga',
    driverLock:     '🔒 Driver hanya bisa mulai perjalanan dari waktu ini',
    tripType:       'Jenis perjalanan',
    dropOneWay:     'Drop — satu arah',
    waitMin:        (n: number) => `Tunggu — ${n} menit`,
    sentCoord:      '⏳ Dikirim ke koordinator untuk persetujuan terlebih dahulu.',
    assignedNow:    '⚡ Driver akan langsung ditugaskan.',
    assignedAuto:   '✓ Driver akan ditugaskan otomatis.',
    nextTripType:   'Lanjut — Jenis Perjalanan →',
    nextReview:     'Lanjut — Tinjau →',
    checkingAvail:  'Memeriksa ketersediaan...',
    confirmBook:    'Konfirmasi Booking',
    findingDriver:  'Mencari Driver',
    pleaseWait:     'Mohon tunggu sebentar...',
    errPickup:      'Pilih lokasi penjemputan di peta',
    errDest:        'Pilih tujuan di peta',
    errDateTime:    'Pilih tanggal dan waktu',
    errFuture:      'Waktu booking harus di masa mendatang.',
    errRestTime:    'Booking tidak tersedia antara jam 12:00–13:00 (istirahat/sholat). Silakan pilih waktu lain.',
    noTaxiAll:      'Tidak ada taksi tersedia. Semua driver sedang tidak bertugas.',
    checkFailed:    'Gagal memeriksa ketersediaan.',
    backToSchedule: 'Kembali ke jadwal',
    conflictPassenger: (time: string, dest: string) => `Konflik: Anda sudah punya booking jam ${time} ke ${dest}.`,
    conflictRoute:  (pickup: string, dest: string, time: string, name: string) =>
      `Sudah ada booking untuk rute ini (${pickup} → ${dest}) jam ${time} oleh ${name}. Silakan gabung ke booking tersebut.`,
    conflictUnknownPassenger: 'penumpang lain',
    passengerLabel: 'Penumpang',
    driverLabel:    'Driver',
  },
}

const LocationPickerMap = dynamic(() => import('@/components/map/LocationPickerMap'), { ssr: false })

type Step = 1 | 2 | 3
type TripType = 'DROP' | 'WAITING'
type BookingMode = 'now' | 'schedule'

interface FormData {
  mode:         BookingMode
  pickup:       string
  destination:  string
  notes:        string
  scheduled_at: string
  trip_type:    TripType
  wait_minutes: number
}

interface ConflictInfo {
  booking_code:     string
  pickup:           string
  destination:      string
  scheduled_at:     string
  auto_complete_at: string
  passenger_name:   string | null
  passenger_phone:  string | null
  driver_name:      string | null
  driver_phone:     string | null
}

function WaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  )
}

function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
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
  blue:        '#1E3A5F',
  blueBg:      '#DBEAFE',
}

export default function BookPage() {
  const router   = useRouter()
  const supabase = createClient()

  const lang = useLang()
  const t    = MSG[lang]

  const [step,        setStep]        = useState<Step>(1)
  const [loading,     setLoading]     = useState(false)
  const [checkingNow, setCheckingNow] = useState(false)
  const [error,       setError]       = useState('')
  const [conflict,    setConflict]    = useState<ConflictInfo | null>(null)
  const [noTaxiMsg,   setNoTaxiMsg]   = useState('')
  const [pickerField, setPickerField] = useState<'pickup' | 'destination' | null>(null)
  const [pickupCoords,  setPickupCoords]  = useState<Coords | null>(null)
  const [destCoords,    setDestCoords]    = useState<Coords | null>(null)
  const [form,        setForm]        = useState<FormData>({
    mode:         'now',
    pickup:       '',
    destination:  '',
    notes:        '',
    scheduled_at: defaultDateTime(),
    trip_type:    'DROP',
    wait_minutes: 30,
  })

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError(''); setConflict(null)
    if (key === 'mode') setNoTaxiMsg('')
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
        // Physical availability: is there a trip IN PROGRESS right now?
        // In progress = scheduled_at <= now AND auto_complete_at >= now
        const { data: inProgress } = await supabase
          .from('bookings').select('auto_complete_at')
          .eq('taxi_id', taxi.id)
          .in('status', ['booked','on_trip','waiting_trip'])
          .lte('scheduled_at', now.toISOString())
          .gte('auto_complete_at', now.toISOString())
          .limit(1).maybeSingle()

        if (!inProgress) {
          // No trip in progress — physically free right now
          freeTaxi = taxi; break
        }
        // Busy now — track next free time
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
    if (step === 1) {
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

  async function submit() {
    setLoading(true); setError(''); setConflict(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const user = session.user

      const scheduledDate = form.mode === 'now'
        ? new Date(Date.now() + 2 * 60000)
        : new Date(form.scheduled_at)

      if (form.mode === 'schedule' && scheduledDate <= new Date(Date.now() - 3 * 60000)) {
        setError(t.errFuture); setLoading(false); return
      }

      // Same passenger overlap pre-check — a passenger can't be in two places at once.
      // Server is the authoritative check; this gives quick pre-flight feedback.
      // Compared against passenger_end_at (not auto_complete_at) so a past DROP trip's
      // driver-return leg doesn't falsely block this new booking.
      const estimatedEnd = new Date(scheduledDate.getTime() + 3 * 60 * 60 * 1000)
      const { data: passengerConflicts } = await supabase.from('bookings')
        .select('booking_code, scheduled_at, destination')
        .eq('passenger_id', user.id)
        .not('status', 'in', '(rejected,cancelled,completed)')
        .lt('scheduled_at', estimatedEnd.toISOString())
        .gt('passenger_end_at', scheduledDate.toISOString())

      if (passengerConflicts?.length) {
        const c = passengerConflicts[0]
        const conflictTime = new Date(c.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        setError(t.conflictPassenger(conflictTime, c.destination))
        setLoading(false); return
      }

      // Note: the "same route, join booking" check is server-authoritative only (not pre-checked
      // client-side) — RLS only lets a staff user see their own bookings, so a client-side query
      // can't see other passengers' bookings to detect this conflict. See /api/bookings.

      const needsApproval = form.trip_type === 'WAITING' && form.wait_minutes > 45
      const status        = needsApproval ? 'pending_coordinator_approval' : 'submitted'

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
          status,
          is_now_trip:     form.mode === 'now',
          pickup_lat:      pickupCoords!.lat,
          pickup_lng:      pickupCoords!.lng,
          destination_lat: destCoords!.lat,
          destination_lng: destCoords!.lng,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (data.conflict) {
          setConflict(data.conflict)
          const conflictTime = new Date(data.conflict.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          setError(t.conflictRoute(data.conflict.pickup, data.conflict.destination, conflictTime, data.conflict.passenger_name || t.conflictUnknownPassenger))
        } else {
          setError(data.error || 'Failed to submit')
        }
        setLoading(false); return
      }

      const code = data.booking.booking_code
      const assigned = data.assigned
        ? `&taxi=${encodeURIComponent(data.taxi_name)}&driver=${encodeURIComponent(data.driver_name)}${data.driver_phone ? `&phone=${encodeURIComponent(data.driver_phone)}` : ''}` : ''
      const extra = `&pickup=${encodeURIComponent(form.pickup)}&dest=${encodeURIComponent(form.destination)}&time=${encodeURIComponent(scheduledDate.toISOString())}&type=${form.trip_type}${form.trip_type === 'WAITING' ? `&wait=${form.wait_minutes}` : ''}${form.notes ? `&notes=${encodeURIComponent(form.notes)}` : ''}`

      router.push(`/staff/success?code=${code}${assigned}${extra}`)
    } catch (e: any) {
      setError('Error: ' + e.message); setLoading(false)
    }
  }

  const needsApproval = form.trip_type === 'WAITING' && form.wait_minutes > 45

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", minHeight: '100vh', background: C.surface, WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Submit loading overlay ── */}
      {loading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#F5F5F2',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: "var(--font-inter), 'Inter', sans-serif",
        }}>
          <style>{`
            @keyframes carSlide {
              0%   { transform: translateX(-72px); }
              42%  { transform: translateX(72px); }
              50%  { transform: translateX(72px); }
              92%  { transform: translateX(-72px); }
              100% { transform: translateX(-72px); }
            }
            @keyframes roadMove {
              from { background-position-x: 0; }
              to   { background-position-x: 36px; }
            }
            @keyframes dotBounce {
              0%, 80%, 100% { transform: translateY(0); opacity: 0.25; }
              40%           { transform: translateY(-10px); opacity: 1; }
            }
          `}</style>

          {/* Road + car */}
          <div style={{ width: 200, height: 72, position: 'relative', marginBottom: 20 }}>
            <div style={{
              position: 'absolute', top: 4, left: '50%', marginLeft: -18,
              fontSize: 36, lineHeight: 1,
              animation: 'carSlide 2.4s ease-in-out infinite',
              display: 'inline-block',
            }}>
              🚕
            </div>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
              background: '#374151', borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: '50%', left: 0, right: 0, height: 3,
                transform: 'translateY(-50%)',
                backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.6) 0,rgba(255,255,255,0.6) 16px,transparent 16px,transparent 32px)',
                animation: 'roadMove 0.5s linear infinite',
              }} />
            </div>
          </div>

          {/* Bouncing dots */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {([0, 0.2, 0.4] as number[]).map((delay, i) => (
              <div key={i} style={{
                width: 9, height: 9, borderRadius: '50%', background: '#006064',
                animation: `dotBounce 1s ${delay}s ease-in-out infinite`,
              }} />
            ))}
          </div>

          <p style={{ fontSize: 20, fontWeight: 700, color: '#1a1c1b', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
            {t.findingDriver}
          </p>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
            {t.pleaseWait}
          </p>
        </div>
      )}

      {/* Location picker modal */}
      {pickerField && (
        <LocationPickerMap
          title={pickerField === 'pickup' ? t.pickupLoc : t.destination}
          autoGps={pickerField === 'pickup'}
          onClose={() => setPickerField(null)}
          onConfirm={(address, coords) => {
            if (pickerField === 'pickup') {
              update('pickup', address)
              setPickupCoords(coords)
            } else {
              update('destination', address)
              setDestCoords(coords)
            }
            setPickerField(null)
          }}
        />
      )}

      {/* ── Header ── */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '12px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14 }}>
          <button
            onClick={() => step === 1 ? router.push('/staff/home') : setStep(p => (p - 1) as Step)}
            style={{ width: 34, height: 34, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 16, color: C.textSecond, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >←</button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-0.2px', color: C.textPrimary }}>{t.title}</p>
            <p style={{ fontSize: 12, color: C.textTert, margin: 0 }}>{t.step(step)}</p>
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, paddingBottom: 0 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? C.black : C.border, transition: 'background 0.2s' }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 12px' }}>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 24, padding: '18px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 12 }}>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div>
            {/* Mode toggle */}
            <div style={{ background: C.surface2, borderRadius: 16, padding: 4, display: 'flex', gap: 4, marginBottom: 24 }}>
              {(['now','schedule'] as BookingMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => update('mode', m)}
                  style={{
                    flex: 1, padding: '10px 8px', border: 'none', borderRadius: 11,
                    cursor: 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif", fontWeight: 600, fontSize: 13,
                    transition: 'all 0.15s',
                    background: form.mode === m ? C.white : 'transparent',
                    color: form.mode === m ? C.textPrimary : C.textTert,
                    boxShadow: form.mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {m === 'now' ? t.now : t.schedule}
                </button>
              ))}
            </div>

            {/* Now status */}
            {form.mode === 'now' && !noTaxiMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: C.greenBg, border: `1px solid #B7E4C7`, borderRadius: 12, marginBottom: 20 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenMid, flexShrink: 0, display: 'inline-block' }} />
                <p style={{ fontSize: 12, color: C.green, margin: 0, fontWeight: 500 }}>
                  {t.taxiAssigned}
                </p>
              </div>
            )}

            {/* No taxi error */}
            {noTaxiMsg && (
              <div style={{ padding: '10px 14px', background: C.redBg, border: `1px solid #FECACA`, borderRadius: 12, marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.red, margin: '0 0 2px' }}>{t.noTaxiNow}</p>
                <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{noTaxiMsg}</p>
              </div>
            )}

            {/* DateTime — only for schedule */}
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

            {/* Route fields — map picker, editable once pinned */}
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
              <input type="text" value={form.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder={t.specialReq}
                style={inputSt} />
            </FG>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 20px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.selectTrip}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { val: 'DROP'    as TripType, icon: '→', title: t.drop,    sub: t.dropSub },
                { val: 'WAITING' as TripType, icon: '⏱', title: t.waiting, sub: t.waitSub },
              ].map(({ val, icon, title, sub }) => {
                const sel = form.trip_type === val
                return (
                  <div
                    key={val}
                    onClick={() => update('trip_type', val)}
                    style={{
                      border: `${sel ? 2 : 1.5}px solid ${sel ? C.black : C.border}`,
                      borderRadius: 16, padding: '18px 14px', textAlign: 'center',
                      cursor: 'pointer', background: sel ? C.surface : C.white,
                      transition: 'all 0.15s',
                    }}
                  >
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
                  <button onClick={() => update('wait_minutes', Math.max(15, form.wait_minutes - 15))}
                    style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${C.border}`, background: C.white, fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textPrimary }}>−</button>
                  <input type="number" min={1} max={480} value={form.wait_minutes}
                    onChange={e => update('wait_minutes', parseInt(e.target.value) || 30)}
                    style={{ ...inputSt, textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
                  <button onClick={() => update('wait_minutes', Math.min(480, form.wait_minutes + 15))}
                    style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${C.border}`, background: C.white, fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textPrimary }}>+</button>
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

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 16px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.reviewConfirm}</p>

            {/* Summary card */}
            <div style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
              {/* When row — highlighted */}
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border2}`, background: C.surface2 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textTert, margin: '0 0 4px' }}>{t.when}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: '0 0 3px', letterSpacing: '-0.2px' }}>
                  {form.mode === 'now' ? t.rightNow : formatDateTime(form.scheduled_at)}
                </p>
                {form.mode === 'schedule' && (
                  <p style={{ fontSize: 11, color: C.textTert, margin: 0 }}>
                    {t.driverLock}
                  </p>
                )}
              </div>

              {/* Route */}
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

              {/* Meta rows */}
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

            {/* Status notice — hidden while a submit error/conflict is showing below, since it
                would contradict the fact that the booking wasn't actually created */}
            {!error && (
              <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${needsApproval ? '#FDE68A' : '#B7E4C7'}`, background: needsApproval ? C.amberBg : C.greenBg, marginBottom: 4 }}>
                <p style={{ fontSize: 12, color: needsApproval ? C.amber : C.green, margin: 0 }}>
                  {needsApproval
                    ? t.sentCoord
                    : form.mode === 'now'
                      ? t.assignedNow
                      : t.assignedAuto}
                </p>
              </div>
            )}
          </div>
        )}

        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', background: C.redBg, border: `1px solid #FECACA`, borderRadius: 12, marginTop: 12 }}>
            <p style={{ fontSize: 12, color: C.red, margin: 0, fontWeight: 500 }}>{error}</p>

            {conflict && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'row', gap: 8 }}>
                {conflict.passenger_phone && (
                  <a
                    href={`https://wa.me/${toWaNumber(conflict.passenger_phone)}?text=${encodeURIComponent(`Halo ${conflict.passenger_name || ''}, saya juga mau ke ${conflict.destination} dari ${conflict.pickup}. Bisa gabung booking ${conflict.booking_code}?`)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 8px', background: '#25D366', color: '#fff', borderRadius: 12, fontSize: 12, fontWeight: 700, textDecoration: 'none', minWidth: 0 }}
                  >
                    <WaIcon />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conflict.passenger_name || t.passengerLabel}</span>
                  </a>
                )}
                {conflict.driver_phone && (
                  <a
                    href={`https://wa.me/${toWaNumber(conflict.driver_phone)}?text=${encodeURIComponent(`Halo ${conflict.driver_name || ''}, ada penumpang tambahan untuk booking ${conflict.booking_code} (${conflict.pickup} → ${conflict.destination}).`)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 8px', background: '#25D366', color: '#fff', borderRadius: 12, fontSize: 12, fontWeight: 700, textDecoration: 'none', minWidth: 0 }}
                  >
                    <WaIcon />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conflict.driver_name || t.driverLabel}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: 12 }}>
          {step < 3 ? (
            <button
              onClick={handleNext}
              disabled={checkingNow}
              style={{ width: '100%', padding: '14px 20px', background: checkingNow ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: checkingNow ? 'not-allowed' : 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif", letterSpacing: '-0.1px', transition: 'opacity 0.15s' }}
            >
              {checkingNow ? t.checkingAvail : step === 1 ? t.nextTripType : t.nextReview}
            </button>
          ) : conflict ? (
            <button
              onClick={() => router.push('/staff/home')}
              style={{ width: '100%', padding: '14px 20px', background: C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif", letterSpacing: '-0.1px' }}
            >
              {t.backToSchedule}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={loading}
              style={{ width: '100%', padding: '14px 20px', background: loading ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif", letterSpacing: '-0.1px' }}
            >
              {t.confirmBook}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Components ─────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────
function defaultDateTime() {
  const d = new Date()
  d.setSeconds(0, 0)
  // toISOString() is UTC — shift by the local offset first so the sliced
  // string reflects the browser's local wall-clock time (what <input type="datetime-local"> expects).
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function formatDateTime(s: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 14,
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 16,
  background: '#F5F5F2', color: '#006064',
  boxSizing: 'border-box', outline: 'none',
  transition: 'border-color 0.15s',
}
