'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { Coords } from '@/lib/geocode'

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

  const [step,          setStep]          = useState<Step>(1)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [pickerField,   setPickerField]   = useState<'pickup' | 'destination' | null>(null)
  const [pickupCoords,  setPickupCoords]  = useState<Coords | null>(null)
  const [destCoords,    setDestCoords]    = useState<Coords | null>(null)
  const [staffUsers,    setStaffUsers]    = useState<StaffUser[]>([])
  const [form,          setForm]          = useState<FormData>({
    mode:         'schedule',
    pickup:       'Engineering Office',
    destination:  '',
    notes:        '',
    scheduled_at: defaultDateTime(),
    trip_type:    'DROP',
    wait_minutes: 30,
    passenger_id: '',
  })

  useEffect(() => {
    supabase
      .from('users')
      .select('id, name, email, role')
      .in('role', ['staff', 'coordinator'])
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setStaffUsers(data || [])
        if (data?.length) setForm(f => ({ ...f, passenger_id: data[0].id }))
      })
  }, [])

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'mode') setError('')
  }

  async function handleNext() {
    setError('')
    if (step === 1) {
      if (!form.passenger_id) { setError('Please select a passenger'); return }
      if (!form.destination.trim()) { setError('Please enter a destination'); return }
      if (!form.scheduled_at) { setError('Please select date and time'); return }
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

      const needsApproval  = form.trip_type === 'WAITING' && form.wait_minutes > 60
      const bookingStatus  = needsApproval ? 'pending_coordinator_approval' : 'submitted'
      const waitMs         = form.trip_type === 'WAITING' ? form.wait_minutes * 60000 : 0
      const autoCompleteAt = new Date(scheduledDate.getTime() + waitMs + 2 * 3600000)

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
          auto_complete_at: autoCompleteAt.toISOString(),
          pickup_lat:      pickupCoords?.lat ?? null,
          pickup_lng:      pickupCoords?.lng ?? null,
          destination_lat: destCoords?.lat   ?? null,
          destination_lng: destCoords?.lng   ?? null,
          passenger_id:    form.passenger_id,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to submit'); setLoading(false); return
      }

      router.push('/coordinator/home')
    } catch (e: any) {
      setError('Error: ' + e.message); setLoading(false)
    }
  }

  const needsApproval = form.trip_type === 'WAITING' && form.wait_minutes > 60
  const selectedPassenger = staffUsers.find(u => u.id === form.passenger_id)

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: C.surface, WebkitFontSmoothing: 'antialiased' }}>

      {pickerField && (
        <LocationPickerMap
          title={pickerField === 'pickup' ? 'Select pickup location' : 'Select destination'}
          autoGps={false}
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
            <p style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-0.2px', color: C.textPrimary }}>Book a trip</p>
            <p style={{ fontSize: 12, color: C.textTert, margin: 0 }}>Step {step} of 3</p>
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
            <FG label="Passenger">
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
            <FG label="When">
              <div style={{ background: C.surface2, borderRadius: 16, padding: 4, display: 'flex', gap: 4 }}>
                {(['now','schedule'] as BookingMode[]).map(m => (
                  <button key={m} onClick={() => update('mode', m)} style={{ flex: 1, padding: '10px 8px', border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13, background: form.mode === m ? C.white : 'transparent', color: form.mode === m ? C.textPrimary : C.textTert, boxShadow: form.mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                    {m === 'now' ? '⚡  Now' : '📅  Schedule'}
                  </button>
                ))}
              </div>
            </FG>

            {form.mode === 'schedule' && (
              <FG label="Date & time">
                <input type="datetime-local" value={form.scheduled_at} onChange={e => update('scheduled_at', e.target.value)} min={new Date().toISOString().slice(0,16)} style={inputSt} />
              </FG>
            )}

            <FG label="Pickup location">
              <input type="text" value={form.pickup} onChange={e => { update('pickup', e.target.value); setPickupCoords(null) }} placeholder="e.g. Engineering Office" style={inputSt} />
              <button type="button" onClick={() => setPickerField('pickup')} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.black, fontFamily: FONT }}>
                📍 {pickupCoords ? 'Change on map' : 'Pick on map'}
              </button>
            </FG>

            <FG label="Destination">
              <input type="text" value={form.destination} onChange={e => { update('destination', e.target.value); setDestCoords(null) }} placeholder="e.g. Larona, Karebbe, Sorowako..." style={inputSt} />
              <button type="button" onClick={() => setPickerField('destination')} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.black, fontFamily: FONT }}>
                📍 {destCoords ? 'Change on map' : 'Pick on map'}
              </button>
            </FG>

            <FG label="Notes (optional)">
              <input type="text" value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Any special requests..." style={inputSt} />
            </FG>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 20px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Select trip type</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {([
                { val: 'DROP'    as TripType, icon: '→', title: 'Drop',    sub: 'One-way, driver leaves' },
                { val: 'WAITING' as TripType, icon: '⏱', title: 'Waiting', sub: 'Driver waits for passenger' },
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
              <FG label="Waiting duration (minutes)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => update('wait_minutes', Math.max(15, form.wait_minutes - 15))} style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${C.border}`, background: C.white, fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textPrimary }}>−</button>
                  <input type="number" min={1} max={480} value={form.wait_minutes} onChange={e => update('wait_minutes', parseInt(e.target.value) || 30)} style={{ ...inputSt, textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
                  <button onClick={() => update('wait_minutes', Math.min(480, form.wait_minutes + 15))} style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${C.border}`, background: C.white, fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textPrimary }}>+</button>
                </div>
              </FG>
            )}

            <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${needsApproval ? '#FDE68A' : '#B7E4C7'}`, background: needsApproval ? C.amberBg : C.greenBg }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: needsApproval ? C.amber : C.green, margin: '0 0 2px' }}>
                {needsApproval ? '⚠ Coordinator approval required' : '✓ Auto-assigned'}
              </p>
              <p style={{ fontSize: 11, color: needsApproval ? C.amber : C.green, margin: 0 }}>
                {needsApproval ? 'Waiting trips over 60 min need approval first.' : 'Best available driver will be assigned automatically.'}
              </p>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 16px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Review & confirm</p>
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textTert, margin: '0 0 4px' }}>Passenger</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0 }}>{selectedPassenger?.name || '—'}</p>
              </div>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textTert, margin: '0 0 4px' }}>When</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0 }}>
                  {form.mode === 'now' ? '⚡ Right now' : formatDateTime(form.scheduled_at)}
                </p>
              </div>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.black, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 10, color: C.textTert, margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pickup</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, margin: 0 }}>{form.pickup}</p>
                  </div>
                </div>
                <div style={{ width: 1, height: 14, background: C.border, marginLeft: 3, marginBottom: 10 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.greenMid, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 10, color: C.textTert, margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Destination</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, margin: 0 }}>{form.destination}</p>
                  </div>
                </div>
              </div>
              {[
                { label: 'Trip type', value: form.trip_type === 'DROP' ? 'Drop — one way' : `Waiting — ${form.wait_minutes} min` },
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
                {needsApproval ? '⏳ Needs your approval first.' : '✓ Driver will be assigned automatically.'}
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
            <button onClick={handleNext} style={{ width: '100%', padding: '14px 20px', background: C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              {step === 1 ? 'Next — Trip type →' : 'Next — Review →'}
            </button>
          ) : (
            <button onClick={submit} disabled={loading} style={{ width: '100%', padding: '14px 20px', background: loading ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
              {loading ? 'Submitting...' : 'Confirm booking'}
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
