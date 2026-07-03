'use client'

import { useEffect, useState, useCallback } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { format, isSameDay } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'

const DriverFleetMap = dynamic(() => import('@/components/map/DriverFleetMap'), { ssr: false })

const MSG = {
  en: {
    title:           'Dispatch',
    subtitle:        'Manage & reassign all trip schedules',
    allDates:        'All dates',
    today:           'Today',
    filterAll:       'All',
    filterUnassigned:'Unassigned',
    filterBooked:    'Confirmed',
    filterActive:    'Active',
    fleetStatus:     'Fleet status',
    noDriver:        'No driver',
    unavailable:     'Unavailable',
    activeNow:       '🚗 Active',
    bookedCount:     (n: number) => `${n} booked`,
    free:            'Free',
    showMap:         '🗺 Show fleet map',
    hideMap:         '🗺 Hide fleet map',
    noBookings:      'No bookings',
    noBookingsFor:   (date: string) => `No trips match this filter for ${date}`,
    dropBadge:       '→ Drop',
    waitBadge:       (n: number) => `⏱ Wait ${n}min`,
    noTaxi:          '⚠ No taxi assigned',
    tripInProgress:  'Trip in progress — cannot reassign',
    reassignTaxi:    '🔄 Reassign taxi',
    reassignTitle:   'Reassign trip',
    selectTaxi:      'Select taxi',
    reasonOpt:       'Reason (optional)',
    reasonPlaceholder: 'e.g. Driver unavailable, schedule conflict...',
    conflictTitle:   '⚠ Schedule conflict',
    conflictBody:    'This taxi has another booking at this time. You can still assign — driver will be notified.',
    cancel:          'Cancel',
    confirmReassign: 'Confirm reassign',
    saving:          'Saving...',
    unavailTaxi:     '○ Unavailable',
    freeTaxi:        '✓ Free at this time',
    conflictTaxi:    '✗ Has conflict',
    current:         'Current',
  },
  id: {
    title:           'Dispatch',
    subtitle:        'Kelola & atur ulang semua jadwal trip',
    allDates:        'Semua tanggal',
    today:           'Hari ini',
    filterAll:       'Semua',
    filterUnassigned:'Belum diassign',
    filterBooked:    'Terkonfirmasi',
    filterActive:    'Aktif',
    fleetStatus:     'Status armada',
    noDriver:        'Tidak ada driver',
    unavailable:     'Tidak tersedia',
    activeNow:       '🚗 Aktif',
    bookedCount:     (n: number) => `${n} booking`,
    free:            'Bebas',
    showMap:         '🗺 Tampilkan peta armada',
    hideMap:         '🗺 Sembunyikan peta armada',
    noBookings:      'Tidak ada booking',
    noBookingsFor:   (date: string) => `Tidak ada trip untuk filter ini pada ${date}`,
    dropBadge:       '→ Drop',
    waitBadge:       (n: number) => `⏱ Tunggu ${n}mnt`,
    noTaxi:          '⚠ Belum ada taksi',
    tripInProgress:  'Trip sedang berlangsung — tidak bisa diatur ulang',
    reassignTaxi:    '🔄 Atur ulang taksi',
    reassignTitle:   'Atur ulang trip',
    selectTaxi:      'Pilih taksi',
    reasonOpt:       'Alasan (opsional)',
    reasonPlaceholder: 'mis. Driver tidak tersedia, konflik jadwal...',
    conflictTitle:   '⚠ Konflik jadwal',
    conflictBody:    'Taksi ini sudah punya booking di waktu yang sama. Anda tetap bisa assign — driver akan diberitahu.',
    cancel:          'Batal',
    confirmReassign: 'Konfirmasi penugasan ulang',
    saving:          'Menyimpan...',
    unavailTaxi:     '○ Tidak tersedia',
    freeTaxi:        '✓ Bebas di waktu ini',
    conflictTaxi:    '✗ Ada konflik',
    current:         'Saat ini',
  },
}

const FONT = "var(--font-inter), 'Inter', sans-serif"

interface Booking {
  id:             string
  booking_code:   string
  passenger_name: string
  pickup:         string
  destination:    string
  trip_type:      string
  wait_minutes:   number
  scheduled_at:   string
  status:         string
  notes:          string | null
  taxi_id:        string | null
  taxi_name:      string | null
  taxi_color:     string | null
  driver_name:    string | null
  passenger_id:   string
}

