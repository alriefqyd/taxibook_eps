'use client'

import { useState, useRef, useEffect } from 'react'
import {
  format, startOfWeek, addDays, addMonths,
  isSameDay, isSameMonth, startOfMonth,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { BookingDetail } from '@/types'
import { STATUS_LABELS, STATUS_COLORS } from '@/types'

type ViewMode = 'day' | 'week' | 'month'

const HOUR_START = 7
const HOUR_END   = 19
const HOUR_W     = 80
const DAY_W      = 100
const ROW_H      = 52

interface GanttCalendarProps {
  bookings:       BookingDetail[]
  taxis:          any[]
  showCompleted?: boolean
  onRefresh?:     () => void
}

export default function GanttCalendar({ bookings, taxis, showCompleted = false }: GanttCalendarProps) {
  const [view,            setView]            = useState<ViewMode>('day')
  const [cursor,          setCursor]          = useState(new Date())
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null)
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

  const ganttBookings = bookings.filter(b =>
    showCompleted
      ? ['booked', 'on_trip', 'waiting_trip', 'completed'].includes(b.status)
      : ['booked', 'on_trip', 'waiting_trip'].includes(b.status)
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
      {view === 'day'   && <DayGantt   bookings={ganttBookings} taxis={taxis} cursor={cursor} scrollRef={dayRef}  onSelectBooking={setSelectedBooking} />}
      {view === 'week'  && <WeekGantt  bookings={ganttBookings} taxis={taxis} cursor={cursor} scrollRef={weekRef} onSelectBooking={setSelectedBooking} />}
      {view === 'month' && <MonthView  bookings={ganttBookings} cursor={cursor} onDayClick={d => { setCursor(d); setView('day') }} />}

      {/* ── Booking detail sheet ── */}
      {selectedBooking && (
        <BookingSheet booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
      )}
    </div>
  )
}

