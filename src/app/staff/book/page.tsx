'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

const FONT = "'DM Sans', -apple-system, sans-serif"

const C = {
  black:       '#0F0F0F',
  white:       '#FAFAF8',
  surface:     '#F4F3EF',
  surface2:    '#ECEAE4',
  border:      '#E0DED8',
  border2:     '#C8C6C0',
  textPrimary: '#0F0F0F',
  textSecond:  '#6B6963',
  textTert:    '#A8A6A0',
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

  const [step,        setStep]        = useState<Step>(1)
  const [loading,     setLoading]     = useState(false)
  const [checkingNow, setCheckingNow] = useState(false)
  const [error,       setError]       = useState('')
  const [noTaxiMsg,   setNoTaxiMsg]   = useState('')
  const [form,        setForm]        = useState<FormData>({
    mode:         'now',
    pickup:       'Engineering Office',
    destination:  '',
    notes:        '',
    scheduled_at: defaultDateTime(),
    trip_type:    'DROP',
    wait_minutes: 30,
  })

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
        setNoTaxiMsg('No taxis available. All drivers are off duty.')
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
          .in('status', ['booked','on_trip','waiting_trip','pending_driver_approval'])
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
      setNoTaxiMsg(`No taxi available right now.${nextTime ? ` Next: ${nextName} at ${nextTime}.` : ''}`)
      return false
    } catch {
      setNoTaxiMsg('Failed to check availability.')
      setCheckingNow(false); return false
    }
  }

  async function handleNext() {
    setError('')
    if (step === 1) {
      if (!form.destination.trim()) { setError('Please enter a destination'); return }
      if (form.mode === 'now') {
        const ok = await checkNowAvailability()
        if (!ok) return
      } else {
        if (!form.scheduled_at) { setError('Please select date and time'); return }
      }
    }
    setStep(prev => (prev + 1) as Step)
  }

  async function submit() {
    setLoading(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const scheduledDate = form.mode === 'now'
        ? new Date(Date.now() + 2 * 60000)
        : new Date(form.scheduled_at)

      if (form.mode === 'schedule' && scheduledDate <= new Date(Date.now() - 3 * 60000)) {
        setError('Booking time must be in the future.'); setLoading(false); return
      }

      const windowStart = new Date(scheduledDate.getTime() - 30 * 60 * 1000)
      const windowEnd   = new Date(scheduledDate.getTime() + 2 * 60 * 60 * 1000)
      const { data: conflicts } = await supabase.from('bookings')
        .select('booking_code, scheduled_at, destination')
        .eq('passenger_id', user.id)
        .not('status', 'in', '("rejected","cancelled","completed")')
        .gte('scheduled_at', windowStart.toISOString())
        .lte('scheduled_at', windowEnd.toISOString())

      if (conflicts?.length) {
        const c = conflicts[0]
        const t = new Date(c.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        setError(`Conflict: you already have a booking at ${t} to ${c.destination}.`)
        setLoading(false); return
      }

      const needsApproval  = form.trip_type === 'WAITING' && form.wait_minutes > 60
      const status         = needsApproval ? 'pending_coordinator_approval' : 'submitted'
      const waitMs         = form.trip_type === 'WAITING' ? form.wait_minutes * 60000 : 0
      const autoCompleteAt = new Date(scheduledDate.getTime() + waitMs + 2 * 3600000)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          pickup: form.pickup, destination: form.destination,
          trip_type: form.trip_type,
          wait_minutes: form.trip_type === 'WAITING' ? form.wait_minutes : 0,
          notes: form.notes || null,
          scheduled_at: scheduledDate.toISOString(),
          status, auto_complete_at: autoCompleteAt.toISOString(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(res.status === 409 ? 'You already have a booking at this time.' : (data.error || 'Failed to submit'))
        setLoading(false); return
      }

      const code = data.booking.booking_code
      const assigned = data.assigned
        ? `&taxi=${encodeURIComponent(data.taxi_name)}&driver=${encodeURIComponent(data.driver_name)}` : ''
      router.push(`/staff/success?code=${code}${assigned}`)
    } catch (e: any) {
      setError('Error: ' + e.message); setLoading(false)
    }
  }

  const needsApproval = form.trip_type === 'WAITING' && form.wait_minutes > 60

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: C.surface, WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Header ── */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '12px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14 }}>
          <button
            onClick={() => step === 1 ? router.push('/staff/home') : setStep(p => (p - 1) as Step)}
            style={{ width: 34, height: 34, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 16, color: C.textSecond, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >←</button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-0.2px', color: C.textPrimary }}>New booking</p>
            <p style={{ fontSize: 12, color: C.textTert, margin: 0 }}>Step {step} of 3</p>
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, paddingBottom: 0 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? C.black : C.border, transition: 'background 0.2s' }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 20px 32px' }}>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div>
            {/* Mode toggle */}
            <div style={{ background: C.surface2, borderRadius: 14, padding: 4, display: 'flex', gap: 4, marginBottom: 24 }}>
              {(['now','schedule'] as BookingMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => update('mode', m)}
                  style={{
                    flex: 1, padding: '10px 8px', border: 'none', borderRadius: 11,
                    cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13,
                    transition: 'all 0.15s',
                    background: form.mode === m ? C.white : 'transparent',
                    color: form.mode === m ? C.textPrimary : C.textTert,
                    boxShadow: form.mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {m === 'now' ? '⚡  Now' : '📅  Schedule'}
                </button>
              ))}
            </div>

            {/* Now status */}
            {form.mode === 'now' && !noTaxiMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: C.greenBg, border: `1px solid #B7E4C7`, borderRadius: 10, marginBottom: 20 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenMid, flexShrink: 0, display: 'inline-block' }} />
                <p style={{ fontSize: 12, color: C.green, margin: 0, fontWeight: 500 }}>
                  Taxi will be assigned immediately after submission
                </p>
              </div>
            )}

            {/* No taxi error */}
            {noTaxiMsg && (
              <div style={{ padding: '10px 14px', background: C.redBg, border: `1px solid #FECACA`, borderRadius: 10, marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.red, margin: '0 0 2px' }}>⚠ No taxi available right now</p>
                <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{noTaxiMsg}</p>
              </div>
            )}

            {/* DateTime — only for schedule */}
            {form.mode === 'schedule' && (
              <FG label="Date & time">
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={e => update('scheduled_at', e.target.value)}
                  min={new Date().toISOString().slice(0,16)}
                  style={inputSt}
                />
              </FG>
            )}

            {/* Route fields */}
            <FG label="Pickup location">
              <input type="text" value={form.pickup}
                onChange={e => update('pickup', e.target.value)}
                placeholder="e.g. Engineering Office"
                style={inputSt} />
            </FG>

            <FG label="Destination">
              <input type="text" value={form.destination}
                onChange={e => update('destination', e.target.value)}
                placeholder="e.g. Larona, Karebbe, Sorowako..."
                style={inputSt} />
            </FG>

            <FG label="Notes (optional)">
              <input type="text" value={form.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="Any special requests..."
                style={inputSt} />
            </FG>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 20px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Select trip type</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { val: 'DROP'    as TripType, icon: '→', title: 'Drop',    sub: 'One-way, driver leaves' },
                { val: 'WAITING' as TripType, icon: '⏱', title: 'Waiting', sub: 'Driver waits for you'  },
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
              <FG label="Waiting duration (minutes)">
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

            <div style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${needsApproval ? '#FDE68A' : '#B7E4C7'}`, background: needsApproval ? C.amberBg : C.greenBg }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: needsApproval ? C.amber : C.green, margin: '0 0 2px' }}>
                {needsApproval ? '⚠ Coordinator approval required' : '✓ Auto-assigned'}
              </p>
              <p style={{ fontSize: 11, color: needsApproval ? C.amber : C.green, margin: 0 }}>
                {needsApproval ? 'Waiting trips over 60 min need approval first.' : 'Best available driver will be assigned automatically.'}
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div>
            <p style={{ fontSize: 12, color: C.textTert, margin: '0 0 16px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Review & confirm</p>

            {/* Summary card */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
              {/* When row — highlighted */}
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textTert, margin: '0 0 4px' }}>When</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0, letterSpacing: '-0.2px' }}>
                  {form.mode === 'now' ? '⚡ Right now' : formatDateTime(form.scheduled_at)}
                </p>
              </div>

              {/* Route */}
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

              {/* Meta rows */}
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

            {/* Status notice */}
            <div style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${needsApproval ? '#FDE68A' : '#B7E4C7'}`, background: needsApproval ? C.amberBg : C.greenBg, marginBottom: 4 }}>
              <p style={{ fontSize: 12, color: needsApproval ? C.amber : C.green, margin: 0 }}>
                {needsApproval
                  ? '⏳ Sent to coordinator for approval first.'
                  : form.mode === 'now'
                    ? '⚡ Driver will be assigned immediately.'
                    : '✓ Driver will be assigned automatically.'}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', background: C.redBg, border: `1px solid #FECACA`, borderRadius: 10, marginTop: 12 }}>
            <p style={{ fontSize: 12, color: C.red, margin: 0, fontWeight: 500 }}>{error}</p>
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: 20 }}>
          {step < 3 ? (
            <button
              onClick={handleNext}
              disabled={checkingNow}
              style={{ width: '100%', padding: '14px 20px', background: checkingNow ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: checkingNow ? 'not-allowed' : 'pointer', fontFamily: FONT, letterSpacing: '-0.1px', transition: 'opacity 0.15s' }}
            >
              {checkingNow ? 'Checking availability...' : step === 1 ? 'Next — Trip type →' : 'Next — Review →'}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={loading}
              style={{ width: '100%', padding: '14px 20px', background: loading ? C.border2 : C.black, color: C.white, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT, letterSpacing: '-0.1px' }}
            >
              {loading ? 'Submitting...' : 'Confirm booking'}
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
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A8A6A0', marginBottom: 6 }}>
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
  return d.toISOString().slice(0, 16)
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
  fontFamily: "'DM Sans', sans-serif",
  border: '1.5px solid #E0DED8', borderRadius: 12,
  background: '#FAFAF8', color: '#0F0F0F',
  boxSizing: 'border-box', outline: 'none',
  transition: 'border-color 0.15s',
}
