'use client'

import { useEffect, useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { Coords } from '@/lib/geocode'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'

const MSG = {
  en: {
    title:         'Book a trip',
    step:          (n: number) => `Step ${n} of 3`,
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
    over60:        'Waiting trips over 60 min need approval first.',
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
    noTaxiAll:     'No taxis available. All drivers are off duty.',
    checkFailed:   'Failed to check availability.',
  },
  id: {
    title:         'Buat Booking',
    step:          (n: number) => `Langkah ${n} dari 3`,
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
    over60:        'Perjalanan tunggu lebih dari 60 menit perlu persetujuan.',
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
    noTaxiAll:     'Tidak ada taksi tersedia. Semua driver sedang tidak bertugas.',
    checkFailed:   'Gagal memeriksa ketersediaan.',
  },
}

const LocationPickerMap = dynamic(() => import('@/components/map/LocationPickerMap'), { ssr: false })

type Step = 1 | 2 | 3
type TripType = 'DROP' | 'WAITING'
type BookingMode = 'now' | 'schedule'

interface StaffUser { id: string; name: string; email: string; role: string }

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
  const [staffUsers,    setStaffUsers]    = useState<StaffUser[]>([])
  const [form,          setForm]          = useState<FormData>({
    mode:         'schedule',
    pickup:       '',
    destination:  '',
    notes:        '',
    scheduled_at: defaultDateTime(),
    trip_type:    'DROP',
    wait_minutes: 30,
    passenger_id: '',
  })

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
        if (users.length) setForm(f => ({ ...f, passenger_id: users[0].id }))
      }
      setPageLoading(false)
    }
    loadUsers()
  }, [])

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
    if (step === 1) {
      if (!form.passenger_id) { setError(t.errPassenger); return }
      if (!pickupCoords) { setError(t.errPickup); return }
      if (!destCoords)   { setError(t.errDest); return }
      if (form.mode === 'now') {
        const ok = await checkNowAvailability()
        if (!ok) return
      } else {
        if (!form.scheduled_at) { setError(t.errDateTime); return }
      }
    }
    setStep(prev => (prev + 1) as Step)
  }

  async function submit() {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const scheduledDate = form.mode === 'now'
        ? new Date(Date.now() + 2 * 60000)
        : new Date(form.scheduled_at)

      // Client-side conflict pre-check
      const estimatedEnd = new Date(scheduledDate.getTime() + 3 * 60 * 60 * 1000)
      const { data: conflicts } = await supabase.from('bookings')
        .select('booking_code, scheduled_at, destination')
        .eq('passenger_id', form.passenger_id)
        .not('status', 'in', '(rejected,cancelled,completed)')
        .lt('scheduled_at', estimatedEnd.toISOString())
        .gt('auto_complete_at', scheduledDate.toISOString())

      if (conflicts?.length) {
        const c = conflicts[0]
        const t = new Date(c.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        setError(`Conflict: ${selectedPassenger?.name || 'Passenger'} already has a booking at ${t} to ${c.destination}.`)
        setLoading(false); return
      }

      const needsApproval = form.trip_type === 'WAITING' && form.wait_minutes > 60
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

      // Build success redirect URL with booking result info
      const code = data.booking.booking_code
      if (data.assigned) {
        router.push(
          `/coordinator/home?booked=${code}&taxi=${encodeURIComponent(data.taxi_name)}&driver=${encodeURIComponent(data.driver_name)}${data.driver_phone ? `&phone=${encodeURIComponent(data.driver_phone)}` : ''}`
        )
      } else {
        router.push(`/coordinator/home?booked=${code}&pending=${needsApproval ? '1' : '0'}`)
      }
    } catch (e: any) {
      setError('Error: ' + e.message); setLoading(false)
    }
  }

  const needsApproval = form.trip_type === 'WAITING' && form.wait_minutes > 60
  if (pageLoading) return <PageLoader />

  const selectedPassenger = staffUsers.find(u => u.id === form.passenger_id)

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
            onClick={() => step === 1 ? router.push('/coordinator/home') : setStep(p => (p - 1) as Step)}
            style={{ width: 34, height: 34, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 16, color: C.textSecond, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >←</button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-0.2px', color: C.textPrimary }}>{t.title}</p>
            <p style={{ fontSize: 12, color: C.textTert, margin: 0 }}>{t.step(step)}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, paddingBottom: 0 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? C.black : C.border, transition: 'background 0.2s' }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 20px 32px' }}>

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            {/* Passenger selector */}
            <FG label={t.passenger}>
              <select
                value={form.passenger_id}
                onChange={e => update('passenger_id', e.target.value)}
                style={{ ...inputSt, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23006064\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: 36 }}
              >
                {staffUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </FG>

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
                <input type="datetime-local" value={form.scheduled_at} onChange={e => update('scheduled_at', e.target.value)} min={new Date().toISOString().slice(0,16)} style={inputSt} />
              </FG>
            )}

            <FG label={t.pickupLoc}>
              <button
                type="button"
                onClick={() => setPickerField('pickup')}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: C.white, border: `1.5px solid ${pickupCoords ? C.black : C.border}`, borderRadius: 16, padding: '12px 14px', cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>📍</span>
                <div style={{ flex: 1 }}>
                  {pickupCoords ? (
                    <>
                      <p style={{ fontSize: 10, color: C.textTert, margin: '0 0 2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.pickup}</p>
                      <p style={{ fontSize: 13, color: C.textPrimary, margin: 0, fontWeight: 600 }}>{form.pickup}</p>
                    </>
                  ) : (
                    <p style={{ fontSize: 14, color: C.textTert, margin: 0 }}>{t.tapMap}</p>
                  )}
                </div>
                {pickupCoords && <span style={{ fontSize: 11, color: C.textTert, flexShrink: 0 }}>{t.change}</span>}
              </button>
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
        {step === 3 && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 16px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.reviewConfirm}</p>
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface }}>
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

        {error && (
          <div style={{ padding: '10px 14px', background: C.redBg, border: `1px solid #FECACA`, borderRadius: 12, marginTop: 12 }}>
            <p style={{ fontSize: 12, color: C.red, margin: 0, fontWeight: 500 }}>{error}</p>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          {step < 3 ? (
            <button
              onClick={handleNext}
              disabled={checkingNow}
              style={{ width: '100%', padding: '14px 20px', background: checkingNow ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: checkingNow ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
              {checkingNow ? t.checkingAvail : step === 1 ? t.nextTripType : t.nextReview}
            </button>
          ) : (
            <button onClick={submit} disabled={loading} style={{ width: '100%', padding: '14px 20px', background: loading ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
              {loading ? t.checkingAvail : t.confirmBook}
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
  return d.toISOString().slice(0, 16)
}

function formatDateTime(s: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 14,
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 16,
  background: '#F5F5F2', color: '#006064',
  boxSizing: 'border-box', outline: 'none',
}
