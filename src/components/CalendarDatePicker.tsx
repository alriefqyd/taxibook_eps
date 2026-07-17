'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { enUS, id as idLocale } from 'date-fns/locale'
import CalendarGrid from './CalendarGrid'

const FONT = "var(--font-inter), 'Inter', sans-serif"

interface Props {
  value: string                    // 'yyyy-MM-dd'
  onChange: (value: string) => void
  min?: string                     // 'yyyy-MM-dd'
  lang: 'en' | 'id'
  color?: string
  border?: string
  textPrimary?: string
  textTert?: string
}

export default function CalendarDatePicker({
  value, onChange, min, lang,
  color = '#006064', border = 'rgba(0,0,0,0.08)', textPrimary = '#006064', textTert = '#9ca3af',
}: Props) {
  const [open, setOpen] = useState(false)
  const locale   = lang === 'id' ? idLocale : enUS
  const selected = value ? new Date(`${value}T12:00:00`) : new Date()
  const minDate  = min ? new Date(`${min}T00:00:00`) : new Date()

  function selectDay(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
  }

  const summary = format(selected, lang === 'id' ? 'EEEE, d MMMM yyyy' : 'EEEE, MMMM d, yyyy', { locale })

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
        </div>
      )}
    </div>
  )
}
