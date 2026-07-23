'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  format, startOfWeek, addDays, addMonths,
  isSameDay, isSameMonth, startOfMonth,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useLang } from '@/lib/language'
import type { BookingDetail } from '@/types'
import StaffBookingSheet from './StaffBookingSheet'

type ViewMode = 'day' | 'week' | 'month'

export interface DayAssignment {
  taxi_id:        string
  assign_date:    string
  reason?:        string | null
  taxi_name?:     string | null
  taxi_plate?:    string | null
  driver_name?:   string | null
  driver_phone?:  string | null
  passenger_name?: string | null
  start_time?:    string | null
  end_time?:      string | null
}

const HOUR_START = 5
const HOUR_END   = 19
const HOUR_W     = 80
const DAY_W      = 100
const ROW_H      = 52

interface GanttCalendarProps {
  bookings:        BookingDetail[]
  taxis:           any[]
  showCompleted?:  boolean
  onRefresh?:      () => void
  dayAssignments?: DayAssignment[]
  onMapClick?:     () => void
  mapActive?:      boolean
  currentUserId?:  string
}

const MSG = {
  en: {
    viewDay:                 'Day',
    viewWeek:                'Week',
    viewMonth:               'Month',
    scrollHint:               '← scroll →',
    confirmedCount:           (n: number) => `${n} confirmed`,
    doneCount:                (n: number) => `${n} done`,
    noTrips:                  'No trips',
    fullDayRangeTapDetail:    (s: string, e: string) => `★ ${s}–${e}`,
    fullDayDutyTapDetail:     '★ FULL DAY DUTY',
    doneAt:                   (time: string, dest: string) => `Done ${time} · ${dest}`,
    confirmedThisWeek:        (n: number) => `${n} confirmed this week`,
    fullDayVertical:          '★ FULL DAY',
    fullDayShort:             'full day',
    legendPending:            'Pending',
    legendConfirmedTaxiColor: 'Confirmed (taxi color)',
    legendCompleted:          '✓ Completed',
    legendFullDayDuty:        'Full Day Duty',
    noDriver:                 'No driver',
    unavailable:              'Unavailable',
    free:                     'Free',
    legendNow:                'Now',
    legendConfirmed:          'Confirmed',
    tapMonthDay:              'Tap month day → Day view',
    partialDayDuty:           'PARTIAL DAY DUTY',
    fullDayDutyCaps:          'FULL DAY DUTY',
    fullDayBadgeText:         'Full Day',
    dateLabel:                'Date',
    taxiDriverLabel:          'Taxi / Driver',
    passengerLabel:           'Passenger',
    reasonLabel:               'Reason',
    closeLabel:               'Close',
    callBtn:                  'Call',
    whatsappBtn:              'WhatsApp',
    monthDayLetters:          ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  },
  id: {
    viewDay:                 'Hari',
    viewWeek:                'Minggu',
    viewMonth:               'Bulan',
    scrollHint:               '← geser →',
    confirmedCount:           (n: number) => `${n} terkonfirmasi`,
    doneCount:                (n: number) => `${n} selesai`,
    noTrips:                  'Tidak ada trip',
    fullDayRangeTapDetail:    (s: string, e: string) => `★ ${s}–${e}`,
    fullDayDutyTapDetail:     '★ TUGAS SEHARIAN',
    doneAt:                   (time: string, dest: string) => `Selesai ${time} · ${dest}`,
    confirmedThisWeek:        (n: number) => `${n} terkonfirmasi minggu ini`,
    fullDayVertical:          '★ SEHARIAN',
    fullDayShort:             'seharian',
    legendPending:            'Pending',
    legendConfirmedTaxiColor: 'Terkonfirmasi (warna taksi)',
    legendCompleted:          '✓ Selesai',
    legendFullDayDuty:        'Tugas Seharian',
    noDriver:                 'Tidak ada driver',
    unavailable:              'Tidak tersedia',
    free:                     'Bebas',
    legendNow:                'Sekarang',
    legendConfirmed:          'Terkonfirmasi',
    tapMonthDay:              'Ketuk tanggal di tampilan bulan → tampilan Hari',
    partialDayDuty:           'TUGAS PARUH HARI',
    fullDayDutyCaps:          'TUGAS SEHARIAN',
    fullDayBadgeText:         'Seharian Penuh',
    dateLabel:                'Tanggal',
    taxiDriverLabel:          'Taksi / Driver',
    passengerLabel:           'Penumpang',
    reasonLabel:               'Keterangan',
    closeLabel:               'Tutup',
    callBtn:                  'Telepon',
    whatsappBtn:              'WhatsApp',
    monthDayLetters:          ['S', 'S', 'R', 'K', 'J', 'S', 'M'],
  },
}

