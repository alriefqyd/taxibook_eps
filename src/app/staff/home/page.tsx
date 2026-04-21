'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  format, startOfWeek, addDays, addMonths,
  isSameDay, isSameMonth, startOfMonth, endOfMonth,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { BookingDetail, User } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/types'

type ViewMode = 'day' | 'week' | 'month'

const HOUR_START = 7
const HOUR_END   = 19
const HOUR_W     = 80   // px per hour (day view)
const DAY_W      = 100  // px per day  (week view)
const ROW_H      = 52   // px per taxi row

export default function StaffHomePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,     setUser]     = useState<User | null>(null)
  const [bookings, setBookings] = useState<BookingDetail[]>([])
  const [taxis,    setTaxis]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [view,         setView]         = useState<ViewMode>('day')
  const [cursor,       setCursor]       = useState(new Date())
  const [selectedBk,   setSelectedBk]   = useState<any | null>(null)
  const dayScrollRef  = useRef<HTMLDivElement>(null)
  const weekScrollRef = useRef<HTMLDivElement>(null)

  async function loadData(userId: string) {
    const [{ data: bks }, { data: txs }] = await Promise.all([
      supabase
        .from('booking_details')
        .select('*')
        .eq('passenger_id', userId)
        .not('status', 'in', '("cancelled")')
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('taxis')
        .select('*, users!driver_id(name)')
        .eq('is_active', true)
        .order('name'),
    ])
    setBookings(bks || [])
    setTaxis((txs || []).map((t: any) => ({
      ...t,
      driver_name: t.users?.name || 'No driver',
    })))
  }

  // Separate reload for taxis only (availability changes)
  async function reloadTaxis() {
    const { data: txs } = await supabase
      .from('taxis')
      .select('*, users!driver_id(name)')
      .eq('is_active', true)
      .order('name')
    setTaxis((txs || []).map((t: any) => ({
      ...t,
      driver_name: t.users?.name || 'No driver',
    })))
  }

  useEffect(() => {
    let userId = ''
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      setUser(p)
      userId = au.id
      await loadData(au.id)
      setLoading(false)
    }
    init()
    const ch = supabase.channel('staff-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' },
        () => { if (userId) loadData(userId) })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Auto scroll to now
  useEffect(() => {
    if (loading) return
    const offset = (new Date().getHours() + new Date().getMinutes() / 60 - HOUR_START) * HOUR_W - 60
    if (dayScrollRef.current)  dayScrollRef.current.scrollLeft  = Math.max(0, offset)
    const today = new Date()
    const mon   = startOfWeek(cursor, { weekStartsOn: 1 })
    const dayIdx = Math.round((today.getTime() - mon.getTime()) / 86400000)
    if (weekScrollRef.current && dayIdx >= 0 && dayIdx < 7) {
      weekScrollRef.current.scrollLeft = Math.max(0, dayIdx * DAY_W - 40)
    }
  }, [loading, view])

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <p style={{ color:'#A8A6A0' }}>Loading...</p>
    </div>
  )

  const today        = new Date()
  const ACTIVE_STATUSES = ['booked','on_trip','waiting_trip']
  const activeBookings  = bookings.filter(b => ACTIVE_STATUSES.includes(b.status))
  const myBookings      = bookings // all non-cancelled for list below
  // Stats show today's fleet activity
  const todayBookings  = activeBookings.filter(b => isSameDay(new Date(b.scheduled_at), today))
  const pendingCount   = activeBookings.filter(b => b.status === 'pending_driver_approval').length

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
      return `${format(mon,'d MMM')} – ${format(addDays(mon,6),'d MMM yyyy')}`
    }
    return format(cursor, 'MMMM yyyy', { locale: idLocale })
  }

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', minHeight:'100vh', background:'#F4F3EF' }}>

      {/* ── Header ── */}
      <div style={{ background:'#fff', padding:'16px 20px 14px', borderBottom:'1px solid #E0DED8' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
          <div>
            <h1 style={{ fontSize:'18px', fontWeight:700, margin:'0 0 2px', letterSpacing:'-0.3px' }}>
              Good {getGreeting()}, {user?.name?.split(' ')[0]}
            </h1>
            <p style={{ fontSize:'12px', color:'#6B6963', margin:0 }}>
              {format(today, 'EEEE, d MMMM yyyy', { locale: idLocale })}
            </p>
          </div>
          <Avatar name={user?.name || ''} />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'12px' }}>
          <StatCard label="Active today" value={todayBookings.length} />
          <StatCard label="Awaiting driver" value={pendingCount} color="#92400E" bg="#FEF3C7" />
        </div>

        <Link href="/staff/book" style={{ textDecoration:'none', display:'block' }}>
          <button style={{ width:'100%', padding:'12px', background:'#0F0F0F', color:'#fff', border:'none', borderRadius:'12px', fontSize:'14px', fontWeight:700, cursor:'pointer' }}>
            + New booking
          </button>
        </Link>
      </div>

      {/* ── View tabs + nav ── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #E0DED8', padding:'12px 16px' }}>
        {/* Tabs */}
        <div style={{ display:'flex', background:'#ECEAE4', borderRadius:'999px', padding:'3px', gap:'2px', marginBottom:'10px' }}>
          {(['day','week','month'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => { setView(v); setCursor(new Date()) }} style={{
              flex:1, padding:'6px 4px', fontSize:'12px', fontWeight:600,
              border:'none', borderRadius:'999px', cursor:'pointer',
              background: view === v ? '#fff' : 'transparent',
              color: view === v ? '#0F0F0F' : '#A8A6A0',
              textTransform:'capitalize',
            }}>
              {v}
            </button>
          ))}
        </div>

        {/* Nav row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => navigate(-1)} style={navBtn}>←</button>
          <span style={{ fontSize:'13px', fontWeight:700, color:'#0F0F0F', textAlign:'center', flex:1, padding:'0 8px' }}>
            {getNavLabel()}
          </span>
          <button onClick={() => navigate(1)} style={navBtn}>→</button>
        </div>
      </div>

      {/* ── Views ── */}
      {view === 'day'   && <DayGantt   bookings={activeBookings} taxis={taxis} cursor={cursor} scrollRef={dayScrollRef} />}
      {view === 'week'  && <WeekView   bookings={activeBookings} cursor={cursor} />}
      {view === 'month' && <MonthView  bookings={bookings} cursor={cursor} onDayClick={d => { setCursor(d); setView('day') }} />}

      {/* ── My bookings list ── */}
      <div style={{ padding: '16px 16px 20px' }}>
        <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A6A0', margin: '0 0 10px' }}>
          My bookings
        </p>
        {myBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#A8A6A0', background: '#fff', borderRadius: '12px', border: '1px solid #E0DED8' }}>
            <p style={{ fontSize: '13px', margin: 0 }}>No bookings yet</p>
          </div>
        ) : (
          myBookings.map(b => {
            const sc = (STATUS_COLORS as any)[b.status]
            return (
              <div
                key={b.id}
                onClick={() => setSelectedBk(b)}
                style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: '14px', padding: '14px', marginBottom: '8px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.destination}
                    </p>
                    <p style={{ fontSize: '12px', color: '#6B6963', margin: 0 }}>
                      {new Date(b.scheduled_at).toLocaleString('id-ID', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                  {sc && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', flexShrink: 0, background: sc.bg, color: sc.text }}>{(STATUS_LABELS as any)[b.status]}</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: '1px solid #F0EEE8', paddingTop: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
                    {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}min`}
                  </span>
                  {b.taxi_name
                    ? <span style={{ fontSize: '11px', color: '#6B6963', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.taxi_color || '#888', display: 'inline-block' }} />
                        {b.taxi_name} · {b.driver_name}
                      </span>
                    : <span style={{ fontSize: '11px', color: '#A8A6A0', fontStyle: 'italic' }}>
                        {b.status === 'pending_coordinator_approval' ? 'Awaiting approval' : 'Awaiting driver'}
                      </span>
                  }
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Booking detail + cancel sheet ── */}
      {selectedBk && (
        <StaffBookingSheet
          booking={selectedBk}
          onClose={() => setSelectedBk(null)}
          onCancelled={() => { if (user) loadData(user.id) }}
        />
      )}
    </div>
  )
}

// ── DAY GANTT ───────────────────────────────────────────────
function DayGantt({ bookings, taxis, cursor, scrollRef }: {
  bookings: BookingDetail[]
  taxis: any[]
  cursor: Date
  scrollRef: React.RefObject<HTMLDivElement>
}) {
  const today    = new Date()
  const dayBks   = bookings.filter(b => isSameDay(new Date(b.scheduled_at), cursor))
  const hours    = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START)
  const totalW   = hours.length * HOUR_W

  return (
    <div style={{ paddingBottom: 20 }}>
      <div style={{ padding:'10px 16px 6px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:'11px', color:'#A8A6A0' }}>← scroll to see full day →</span>
        <span style={{ fontSize:'11px', color:'#A8A6A0' }}>{dayBks.length} booking{dayBks.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ overflowX:'auto' }} ref={scrollRef}>
        <div style={{ minWidth: totalW + 90 }}>

          {/* Time header */}
          <div style={{ display:'flex', marginLeft:90, borderBottom:'1px solid #E0DED8', background:'#fff', position:'sticky', top:0, zIndex:20 }}>
            {hours.map(h => (
              <div key={h} style={{ width:HOUR_W, flexShrink:0, padding:'5px 4px', borderLeft:'1px solid #F0EEE8' }}>
                <span style={{ fontSize:'10px', fontWeight:700, color:'#A8A6A0' }}>
                  {String(h).padStart(2,'0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {taxis.map((taxi, idx) => (
            <GanttRow
              key={taxi.id}
              taxi={taxi}
              idx={idx}
              bookings={dayBks.filter(b => b.taxi_id === taxi.id)}
              renderBlock={(b) => {
                const dt      = new Date(b.scheduled_at)
                const startH  = dt.getHours() + dt.getMinutes() / 60
                const left    = (startH - HOUR_START) * HOUR_W
                const durH    = b.trip_type === 'WAITING'
                  ? Math.min(b.wait_minutes / 60 + 2, HOUR_END - startH)
                  : Math.min(2, HOUR_END - startH)
                const width   = Math.max(durH * HOUR_W - 4, 44)
                const isPending = b.status.includes('pending')
                return (
                  <div key={b.id} style={{
                    position:'absolute', left:left+2, top:5,
                    width, height:ROW_H - 10,
                    background: taxi.color + '22',
                    border:`1.5px ${isPending?'dashed':'solid'} ${taxi.color}`,
                    borderRadius:'7px', padding:'4px 6px', overflow:'hidden', zIndex:5,
                  }}>
                    <p style={{ fontSize:'10px', fontWeight:800, color:taxi.color, margin:'0 0 1px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {b.destination}
                    </p>
                    <p style={{ fontSize:'9px', color:taxi.color, opacity:0.8, margin:0, whiteSpace:'nowrap' }}>
                      {format(dt,'HH:mm')} · {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}m`}
                    </p>
                  </div>
                )
              }}
              nowLine={
                isSameDay(cursor, today) ? (
                  <div style={{
                    position:'absolute',
                    left:`${(today.getHours() + today.getMinutes()/60 - HOUR_START)*HOUR_W}px`,
                    top:0, bottom:0, width:2, background:'#EF4444', zIndex:8,
                  }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#EF4444', position:'absolute', top:-3, left:-2 }} />
                  </div>
                ) : null
              }
              gridLines={hours.map(h => (
                <div key={h} style={{ position:'absolute', left:(h-HOUR_START)*HOUR_W, top:0, bottom:0, width:1, background:'#F0EEE8' }} />
              ))}
              totalW={totalW}
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
  bookings: BookingDetail[]
  taxis: any[]
  cursor: Date
  scrollRef: React.RefObject<HTMLDivElement>
}) {
  const today    = new Date()
  const monday   = startOfWeek(cursor, { weekStartsOn: 1 })
  const days     = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const totalW   = days.length * DAY_W

  return (
    <div style={{ paddingBottom:20 }}>
      <div style={{ padding:'10px 16px 6px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:'11px', color:'#A8A6A0' }}>← scroll to see full week →</span>
        <span style={{ fontSize:'11px', color:'#A8A6A0' }}>
          {bookings.filter(b => days.some(d => isSameDay(new Date(b.scheduled_at), d))).length} bookings this week
        </span>
      </div>
      <div style={{ overflowX:'auto' }} ref={scrollRef}>
        <div style={{ minWidth: totalW + 90 }}>

          {/* Day header */}
          <div style={{ display:'flex', marginLeft:90, borderBottom:'1px solid #E0DED8', background:'#fff', position:'sticky', top:0, zIndex:20 }}>
            {days.map(d => {
              const isToday   = isSameDay(d, today)
              const dayBkCount = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d)).length
              return (
                <div key={d.toISOString()} style={{
                  width:DAY_W, flexShrink:0, padding:'6px 4px',
                  borderLeft:'1px solid #F0EEE8', textAlign:'center',
                  background: isToday ? '#0F0F0F' : 'transparent',
                }}>
                  <p style={{ fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', color: isToday ? 'rgba(255,255,255,0.6)' : '#A8A6A0', margin:'0 0 2px' }}>
                    {format(d,'EEE',{locale:idLocale})}
                  </p>
                  <p style={{ fontSize:'15px', fontWeight:700, color: isToday ? '#fff' : '#0F0F0F', margin:'0 0 2px', lineHeight:1 }}>
                    {format(d,'d')}
                  </p>
                  {dayBkCount > 0 && (
                    <p style={{ fontSize:'9px', color: isToday ? 'rgba(255,255,255,0.6)' : '#A8A6A0', margin:0 }}>
                      {dayBkCount} trip{dayBkCount > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Rows */}
          {taxis.map((taxi, idx) => {
            const weekBks = bookings.filter(b =>
              days.some(d => isSameDay(new Date(b.scheduled_at), d)) &&
              b.taxi_id === taxi.id
            )
            return (
              <GanttRow
                key={taxi.id}
                taxi={taxi}
                idx={idx}
                bookings={weekBks}
                renderBlock={(b) => {
                  const dt      = new Date(b.scheduled_at)
                  const dayIdx  = days.findIndex(d => isSameDay(dt, d))
                  if (dayIdx < 0) return null
                  const left    = dayIdx * DAY_W + 2
                  const isPending = b.status.includes('pending')
                  return (
                    <div key={b.id} style={{
                      position:'absolute', left, top:5,
                      width: DAY_W - 6, height: ROW_H - 10,
                      background: taxi.color + '22',
                      border:`1.5px ${isPending?'dashed':'solid'} ${taxi.color}`,
                      borderRadius:'7px', padding:'4px 6px', overflow:'hidden', zIndex:5,
                    }}>
                      <p style={{ fontSize:'10px', fontWeight:800, color:taxi.color, margin:'0 0 1px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {b.destination}
                      </p>
                      <p style={{ fontSize:'9px', color:taxi.color, opacity:0.8, margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {format(dt,'HH:mm')} · {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}m`}
                      </p>
                    </div>
                  )
                }}
                nowLine={
                  days.some(d => isSameDay(d, today)) ? (
                    <div style={{
                      position:'absolute',
                      left: `${days.findIndex(d => isSameDay(d, today)) * DAY_W + (today.getHours() + today.getMinutes()/60)/24 * DAY_W}px`,
                      top:0, bottom:0, width:2, background:'#EF4444', zIndex:8,
                    }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:'#EF4444', position:'absolute', top:-3, left:-2 }} />
                    </div>
                  ) : null
                }
                gridLines={days.map((d, i) => (
                  <div key={d.toISOString()} style={{ position:'absolute', left:i*DAY_W, top:0, bottom:0, width:1, background: isSameDay(d, today) ? '#E0DED8' : '#F0EEE8' }} />
                ))}
                totalW={totalW}
              />
            )
          })}
          <GanttLegend />
        </div>
      </div>
    </div>
  )
}

// ── Shared Gantt row ────────────────────────────────────────
function GanttRow({ taxi, idx, bookings, renderBlock, nowLine, gridLines, totalW }: {
  taxi: any
  idx: number
  bookings: BookingDetail[]
  renderBlock: (b: BookingDetail) => React.ReactNode
  nowLine: React.ReactNode
  gridLines: React.ReactNode
  totalW: number
}) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid #E0DED8', background: idx % 2 === 0 ? '#fff' : '#FAFAF8' }}>
      {/* Label */}
      <div style={{
        width:90, flexShrink:0, padding:'8px 10px',
        borderRight:'1px solid #E0DED8',
        display:'flex', flexDirection:'column', justifyContent:'center', gap:2,
        position:'sticky', left:0,
        background: idx % 2 === 0 ? '#fff' : '#FAFAF8',
        zIndex:10,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background: taxi.is_available ? taxi.color : '#D1D5DB', flexShrink:0 }} />
          <span style={{ fontSize:'11px', fontWeight:800, color: taxi.is_available ? '#0F0F0F' : '#A8A6A0' }}>
            {taxi.name}
          </span>
        </div>
        <span style={{ fontSize:'9px', color:'#A8A6A0', paddingLeft:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {taxi.is_available ? taxi.driver_name : 'Unavailable'}
        </span>
      </div>

      {/* Timeline */}
      <div style={{ flex:1, position:'relative', height:ROW_H, minWidth:totalW }}>
        {gridLines}
        {!taxi.is_available && (
          <div style={{ position:'absolute', inset:0, background:'repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(0,0,0,0.03) 5px,rgba(0,0,0,0.03) 10px)', zIndex:1 }} />
        )}
        {nowLine}
        {bookings.map(b => renderBlock(b))}
        {bookings.length === 0 && taxi.is_available && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', paddingLeft:12 }}>
            <span style={{ fontSize:'10px', color:'#D1D5DB', fontWeight:600 }}>Free</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MONTH VIEW ──────────────────────────────────────────────
function MonthView({ bookings, cursor, onDayClick }: {
  bookings: BookingDetail[]
  cursor: Date
  onDayClick: (d: Date) => void
}) {
  const today  = new Date()
  const start  = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const days   = Array.from({ length: 42 }, (_, i) => addDays(start, i))

  return (
    <div style={{ padding:'14px 16px 20px' }}>
      <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #E0DED8', overflow:'hidden' }}>
        {/* Day name headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #E0DED8' }}>
          {['M','T','W','T','F','S','S'].map((n,i) => (
            <div key={i} style={{ textAlign:'center', padding:'7px 0', fontSize:'10px', fontWeight:700, color:'#A8A6A0', textTransform:'uppercase' }}>
              {n}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {days.map(d => {
            const inMonth = isSameMonth(d, cursor)
            const isToday = isSameDay(d, today)
            const bks     = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            return (
              <div
                key={d.toISOString()}
                onClick={() => onDayClick(d)}
                style={{ minHeight:52, borderRight:'1px solid #E0DED8', borderBottom:'1px solid #E0DED8', padding:'4px', opacity: inMonth ? 1 : 0.3, cursor:'pointer', background: isToday ? '#F8F7FF' : 'transparent' }}
              >
                <div style={{ width:20, height:20, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:3, background: isToday ? '#0F0F0F' : 'transparent', fontSize:'11px', fontWeight:700, color: isToday ? '#fff' : '#0F0F0F' }}>
                  {format(d,'d')}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>
                  {bks.slice(0,3).map(b => (
                    <span key={b.id} style={{ width:6, height:6, borderRadius:'50%', background: b.taxi_color || '#A8A6A0', opacity: b.status.includes('pending') ? 0.4 : 1, display:'inline-block' }} />
                  ))}
                  {bks.length > 3 && <span style={{ fontSize:'8px', color:'#A8A6A0', fontWeight:700 }}>+{bks.length-3}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display:'flex', gap:'14px', marginTop:'10px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:16, height:2, background:'#EF4444' }} />
          <span style={{ fontSize:'10px', color:'#A8A6A0' }}>Tap day → Day view</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#A8A6A0', opacity:0.4 }} />
          <span style={{ fontSize:'10px', color:'#A8A6A0' }}>Pending</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#2563EB' }} />
          <span style={{ fontSize:'10px', color:'#A8A6A0' }}>Confirmed (taxi color)</span>
        </div>
      </div>
    </div>
  )
}

// ── Gantt legend ────────────────────────────────────────────
function GanttLegend() {
  return (
    <div style={{ padding:'8px 16px', background:'#fff', borderTop:'1px solid #E0DED8', display:'flex', gap:'14px', flexWrap:'wrap' }}>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ display:'inline-block', width:16, height:2, background:'#EF4444' }} />
        <span style={{ fontSize:'10px', color:'#A8A6A0' }}>Now</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ display:'inline-block', width:20, height:10, border:'1.5px dashed #A8A6A0', borderRadius:2 }} />
        <span style={{ fontSize:'10px', color:'#A8A6A0' }}>Pending</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ display:'inline-block', width:20, height:10, border:'1.5px solid #A8A6A0', borderRadius:2 }} />
        <span style={{ fontSize:'10px', color:'#A8A6A0' }}>Confirmed</span>
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────
function StatCard({ label, value, color = '#0F0F0F', bg = '#F4F3EF' }: {
  label: string; value: number; color?: string; bg?: string
}) {
  return (
    <div style={{ background:bg, borderRadius:'10px', padding:'12px' }}>
      <p style={{ fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: color === '#0F0F0F' ? '#A8A6A0' : color, margin:'0 0 4px' }}>{label}</p>
      <p style={{ fontSize:'24px', fontWeight:700, margin:0, letterSpacing:'-0.5px', color }}>{value}</p>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('')
  return (
    <div style={{ width:40, height:40, borderRadius:'50%', background:'#DBEAFE', color:'#1E3A5F', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:700, flexShrink:0 }}>
      {initials}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

const navBtn: React.CSSProperties = {
  width:30, height:30, borderRadius:'50%',
  background:'#fff', border:'1px solid #E0DED8',
  cursor:'pointer', fontSize:'14px', color:'#6B6963',
  display:'flex', alignItems:'center', justifyContent:'center',
  flexShrink:0,
}

// ── WEEK VIEW (original grid) ───────────────────────────────
function WeekView({ bookings, cursor }: { bookings: BookingDetail[]; cursor: Date }) {
  const today  = new Date()
  const monday = startOfWeek(cursor, { weekStartsOn: 1 })
  const days   = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <div style={{ padding:'14px 16px 20px' }}>
      <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #E0DED8', overflow:'hidden' }}>

        {/* Day headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #E0DED8' }}>
          {days.map(d => {
            const isToday = isSameDay(d, today)
            return (
              <div key={d.toISOString()} style={{ textAlign:'center', padding:'8px 2px', background: isToday ? '#0F0F0F' : 'transparent', borderRight:'1px solid #E0DED8' }}>
                <p style={{ fontSize:'8px', fontWeight:700, color: isToday ? 'rgba(255,255,255,0.6)' : '#A8A6A0', margin:'0 0 2px', textTransform:'uppercase' }}>
                  {format(d,'EEE',{locale:idLocale})}
                </p>
                <p style={{ fontSize:'15px', fontWeight:700, color: isToday ? '#fff' : '#0F0F0F', margin:0 }}>
                  {format(d,'d')}
                </p>
              </div>
            )
          })}
        </div>

        {/* Day columns */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', minHeight:120 }}>
          {days.map(d => {
            const dayBks = bookings.filter(b => isSameDay(new Date(b.scheduled_at), d))
            return (
              <div key={d.toISOString()} style={{ borderRight:'1px solid #E0DED8', padding:'4px 2px', minHeight:120 }}>
                {dayBks.map(b => {
                  const color     = b.taxi_color || '#6B6963'
                  const isPending = b.status.includes('pending')
                  return (
                    <div key={b.id} style={{
                      background: color + '20',
                      border:`1px ${isPending?'dashed':'solid'} ${color}`,
                      borderRadius:3, padding:'2px 4px', marginBottom:2,
                      fontSize:'9px', fontWeight:700, color,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    }}>
                      {format(new Date(b.scheduled_at),'HH:mm')} {b.destination.split(' ')[0]}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:'14px', marginTop:'10px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:20, height:10, border:'1.5px dashed #A8A6A0', borderRadius:2 }} />
          <span style={{ fontSize:'10px', color:'#A8A6A0' }}>Pending</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ display:'inline-block', width:20, height:10, border:'1.5px solid #2563EB', borderRadius:2, background:'#2563EB20' }} />
          <span style={{ fontSize:'10px', color:'#A8A6A0' }}>Confirmed (taxi color)</span>
        </div>
      </div>
    </div>
  )
}

// ── Staff booking detail + cancel sheet ────────────────────
// Add this to the bottom of the file and wire it into the header
function StaffBookingSheet({ booking, onClose, onCancelled }: {
  booking: any
  onClose: () => void
  onCancelled: () => void
}) {
  const supabase = createClient()
  const [cancelling,   setCancelling]   = React.useState(false)
  const [showCancel,   setShowCancel]   = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [error,        setError]        = React.useState('')

  async function handleCancel() {
    setCancelling(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Session expired'); setCancelling(false); return }

    const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ reason: cancelReason }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to cancel')
      setCancelling(false)
      return
    }

    onCancelled()
    onClose()
  }

  const canCancel = ['submitted','pending_coordinator_approval','pending_driver_approval','booked']
    .includes(booking.status)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E0DED8', margin: '0 auto 20px' }} />

        {/* Booking header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
              {booking.destination}
            </p>
            <p style={{ fontSize: '13px', color: '#6B6963', margin: 0 }}>
              {booking.scheduled_at && new Date(booking.scheduled_at).toLocaleString('id-ID', {
                weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
              })}
            </p>
          </div>
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px',
            background: booking.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE',
            color: booking.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95',
          }}>
            {booking.trip_type === 'DROP' ? 'Drop' : `Wait ${booking.wait_minutes}min`}
          </span>
        </div>

        {/* Details */}
        <div style={{ background: '#F4F3EF', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px' }}>
          {[
            { label: 'Booking ID',  value: booking.booking_code },
            { label: 'Pickup',      value: booking.pickup },
            { label: 'Status',      value: booking.status?.replace(/_/g,' ') },
            { label: 'Taxi',        value: booking.taxi_name ? `${booking.taxi_name} · ${booking.driver_name}` : 'Not assigned yet' },
            ...(booking.notes ? [{ label: 'Notes', value: booking.notes }] : []),
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: i < arr.length - 1 ? '8px' : '0', marginBottom: i < arr.length - 1 ? '8px' : '0', borderBottom: i < arr.length - 1 ? '1px solid #E0DED8' : 'none' }}>
              <span style={{ fontSize: '12px', color: '#6B6963' }}>{row.label}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right', maxWidth: '60%', textTransform: 'capitalize' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Cancel section */}
        {canCancel && !showCancel && (
          <button
            onClick={() => setShowCancel(true)}
            style={{ width: '100%', padding: '12px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            Cancel this booking
          </button>
        )}

        {canCancel && showCancel && (
          <div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A6A0', marginBottom: '6px' }}>
                Reason for cancellation
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. I no longer need the taxi"
                style={{ width: '100%', padding: '11px 14px', fontSize: '14px', border: '1.5px solid #E0DED8', borderRadius: '10px', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            {error && (
              <p style={{ fontSize: '12px', color: '#991B1B', margin: '0 0 10px', background: '#FEE2E2', padding: '8px 12px', borderRadius: '8px' }}>{error}</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => setShowCancel(false)} style={{ padding: '12px', background: 'transparent', border: '1.5px solid #E0DED8', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Go back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ padding: '12px', background: '#991B1B', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                {cancelling ? 'Cancelling...' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        )}

        {!canCancel && (
          <div style={{ background: '#F4F3EF', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: '#6B6963', margin: 0 }}>
              {booking.status === 'completed' ? 'This trip has been completed.' : 'This booking cannot be cancelled.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
