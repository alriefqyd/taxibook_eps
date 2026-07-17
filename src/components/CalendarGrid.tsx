'use client'

import { useMemo, useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isBefore, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import { enUS, id as idLocale } from 'date-fns/locale'

const FONT = "var(--font-inter), 'Inter', sans-serif"

export interface CalendarGridProps {
  selected: Date
  minDate: Date
  lang: 'en' | 'id'
  color: string
  border: string
  textPrimary: string
  textTert: string
  onSelect: (day: Date) => void
}

export default function CalendarGrid({ selected, minDate, lang, color, border, textPrimary, textTert, onSelect }: CalendarGridProps) {
  const locale = lang === 'id' ? idLocale : enUS
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected))

  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth)
    const monthEnd   = endOfMonth(viewMonth)
    const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd    = startOfDay(endOfWeek(monthEnd, { weekStartsOn: 1 }))
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [viewMonth])

  const weekdayLabels = useMemo(
    () => gridDays.slice(0, 7).map(d => format(d, 'EEE', { locale })),
    [gridDays, locale],
  )

  const prevMonthDisabled = isBefore(endOfMonth(subMonths(viewMonth, 1)), startOfDay(minDate))
  const monthLabel = format(viewMonth, 'MMMM yyyy', { locale })

  function isDayDisabled(day: Date) {
    return isBefore(day, startOfDay(minDate)) || !isSameMonth(day, viewMonth)
  }

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => !prevMonthDisabled && setViewMonth(m => subMonths(m, 1))}
          disabled={prevMonthDisabled}
          style={{
            width: 30, height: 30, borderRadius: '50%', border: `1px solid ${border}`, background: '#fff',
            color: prevMonthDisabled ? textTert : textPrimary, cursor: prevMonthDisabled ? 'default' : 'pointer',
            opacity: prevMonthDisabled ? 0.4 : 1, fontSize: 14, fontFamily: FONT,
          }}
        >‹</button>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: textPrimary, textTransform: 'capitalize' }}>{monthLabel}</p>
        <button
          type="button"
          onClick={() => setViewMonth(m => addMonths(m, 1))}
          style={{
            width: 30, height: 30, borderRadius: '50%', border: `1px solid ${border}`, background: '#fff',
            color: textPrimary, cursor: 'pointer', fontSize: 14, fontFamily: FONT,
          }}
        >›</button>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {weekdayLabels.map((wd, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: textTert, textTransform: 'uppercase' }}>
            {wd.slice(0, 2)}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {gridDays.map(day => {
          const disabled = isDayDisabled(day)
          const sel = isSameDay(day, selected)
          const isToday = isSameDay(day, new Date())
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(day)}
              style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 10, border: isToday && !sel ? `1.5px solid ${color}` : '1.5px solid transparent',
                background: sel ? color : 'transparent',
                color: disabled ? textTert : sel ? '#fff' : textPrimary,
                opacity: disabled ? 0.35 : 1, fontSize: 12, fontWeight: sel ? 700 : 500,
                fontFamily: FONT, cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