export default function GanttCalendar({ bookings, taxis, showCompleted = false, dayAssignments = [], onMapClick, mapActive = false, onRefresh, currentUserId }: GanttCalendarProps) {
  const lang = useLang()
  const t    = MSG[lang]
  const dateLocale = lang === 'id' ? idLocale : undefined
  const [view,                    setView]                    = useState<ViewMode>('day')
  const [cursor,                  setCursor]                  = useState(new Date())
  const [selectedBooking,         setSelectedBooking]         = useState<BookingDetail | null>(null)
  const [selectedDayAssignment,   setSelectedDayAssignment]   = useState<DayAssignment | null>(null)
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
    if (view === 'day')   return format(cursor, 'EEEE, d MMMM yyyy', { locale: dateLocale })
    if (view === 'week') {
      const mon = startOfWeek(cursor, { weekStartsOn: 1 })
      return `${format(mon, 'd MMM', { locale: dateLocale })} – ${format(addDays(mon, 6), 'd MMM yyyy', { locale: dateLocale })}`
    }
    return format(cursor, 'MMMM yyyy', { locale: dateLocale })
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
        {/* Icon toggle + Day/Week/Month pill — same row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: mapActive ? 0 : 10 }}>
          {onMapClick && (
            <div style={{ display: 'flex', background: '#F5F5F2', borderRadius: 8, padding: '2px', gap: '2px', flexShrink: 0 }}>
              <button onClick={() => { if (mapActive) onMapClick() }} style={{
                background: !mapActive ? '#ffffff' : 'transparent',
                border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
                color: !mapActive ? '#006064' : '#9ca3af',
                display: 'flex', alignItems: 'center',
                boxShadow: !mapActive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </button>
              <button onClick={() => { if (!mapActive) onMapClick() }} style={{
                background: mapActive ? '#ffffff' : 'transparent',
                border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
                color: mapActive ? '#006064' : '#9ca3af',
                display: 'flex', alignItems: 'center',
                boxShadow: mapActive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
                </svg>
              </button>
            </div>
          )}
          {!mapActive && (
            <div style={{ flex: 1, display: 'flex', background: '#F5F5F2', borderRadius: 9999, padding: '3px', gap: '2px' }}>
              {(['day', 'week', 'month'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => { setView(v); setCursor(new Date()) }} style={{
                  flex: 1, padding: '6px 4px', fontSize: '12px', fontWeight: 600,
                  border: 'none', borderRadius: 9999, cursor: 'pointer',
                  background: view === v ? '#ffffff' : 'transparent',
                  color: view === v ? '#0F1923' : '#9ca3af',
                  textTransform: 'capitalize',
                }}>
                  {v === 'day' ? t.viewDay : v === 'week' ? t.viewWeek : t.viewMonth}
                </button>
              ))}
            </div>
          )}
        </div>
        {!mapActive && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => navigate(-1)} style={navBtn}>←</button>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#006064', textAlign: 'center', flex: 1, padding: '0 8px' }}>
              {getNavLabel()}
            </span>
            <button onClick={() => navigate(1)} style={navBtn}>→</button>
          </div>
        )}
      </div>

      {/* ── Views ── */}
      {!mapActive && view === 'day'   && <DayGantt   bookings={ganttBookings} taxis={taxis} cursor={cursor} scrollRef={dayRef}  onSelectBooking={setSelectedBooking} dayAssignments={dayAssignments} onSelectDayAssignment={setSelectedDayAssignment} />}
      {!mapActive && view === 'week'  && <WeekGrid   bookings={ganttBookings} cursor={cursor} onSelectBooking={setSelectedBooking} dayAssignments={dayAssignments} onSelectDayAssignment={setSelectedDayAssignment} />}
      {!mapActive && view === 'month' && <MonthView  bookings={ganttBookings} cursor={cursor} onDayClick={d => { setCursor(d); setView('day') }} dayAssignments={dayAssignments} />}

      {/* ── Booking detail sheet ── */}
      {selectedBooking && (
        <StaffBookingSheet
          booking={selectedBooking}
          currentUserId={currentUserId}
          onClose={() => setSelectedBooking(null)}
          onCancelled={() => onRefresh?.()}
        />
      )}

      {/* ── Day assignment detail sheet ── */}
      {selectedDayAssignment && (
        <DayAssignmentSheet assignment={selectedDayAssignment} onClose={() => setSelectedDayAssignment(null)} />
      )}
    </div>
  )
}

