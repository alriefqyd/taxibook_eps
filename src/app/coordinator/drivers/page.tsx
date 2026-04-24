'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const FONT = "var(--font-inter), 'Inter', sans-serif"

// ── SVG Icons ───────────────────────────────────────────────
const IconShuffle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
    <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
  </svg>
)
const IconChevron = ({ up }: { up?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points={up ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/>
  </svg>
)
const IconCar = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/>
  </svg>
)
const IconClock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconAlert = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 22 20 2 20"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

interface TaxiRow {
  id: string; name: string; plate: string | null; color: string
  is_available: boolean; driver_id: string | null; driver_name: string | null
  trips_today: number; declines_today: number
  active_booking: any | null; next_booking: any | null
}
interface Booking {
  id: string; booking_code: string; passenger_name: string
  pickup: string; destination: string; trip_type: string
  wait_minutes: number; scheduled_at: string; status: string
  notes: string | null; taxi_id: string | null; taxi_name: string | null
  taxi_color: string | null; driver_name: string | null; passenger_id: string
}
type Section = 'fleet' | 'schedule'

export default function DriversPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [taxis,        setTaxis]        = useState<TaxiRow[]>([])
  const [bookings,     setBookings]     = useState<Booking[]>([])
  const [loading,      setLoading]      = useState(true)
  const [section,      setSection]      = useState<Section>('fleet')
  const [toggling,     setToggling]     = useState<string | null>(null)
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [reassigning,  setReassigning]  = useState<Booking | null>(null)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const [newTaxiId,    setNewTaxiId]    = useState('')
  const [reason,       setReason]       = useState('')
  const [saving,       setSaving]       = useState(false)
  const [dateFilter,   setDateFilter]   = useState(new Date().toISOString().slice(0, 10))

  const loadData = useCallback(async (date?: string) => {
    const d = date || dateFilter
    const start = new Date(d); start.setHours(0,0,0,0)
    const end   = new Date(d); end.setHours(23,59,59,999)
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)

    const [{ data: txs }, { data: bks }] = await Promise.all([
      supabase.from('taxis').select('*, users!driver_id(name)').eq('is_active', true).order('name'),
      supabase.from('booking_details').select('*')
        .gte('scheduled_at', start.toISOString())
        .lte('scheduled_at', end.toISOString())
        .not('status', 'in', '("cancelled","rejected")')
        .order('scheduled_at', { ascending: true }),
    ])
    setBookings(bks || [])
    if (!txs) return

    const enriched = await Promise.all(txs.map(async (t: any) => {
      const [{ count: trips }, { count: declines }, { data: activeBk }, { data: nextBk }] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true })
          .eq('taxi_id', t.id).eq('status', 'completed').gte('completed_at', todayStart.toISOString()),
        supabase.from('booking_responses').select('id', { count: 'exact', head: true })
          .eq('taxi_id', t.id).eq('response', 'declined').gte('responded_at', todayStart.toISOString()),
        supabase.from('booking_details').select('*')
          .eq('taxi_id', t.id).in('status', ['on_trip','waiting_trip']).maybeSingle(),
        supabase.from('booking_details').select('*')
          .eq('taxi_id', t.id).eq('status', 'booked')
          .gt('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      ])
      return { id: t.id, name: t.name, plate: t.plate, color: t.color,
        is_available: t.is_available, driver_id: t.driver_id,
        driver_name: t.users?.name || null, trips_today: trips || 0,
        declines_today: declines || 0, active_booking: activeBk || null, next_booking: nextBk || null }
    }))
    setTaxis(enriched)
    setLoading(false)
  }, [supabase, dateFilter])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
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

  async function toggleAvail(taxi: TaxiRow) {
    setToggling(taxi.id)
    await supabase.from('taxis').update({ is_available: !taxi.is_available }).eq('id', taxi.id)
    await loadData()
    setToggling(null)
  }

  async function openReassign(booking: Booking) {
    setReassigning(booking)
    setNewTaxiId(booking.taxi_id || '')
    setReason('')
    const scheduledTime = new Date(booking.scheduled_at)
    const avail: Record<string, boolean> = {}
    for (const taxi of taxis) {
      if (!taxi.driver_id || !taxi.is_available) { avail[taxi.id] = false; continue }
      const { data: conflict } = await supabase.from('bookings').select('id')
        .eq('taxi_id', taxi.id).neq('id', booking.id)
        .in('status', ['booked','on_trip','waiting_trip','pending_driver_approval'])
        .gt('auto_complete_at', scheduledTime.toISOString())
        .lte('scheduled_at', new Date(scheduledTime.getTime() + 2 * 3600000).toISOString())
        .limit(1).maybeSingle()
      avail[taxi.id] = !conflict
    }
    setAvailability(avail)
  }

  async function confirmReassign() {
    if (!reassigning || !newTaxiId) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const res = await fetch(`/api/bookings/${reassigning.id}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ new_taxi_id: newTaxiId, reason }),
    })
    if (!res.ok) alert('Failed to reassign')
    else { setReassigning(null); await loadData() }
    setSaving(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--font-inter), 'Inter', sans-serif", background: '#F5F5F2' }}>
      <p style={{ color: '#9ca3af' }}>Loading fleet...</p>
    </div>
  )

  const available = taxis.filter(t => t.is_available && t.driver_id).length
  const active    = taxis.filter(t => t.active_booking).length
  const offline   = taxis.filter(t => !t.is_available || !t.driver_id).length
  const pendingBks = bookings.filter(b => b.status.includes('pending'))
  const activeBks  = bookings.filter(b => ['booked','on_trip','waiting_trip'].includes(b.status))
  const doneBks    = bookings.filter(b => b.status === 'completed')

  const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
    completed:                    { bg: '#D8F3DC', color: '#2D6A4F', label: 'Done' },
    booked:                       { bg: '#DBEAFE', color: '#006064', label: 'Confirmed' },
    on_trip:                      { bg: '#D8F3DC', color: '#2D6A4F', label: 'On trip' },
    waiting_trip:                 { bg: '#EDE9FE', color: '#006064', label: 'Waiting' },
    pending_driver_approval:      { bg: '#FEF3C7', color: '#7e5700', label: 'Pending driver' },
    pending_coordinator_approval: { bg: '#FEF3C7', color: '#7e5700', label: 'Pending approval' },
    submitted:                    { bg: 'rgba(0,0,0,0.04)', color: '#6f7979', label: 'Submitted' },
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", minHeight: '100vh', background: '#F5F5F2', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Hero header — Vale teal ── */}
      <div style={{ background: 'linear-gradient(160deg, #005F6B 0%, #007B8A 60%, #00A4B4 100%)', padding: '24px 20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>Fleet Management</p>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>Drivers</h1>
          </div>
          {/* Vale yellow accent dot */}
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#006064', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🚗</div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[
            { label: 'On duty',    value: available, accent: '#A8F0D8', dot: '#34D399' },
            { label: 'Active now', value: active,    accent: '#FDE68A', dot: '#F59E0B' },
            { label: 'Offline',    value: offline,   accent: '#FCA5A5', dot: '#F87171' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.2)' }}>
              <p style={{ fontSize: 28, fontWeight: 800, margin: '0 0 3px', color: s.accent, letterSpacing: '-1px', lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.55)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Floating tab switcher — overlaps header/content seam ── */}
      <div style={{ padding: '0 20px', marginTop: -18, marginBottom: 16, position: 'relative', zIndex: 10 }}>
        <div style={{ background: '#ffffff', borderRadius: 16, padding: 4, display: 'flex', gap: 3, boxShadow: '0 4px 20px rgba(0,123,138,0.10), 0 1px 4px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}>
          {([
            { key: 'fleet',    label: 'Drivers',  emoji: '🚗' },
            { key: 'schedule', label: 'Schedule', emoji: '📋' },
          ] as { key: Section; label: string; emoji: string }[]).map(s => (
            <button key={s.key} onClick={() => setSection(s.key)} style={{
              flex: 1, padding: '10px 8px', fontSize: 13, fontWeight: 700,
              border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif",
              background: section === s.key ? '#006064' : 'transparent',
              color:      section === s.key ? '#fff'    : '#9ca3af',
              transition: 'all 0.15s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 15 }}>{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── FLEET TAB ── */}
      {section === 'fleet' && (
        <div style={{ padding: '16px 16px 100px', background: '#F5F5F2' }}>
          {taxis.map((t, idx) => {
            const isOn       = t.is_available && !!t.driver_id
            const isActive   = !!t.active_booking
            const isExpanded = expanded === t.id
            const isToggling = toggling === t.id
            const taxiBks    = bookings.filter(b => b.taxi_id === t.id)

            return (
              <div key={t.id} style={{
                background: '#ffffff',
                borderRadius: 16,
                marginBottom: 10,
                overflow: 'hidden',
                boxShadow: isActive
                  ? `0 4px 16px rgba(196,98,45,0.12), 0 1px 4px rgba(0,0,0,0.06)`
                  : '0 1px 4px rgba(0,0,0,0.06)',
                border: `1px solid ${isActive ? t.color + '40' : 'rgba(0,0,0,0.08)'}`,
              }}>

                {/* Colored top strip if active */}
                {isActive && (
                  <div style={{ height: 3, background: `linear-gradient(90deg, ${t.color}, ${t.color}88)` }} />
                )}

                {/* Main row */}
                <div onClick={() => setExpanded(isExpanded ? null : t.id)}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>

                  {/* Avatar circle */}
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: isOn ? t.color + '20' : 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${isOn ? t.color + '40' : 'rgba(0,0,0,0.08)'}` }}>
                    <span style={{ fontSize: 18 }}>🚗</span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>{t.name}</p>
                      {t.plate && (
                        <span style={{ fontSize: 10, color: '#9ca3af', background: '#F5F5F2', padding: '2px 7px', borderRadius: 6, fontWeight: 600, letterSpacing: '0.03em' }}>{t.plate}</span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: '#6f7979', margin: '0 0 5px' }}>{t.driver_name || 'No driver'}</p>

                    {/* Status pill */}
                    {isActive ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#2D6A4F', background: '#d8f3dc', padding: '2px 8px', borderRadius: 9999 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#52B788', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                        {t.active_booking.status === 'waiting_trip' ? '⏱' : '→'} {t.active_booking.destination}
                      </span>
                    ) : t.next_booking ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#006064', background: 'rgba(0,96,100,0.1)', padding: '2px 8px', borderRadius: 9999 }}>
                        <IconClock /> {format(new Date(t.next_booking.scheduled_at), 'HH:mm')} → {t.next_booking.destination}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: isOn ? '#2D6A4F' : '#EF4444' }}>
                        {isOn ? '● Free' : !t.driver_id ? '— No driver' : '○ Offline'}
                      </span>
                    )}
                  </div>

                  {/* Right side: trips + toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.5px', color: '#006064' }}>{t.trips_today}</p>
                      <p style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', margin: 0, letterSpacing: '0.05em' }}>trips</p>
                    </div>

                    {t.driver_id ? (
                      <div onClick={e => { e.stopPropagation(); if (!isToggling) toggleAvail(t) }}
                        style={{
                          width: 46, height: 26, borderRadius: 13, flexShrink: 0,
                          background: isToggling ? '#D1D5DB' : isOn ? t.color : '#D1D5DB',
                          position: 'relative', cursor: isToggling ? 'not-allowed' : 'pointer',
                          boxShadow: isOn && !isToggling ? `0 0 0 3px ${t.color}30` : 'none',
                          transition: 'background 0.25s, box-shadow 0.25s',
                        }}>
                        <div style={{
                          position: 'absolute', top: 3,
                          left: isOn ? 23 : 3,
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#ffffff',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                          transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                        }} />
                      </div>
                    ) : (
                      <div style={{ width: 46, height: 26, borderRadius: 13, background: '#F5F5F2', border: '1px dashed #D1D5DB' }} />
                    )}

                    <div style={{ color: '#C4C2BC', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                      <IconChevron />
                    </div>
                  </div>
                </div>

                {/* Expanded drawer */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', padding: '14px 16px 16px', background: '#F5F5F2' }}>

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Today',      value: t.trips_today,    warn: false },
                        { label: 'Declines',   value: t.declines_today, warn: t.declines_today >= 2 },
                        { label: 'Scheduled',  value: taxiBks.filter(b => b.status === 'booked').length, warn: false },
                      ].map(s => (
                        <div key={s.label} style={{ background: s.warn ? '#FEF9EC' : '#F0F7F8', borderRadius: 12, padding: '10px', textAlign: 'center', border: `1px solid ${s.warn ? '#FDE68A' : '#EDD9C4'}` }}>
                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.warn ? '#92400E' : '#9ca3af', margin: '0 0 4px' }}>{s.label}</p>
                          <p style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.5px', color: s.warn ? '#92400E' : '#006064' }}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Today's trips */}
                    {taxiBks.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 7px' }}>Today's trips</p>
                        {taxiBks.map(b => {
                          const sc = STATUS_CONFIG[b.status] || { bg: 'rgba(0,0,0,0.04)', color: '#6f7979', label: b.status }
                          const canReassign = !['completed','cancelled','rejected'].includes(b.status)
                          return (
                            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#ffffff', borderRadius: 12, marginBottom: 5, border: '1px solid rgba(0,0,0,0.08)' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.passenger_name}</p>
                                <p style={{ fontSize: 11, color: '#6f7979', margin: 0 }}>{format(new Date(b.scheduled_at), 'HH:mm')} → {b.destination}</p>
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>
                              {canReassign && (
                                <button
                                  onClick={() => { setSection('schedule'); openReassign(b) }}
                                  title="Reassign taxi"
                                  style={{ width: 30, height: 30, borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)', background: '#F5F5F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6f7979', flexShrink: 0, padding: 0 }}>
                                  <IconShuffle />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Warning + offline button */}
                    {t.declines_today >= 2 && (
                      <div style={{ background: '#ffdeac', border: '1px solid #FDE68A', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <p style={{ fontSize: 12, color: '#7e5700', margin: 0, fontWeight: 600 }}>
                          ⚠️ {t.declines_today} declines today
                        </p>
                        {t.is_available && (
                          <button onClick={() => toggleAvail(t)} disabled={!!toggling}
                            style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 10, border: 'none', background: '#92400E', color: '#fff', cursor: 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif", flexShrink: 0 }}>
                            Set offline
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {section === 'schedule' && (
        <div style={{ padding: '16px 16px 100px', background: '#F5F5F2' }}>

          {/* Date filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '9px 14px', boxShadow: '0 1px 3px rgba(196,98,45,0.06)' }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <input type="date" value={dateFilter}
                onChange={e => { setDateFilter(e.target.value); loadData(e.target.value) }}
                style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: "var(--font-inter), 'Inter', sans-serif", background: 'transparent', color: '#006064', fontWeight: 600 }} />
            </div>
            <button onClick={() => { const t = new Date().toISOString().slice(0,10); setDateFilter(t); loadData(t) }}
              style={{ padding: '9px 16px', fontSize: 12, fontWeight: 700, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, background: '#ffffff', color: '#8C6E54', cursor: 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif", border: '1px solid rgba(0,0,0,0.08)' }}>
              Today
            </button>
          </div>

          {/* Day summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 18 }}>
            {[
              { label: 'Total',   value: bookings.length,   bg: '#F5E6D4', color: '#8C6E54' },
              { label: 'Pending', value: pendingBks.length, bg: '#FEF3C7', color: '#7e5700' },
              { label: 'Active',  value: activeBks.length,  bg: '#DBEAFE', color: '#006064' },
              { label: 'Done',    value: doneBks.length,    bg: '#D8F3DC', color: '#2D6A4F' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '8px', textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.5px', color: s.color }}>{s.value}</p>
                <p style={{ fontSize: 9, fontWeight: 700, color: s.color, opacity: 0.7, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Grouped by taxi */}
          {taxis.map(t => {
            const taxiBks = bookings.filter(b => b.taxi_id === t.id)
            if (taxiBks.length === 0) return null
            return (
              <div key={t.id} style={{ marginBottom: 18 }}>
                {/* Taxi header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '0 4px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{t.name}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>· {t.driver_name}</p>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: t.is_available ? '#D8F3DC' : '#FEE2E2', color: t.is_available ? '#2D6A4F' : '#991B1B' }}>
                    {t.is_available ? 'On duty' : 'Offline'}
                  </span>
                </div>
                {taxiBks.map(b => {
                  const sc = STATUS_CONFIG[b.status] || { bg: 'rgba(0,0,0,0.04)', color: '#6f7979', label: b.status }
                  const canReassign = !['completed','cancelled','rejected'].includes(b.status)
                  return (
                    <div key={b.id} style={{ background: '#ffffff', borderRadius: 13, padding: '12px 14px', marginBottom: 6, borderLeft: `3px solid ${t.color}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: `1px solid #EDD9C4`, borderLeftColor: t.color, borderLeftWidth: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>{b.passenger_name}</p>
                          <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{format(new Date(b.scheduled_at), 'HH:mm')} · {b.pickup} → {b.destination}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: sc.bg, color: sc.color }}>{sc.label}</span>
                          {canReassign && (
                            <button onClick={() => openReassign(b)} title="Reassign taxi"
                              style={{ width: 32, height: 32, borderRadius: 9, border: '1.5px solid rgba(0,0,0,0.1)', background: '#F5F5F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6f7979', padding: 0 }}>
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
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#991B1B' }}>Unassigned</p>
              </div>
              {bookings.filter(b => !b.taxi_id).map(b => (
                <div key={b.id} style={{ background: '#ffffff', borderRadius: 13, padding: '12px 14px', marginBottom: 6, borderLeft: '3px solid #EF4444', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>{b.passenger_name}</p>
                      <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{format(new Date(b.scheduled_at), 'HH:mm')} · {b.destination}</p>
                    </div>
                    <button onClick={() => openReassign(b)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#006064', color: '#fff', border: 'none', borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
                      <IconShuffle /> Assign
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {bookings.length === 0 && (
            <div style={{ textAlign: 'center', padding: '52px 20px', background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 32, margin: '0 0 10px' }}>📋</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#006064', margin: '0 0 4px' }}>No trips</p>
              <p style={{ fontSize: 13, color: '#6f7979', margin: 0 }}>No bookings for this date</p>
            </div>
          )}
        </div>
      )}

      {/* ── Reassign sheet ── */}
      {reassigning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
          onClick={() => setReassigning(null)}>
          <div style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', margin: '0 auto 20px' }} />

            <p style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.3px' }}>Reassign trip</p>
            <p style={{ fontSize: 13, color: '#6f7979', margin: '0 0 20px' }}>
              {reassigning.passenger_name} · {format(new Date(reassigning.scheduled_at), 'HH:mm')} → {reassigning.destination}
            </p>

            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 10px' }}>Select taxi</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {taxis.filter(t => t.driver_id).map(t => {
                const isSelected = newTaxiId === t.id
                const isCurrent  = reassigning.taxi_id === t.id
                const isFree     = availability[t.id]
                const isOffline  = !t.is_available
                return (
                  <div key={t.id} onClick={() => !isOffline && setNewTaxiId(t.id)}
                    style={{ padding: '13px 14px', borderRadius: 13, cursor: isOffline ? 'not-allowed' : 'pointer', opacity: isOffline ? 0.45 : 1, border: `${isSelected ? 2 : 1}px solid ${isSelected ? '#C4622D' : 'rgba(0,0,0,0.08)'}`, background: isSelected ? '#1A3444' : '#1C2B3A', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: isSelected ? '#F5C518' : '#F0F4F8' }}>{t.name} · {t.driver_name}</p>
                      <p style={{ fontSize: 11, margin: 0, color: isOffline ? '#EF4444' : isFree ? '#52B788' : '#F59E0B', fontWeight: 600 }}>
                        {isOffline ? '○ Offline' : isFree ? '✓ Free at this time' : '⚠ Has conflict'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isCurrent && <span style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.5)' : '#9ca3af', fontWeight: 600 }}>Current</span>}
                      {isSelected && <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>✓</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 6px' }}>Reason (optional)</p>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Driver unavailable..."
              style={{ width: '100%', padding: '12px 14px', fontSize: 14, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 16, fontFamily: "var(--font-inter), 'Inter', sans-serif", outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />

            {newTaxiId && availability[newTaxiId] === false && !taxis.find(t=>t.id===newTaxiId)?.is_available === false && (
              <div style={{ background: '#ffdeac', border: '1px solid #FDE68A', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#7e5700', margin: 0 }}>⚠ Schedule conflict — driver will be notified</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setReassigning(null)}
                style={{ padding: '13px', background: '#F5F5F2', color: '#006064', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 13, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
                Cancel
              </button>
              <button onClick={confirmReassign} disabled={!newTaxiId || saving || newTaxiId === reassigning.taxi_id}
                style={{ padding: '13px', background: (!newTaxiId || saving || newTaxiId === reassigning.taxi_id) ? 'rgba(0,0,0,0.08)' : '#C4622D', color: '#fff', border: 'none', borderRadius: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper: hex color to rgb values
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `${r},${g},${b}`
}