interface Taxi {
  id:          string
  name:        string
  color:       string
  driver_id:   string | null
  driver_name: string | null
  is_available: boolean
  is_active:   boolean
}

type FilterStatus = 'all' | 'unassigned' | 'booked' | 'active'

export default function DispatchPage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [bookings,    setBookings]    = useState<Booking[]>([])
  const [taxis,       setTaxis]       = useState<Taxi[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState<FilterStatus>('all')
  const [dateFilter,  setDateFilter]  = useState(new Date().toISOString().slice(0, 10))
  const [reassigning, setReassigning] = useState<string | null>(null)
  const [selected,    setSelected]    = useState<Booking | null>(null)
  const [showMap,     setShowMap]     = useState(false)
  const [newTaxiId,   setNewTaxiId]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const [reason,      setReason]      = useState('')

  const loadData = useCallback(async () => {
    const [{ data: bks }, { data: txs }] = await Promise.all([
      supabase.from('booking_details').select('*')
        .not('status', 'in', '("cancelled","rejected","completed")')
        .order('scheduled_at', { ascending: true }),
      supabase.from('taxis').select('*, users!driver_id(name)')
        .eq('is_active', true).order('name'),
    ])
    setBookings(bks || [])
    setTaxis((txs || []).map((taxi: any) => ({
      ...taxi, driver_name: taxi.users?.name || null
    })))
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      await loadData()
      setLoading(false)
    }
    init()
    const ch = supabase.channel('dispatch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Check taxi availability when booking is selected
  async function checkAvailability(booking: Booking) {
    const scheduledTime = new Date(booking.scheduled_at)
    const avail: Record<string, boolean> = {}

    for (const taxi of taxis) {
      if (!taxi.driver_id || !taxi.is_active) { avail[taxi.id] = false; continue }

      const { data: conflict } = await supabase
        .from('bookings')
        .select('id')
        .eq('taxi_id', taxi.id)
        .neq('id', booking.id)
        .in('status', ['booked','on_trip','waiting_trip','booked'])
        .gt('auto_complete_at', scheduledTime.toISOString())
        .lte('scheduled_at', new Date(scheduledTime.getTime() + 2 * 3600000).toISOString())
        .limit(1).maybeSingle()

      avail[taxi.id] = !conflict
    }
    setAvailability(avail)
  }

  async function openReassign(booking: Booking) {
    setSelected(booking)
    setNewTaxiId(booking.taxi_id || '')
    setReason('')
    await checkAvailability(booking)
    setReassigning(booking.id)
  }

  async function confirmReassign() {
    if (!selected || !newTaxiId) return
    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    const res = await fetch(`/api/bookings/${selected.id}/reassign`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ new_taxi_id: newTaxiId, reason }),
    })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert('Error: ' + (d.error || 'Failed to reassign'))
    } else {
      setReassigning(null)
      setSelected(null)
      await loadData()
    }
    setSaving(false)
  }

  if (loading) return <PageLoader />

  // Filter bookings — show all if dateFilter is empty, otherwise filter by date
  const dateFiltered = dateFilter
    ? bookings.filter(b => isSameDay(new Date(b.scheduled_at), new Date(dateFilter)))
    : bookings

  const filtered = dateFiltered.filter(b => {
    if (filter === 'unassigned') return !b.taxi_id || b.status === 'submitted' || b.status === 'pending_coordinator_approval'
    if (filter === 'booked')     return b.status === 'booked'
    if (filter === 'active')     return ['on_trip','waiting_trip'].includes(b.status)
    return true
  })

  const counts = {
    all:        dateFiltered.length,
    unassigned: dateFiltered.filter(b => !b.taxi_id || ['submitted','pending_coordinator_approval'].includes(b.status)).length,
    booked:     dateFiltered.filter(b => b.status === 'booked').length,
    active:     dateFiltered.filter(b => ['on_trip','waiting_trip'].includes(b.status)).length,
  }

  const statusColors: Record<string, { bg: string; text: string }> = {
    submitted:                    { bg: '#DBEAFE', text: '#1E3A5F' },
    pending_coordinator_approval: { bg: '#FEF3C7', text: '#92400E' },
    booked:                       { bg: '#D8F3DC', text: '#2D6A4F' },
    on_trip:                      { bg: '#D8F3DC', text: '#2D6A4F' },
    waiting_trip:                 { bg: '#EDE9FE', text: '#4C1D95' },
  }

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F5F5F2', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Header ── */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '16px 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={() => router.push('/coordinator/home')} style={{ width: 32, height: 32, borderRadius: '50%', background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.2px' }}>{t.title}</h1>
            <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{t.subtitle}</p>
          </div>
        </div>

        {/* Date picker */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', fontSize: 14, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 12, background: '#ffffff', fontFamily: FONT, outline: 'none' }}
          />
          <button
            onClick={() => setDateFilter('')}
            style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 12, background: !dateFilter ? '#006064' : '#fff', color: !dateFilter ? '#fff' : '#3f4949', cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}
          >
            {t.allDates}
          </button>
          <button
            onClick={() => setDateFilter(new Date().toISOString().slice(0, 10))}
            style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 12, background: dateFilter === new Date().toISOString().slice(0, 10) ? '#006064' : '#fff', color: dateFilter === new Date().toISOString().slice(0, 10) ? '#fff' : '#3f4949', cursor: 'pointer', fontFamily: FONT }}
          >
            {t.today}
          </button>
        </div>

        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {([
            { key: 'all',        label: t.filterAll },
            { key: 'unassigned', label: t.filterUnassigned },
            { key: 'booked',     label: t.filterBooked },
            { key: 'active',     label: t.filterActive },
          ] as { key: FilterStatus; label: string }[]).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${filter === f.key ? '#006064' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: 9999, cursor: 'pointer', fontFamily: FONT, flexShrink: 0,
              background: filter === f.key ? '#006064' : '#fff',
              color:      filter === f.key ? '#fff'    : '#3f4949',
            }}>
              {f.label} {counts[f.key] > 0 && <span style={{ opacity: 0.7 }}>({counts[f.key]})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Fleet status strip ── */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px' }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>{t.fleetStatus}</p>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {taxis.map(taxi => {
            const taxiBookings = dateFiltered.filter(b => b.taxi_id === taxi.id)
            const active = taxiBookings.find(b => ['on_trip','waiting_trip'].includes(b.status))
            const booked = taxiBookings.filter(b => b.status === 'booked').length
            return (
              <div key={taxi.id} style={{ flexShrink: 0, background: '#F5F5F2', borderRadius: 12, padding: '8px 12px', borderLeft: `3px solid ${taxi.is_available && taxi.driver_id ? taxi.color : '#D1D5DB'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: taxi.is_available && taxi.driver_id ? taxi.color : '#D1D5DB', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{taxi.name}</span>
                </div>
                <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{taxi.driver_name ?? t.noDriver}</p>
                <p style={{ fontSize: 10, fontWeight: 600, margin: 0, color: active ? '#2D6A4F' : !taxi.is_available ? '#991B1B' : '#3f4949' }}>
                  {!taxi.driver_id ? t.noDriver : !taxi.is_available ? t.unavailable : active ? t.activeNow : booked > 0 ? t.bookedCount(booked) : t.free}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Fleet map toggle ── */}
      <div style={{ padding: '10px 16px 0' }}>
        <button
          onClick={() => setShowMap(v => !v)}
          style={{
            width: '100%', padding: '10px', fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${showMap ? '#006064' : 'rgba(0,0,0,0.1)'}`,
            borderRadius: 12, cursor: 'pointer',
            background: showMap ? '#006064' : '#ffffff',
            color: showMap ? '#ffffff' : '#3f4949',
            fontFamily: FONT,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {showMap ? t.hideMap : t.showMap}
        </button>
        {showMap && (
          <div style={{ marginTop: 10 }}>
            <DriverFleetMap />
          </div>
        )}
      </div>

      {/* ── Bookings list ── */}
      <div style={{ padding: '14px 16px 32px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af', background: '#ffffff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: 32, margin: '0 0 10px' }}>📋</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#006064', margin: '0 0 4px' }}>{t.noBookings}</p>
            <p style={{ fontSize: 13, margin: 0 }}>
              {dateFilter
                ? t.noBookingsFor(format(new Date(dateFilter), 'd MMMM yyyy', { locale: idLocale }))
                : t.noBookings}
            </p>
          </div>
        ) : (
          filtered.map(b => {
            const sc      = statusColors[b.status] || { bg: 'rgba(0,0,0,0.04)', text: '#3f4949' }
            const isActive = ['on_trip','waiting_trip'].includes(b.status)
            return (
              <div key={b.id} style={{ background: '#ffffff', border: `1px solid rgba(0,0,0,0.08)`, borderRadius: 16, padding: '14px', marginBottom: 10, borderLeft: b.taxi_color ? `3px solid ${b.taxi_color}` : '3px solid rgba(0,0,0,0.08)' }}>
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.passenger_name}
                    </p>
                    <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>
                      {format(new Date(b.scheduled_at), 'HH:mm')} · {b.pickup} → {b.destination}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: sc.bg, color: sc.text, flexShrink: 0 }}>
                    {b.status.replace(/_/g,' ')}
                  </span>
                </div>

                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
                    {b.trip_type === 'DROP' ? t.dropBadge : t.waitBadge(b.wait_minutes)}
                  </span>
                  {b.taxi_name ? (
                    <span style={{ fontSize: 11, color: '#6f7979', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: b.taxi_color || '#888', display: 'inline-block' }} />
                      {b.taxi_name} · {b.driver_name}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>{t.noTaxi}</span>
                  )}
                </div>

                {/* Reassign button — disabled for active trips */}
                {isActive ? (
                  <div style={{ background: '#F5F5F2', borderRadius: 10, padding: '7px 12px', textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{t.tripInProgress}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => openReassign(b)}
                    style={{ width: '100%', padding: '9px', background: '#F5F5F2', color: '#006064', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
                  >
                    {t.reassignTaxi}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Reassign sheet ── */}
      {reassigning && selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
          onClick={() => { setReassigning(null); setSelected(null) }}
        >
          <div
            style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', margin: '0 auto 20px' }} />

            <p style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.2px' }}>{t.reassignTitle}</p>
            <p style={{ fontSize: 13, color: '#6f7979', margin: '0 0 16px' }}>
              {selected.passenger_name} · {format(new Date(selected.scheduled_at), 'HH:mm')} → {selected.destination}
            </p>

            {/* Taxi options */}
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>{t.selectTaxi}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {taxis.filter(taxi => taxi.driver_id).map(taxi => {
                const isSelected  = newTaxiId === taxi.id
                const isCurrent   = selected.taxi_id === taxi.id
                const isFree      = availability[taxi.id]
                const isUnavail   = !taxi.is_available

                return (
                  <div
                    key={taxi.id}
                    onClick={() => !isUnavail && setNewTaxiId(taxi.id)}
                    style={{
                      padding: '12px 14px', borderRadius: 16, cursor: isUnavail ? 'not-allowed' : 'pointer',
                      border: `${isSelected ? 2 : 1}px solid ${isSelected ? '#006064' : 'rgba(0,0,0,0.08)'}`,
                      background: isSelected ? 'rgba(0,0,0,0.04)' : '#fff',
                      opacity: isUnavail ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: taxi.color, flexShrink: 0, display: 'inline-block' }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px' }}>{taxi.name} · {taxi.driver_name}</p>
                        <p style={{ fontSize: 11, margin: 0, color: isFree ? '#2D6A4F' : '#EF4444', fontWeight: 600 }}>
                          {isUnavail ? t.unavailTaxi : isFree ? t.freeTaxi : t.conflictTaxi}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isCurrent && <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{t.current}</span>}
                      {isSelected && <span style={{ fontSize: 16 }}>✓</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Reason */}
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 6px' }}>{t.reasonOpt}</p>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t.reasonPlaceholder}
              style={{ width: '100%', padding: '11px 14px', fontSize: 14, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 12, fontFamily: FONT, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
            />

            {/* Conflict warning */}
            {newTaxiId && availability[newTaxiId] === false && (
              <div style={{ background: '#ffdeac', border: '1px solid #FCD34D', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#7e5700', margin: '0 0 2px' }}>{t.conflictTitle}</p>
                <p style={{ fontSize: 12, color: '#7e5700', margin: 0 }}>{t.conflictBody}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                onClick={() => { setReassigning(null); setSelected(null) }}
                style={{ padding: '12px', background: '#F5F5F2', color: '#006064', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmReassign}
                disabled={!newTaxiId || saving || newTaxiId === selected.taxi_id}
                style={{ padding: '12px', background: (!newTaxiId || saving || newTaxiId === selected.taxi_id) ? 'rgba(0,0,0,0.08)' : '#006064', color: '#fff', border: 'none', borderRadius: 16, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
              >
                {saving ? t.saving : t.confirmReassign}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