// ── DAY GANTT ───────────────────────────────────────────────
function DayGantt({ bookings, taxis, cursor, scrollRef, onSelectBooking, dayAssignments, onSelectDayAssignment }: {
  bookings: BookingDetail[]; taxis: any[]; cursor: Date; scrollRef: React.RefObject<HTMLDivElement>
  onSelectBooking: (b: BookingDetail) => void
  dayAssignments: DayAssignment[]
  onSelectDayAssignment: (a: DayAssignment) => void
}) {
  const lang = useLang()
  const t    = MSG[lang]
  const today        = new Date()
  const cursorDateStr = format(cursor, 'yyyy-MM-dd')
  const dayBks       = bookings.filter(b => isSameDay(new Date(b.scheduled_at), cursor))
  const activeCnt = dayBks.filter(b => b.status !== 'completed').length
  const doneCnt   = dayBks.filter(b => b.status === 'completed').length
  const hours  = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START)
  const totalW = hours.length * HOUR_W

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{t.scrollHint}</span>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          {activeCnt > 0 && t.confirmedCount(activeCnt)}
          {activeCnt > 0 && doneCnt > 0 && ' · '}
          {doneCnt > 0 && t.doneCount(doneCnt)}
          {activeCnt === 0 && doneCnt === 0 && t.noTrips}
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
          {taxis.map((taxi, idx) => {
            const isFullDay = dayAssignments.some(a => a.taxi_id === taxi.id && a.assign_date === cursorDateStr)
            const fullDayAssignment = dayAssignments.find(a => a.taxi_id === taxi.id && a.assign_date === cursorDateStr)
            return (
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
              overlay={isFullDay && fullDayAssignment ? (() => {
                const hasRange = !!(fullDayAssignment.start_time && fullDayAssignment.end_time)
                const parseHour = (t: string) => {
                  const [h, m] = t.split(':').map(Number)
                  return h + m / 60
                }
                const startH = hasRange ? Math.max(parseHour(fullDayAssignment.start_time!), HOUR_START) : HOUR_START
                const endH   = hasRange ? Math.min(parseHour(fullDayAssignment.end_time!), HOUR_END)     : HOUR_END
                const left   = (startH - HOUR_START) * HOUR_W
                const width  = Math.max((endH - startH) * HOUR_W, 4)
                // Grey out once it's over — the whole viewed day is in the past, or (for a
                // partial-day duty) today's window has already ended — same treatment as a
                // completed regular booking block, instead of the active amber highlight.
                const nowH   = today.getHours() + today.getMinutes() / 60
                const isPast = cursorDateStr < format(today, 'yyyy-MM-dd')
                  || (isSameDay(cursor, today) && hasRange && nowH > endH)
                return (
                  <div onClick={() => onSelectDayAssignment(fullDayAssignment)} style={{
                    position: 'absolute', left, width, top: 4, bottom: 4,
                    background: isPast
                      ? '#F1F5F9'
                      : 'repeating-linear-gradient(135deg, rgba(254,179,0,0.14) 0px, rgba(254,179,0,0.14) 7px, rgba(254,179,0,0.26) 7px, rgba(254,179,0,0.26) 14px)',
                    border: isPast ? '1.5px solid #CBD5E1' : '1.5px solid #FCD34D',
                    borderLeft: isPast ? '4px solid #94a3b8' : '4px solid #F59E0B', borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 5, zIndex: 4, cursor: 'pointer', overflow: 'hidden', padding: '0 8px',
                    boxShadow: isPast ? 'none' : '0 1px 3px rgba(146,64,14,0.12)',
                    opacity: isPast ? 0.8 : 1,
                  }}>
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{isPast ? '✓' : '📋'}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: isPast ? '#64748B' : '#92400E', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hasRange
                        ? t.fullDayRangeTapDetail(fullDayAssignment.start_time!.slice(0, 5), fullDayAssignment.end_time!.slice(0, 5))
                        : t.fullDayDutyTapDetail}
                      {fullDayAssignment.reason && ` · ${fullDayAssignment.reason}`}
                    </span>
                  </div>
                )
              })() : undefined}
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
                } else if (b.auto_complete_at) {
                  const durationH = (new Date(b.auto_complete_at).getTime() - new Date(b.scheduled_at).getTime()) / 3_600_000
                  durH = Math.min(Math.max(durationH, 0.3), HOUR_END - startH)
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
                        ? t.doneAt(format(new Date(b.completed_at), 'HH:mm'), b.destination)
                        : `${format(dt, 'HH:mm')} · ${b.destination}`}
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

// ── WEEK GANTT ──────────────────────────────────────────────
function WeekGantt({ bookings, taxis, cursor, scrollRef, onSelectBooking, dayAssignments }: {
  bookings: BookingDetail[]; taxis: any[]; cursor: Date; scrollRef: React.RefObject<HTMLDivElement>
  onSelectBooking: (b: BookingDetail) => void
  dayAssignments: { taxi_id: string; assign_date: string }[]
}) {
  const lang = useLang()
  const t    = MSG[lang]
  const dateLocale = lang === 'id' ? idLocale : undefined
  const today  = new Date()
  const monday = startOfWeek(cursor, { weekStartsOn: 1 })
  const days   = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const totalW = days.length * DAY_W

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{t.scrollHint}</span>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          {t.confirmedThisWeek(bookings.filter(b => days.some(d => isSameDay(new Date(b.scheduled_at), d))).length)}
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
                    {format(d, 'EEE', { locale: dateLocale })}
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
                overlay={
                  <>
                    {days.map((d, i) => {
                      const isAssigned = dayAssignments.some(a => a.taxi_id === taxi.id && a.assign_date === format(d, 'yyyy-MM-dd'))
                      if (!isAssigned) return null
                      return (
                        <div key={d.toISOString()} style={{
                          position: 'absolute', left: i * DAY_W + 2, top: 4, width: DAY_W - 4, bottom: 4,
                          background: 'repeating-linear-gradient(135deg, rgba(254,179,0,0.14) 0px, rgba(254,179,0,0.14) 7px, rgba(254,179,0,0.26) 7px, rgba(254,179,0,0.26) 14px)',
                          border: '1.5px solid #FCD34D', borderTop: '4px solid #F59E0B', borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4, overflow: 'hidden',
                        }}>
                          <span style={{ fontSize: 8, fontWeight: 800, color: '#92400E', letterSpacing: '0.04em', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>★ {t.fullDayVertical}</span>
                        </div>
                      )
                    })}
                  </>
                }
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

// ── WEEK GRID (simple 7-column, matches staff view) ─────────
function WeekGrid({ bookings, cursor, onSelectBooking, dayAssignments = [], onSelectDayAssignment }: {
  bookings: BookingDetail[]
  cursor: Date
  onSelectBooking: (b: BookingDetail) => void
  dayAssignments: DayAssignment[]
  onSelectDayAssignment: (a: DayAssignment) => void
}) {
  const lang = useLang()
  const t    = MSG[lang]
  const dateLocale = lang === 'id' ? idLocale : undefined
  const today  = new Date()
  const monday = startOfWeek(cursor, { weekStartsOn: 1 })
  const days   = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <div style={{ padding: '14px 16px 20px' }}>
      <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          {days.map(d => {
            const isToday     = isSameDay(d, today)
            const isPastDay   = d < today && !isToday
            const dayStr      = format(d, 'yyyy-MM-dd')
            const assignCount = dayAssignments.filter(a => a.assign_date === dayStr).length
            return (
              <div key={d.toISOString()} style={{ textAlign: 'center', padding: '8px 2px', background: isToday ? '#006064' : assignCount > 0 ? (isPastDay ? 'rgba(148,163,184,0.12)' : 'rgba(254,179,0,0.12)') : 'transparent', borderRight: '1px solid rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: '8px', fontWeight: 700, color: isToday ? 'rgba(255,255,255,0.6)' : '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase' }}>
                  {format(d, 'EEE', { locale: dateLocale })}
                </p>
                <p style={{ fontSize: '15px', fontWeight: 700, color: isToday ? '#fff' : '#006064', margin: '0 0 2px', lineHeight: 1 }}>
                  {format(d, 'd')}
                </p>
                {assignCount > 0 && !isToday && (
                  <p style={{ fontSize: '8px', fontWeight: 700, color: isPastDay ? '#64748B' : '#7e5700', margin: 0 }}>{isPastDay ? '✓' : '★'} {assignCount}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Day columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', minHeight: 120 }}>
          {days.map(d => {
            const dayBks      = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            const dayStr      = format(d, 'yyyy-MM-dd')
            const isPastDay   = d < today && !isSameDay(d, today)
            const assignCount = dayAssignments.filter(a => a.assign_date === dayStr).length
            return (
              <div key={d.toISOString()} style={{ borderRight: '1px solid rgba(0,0,0,0.08)', padding: '4px 2px', minHeight: 120, background: assignCount > 0 ? (isPastDay ? 'rgba(148,163,184,0.08)' : 'rgba(254,179,0,0.06)') : 'transparent', overflow: 'hidden', minWidth: 0 }}>
                {assignCount > 0 && (
                  <div
                    onClick={() => {
                      const a = dayAssignments.find(x => x.assign_date === dayStr)
                      if (a) onSelectDayAssignment(a)
                    }}
                    style={{ fontSize: '7px', fontWeight: 700, color: isPastDay ? '#64748B' : '#7e5700', background: isPastDay ? 'rgba(148,163,184,0.2)' : 'rgba(254,179,0,0.18)', borderRadius: 3, padding: '1px 2px', marginBottom: 3, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                    {isPastDay ? '✓' : '★'} {t.fullDayShort}{assignCount > 1 ? ` ×${assignCount}` : ''}
                  </div>
                )}
                {dayBks.map(b => {
                  const color     = b.taxi_color || '#3f4949'
                  const isPending = b.status.includes('pending')
                  const isDone    = b.status === 'completed'
                  return (
                    <div
                      key={b.id}
                      onClick={() => onSelectBooking(b)}
                      style={{
                        background: isDone ? '#F1F5F9' : color + '20',
                        border: `1px ${isPending ? 'dashed' : 'solid'} ${isDone ? '#94a3b8' : color}`,
                        borderRadius: 3, padding: '2px 3px', marginBottom: 2,
                        fontSize: '8px', fontWeight: 700, color: isDone ? '#64748b' : color,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        width: '100%', boxSizing: 'border-box', cursor: 'pointer',
                        opacity: isDone ? 0.75 : 1,
                      }}
                    >
                      {isDone ? '✓ ' : ''}{format(new Date(b.scheduled_at), 'HH:mm')}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '14px', marginTop: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 20, height: 10, border: '1.5px dashed #9ca3af', borderRadius: 2 }} />
          <span style={{ fontSize: '10px', color: '#6B7C8F' }}>{t.legendPending}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 20, height: 10, border: '1.5px solid #2563EB', borderRadius: 2, background: '#2563EB20' }} />
          <span style={{ fontSize: '10px', color: '#6B7C8F' }}>{t.legendConfirmedTaxiColor}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 20, height: 10, border: '1.5px solid #CBD5E1', borderRadius: 2, background: '#F1F5F9' }} />
          <span style={{ fontSize: '10px', color: '#6B7C8F' }}>{t.legendCompleted}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '10px', color: '#7e5700', fontWeight: 700 }}>★</span>
          <span style={{ fontSize: '10px', color: '#6B7C8F' }}>{t.legendFullDayDuty}</span>
        </div>
      </div>
    </div>
  )
}

// ── MONTH VIEW ──────────────────────────────────────────────
function MonthView({ bookings, cursor, onDayClick, dayAssignments }: {
  bookings: BookingDetail[]; cursor: Date; onDayClick: (d: Date) => void
  dayAssignments: DayAssignment[]
}) {
  const lang = useLang()
  const t    = MSG[lang]
  const today = new Date()
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const days  = Array.from({ length: 42 }, (_, i) => addDays(start, i))

  return (
    <div style={{ padding: '14px 16px 20px' }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          {t.monthDayLetters.map((n, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '7px 0', fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>{n}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {days.map(d => {
            const inMonth    = isSameMonth(d, cursor)
            const isToday    = isSameDay(d, today)
            const bks        = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            const dateStr    = format(d, 'yyyy-MM-dd')
            const assignedCount = dayAssignments.filter(a => a.assign_date === dateStr).length
            return (
              <div key={d.toISOString()} onClick={() => onDayClick(d)} style={{ minHeight: 52, borderRight: '1px solid rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '4px', opacity: inMonth ? 1 : 0.3, cursor: 'pointer', background: assignedCount > 0 ? 'rgba(254,243,199,0.4)' : isToday ? 'rgba(0,96,100,0.06)' : 'transparent' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2, background: isToday ? '#006064' : 'transparent', fontSize: '11px', fontWeight: 700, color: isToday ? '#fff' : '#006064' }}>
                  {format(d, 'd')}
                </div>
                {assignedCount > 0 && (
                  <div style={{ fontSize: '8px', fontWeight: 800, color: '#92400E', background: '#FEF3C7', borderRadius: 3, padding: '1px 3px', marginBottom: 2, border: '1px solid #FCD34D', display: 'inline-block' }}>
                    ★ {assignedCount}
                  </div>
                )}
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
function GanttRow({ taxi, idx, bookings, renderBlock, nowLine, gridLines, totalW, overlay }: {
  taxi: any; idx: number; bookings: BookingDetail[]
  renderBlock: (b: BookingDetail) => React.ReactNode
  nowLine: React.ReactNode; gridLines: React.ReactNode; totalW: number
  overlay?: React.ReactNode
}) {
  const lang = useLang()
  const t    = MSG[lang]
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.08)', background: idx % 2 === 0 ? '#fff' : '#f9f9f6' }}>
      <div style={{ width: 90, flexShrink: 0, padding: '8px 10px', borderRight: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#f9f9f6', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: taxi.is_available ? taxi.color : '#D1D5DB', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: 800, color: taxi.is_available ? '#006064' : '#9ca3af' }}>{taxi.name}</span>
        </div>
        <span style={{ fontSize: '9px', color: '#9ca3af', paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {taxi.is_available ? (taxi.driver_name || t.noDriver) : t.unavailable}
        </span>
      </div>
      <div style={{ flex: 1, position: 'relative', height: ROW_H, minWidth: totalW }}>
        {gridLines}
        {!taxi.is_available && (
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(0,0,0,0.03) 5px,rgba(0,0,0,0.03) 10px)', zIndex: 1 }} />
        )}
        {overlay}
        {nowLine}
        {bookings.map(b => renderBlock(b))}
        {bookings.length === 0 && taxi.is_available && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
            <span style={{ fontSize: '10px', color: '#D1D5DB', fontWeight: 600 }}>{t.free}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function GanttLegend() {
  const lang = useLang()
  const t    = MSG[lang]
  return (
    <div style={{ padding: '8px 16px', background: '#fff', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 16, height: 2, background: '#EF4444' }} />
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>{t.legendNow}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 20, height: 10, border: '1.5px solid #9ca3af', borderRadius: 2 }} />
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>{t.legendConfirmed}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 20, height: 10, border: '1.5px solid #CBD5E1', borderRadius: 2, background: '#F1F5F9' }} />
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>{t.legendCompleted}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>{t.tapMonthDay}</span>
      </div>
    </div>
  )
}

// ── Day assignment detail bottom sheet ─────────────────────
export function DayAssignmentSheet({ assignment: a, onClose }: { assignment: DayAssignment; onClose: () => void }) {
  const lang = useLang()
  const t    = MSG[lang]
  const dateLocale = lang === 'id' ? idLocale : undefined

  if (typeof document === 'undefined') return null

  const dateLabel = (() => {
    try { return format(new Date(a.assign_date + 'T00:00:00'), 'EEEE, dd MMMM yyyy', { locale: dateLocale }) }
    catch { return a.assign_date }
  })()

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1101, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', maxHeight: '80vh', overflowY: 'auto' }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'rgba(0,0,0,0.12)', margin: '0 auto 16px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: 0, letterSpacing: '0.04em', flex: 1, minWidth: 0 }}>★ {a.start_time && a.end_time ? t.partialDayDuty : t.fullDayDutyCaps}</p>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: '#FEF3C7', color: '#92400E', flexShrink: 0 }}>
            {a.start_time && a.end_time ? `${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}` : t.fullDayBadgeText}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, flexShrink: 0, display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Date */}
        <Row label={t.dateLabel}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{dateLabel}</p>
        </Row>

        {/* Taxi / Driver */}
        <Row label={t.taxiDriverLabel}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1px' }}>
            {a.taxi_name ?? '—'}{a.taxi_plate ? ` · ${a.taxi_plate}` : ''}
          </p>
          <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{a.driver_name ?? t.noDriver}</p>
        </Row>

        {/* Passenger */}
        {a.passenger_name && (
          <Row label={t.passengerLabel}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>👤 {a.passenger_name}</p>
          </Row>
        )}

        {/* Reason */}
        {a.reason && (
          <Row label={t.reasonLabel}>
            <p style={{ fontSize: 13, margin: 0, color: '#6f7979' }}>{a.reason}</p>
          </Row>
        )}

        {/* Contact actions — Call and WhatsApp are both available to anyone
            viewing this sheet. */}
        {a.driver_phone && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <a
              href={`tel:${a.driver_phone}`}
              style={{ padding: '12px 8px', background: '#EFF6FF', color: '#0369A1', border: '1px solid #BAE6FD', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}
            >
              {t.callBtn}
            </a>
            <a
              href={`https://wa.me/${toWaNumber(a.driver_phone)}?text=${encodeURIComponent(buildWaMessage(a))}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '12px 8px', background: '#25D366', color: '#ffffff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}
            >
              {t.whatsappBtn}
            </a>
          </div>
        )}

      </div>
    </>,
    document.body
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

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)',
  cursor: 'pointer', fontSize: '14px', color: '#3f4949',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

function buildWaMessage(a: DayAssignment): string {
  const time = a.start_time ? `${a.start_time}${a.end_time ? `–${a.end_time}` : ''}` : ''
  const taxi = a.taxi_name ? `${a.taxi_name}${a.taxi_plate ? ` (${a.taxi_plate})` : ''}` : ''
  return [
    `📋 *Ridr – Penugasan Tugas*`,
    `━━━━━━━━━━━━━━━━━━`,
    `📍 ${taxi}`,
    ...(a.driver_name ? [`👤 ${a.driver_name}`] : []),
    ...(time ? [`🕐 ${time}`] : []),
    ...(a.passenger_name ? [`👥 ${a.passenger_name}`] : []),
    ...(a.reason ? [`📝 ${a.reason}`] : []),
  ].join('\n')
}

