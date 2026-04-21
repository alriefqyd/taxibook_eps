'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { BookingDetail, User } from '@/types'
import { STATUS_LABELS, STATUS_COLORS } from '@/types'
import GanttCalendar from '@/components/GanttCalendar'

interface TaxiRow {
  id: string
  name: string
  plate: string | null
  color: string
  is_available: boolean
  driver_id: string | null
  driver_name: string | null
  trips_today: number
  declines_today: number
}

export default function CoordinatorHomePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,       setUser]       = useState<User | null>(null)
  const [bookings,   setBookings]   = useState<BookingDetail[]>([])
  const [taxis,      setTaxis]      = useState<TaxiRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState<'bookings' | 'fleet' | 'calendar'>('bookings')
  const [filter,     setFilter]     = useState<'all' | 'pending' | 'booked' | 'completed'>('all')
  const [rejectId,   setRejectId]   = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [{ data: bks }, { data: txs }] = await Promise.all([
      supabase
        .from('booking_details')
        .select('*')
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('taxis')
        .select('*, users!driver_id(name)')
        .eq('is_active', true),
    ])

    // Get trips today + declines today per taxi
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const enriched = await Promise.all(
      (txs || []).map(async (t: any) => {
        const [{ count: trips }, { count: declines }] = await Promise.all([
          supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('taxi_id', t.id)
            .eq('status', 'completed')
            .gte('completed_at', todayStart.toISOString()),
          supabase
            .from('booking_responses')
            .select('id', { count: 'exact', head: true })
            .eq('taxi_id', t.id)
            .eq('response', 'declined')
            .gte('responded_at', todayStart.toISOString()),
        ])
        return {
          id:           t.id,
          name:         t.name,
          plate:        t.plate,
          color:        t.color,
          is_available: t.is_available,
          driver_id:    t.driver_id,
          driver_name:  t.users?.name || null,
          trips_today:  trips || 0,
          declines_today: declines || 0,
        }
      })
    )

    setBookings(bks || [])
    setTaxis(enriched)
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }
      setUser(p)
      await loadData()
      setLoading(false)
    }
    init()

    const ch = supabase.channel('coord-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  async function runCron() {
    const res  = await fetch('/api/cron/auto-complete')
    const data = await res.json()

    if (!res.ok) {
      alert('Cron error: ' + JSON.stringify(data))
      return
    }

    const msg =
      `✅ Cron ran successfully\n\n` +
      `Auto-completed:    ${data.auto_completed}\n` +
      `15min reminders:   ${data.reminded_15min}\n` +
      `Start reminders:   ${data.reminded_start}\n` +
      `Overdue alerts:    ${data.reminded_overdue}\n` +
      `Coord alerts:      ${data.notified_coord}\n\n` +
      (data.reminded_15min === 0 && data.reminded_start === 0
        ? `⚠️ No reminders sent.\nPossible reasons:\n` +
          `• Booking status is not "booked" yet\n` +
          `• Booking time not in 10-15min window\n` +
          `• Reminder already sent before`
        : `🔔 Check notification bell for alerts`)

    alert(msg)
    await loadData()
  }

  async function handleApprove(bookingId: string) {
    setProcessing(bookingId)
    const token = await getToken()
    await fetch(`/api/bookings/${bookingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'approve' }),
    })
    await loadData()
    setProcessing(null)
  }

  async function handleReject(bookingId: string) {
    setProcessing(bookingId)
    const token = await getToken()
    await fetch(`/api/bookings/${bookingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'reject', rejection_reason: rejectNote }),
    })
    setRejectId(null)
    setRejectNote('')
    await loadData()
    setProcessing(null)
  }

  async function toggleAvailability(taxiId: string, current: boolean) {
    await supabase
      .from('taxis')
      .update({ is_available: !current })
      .eq('id', taxiId)
    await loadData()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <p style={{ color: '#A8A6A0' }}>Loading...</p>
    </div>
  )

  const pendingApproval = bookings.filter(b => b.status === 'pending_coordinator_approval')
  const filtered = filter === 'all' ? bookings
    : filter === 'pending' ? bookings.filter(b => ['submitted','pending_coordinator_approval','pending_driver_approval'].includes(b.status))
    : filter === 'booked'  ? bookings.filter(b => ['booked','on_trip','waiting_trip'].includes(b.status))
    : bookings.filter(b => b.status === 'completed')

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', minHeight: '100vh', background: '#F4F3EF' }}>

      {/* Header */}
      <div style={{ background: '#fff', padding: '20px 20px 0', borderBottom: '1px solid #E0DED8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.3px' }}>
              Coordinator
            </h1>
            <p style={{ fontSize: '13px', color: '#6B6963', margin: 0 }}>
              {format(new Date(), 'EEEE, d MMMM yyyy', { locale: idLocale })}
            </p>

          </div>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#FEF3C7', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>
            {user?.name?.split(' ').map(n => n[0]).slice(0,2).join('')}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '16px' }}>
          <StatCard label="Total" value={bookings.length} />
          <StatCard label="Approval" value={pendingApproval.length} color="#92400E" bg="#FEF3C7" />
          <StatCard label="Active" value={bookings.filter(b=>['booked','on_trip','waiting_trip'].includes(b.status)).length} color="#065F46" bg="#D1FAE5" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0' }}>
          {(['bookings','fleet','calendar'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              flex: 1, padding: '10px', fontSize: '12px', fontWeight: 600,
              border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: activeTab === t ? '2px solid #0F0F0F' : '2px solid transparent',
              color: activeTab === t ? '#0F0F0F' : '#A8A6A0',
              textTransform: 'capitalize',
            }}>
              {t === 'bookings' ? `Bookings${bookings.length > 0 ? ` (${bookings.length})` : ''}` : t === 'fleet' ? 'Fleet' : 'Calendar'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>

        {/* ── BOOKINGS TAB ── */}
        {activeTab === 'bookings' && (
          <>
            {/* Pending approval alert */}
            {pendingApproval.length > 0 && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#D97706', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                  {pendingApproval.length}
                </div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', margin: 0 }}>
                  {pendingApproval.length} booking{pendingApproval.length > 1 ? 's' : ''} need your approval
                </p>
              </div>
            )}

            {/* Filter tabs */}
            <div style={{ display: 'flex', background: '#ECEAE4', borderRadius: '999px', padding: '3px', gap: '2px', marginBottom: '12px' }}>
              {(['all','pending','booked','completed'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  flex: 1, padding: '5px 4px', fontSize: '11px', fontWeight: 600,
                  border: 'none', borderRadius: '999px', cursor: 'pointer',
                  background: filter === f ? '#fff' : 'transparent',
                  color: filter === f ? '#0F0F0F' : '#A8A6A0',
                  textTransform: 'capitalize',
                }}>
                  {f}
                </button>
              ))}
            </div>

            {/* Booking list */}
            {filtered.length === 0
              ? <EmptyState label="No bookings" />
              : filtered.map(b => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  isProcessing={processing === b.id}
                  onApprove={() => handleApprove(b.id)}
                  onReject={() => setRejectId(b.id)}
                />
              ))
            }
          </>
        )}

        {/* ── CALENDAR TAB ── */}
        {activeTab === 'calendar' && (
          <div style={{ margin: '0 -16px' }}>
            <GanttCalendar bookings={bookings} taxis={taxis} />
          </div>
        )}

        {/* ── FLEET TAB ── */}
        {activeTab === 'fleet' && (
          <div>
            {taxis.map(t => (
              <div key={t.id} style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: '14px', padding: '14px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px' }}>{t.name}</p>
                      <p style={{ fontSize: '12px', color: '#6B6963', margin: 0 }}>{t.driver_name || 'No driver'} {t.plate ? `· ${t.plate}` : ''}</p>
                    </div>
                  </div>

                  {/* Availability toggle */}
                  <button
                    onClick={() => toggleAvailability(t.id, t.is_available)}
                    style={{
                      padding: '5px 12px', fontSize: '11px', fontWeight: 700,
                      border: 'none', borderRadius: '999px', cursor: 'pointer',
                      background: t.is_available ? '#D1FAE5' : '#FEE2E2',
                      color:      t.is_available ? '#065F46' : '#991B1B',
                    }}
                  >
                    {t.is_available ? '● Available' : '○ Unavailable'}
                  </button>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ background: '#F4F3EF', borderRadius: '8px', padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                    <p style={{ fontSize: '10px', color: '#A8A6A0', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Trips today</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{t.trips_today}</p>
                  </div>
                  <div style={{ background: t.declines_today >= 2 ? '#FEE2E2' : '#F4F3EF', borderRadius: '8px', padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                    <p style={{ fontSize: '10px', color: t.declines_today >= 2 ? '#991B1B' : '#A8A6A0', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Declines</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: t.declines_today >= 2 ? '#991B1B' : '#0F0F0F' }}>{t.declines_today}</p>
                  </div>
                </div>

                {t.declines_today >= 2 && (
                  <p style={{ fontSize: '11px', color: '#991B1B', margin: '8px 0 0', background: '#FEE2E2', padding: '6px 10px', borderRadius: '6px' }}>
                    ⚠ {t.driver_name} has declined {t.declines_today} trips today. Consider marking unavailable.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div style={{ background: '#fff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 14px' }}>Reject booking</h2>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A6A0', display: 'block', marginBottom: '6px' }}>
                Reason (optional)
              </label>
              <input
                type="text"
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="e.g. No drivers available for this time"
                style={{ width: '100%', padding: '11px 14px', fontSize: '14px', border: '1.5px solid #E0DED8', borderRadius: '10px', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => { setRejectId(null); setRejectNote('') }} style={{ padding: '12px', background: 'transparent', border: '1.5px solid #E0DED8', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleReject(rejectId)} style={{ padding: '12px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({ booking: b, isProcessing, onApprove, onReject }: {
  booking: BookingDetail
  isProcessing: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const sc = STATUS_COLORS[b.status]
  const needsApproval = b.status === 'pending_coordinator_approval'

  return (
    <div style={{ background: '#fff', border: `1px solid ${needsApproval ? '#FCD34D' : '#E0DED8'}`, borderLeft: needsApproval ? '3px solid #D97706' : '1px solid #E0DED8', borderRadius: '14px', padding: '14px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {b.passenger_name}
          </p>
          <p style={{ fontSize: '12px', color: '#6B6963', margin: 0 }}>
            {format(new Date(b.scheduled_at), 'EEE d MMM · HH:mm', { locale: idLocale })}
          </p>
          <p style={{ fontSize: '12px', color: '#6B6963', margin: '2px 0 0' }}>
            {b.pickup} → {b.destination}
          </p>
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', flexShrink: 0, background: sc.bg, color: sc.text }}>
          {STATUS_LABELS[b.status]}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: needsApproval ? '10px' : '0' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: b.trip_type === 'DROP' ? '#DBEAFE' : '#EDE9FE', color: b.trip_type === 'DROP' ? '#1E3A5F' : '#4C1D95' }}>
          {b.trip_type === 'DROP' ? 'Drop' : `Wait ${b.wait_minutes}min`}
        </span>
        {b.taxi_name
          ? <span style={{ fontSize: '11px', color: '#6B6963', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.taxi_color || '#888', display: 'inline-block' }} />
              {b.taxi_name} · {b.driver_name}
            </span>
          : <span style={{ fontSize: '11px', color: '#A8A6A0' }}>Unassigned</span>
        }
      </div>

      {needsApproval && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={onReject} disabled={isProcessing} style={{ padding: '9px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            Reject
          </button>
          <button onClick={onApprove} disabled={isProcessing} style={{ padding: '9px', background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            {isProcessing ? '...' : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color = '#0F0F0F', bg = '#F4F3EF' }: {
  label: string; value: number; color?: string; bg?: string
}) {
  return (
    <div style={{ background: bg, borderRadius: '10px', padding: '12px' }}>
      <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: color === '#0F0F0F' ? '#A8A6A0' : color, margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px', color }}>{value}</p>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A8A6A0' }}>
      <p style={{ fontSize: '14px', margin: 0 }}>{label}</p>
    </div>
  )
}
