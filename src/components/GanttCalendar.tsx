'use client'

import { useState, useRef, useEffect } from 'react'
import {
  format, startOfWeek, addDays, addMonths,
  isSameDay, isSameMonth, startOfMonth,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { BookingDetail } from '@/types'

type ViewMode = 'day' | 'week' | 'month'

const HOUR_START = 7
const HOUR_END   = 19
const HOUR_W     = 80
const DAY_W      = 100
const ROW_H      = 52

interface GanttCalendarProps {
  bookings:    BookingDetail[]
  taxis:       any[]
  onRefresh?:  () => void
}

export default function GanttCalendar({ bookings, taxis }: GanttCalendarProps) {
  const [view,    setView]   = useState<ViewMode>('day')
  const [cursor,  setCursor] = useState(new Date())
  const dayRef  = useRef<HTMLDivElement>(null)
  const weekRef = useRef<HTMLDivElement>(null)

  const today = new Date()

  // Auto scroll to now
  useEffect(() => {
    const offset = (today.getHours() + today.getMinutes() / 60 - HOUR_START) * HOUR_W - 60
    if (dayRef.current)  dayRef.current.scrollLeft  = Math.max(0, offset)
    const mon    = startOfWeek(cursor, { weekStartsOn: 1 })
    const dayIdx = Math.round((today.getTime() - mon.getTime()) / 86400000)
    if (weekRef.current && dayIdx >= 0 && dayIdx < 7) {
      weekRef.current.scrollLeft = Math.max(0, dayIdx * DAY_W - 40)
    }
  }, [view])

  function navigate(dir: number) {
    setCursor(prev => {
      const d = new Date(prev)
      if (view === 'day')   d.setDate(d.getDate() + dir)
      if (view === 'week')  d.setDate(d.getDate() + dir * 7)
      if (view === 'month') return addMonths(prev, dir)
      return d
    })
  }

  function getNavLabel() {
    if (view === 'day')   return format(cursor, 'EEEE, d MMMM yyyy', { locale: idLocale })
    if (view === 'week') {
      const mon = startOfWeek(cursor, { weekStartsOn: 1 })
      return `${format(mon, 'd MMM')} – ${format(addDays(mon, 6), 'd MMM yyyy')}`
    }
    return format(cursor, 'MMMM yyyy', { locale: idLocale })
  }

  // Only confirmed bookings on Gantt
  const activeBookings = bookings.filter(b =>
    ['booked', 'on_trip', 'waiting_trip'].includes(b.status)
  )

  return (
    <div>
      {/* ── View tabs + nav ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '12px 16px' }}>
        <div style={{ display: 'flex', background: '#F5F5F2', borderRadius: 9999, padding: '3px', gap: '2px', marginBottom: 10 }}>
          {(['day', 'week', 'month'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => { setView(v); setCursor(new Date()) }} style={{
              flex: 1, padding: '6px 4px', fontSize: '12px', fontWeight: 600,
              border: 'none', borderRadius: 9999, cursor: 'pointer',
              background: view === v ? '#ffffff' : 'transparent',
              color: view === v ? '#0F1923' : '#9ca3af',
              textTransform: 'capitalize',
            }}>
              {v}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate(-1)} style={navBtn}>←</button>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#006064', textAlign: 'center', flex: 1, padding: '0 8px' }}>
            {getNavLabel()}
          </span>
          <button onClick={() => navigate(1)} style={navBtn}>→</button>
        </div>
      </div>

      {/* ── Views ── */}
      {view === 'day'   && <DayGantt   bookings={activeBookings} taxis={taxis} cursor={cursor} scrollRef={dayRef} />}
      {view === 'week'  && <WeekGantt  bookings={activeBookings} taxis={taxis} cursor={cursor} scrollRef={weekRef} />}
      {view === 'month' && <MonthView  bookings={activeBookings} cursor={cursor} onDayClick={d => { setCursor(d); setView('day') }} />}
    </div>
  )
}

// ── DAY GANTT ───────────────────────────────────────────────
function DayGantt({ bookings, taxis, cursor, scrollRef }: {
  bookings: BookingDetail[]; taxis: any[]; cursor: Date; scrollRef: React.RefObject<HTMLDivElement>
}) {
  const today  = new Date()
  const dayBks = bookings.filter(b => isSameDay(new Date(b.scheduled_at), cursor))
  const hours  = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START)
  const totalW = hours.length * HOUR_W

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>← scroll →</span>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{dayBks.length} confirmed</span>
      </div>
      <div style={{ overflowX: 'auto' }} ref={scrollRef}>
        <div style={{ minWidth: totalW + 90 }}>
          {/* Time header */}
          <div style={{ display: 'flex', marginLeft: 90, borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}>
            {hours.map(h => (
              <div key={h} style={{ width: HOUR_W, flexShrink: 0, padding: '5px 4px', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
          {/* Taxi rows */}
          {taxis.map((taxi, idx) => (
            <GanttRow
              key={taxi.id}
              taxi={taxi}
              idx={idx}
              totalW={totalW}
              gridLines={hours.map(h => (
                <div key={h} style={{ position: 'absolute', left: (h - HOUR_START) * HOUR_W, top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.08)' }} />
              ))}
              nowLine={isSameDay(cursor, today) ? (
                <div style={{ position: 'absolute', left: `${(today.getHours() + today.getMinutes() / 60 - HOUR_START) * HOUR_W}px`, top: 0, bottom: 0, width: 2, background: '#EF4444', zIndex: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', position: 'absolute', top: -3, left: -2 }} />
                </div>
              ) : null}
              bookings={dayBks.filter(b => b.taxi_id === taxi.id)}
              renderBlock={(b) => {
                const dt     = new Date(b.scheduled_at)
                const startH = dt.getHours() + dt.getMinutes() / 60
                const left   = (startH - HOUR_START) * HOUR_W
                const durH   = b.trip_type === 'WAITING'
                  ? Math.min(b.wait_minutes / 60 + 2, HOUR_END - startH)
                  : Math.min(2, HOUR_END - startH)
                const width = Math.max(durH * HOUR_W - 4, 44)
                return (
                  <div key={b.id} style={{ position: 'absolute', left: left + 2, top: 5, width, height: ROW_H - 10, background: taxi.color + '22', border: `1.5px solid ${taxi.color}`, borderRadius: '7px', padding: '4px 6px', overflow: 'hidden', zIndex: 5 }}>
                    <p style={{ fontSize: '10px', fontWeight: 800, color: taxi.color, margin: '0 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.passenger_name ? `${b.passenger_name} → ` : ''}{b.destination}
                    </p>
                    <p style={{ fontSize: '9px', color: taxi.color, opacity: 0.8, margin: 0, whiteSpace: 'nowrap' }}>
                      {format(dt, 'HH:mm')} · {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}m`}
                    </p>
                  </div>
                )
              }}
            />
          ))}
          <GanttLegend />
        </div>
      </div>
    </div>
  )
}

// ── WEEK GANTT ──────────────────────────────────────────────
function WeekGantt({ bookings, taxis, cursor, scrollRef }: {
  bookings: BookingDetail[]; taxis: any[]; cursor: Date; scrollRef: React.RefObject<HTMLDivElement>
}) {
  const today  = new Date()
  const monday = startOfWeek(cursor, { weekStartsOn: 1 })
  const days   = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const totalW = days.length * DAY_W

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>← scroll →</span>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          {bookings.filter(b => days.some(d => isSameDay(new Date(b.scheduled_at), d))).length} confirmed this week
        </span>
      </div>
      <div style={{ overflowX: 'auto' }} ref={scrollRef}>
        <div style={{ minWidth: totalW + 90 }}>
          {/* Day headers */}
          <div style={{ display: 'flex', marginLeft: 90, borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}>
            {days.map(d => {
              const isToday = isSameDay(d, today)
              const cnt     = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d)).length
              return (
                <div key={d.toISOString()} style={{ width: DAY_W, flexShrink: 0, padding: '6px 4px', borderLeft: '1px solid rgba(0,0,0,0.08)', textAlign: 'center', background: isToday ? '#006064' : 'transparent' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: isToday ? 'rgba(255,255,255,0.6)' : '#9ca3af', margin: '0 0 2px' }}>
                    {format(d, 'EEE', { locale: idLocale })}
                  </p>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: isToday ? '#fff' : '#006064', margin: '0 0 2px', lineHeight: 1 }}>
                    {format(d, 'd')}
                  </p>
                  {cnt > 0 && <p style={{ fontSize: '9px', color: isToday ? 'rgba(255,255,255,0.6)' : '#9ca3af', margin: 0 }}>{cnt}</p>}
                </div>
              )
            })}
          </div>
          {/* Taxi rows */}
          {taxis.map((taxi, idx) => {
            const weekBks = bookings.filter(b =>
              days.some(d => isSameDay(new Date(b.scheduled_at), d)) && b.taxi_id === taxi.id
            )
            return (
              <GanttRow
                key={taxi.id}
                taxi={taxi}
                idx={idx}
                totalW={totalW}
                gridLines={days.map((d, i) => (
                  <div key={d.toISOString()} style={{ position: 'absolute', left: i * DAY_W, top: 0, bottom: 0, width: 1, background: isSameDay(d, today) ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.08)' }} />
                ))}
                nowLine={days.some(d => isSameDay(d, today)) ? (
                  <div style={{ position: 'absolute', left: `${days.findIndex(d => isSameDay(d, today)) * DAY_W + (today.getHours() + today.getMinutes() / 60) / 24 * DAY_W}px`, top: 0, bottom: 0, width: 2, background: '#EF4444', zIndex: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', position: 'absolute', top: -3, left: -2 }} />
                  </div>
                ) : null}
                bookings={weekBks}
                renderBlock={(b) => {
                  const dt     = new Date(b.scheduled_at)
                  const dayIdx = days.findIndex(d => isSameDay(dt, d))
                  if (dayIdx < 0) return null
                  return (
                    <div key={b.id} style={{ position: 'absolute', left: dayIdx * DAY_W + 2, top: 5, width: DAY_W - 6, height: ROW_H - 10, background: taxi.color + '22', border: `1.5px solid ${taxi.color}`, borderRadius: '7px', padding: '4px 6px', overflow: 'hidden', zIndex: 5 }}>
                      <p style={{ fontSize: '10px', fontWeight: 800, color: taxi.color, margin: '0 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.destination}
                      </p>
                      <p style={{ fontSize: '9px', color: taxi.color, opacity: 0.8, margin: 0 }}>
                        {format(dt, 'HH:mm')} · {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}m`}
                      </p>
                    </div>
                  )
                }}
              />
            )
          })}
          <GanttLegend />
        </div>
      </div>
    </div>
  )
}

// ── MONTH VIEW ──────────────────────────────────────────────
function MonthView({ bookings, cursor, onDayClick }: {
  bookings: BookingDetail[]; cursor: Date; onDayClick: (d: Date) => void
}) {
  const today = new Date()
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const days  = Array.from({ length: 42 }, (_, i) => addDays(start, i))

  return (
    <div style={{ padding: '14px 16px 20px' }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          {['M','T','W','T','F','S','S'].map((n, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '7px 0', fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>{n}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {days.map(d => {
            const inMonth = isSameMonth(d, cursor)
            const isToday = isSameDay(d, today)
            const bks     = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            return (
              <div key={d.toISOString()} onClick={() => onDayClick(d)} style={{ minHeight: 52, borderRight: '1px solid rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '4px', opacity: inMonth ? 1 : 0.3, cursor: 'pointer', background: isToday ? 'rgba(0,96,100,0.06)' : 'transparent' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 3, background: isToday ? '#006064' : 'transparent', fontSize: '11px', fontWeight: 700, color: isToday ? '#fff' : '#006064' }}>
                  {format(d, 'd')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {bks.slice(0, 3).map(b => (
                    <span key={b.id} style={{ width: 6, height: 6, borderRadius: '50%', background: b.taxi_color || '#9ca3af', display: 'inline-block' }} />
                  ))}
                  {bks.length > 3 && <span style={{ fontSize: '8px', color: '#9ca3af', fontWeight: 700 }}>+{bks.length - 3}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Shared Gantt row ────────────────────────────────────────
function GanttRow({ taxi, idx, bookings, renderBlock, nowLine, gridLines, totalW }: {
  taxi: any; idx: number; bookings: BookingDetail[]
  renderBlock: (b: BookingDetail) => React.ReactNode
  nowLine: React.ReactNode; gridLines: React.ReactNode; totalW: number
}) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.08)', background: idx % 2 === 0 ? '#fff' : '#f9f9f6' }}>
      <div style={{ width: 90, flexShrink: 0, padding: '8px 10px', borderRight: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#f9f9f6', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: taxi.is_available ? taxi.color : '#D1D5DB', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: 800, color: taxi.is_available ? '#006064' : '#9ca3af' }}>{taxi.name}</span>
        </div>
        <span style={{ fontSize: '9px', color: '#9ca3af', paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {taxi.is_available ? (taxi.driver_name || 'No driver') : 'Unavailable'}
        </span>
      </div>
      <div style={{ flex: 1, position: 'relative', height: ROW_H, minWidth: totalW }}>
        {gridLines}
        {!taxi.is_available && (
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(0,0,0,0.03) 5px,rgba(0,0,0,0.03) 10px)', zIndex: 1 }} />
        )}
        {nowLine}
        {bookings.map(b => renderBlock(b))}
        {bookings.length === 0 && taxi.is_available && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
            <span style={{ fontSize: '10px', color: '#D1D5DB', fontWeight: 600 }}>Free</span>
          </div>
        )}
      </div>
    </div>
  )
}

function GanttLegend() {
  return (
    <div style={{ padding: '8px 16px', background: '#fff', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 16, height: 2, background: '#EF4444' }} />
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>Now</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 20, height: 10, border: '1.5px solid #9ca3af', borderRadius: 2 }} />
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>Confirmed booking</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>Tap month day → Day view</span>
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)',
  cursor: 'pointer', fontSize: '14px', color: '#3f4949',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
