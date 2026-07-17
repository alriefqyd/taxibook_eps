'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { enUS, id as idLocale } from 'date-fns/locale'
import CalendarGrid from './CalendarGrid'

const FONT = "var(--font-inter), 'Inter', sans-serif"

interface Props {
  value: string                    // 'yyyy-MM-ddTHH:mm', local wall-clock
  onChange: (value: string) => void
  min?: string                     // same format as value
  lang: 'en' | 'id'
  color?: string
  border?: string
  textPrimary?: string
  textTert?: string
}

function toValue(day: Date, time: string) {
  return `${format(day, 'yyyy-MM-dd')}T${time}`
}

export default function DateTimePicker({
  value, onChange, min, lang,
  color = '#006064', border = 'rgba(0,0,0,0.08)', textPrimary = '#006064', textTert = '#9ca3af',
}: Props) {
  const [open, setOpen] = useState(false)
  const [timeFocused, setTimeFocused] = useState(false)
  const locale  = lang === 'id' ? idLocale : enUS
  const selected = value ? new Date(value) : new Date()
  const minDate  = min ? new Date(min) : new Date()

  function selectDay(day: Date) {
    onChange(toValue(day, format(selected, 'HH:mm')))
  }

  function selectTime(time: string) {
    onChange(toValue(selected, time))
  }

  const summary = format(selected, lang === 'id' ? "EEE, d MMM · HH:mm" : "EEE, MMM d · HH:mm", { locale })

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box',
          background: '#F5F5F2', border: `1.5px solid ${open ? color : 'rgba(0,0,0,0.1)'}`,
          borderRadius: 16, padding: '12px 14px', cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>📅</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: textPrimary }}>{summary}</span>
        <span style={{ fontSize: 12, color: textTert, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, border: `1px solid ${border}`, borderRadius: 16, padding: 12, background: '#fff', boxSizing: 'border-box' }}>
          <CalendarGrid
            selected={selected}
            minDate={minDate}
            lang={lang}
            color={color}
            border={border}
            textPrimary={textPrimary}
            textTert={textTert}
            onSelect={selectDay}
          />

          {/* Time picker */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${border}` }}>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: textTert }}>
              {lang === 'id' ? 'Waktu' : 'Time'}
            </p>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box',
                border: `1.5px solid ${timeFocused ? color : border}`, borderRadius: 14,
                padding: '10px 14px', background: '#F5F5F2', transition: 'border-color 0.15s',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>🕒</span>
              <input
                type="time"
                step={60}
                value={format(selected, 'HH:mm')}
                onChange={(e) => selectTime(e.target.value)}
                onFocus={() => setTimeFocused(true)}
                onBlur={() => setTimeFocused(false)}
                style={{
                  flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 18, fontWeight: 700, letterSpacing: '0.02em', color: textPrimary, fontFamily: FONT,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