// ── DAY GANTT ───────────────────────────────────────────────
function DayGantt({ bookings, taxis, cursor, scrollRef, onSelectBooking }: {
  bookings: BookingDetail[]; taxis: any[]; cursor: Date; scrollRef: React.RefObject<HTMLDivElement>
  onSelectBooking: (b: BookingDetail) => void
}) {
  const today     = new Date()
  const dayBks    = bookings.filter(b => isSameDay(new Date(b.scheduled_at), cursor))
  const activeCnt = dayBks.filter(b => b.status !== 'completed').length
  const doneCnt   = dayBks.filter(b => b.status === 'completed').length
  const hours  = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START)
  const totalW = hours.length * HOUR_W

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>← scroll →</span>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          {activeCnt > 0 && `${activeCnt} confirmed`}
          {activeCnt > 0 && doneCnt > 0 && ' · '}
          {doneCnt > 0 && `${doneCnt} done`}
          {activeCnt === 0 && doneCnt === 0 && 'No trips'}
        </span>
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
                const dt          = new Date(b.scheduled_at)
                const startH      = dt.getHours() + dt.getMinutes() / 60
                const left        = (startH - HOUR_START) * HOUR_W
                const isDone      = b.status === 'completed'
                let durH: number
                if (isDone && b.completed_at) {
                  const endH = new Date(b.completed_at).getHours() + new Date(b.completed_at).getMinutes() / 60
                  durH = Math.min(Math.max(endH - startH, 0.3), HOUR_END - startH)
                } else {
                  durH = b.trip_type === 'WAITING'
                    ? Math.min(b.wait_minutes / 60 + 2, HOUR_END - startH)
                    : Math.min(2, HOUR_END - startH)
                }
                const width = Math.max(durH * HOUR_W - 4, 44)
                return (
                  <div key={b.id} onClick={() => onSelectBooking(b)} style={{ position: 'absolute', left: left + 2, top: 5, width, height: ROW_H - 10, background: isDone ? '#F1F5F9' : taxi.color + '22', border: `1.5px solid ${isDone ? '#CBD5E1' : taxi.color}`, borderRadius: '7px', padding: '4px 6px', overflow: 'hidden', zIndex: 5, opacity: isDone ? 0.85 : 1, cursor: 'pointer' }}>
                    <p style={{ fontSize: '10px', fontWeight: 800, color: isDone ? '#64748B' : taxi.color, margin: '0 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {isDone ? '✓ ' : ''}{b.passenger_name ?? '—'}
                    </p>
                    <p style={{ fontSize: '9px', color: isDone ? '#94a3b8' : taxi.color, opacity: isDone ? 1 : 0.8, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {isDone && b.completed_at
                        ? `Done ${format(new Date(b.completed_at), 'HH:mm')} · ${b.destination}`
                        : `${format(dt, 'HH:mm')} · ${b.destination}`}
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
function WeekGantt({ bookings, taxis, cursor, scrollRef, onSelectBooking }: {
  bookings: BookingDetail[]; taxis: any[]; cursor: Date; scrollRef: React.RefObject<HTMLDivElement>
  onSelectBooking: (b: BookingDetail) => void
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
                  const isDone = b.status === 'completed'
                  return (
                    <div key={b.id} onClick={() => onSelectBooking(b)} style={{ position: 'absolute', left: dayIdx * DAY_W + 2, top: 5, width: DAY_W - 6, height: ROW_H - 10, background: isDone ? '#F1F5F9' : taxi.color + '22', border: `1.5px solid ${isDone ? '#CBD5E1' : taxi.color}`, borderRadius: '7px', padding: '4px 6px', overflow: 'hidden', zIndex: 5, opacity: isDone ? 0.85 : 1, cursor: 'pointer' }}>
                      <p style={{ fontSize: '10px', fontWeight: 800, color: isDone ? '#64748B' : taxi.color, margin: '0 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isDone ? '✓ ' : ''}{b.passenger_name ?? '—'}
                      </p>
                      <p style={{ fontSize: '9px', color: isDone ? '#94a3b8' : taxi.color, opacity: isDone ? 1 : 0.8, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {format(dt, 'HH:mm')} · {b.destination}
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
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>Confirmed</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 20, height: 10, border: '1.5px solid #CBD5E1', borderRadius: 2, background: '#F1F5F9' }} />
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>✓ Completed</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>Tap month day → Day view</span>
      </div>
    </div>
  )
}

// ── Booking detail bottom sheet ─────────────────────────────
function BookingSheet({ booking: b, onClose }: { booking: BookingDetail; onClose: () => void }) {
  const sc    = STATUS_COLORS[b.status] ?? { bg: '#f3f4f6', text: '#374151' }
  const label = STATUS_LABELS[b.status] ?? b.status

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', maxHeight: '80vh', overflowY: 'auto' }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'rgba(0,0,0,0.12)', margin: '0 auto 16px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#006064', margin: 0, letterSpacing: '0.04em' }}>{b.booking_code}</p>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: sc.bg, color: sc.text }}>{label}</span>
        </div>

        {/* Passenger */}
        <Row label="Penumpang">
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1px' }}>{b.passenger_name}</p>
          {b.passenger_phone && <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{b.passenger_phone}</p>}
        </Row>

        {/* Driver / Taxi */}
        <Row label="Driver / Taxi">
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1px' }}>{b.driver_name ?? 'Belum ditugaskan'}</p>
          <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>
            {b.taxi_name ?? '—'}{b.taxi_plate ? ` · ${b.taxi_plate}` : ''}
          </p>
        </Row>

        {/* Route */}
        <Row label="Rute">
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600 }}>{b.pickup}</span>
            <span style={{ color: '#9ca3af', margin: '0 6px' }}>→</span>
            <span style={{ fontWeight: 600 }}>{b.destination}</span>
          </p>
        </Row>

        {/* Time */}
        <Row label="Waktu">
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>
            {format(new Date(b.scheduled_at), 'EEEE, dd MMMM yyyy · HH:mm', { locale: idLocale })}
          </p>
          {b.completed_at && (
            <p style={{ fontSize: 12, color: '#059669', margin: '0 0 2px' }}>
              Selesai: {format(new Date(b.completed_at), 'HH:mm')}
              {b.completed_by && (
                <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>
                  ({b.completed_by === 'driver' ? 'by driver' : b.completed_by === 'coordinator' ? 'by coordinator' : 'auto-completed'})
                </span>
              )}
            </p>
          )}
        </Row>

        {/* Trip type */}
        <Row label="Jenis">
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, display: 'inline-block', background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
            {b.trip_type === 'DROP' ? 'Drop' : `Waiting ${b.wait_minutes} menit`}
          </span>
        </Row>

        {/* Notes */}
        {b.notes && (
          <Row label="Catatan">
            <p style={{ fontSize: 13, margin: 0, color: '#6f7979' }}>{b.notes}</p>
          </Row>
        )}

        {/* Rejection reason */}
        {b.rejection_reason && (
          <Row label="Alasan ditolak">
            <p style={{ fontSize: 13, margin: 0, color: '#DC2626' }}>{b.rejection_reason}</p>
          </Row>
        )}

        {/* Contact actions */}
        {(b.driver_phone || b.passenger_phone) && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 8px' }}>Contact</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {b.driver_phone && (
                <div>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 5px', fontWeight: 600 }}>
                    Driver{b.driver_name ? ` · ${b.driver_name}` : ''}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <a href={`tel:${b.driver_phone}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, textDecoration: 'none', color: '#0369A1', fontSize: 13, fontWeight: 700 }}>
                      <PhoneIcon /> Call
                    </a>
                    <a href={`https://wa.me/${toWaNumber(b.driver_phone)}?text=${encodeURIComponent(buildWaMessage(b))}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, textDecoration: 'none', color: '#15803D', fontSize: 13, fontWeight: 700 }}>
                      <WaIcon /> WhatsApp
                    </a>
                  </div>
                </div>
              )}
              {b.passenger_phone && (
                <div>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 5px', fontWeight: 600 }}>
                    Passenger{b.passenger_name ? ` · ${b.passenger_name}` : ''}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <a href={`tel:${b.passenger_phone}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, textDecoration: 'none', color: '#0369A1', fontSize: 13, fontWeight: 700 }}>
                      <PhoneIcon /> Call
                    </a>
                    <a href={`https://wa.me/${toWaNumber(b.passenger_phone)}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, textDecoration: 'none', color: '#15803D', fontSize: 13, fontWeight: 700 }}>
                      <WaIcon /> WhatsApp
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <button onClick={onClose} style={{ width: '100%', padding: '13px', background: '#006064', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Tutup
        </button>
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 4px' }}>{label}</p>
      {children}
    </div>
  )
}

function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

function buildWaMessage(b: BookingDetail): string {
  const time = format(new Date(b.scheduled_at), 'EEE dd MMM yyyy · HH:mm', { locale: idLocale })
  const type = b.trip_type === 'DROP' ? 'Drop' : `Waiting ${b.wait_minutes} min`
  return [
    `📋 *TaxiBook – Trip Assignment*`,
    `━━━━━━━━━━━━━`,
    `🔖 *${b.booking_code}*`,
    `👤 Passenger: *${b.passenger_name}*`,
    `📍 From: ${b.pickup}`,
    `🏁 To: *${b.destination}*`,
    `🕐 Schedule: ${time}`,
    `🚗 Type: ${type}`,
    ...(b.notes ? [`📝 Notes: ${b.notes}`] : []),
    `━━━━━━━━━━━━━`,
    `Please confirm receipt of this trip.`,
  ].join('\n')
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)',
  cursor: 'pointer', fontSize: '14px', color: '#3f4949',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.63 4.35 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  )
}

function WaIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  )
}
