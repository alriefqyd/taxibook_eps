'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { BookingDetail } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/types'

const TrackingMap = dynamic(() => import('@/components/map/TrackingMap'), { ssr: false })

function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

function fmtDate(date: string) {
  return new Date(date).toLocaleString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function buildWaMessage(b: BookingDetail): string {
  const time = new Date(b.scheduled_at).toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  })
  const type = b.trip_type === 'DROP' ? 'Drop (antar saja)' : `Waiting ${b.wait_minutes} menit (tunggu penumpang)`
  const taxi = b.taxi_name ? `${b.taxi_name}${b.taxi_plate ? ` (${b.taxi_plate})` : ''}` : null

  return [
    `📋 *TaxiBook – Penugasan Perjalanan*,`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔖 Kode Booking: *${b.booking_code}*`,
    ``,
    `👤 *Penumpang*`,
    `   Nama : ${b.passenger_name}`,
    ...(b.passenger_phone ? [`   HP   : ${b.passenger_phone}`] : []),
    ``,
    `📍 *Rute Perjalanan*`,
    `   Dari    : ${b.pickup}`,
    `   Tujuan  : ${b.destination}`,
    ``,
    `🕐 *Jadwal*`,
    `   ${time}`,
    ``,
    `🚗 *Detail Trip*`,
    `   Jenis : ${type}`,
    ...(taxi ? [`   Taksi : ${taxi}`] : []),
    ...(b.notes ? [`   Catatan : ${b.notes}`] : []),
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `Mohon konfirmasi kesiapan Anda untuk perjalanan ini. Terima kasih! 🙏`,
  ].join('\n')
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#F5F5F2', borderRadius: 14, overflow: 'hidden' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#006064', margin: 0, padding: '10px 14px 6px', opacity: 0.8 }}>{title}</p>
      <div style={{ padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {children}
      </div>
    </div>
  )
}

function DetailRow({ label, value, highlight, valueColor, link }: {
  label: string
  value: string
  highlight?: boolean
  valueColor?: string
  link?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.05)', gap: 12 }}>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, fontWeight: 600, flexShrink: 0 }}>{label}</p>
      {link ? (
        <a href={link} style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, margin: 0, textAlign: 'right', color: '#006064', textDecoration: 'none' }}>{value}</a>
      ) : (
        <p style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, margin: 0, textAlign: 'right', color: valueColor ?? '#1a1c1b', lineHeight: 1.4 }}>{value}</p>
      )}
    </div>
  )
}

export default function StaffBookingSheet({ booking, currentUserId, onClose, onCancelled }: {
  booking: BookingDetail
  currentUserId?: string
  onClose: () => void
  onCancelled: () => void
}) {
  const supabase = createClient()
  const [cancelling, setCancelling] = React.useState(false)
  const [showCancel, setShowCancel] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [error, setError] = React.useState('')

  async function handleCancel() {
    setCancelling(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Session expired')
      setCancelling(false)
      return
    }

    const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

  const createdAt = booking.created_at ? fmtDate(booking.created_at) : '-'
  const scheduledAt = booking.scheduled_at ? fmtDate(booking.scheduled_at) : '-'
  const completedAt = booking.completed_at ? fmtDate(booking.completed_at) : null
  const windowMin = booking.auto_complete_at ? Math.round((new Date(booking.auto_complete_at).getTime() - new Date(booking.scheduled_at).getTime()) / 60000) : null
  const durationMin = booking.completed_at ? Math.round((new Date(booking.completed_at).getTime() - new Date(booking.scheduled_at).getTime()) / 60000) : null
  const isCreator = !!currentUserId && (booking.created_by === currentUserId || booking.passenger_id === currentUserId)
  const canCancel = isCreator && ['submitted', 'pending_coordinator_approval', 'booked'].includes(booking.status)
  const label = STATUS_LABELS[booking.status]
  const statusColor = STATUS_COLORS[booking.status]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }} onClick={onClose}>
      <div
        style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>{booking.destination}</p>
            <p style={{ fontSize: 13, color: '#6f7979', margin: 0 }}>{scheduledAt}</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 9999, background: statusColor.bg, color: statusColor.text, whiteSpace: 'nowrap' }}>
            {label}
          </span>
        </div>

        {['booked', 'on_trip', 'waiting_trip'].includes(booking.status) && booking.taxi_id && (
          <TrackingMap
            taxiId={booking.taxi_id}
            taxiColor={booking.taxi_color || '#006064'}
            pickup={booking.pickup}
            destination={booking.destination}
            status={booking.status}
            pickupLat={booking.pickup_lat}
            pickupLng={booking.pickup_lng}
            destLat={booking.destination_lat}
            destLng={booking.destination_lng}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: booking.taxi_id ? 16 : 0 }}>
          <Section title="Time">
            <DetailRow label="Booking ID" value={booking.booking_code} highlight />
            <DetailRow label="Created" value={createdAt} />
            <DetailRow label="Scheduled" value={scheduledAt} highlight />
            {completedAt && <DetailRow label="Completed" value={completedAt} valueColor="#059669" />}
            {booking.auto_complete_at && <DetailRow label="Window end" value={new Date(booking.auto_complete_at).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} valueColor="#6f7979" />}
            {durationMin != null && <DetailRow label="Actual duration" value={`${durationMin} min`} highlight />}
            {windowMin != null && <DetailRow label="Booking window" value={`${windowMin} min`} />}
          </Section>

          <Section title="Passenger">
            <DetailRow label="Name" value={booking.passenger_name} highlight />
            {booking.passenger_phone && <DetailRow label="Phone" value={booking.passenger_phone} link={`tel:${booking.passenger_phone}`} />}
          </Section>

          <Section title="Driver & Vehicle">
            <DetailRow label="Driver" value={booking.driver_name || 'Not assigned'} highlight={!!booking.driver_name} />
            {booking.driver_phone && <DetailRow label="Driver phone" value={booking.driver_phone} link={`tel:${booking.driver_phone}`} />}
            <DetailRow label="Taxi" value={booking.taxi_name || '—'} />
            {booking.taxi_plate && <DetailRow label="Plate" value={booking.taxi_plate} />}
            {booking.taxi_color && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, fontWeight: 600 }}>Taxi color</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: booking.taxi_color, border: '1px solid rgba(0,0,0,0.1)' }} />
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{booking.taxi_color}</p>
                </div>
              </div>
            )}
          </Section>

          <Section title="Trip Route">
            <DetailRow label="From" value={booking.pickup} highlight />
            <DetailRow label="To" value={booking.destination} highlight />
            <DetailRow label="Trip type" value={booking.trip_type === 'DROP' ? 'Drop' : `Wait ${booking.wait_minutes} min`} />
          </Section>

          {(booking.notes || booking.rejection_reason) && (
            <Section title="Notes">
              {booking.notes && <DetailRow label="Notes" value={booking.notes} />}
              {booking.rejection_reason && <DetailRow label="Rejection reason" value={booking.rejection_reason} valueColor="#DC2626" />}
            </Section>
          )}
        </div>

        {booking.driver_phone && !showCancel && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 20 }}>
            <a
              href={`tel:${booking.driver_phone}`}
              style={{ padding: '12px 8px', background: '#EFF6FF', color: '#0369A1', border: '1px solid #BAE6FD', borderRadius: 16, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}
            >
              Call Driver
            </a>
            <a
              href={`https://wa.me/${toWaNumber(booking.driver_phone)}?text=${encodeURIComponent(buildWaMessage(booking))}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '12px 8px', background: '#25D366', color: '#ffffff', border: 'none', borderRadius: 16, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}
            >
              WhatsApp Driver
            </a>
          </div>
        )}

        {canCancel && !showCancel && (
          <button
            onClick={() => setShowCancel(true)}
            style={{ width: '100%', padding: '12px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 16, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 16 }}
          >
            Cancel this booking
          </button>
        )}

        {canCancel && showCancel && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 6 }}>
                Reason for cancellation
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. I no longer need the taxi"
                style={{ width: '100%', padding: '11px 14px', fontSize: 14, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            {error && (
              <p style={{ fontSize: 12, color: '#991B1B', margin: '0 0 10px', background: '#ffdad6', padding: '8px 12px', borderRadius: 8 }}>{error}</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setShowCancel(false)} style={{ padding: '12px', background: 'transparent', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Go back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ padding: '12px', background: '#991B1B', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {cancelling ? 'Cancelling...' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        )}

        {!canCancel && (
          <div style={{ background: '#F5F5F2', borderRadius: 10, padding: '10px 14px', textAlign: 'center', marginTop: 16 }}>
            <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>
              {booking.status === 'completed' ? 'This trip has been completed.' : 'This booking cannot be cancelled.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
