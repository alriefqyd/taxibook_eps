'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  format, startOfWeek, addDays, addMonths,
  isSameDay, isSameMonth, startOfMonth,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const FONT     = "'DM Sans', -apple-system, sans-serif"
const HOUR_S   = 7
const HOUR_E   = 20
const H_PX     = 64   // px per hour
const HOURS    = Array.from({ length: HOUR_E - HOUR_S }, (_, i) => i + HOUR_S)

type View = 'day' | 'week' | 'month'

export default function BoardPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [bookings,  setBookings]  = useState<any[]>([])
  const [taxis,     setTaxis]     = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState<View>('day')
  const [cursor,    setCursor]    = useState(new Date())
  const [clock,     setClock]     = useState(new Date())
  const [tooltip,   setTooltip]   = useState<any>(null)

  const loadData = useCallback(async () => {
    const [{ data: bks }, { data: txs }] = await Promise.all([
      supabase.from('booking_details').select('*')
        .in('status', ['booked','on_trip','waiting_trip','pending_driver_approval','submitted','pending_coordinator_approval'])
        .order('scheduled_at', { ascending: true }),
      supabase.from('taxis').select('*, users!driver_id(name)')
        .eq('is_active', true).order('name'),
    ])
    setBookings(bks || [])
    setTaxis((txs || []).map((t: any) => ({ ...t, driver_name: t.users?.name || 'No driver' })))
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await loadData()
      setLoading(false)
    }
    init()

    const ch = supabase.channel('board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxis' }, loadData)
      .subscribe()

    const clockInterval = setInterval(() => setClock(new Date()), 1000)
    return () => { supabase.removeChannel(ch); clearInterval(clockInterval) }
  }, [])

  function navigate(dir: number) {
    setCursor(prev => {
      const d = new Date(prev)
      if (view === 'day')   d.setDate(d.getDate() + dir)
      if (view === 'week')  d.setDate(d.getDate() + dir * 7)
      if (view === 'month') return addMonths(prev, dir)
      return d
    })
  }

  function navLabel() {
    if (view === 'day')   return format(cursor, 'EEEE, d MMMM yyyy', { locale: idLocale })
    if (view === 'week') {
      const mon = startOfWeek(cursor, { weekStartsOn: 1 })
      return `${format(mon, 'd MMM')} – ${format(addDays(mon, 6), 'd MMM yyyy')}`
    }
    return format(cursor, 'MMMM yyyy', { locale: idLocale })
  }

  const today = new Date()
  const activeCount   = bookings.filter(b => ['on_trip','waiting_trip'].includes(b.status)).length
  const bookedCount   = bookings.filter(b => b.status === 'booked').length
  const pendingCount  = bookings.filter(b => b.status.includes('pending')).length
  const availTaxis    = taxis.filter(t => t.is_available && t.driver_id).length

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, background: '#F4F3EF' }}>
      <p style={{ color: '#A8A6A0', fontSize: 16 }}>Loading dispatch board...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F4F3EF', display: 'flex', flexDirection: 'column', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Top bar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0DED8', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, background: '#0F0F0F', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 16 }}>🚗</span>
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>TaxiBook</p>
            <p style={{ fontSize: 11, color: '#A8A6A0', margin: 0 }}>Dispatch Board</p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Active trips', value: activeCount,  bg: '#D8F3DC', color: '#2D6A4F' },
            { label: 'Confirmed',    value: bookedCount,  bg: '#DBEAFE', color: '#1E3A5F' },
            { label: 'Pending',      value: pendingCount, bg: '#FEF3C7', color: '#92400E' },
            { label: 'Available',    value: availTaxis,   bg: '#F4F3EF', color: '#6B6963' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '5px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', letterSpacing: '-0.5px', color: s.color }}>{s.value}</p>
              <p style={{ fontSize: 10, fontWeight: 600, color: s.color, margin: 0, opacity: 0.8 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Clock */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 1px', letterSpacing: '-0.5px', fontFamily: 'monospace' }}>
            {format(clock, 'HH:mm:ss')}
          </p>
          <p style={{ fontSize: 11, color: '#A8A6A0', margin: 0 }}>
            {format(clock, 'EEEE, d MMMM yyyy', { locale: idLocale })}
          </p>
        </div>
      </div>

      {/* ── Fleet strip ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0DED8', padding: '10px 28px', display: 'flex', gap: 10, flexShrink: 0 }}>
        {taxis.map(t => {
          const activeBk = bookings.find(b => b.taxi_id === t.id && ['on_trip','waiting_trip'].includes(b.status))
          const nextBk   = bookings.find(b => b.taxi_id === t.id && b.status === 'booked')
          const statusText = activeBk ? `🚗 ${activeBk.destination}` : nextBk ? `⏱ ${format(new Date(nextBk.scheduled_at), 'HH:mm')}` : t.is_available ? 'Free' : 'Unavailable'
          const statusBg   = activeBk ? '#D8F3DC' : nextBk ? '#DBEAFE' : t.is_available ? '#F4F3EF' : '#FEE2E2'
          const statusClr  = activeBk ? '#2D6A4F' : nextBk ? '#1E3A5F' : t.is_available ? '#6B6963' : '#991B1B'
          return (
            <div key={t.id} style={{ flex: 1, background: '#F4F3EF', borderRadius: 10, padding: '8px 12px', borderLeft: `3px solid ${t.color || '#888'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.is_available ? t.color : '#D1D5DB', flexShrink: 0, display: 'inline-block' }} />
                <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{t.name}</p>
              </div>
              <p style={{ fontSize: 11, color: '#6B6963', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.driver_name}</p>
              <div style={{ background: statusBg, borderRadius: 5, padding: '2px 8px', display: 'inline-block' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: statusClr, margin: 0 }}>{statusText}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Controls ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0DED8', padding: '10px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        {/* View tabs */}
        <div style={{ background: '#ECEAE4', borderRadius: 999, padding: 3, display: 'flex', gap: 2 }}>
          {(['day','week','month'] as View[]).map(v => (
            <button key={v} onClick={() => { setView(v); setCursor(new Date()) }} style={{
              padding: '6px 18px', fontSize: 12, fontWeight: 600, border: 'none',
              borderRadius: 999, cursor: 'pointer', fontFamily: FONT,
              background: view === v ? '#fff' : 'transparent',
              color: view === v ? '#0F0F0F' : '#A8A6A0',
              boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              textTransform: 'capitalize',
            }}>{v}</button>
          ))}
        </div>

        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={navBtnSt}>←</button>
          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 260, textAlign: 'center', letterSpacing: '-0.2px' }}>
            {navLabel()}
          </span>
          <button onClick={() => navigate(1)} style={navBtnSt}>→</button>
        </div>

        <button onClick={() => setCursor(new Date())} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, border: '1px solid #E0DED8', borderRadius: 999, cursor: 'pointer', background: '#fff', fontFamily: FONT, color: '#6B6963' }}>
          Today
        </button>
      </div>

      {/* ── Views ── */}
      <div style={{ flex: 1, padding: '16px 28px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: 12, overflow: 'auto', flex: 1 }}>

          {view === 'day' && (
            <DayView bookings={bookings} taxis={taxis} cursor={cursor} today={today} tooltip={tooltip} setTooltip={setTooltip} />
          )}
          {view === 'week' && (
            <WeekView bookings={bookings} cursor={cursor} today={today} tooltip={tooltip} setTooltip={setTooltip} />
          )}
          {view === 'month' && (
            <MonthView bookings={bookings} cursor={cursor} today={today} onDayClick={d => { setCursor(d); setView('day') }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── DAY VIEW — Gantt (taxi on Y, time on X) ────────────────
const HOUR_W = 80 // px per hour in Gantt

function DayView({ bookings, taxis, cursor, today, tooltip, setTooltip }: any) {
  const dayBks  = bookings.filter((b: any) => isSameDay(new Date(b.scheduled_at), cursor))
  const isToday = isSameDay(cursor, today)
  const nowLeft = isToday ? (today.getHours() + today.getMinutes() / 60 - HOUR_S) * HOUR_W : null
  const totalW  = HOURS.length * HOUR_W
  const ROW_H   = 60

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Time header */}
      <div style={{ display: 'flex', marginLeft: 140, borderBottom: '1px solid #E0DED8', position: 'sticky', top: 0, zIndex: 20, background: '#F4F3EF' }}>
        {HOURS.map(h => (
          <div key={h} style={{ width: HOUR_W, flexShrink: 0, padding: '6px 4px', borderLeft: '1px solid #E0DED8' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#A8A6A0' }}>{String(h).padStart(2,'0')}:00</span>
          </div>
        ))}
      </div>

      {/* Taxi rows */}
      {taxis.map((t: any, idx: number) => {
        const txBks = dayBks.filter((b: any) => b.taxi_id === t.id)
        return (
          <div key={t.id} style={{ display: 'flex', borderBottom: '1px solid #E0DED8', background: idx % 2 === 0 ? '#fff' : '#FAFAF8' }}>
            {/* Taxi label */}
            <div style={{ width: 140, flexShrink: 0, padding: '10px 14px', borderRight: '1px solid #E0DED8', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.is_available ? t.color : '#D1D5DB', flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: t.is_available ? '#0F0F0F' : '#A8A6A0' }}>{t.name}</span>
              </div>
              <span style={{ fontSize: 10, color: '#A8A6A0', paddingLeft: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.is_available ? t.driver_name : 'Unavailable'}
              </span>
            </div>

            {/* Timeline */}
            <div style={{ flex: 1, position: 'relative', height: ROW_H, minWidth: totalW }}>
              {/* Grid lines */}
              {HOURS.map(h => (
                <div key={h} style={{ position: 'absolute', left: (h - HOUR_S) * HOUR_W, top: 0, bottom: 0, width: 1, background: '#F0EEE8' }} />
              ))}
              {/* Unavailable hatch */}
              {!t.is_available && (
                <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(0,0,0,0.03) 5px,rgba(0,0,0,0.03) 10px)' }} />
              )}
              {/* Now line */}
              {nowLeft !== null && (
                <div style={{ position: 'absolute', left: nowLeft, top: 0, bottom: 0, width: 2, background: '#EF4444', zIndex: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', position: 'absolute', top: -4, left: -3 }} />
                </div>
              )}
              {/* Booking blocks */}
              {txBks.map((b: any) => {
                const dt     = new Date(b.scheduled_at)
                const startH = dt.getHours() + dt.getMinutes() / 60
                const durH   = b.trip_type === 'WAITING' ? Math.min(b.wait_minutes / 60 + 2, HOUR_E - startH) : Math.min(2, HOUR_E - startH)
                const left   = (startH - HOUR_S) * HOUR_W
                const width  = Math.max(durH * HOUR_W - 4, 50)
                const isPend = b.status.includes('pending')
                return (
                  <div
                    key={b.id}
                    onMouseEnter={e => setTooltip({ b, x: (e.target as HTMLElement).getBoundingClientRect().right + 8, y: (e.target as HTMLElement).getBoundingClientRect().top })}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ position: 'absolute', left: left + 2, top: 6, width, height: ROW_H - 12, background: t.color + '22', border: `1.5px ${isPend ? 'dashed' : 'solid'} ${t.color}`, borderRadius: 7, padding: '4px 7px', overflow: 'hidden', zIndex: 5, cursor: 'pointer' }}
                  >
                    <p style={{ fontSize: 11, fontWeight: 700, color: t.color, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.passenger_name}</p>
                    <p style={{ fontSize: 10, color: t.color, opacity: 0.8, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.destination}</p>
                    <p style={{ fontSize: 9, color: t.color, opacity: 0.6, margin: 0 }}>{format(dt, 'HH:mm')} · {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}m`}</p>
                  </div>
                )
              })}
              {txBks.length === 0 && t.is_available && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                  <span style={{ fontSize: 11, color: '#D1D5DB', fontWeight: 600 }}>Free</span>
                </div>
              )}
            </div>
          </div>
        )
      })}

      <Legend taxis={taxis} />
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  )
}

// ── WEEK VIEW ───────────────────────────────────────────────
function WeekView({ bookings, cursor, today, tooltip, setTooltip }: any) {
  const monday = startOfWeek(cursor, { weekStartsOn: 1 })
  const days   = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const nowPct = (today.getHours() + today.getMinutes() / 60 - HOUR_S) * H_PX

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 800 }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(7, 1fr)`, borderBottom: '1px solid #E0DED8', position: 'sticky', top: 0, zIndex: 20, background: '#fff' }}>
        <div style={{ background: '#F4F3EF', borderRight: '1px solid #E0DED8' }} />
        {days.map(d => {
          const isToday = isSameDay(d, today)
          const cnt     = bookings.filter((b: any) => isSameDay(new Date(b.scheduled_at), d)).length
          return (
            <div key={d.toISOString()} style={{ textAlign: 'center', padding: '8px 4px', borderRight: '1px solid #E0DED8', background: isToday ? '#0F0F0F' : '#F4F3EF' }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: isToday ? 'rgba(255,255,255,0.6)' : '#A8A6A0', margin: '0 0 2px' }}>
                {format(d, 'EEE', { locale: idLocale })}
              </p>
              <p style={{ fontSize: 17, fontWeight: 700, color: isToday ? '#fff' : '#0F0F0F', margin: '0 0 1px', lineHeight: 1 }}>{format(d, 'd')}</p>
              {cnt > 0 && <p style={{ fontSize: 9, color: isToday ? 'rgba(255,255,255,0.6)' : '#A8A6A0', margin: 0 }}>{cnt}</p>}
            </div>
          )
        })}
      </div>

      {/* Hours + day columns */}
      <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(7, 1fr)` }}>
        <div>
          {HOURS.map(h => (
            <div key={h} style={{ height: H_PX, borderBottom: '1px solid #E0DED8', borderRight: '1px solid #E0DED8', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '4px 8px 0 0', background: '#FAFAF8' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#A8A6A0' }}>{String(h).padStart(2,'0')}:00</span>
            </div>
          ))}
        </div>
        {days.map(d => {
          const isToday = isSameDay(d, today)
          const dayBks  = bookings.filter((b: any) => isSameDay(new Date(b.scheduled_at), d))
          return (
            <div key={d.toISOString()} style={{ position: 'relative', borderRight: '1px solid #E0DED8' }}>
              {HOURS.map(h => <div key={h} style={{ height: H_PX, borderBottom: '1px solid #F0EEE8' }} />)}
              {isToday && <div style={{ position: 'absolute', left: 0, right: 0, top: nowPct, height: 2, background: '#EF4444', zIndex: 10, pointerEvents: 'none' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', position: 'absolute', top: -3, left: -4 }} /></div>}
              {dayBks.map((b: any) => {
                const dt     = new Date(b.scheduled_at)
                const startH = dt.getHours() + dt.getMinutes() / 60
                const durH   = b.trip_type === 'WAITING' ? Math.min(b.wait_minutes / 60 + 2, HOUR_E - startH) : Math.min(2, HOUR_E - startH)
                const top    = (startH - HOUR_S) * H_PX
                const height = Math.max(durH * H_PX - 2, 22)
                const color  = b.taxi_color || '#888'
                const isPend = b.status.includes('pending')
                return (
                  <div
                    key={b.id}
                    onMouseEnter={e => setTooltip({ b, x: (e.target as HTMLElement).getBoundingClientRect().right, y: (e.target as HTMLElement).getBoundingClientRect().top })}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ position: 'absolute', left: 2, right: 2, top, height, background: color + '22', border: `1px ${isPend ? 'dashed' : 'solid'} ${color}`, borderRadius: 5, padding: '2px 5px', overflow: 'hidden', zIndex: 5, cursor: 'pointer' }}
                  >
                    <p style={{ fontSize: 10, fontWeight: 700, color, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.passenger_name}</p>
                    <p style={{ fontSize: 9, color, opacity: 0.8, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.destination}</p>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  )
}

// ── MONTH VIEW ──────────────────────────────────────────────
function MonthView({ bookings, cursor, today, onDayClick }: any) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const days  = Array.from({ length: 42 }, (_, i) => addDays(start, i))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #E0DED8' }}>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(n => (
          <div key={n} style={{ textAlign: 'center', padding: '10px 0', fontSize: 10, fontWeight: 700, color: '#A8A6A0', textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: '1px solid #E0DED8' }}>{n}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {days.map(d => {
          const inMonth = isSameMonth(d, cursor)
          const isToday = isSameDay(d, today)
          const bks     = bookings.filter((b: any) => isSameDay(new Date(b.scheduled_at), d))
          const shown   = bks.slice(0, 4)
          return (
            <div key={d.toISOString()} onClick={() => onDayClick(d)} style={{ minHeight: 100, borderRight: '1px solid #E0DED8', borderBottom: '1px solid #E0DED8', padding: 8, opacity: inMonth ? 1 : 0.35, cursor: 'pointer', background: isToday ? '#F8F7FF' : 'transparent' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4, background: isToday ? '#0F0F0F' : 'transparent', fontSize: 12, fontWeight: 700, color: isToday ? '#fff' : '#0F0F0F' }}>
                {format(d, 'd')}
              </div>
              {shown.map((b: any) => {
                const color  = b.taxi_color || '#888'
                const isPend = b.status.includes('pending')
                return (
                  <div key={b.id} style={{ borderRadius: 3, padding: '2px 5px', fontSize: 10, fontWeight: 700, background: color + '20', border: `1px ${isPend ? 'dashed' : 'solid'} ${color}`, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {b.passenger_name?.split(' ')[0]} · {b.destination?.split(',')[0]}
                  </div>
                )
              })}
              {bks.length > 4 && <p style={{ fontSize: 9, color: '#A8A6A0', fontWeight: 600, margin: '2px 0 0' }}>+{bks.length - 4} more</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Legend ──────────────────────────────────────────────────
function Legend({ taxis }: { taxis: any[] }) {
  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid #E0DED8', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: '#FAFAF8' }}>
      {taxis.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: '#6B6963' }}>{t.name} · {t.driver_name}</span>
        </div>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 16, height: 2, background: '#EF4444' }} />
          <span style={{ fontSize: 11, color: '#A8A6A0' }}>Now</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 20, height: 10, border: '1.5px dashed #A8A6A0', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#A8A6A0' }}>Pending</span>
        </div>
      </div>
    </div>
  )
}

// ── Tooltip ─────────────────────────────────────────────────
function Tooltip({ data }: { data: any }) {
  const { b } = data
  return (
    <div style={{ position: 'fixed', left: data.x + 8, top: data.y, background: '#0F0F0F', color: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 12, zIndex: 999, pointerEvents: 'none', lineHeight: 1.7, maxWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
      <p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: 13 }}>{b.passenger_name}</p>
      <p style={{ margin: 0, opacity: 0.8 }}>{format(new Date(b.scheduled_at), 'HH:mm')} · {b.destination}</p>
      <p style={{ margin: 0, opacity: 0.7 }}>{b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}min`}</p>
      <p style={{ margin: '4px 0 0', opacity: 0.6, fontSize: 11 }}>{b.taxi_name} · {b.status.replace(/_/g, ' ')}</p>
    </div>
  )
}

const navBtnSt: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  background: '#fff', border: '1px solid #E0DED8',
  cursor: 'pointer', fontSize: 14, color: '#6B6963',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
