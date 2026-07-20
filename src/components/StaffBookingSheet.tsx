'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { BookingDetail } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/types'
import { useLang } from '@/lib/language'
import { useTravelTimes } from '@/hooks/useTravelTimes'
import { formatDurationMin } from '@/lib/routing'

const TrackingMap = dynamic(() => import('@/components/map/TrackingMap'), { ssr: false })

const MSG = {
  en: {
    sessionExpired:   'Session expired',
    failedCancel:     'Failed to cancel',
    sectionTime:      'Time',
    sectionPassenger: 'Passenger',
    sectionDriver:    'Driver & Vehicle',
    sectionRoute:     'Trip Route',
    sectionNotes:     'Notes',
    scheduled:        'Scheduled',
    completed:        'Completed',
    windowEnd:        'Window end',
    actualDuration:   'Actual duration',
    min:              'min',
    bookingWindow:    'Booking window',
    name:             'Name',
    phone:            'Phone',
    driver:           'Driver',
    notAssigned:      'Not assigned',
    driverPhone:      'Driver phone',
    taxi:             'Taxi',
    from:             'From',
    to:               'To',
    tripType:         'Trip type',
    bufferTime:       'Buffer time',
    drop:             'Drop',
    waitMin:          (n: number) => `Wait ${n} min`,
    rejectionReason:  'Rejection reason',
    callDriver:       'Call Driver',
    whatsappDriver:   'WhatsApp Driver',
    cancelBooking:    'Cancel this booking',
    reasonLabel:      'Reason for cancellation *',
    reasonPlaceholder:'e.g. I no longer need the taxi',
    errReasonRequired:'Please enter a reason for cancelling',
    goBack:           'Go back',
    cancelling:       'Cancelling...',
    confirmCancel:    'Confirm cancel',
    tripCompleted:    'This trip has been completed.',
    cannotCancel:     'This booking cannot be cancelled.',
  },
  id: {
    sessionExpired:   'Sesi telah berakhir',
    failedCancel:     'Gagal membatalkan booking',
    sectionTime:      'Waktu',
    sectionPassenger: 'Penumpang',
    sectionDriver:    'Driver & Kendaraan',
    sectionRoute:     'Rute Perjalanan',
    sectionNotes:     'Catatan',
    scheduled:        'Dijadwalkan',
    completed:        'Selesai',
    windowEnd:        'Akhir jendela',
    actualDuration:   'Durasi aktual',
    min:              'menit',
    bookingWindow:    'Jendela booking',
    name:             'Nama',
    phone:            'Telepon',
    driver:           'Driver',
    notAssigned:      'Belum ditugaskan',
    driverPhone:      'Telepon driver',
    taxi:             'Taksi',
    from:             'Dari',
    to:               'Tujuan',
    tripType:         'Jenis perjalanan',
    bufferTime:       'Buffer time',
    drop:             'Drop',
    waitMin:          (n: number) => `Tunggu ${n} menit`,
    rejectionReason:  'Alasan penolakan',
    callDriver:       'Telepon Driver',
    whatsappDriver:   'WhatsApp Driver',
    cancelBooking:    'Batalkan booking ini',
    reasonLabel:      'Alasan pembatalan *',
    reasonPlaceholder:'cth. Saya tidak jadi membutuhkan taksi',
    errReasonRequired:'Mohon isi alasan pembatalan',
    goBack:           'Kembali',
    cancelling:       'Membatalkan...',
    confirmCancel:    'Konfirmasi batal',
    tripCompleted:    'Perjalanan ini telah selesai.',
    cannotCancel:     'Booking ini tidak dapat dibatalkan.',
  },
}

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
    `📋 *Ridr – Penugasan Perjalanan*,`,
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
  const lang = useLang()
  const t = MSG[lang]
  const supabase = createClient()
  const [cancelling, setCancelling] = React.useState(false)
  const [showCancel, setShowCancel] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [error, setError] = React.useState('')
  const officeName = 'Central Engineering'
  const travel = useTravelTimes(booking.pickup_lat, booking.pickup_lng, booking.destination_lat, booking.destination_lng, officeName)

  async function handleCancel() {
    if (!cancelReason.trim()) { setError(t.errReasonRequired); return }
    setCancelling(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError(t.sessionExpired)
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
      setError(data.error || t.failedCancel)
      setCancelling(false)
      return
    }

    onCancelled()
    onClose()
  }

  const scheduledAt = booking.scheduled_at ? fmtDate(booking.scheduled_at) : '-'
  const completedAt = booking.completed_at ? fmtDate(booking.completed_at) : null
  const windowMin = booking.auto_complete_at ? Math.round((new Date(booking.auto_complete_at).getTime() - new Date(booking.scheduled_at).getTime()) / 60000) : null
  const durationMin = booking.completed_at ? Math.round((new Date(booking.completed_at).getTime() - new Date(booking.scheduled_at).getTime()) / 60000) : null
  const isCreator = !!currentUserId && (booking.created_by === currentUserId || booking.passenger_id === currentUserId)
  const canCancel = isCreator && ['submitted', 'pending_coordinator_approval', 'booked'].includes(booking.status)
  const label = STATUS_LABELS[booking.status]
  const statusColor = STATUS_COLORS[booking.status]

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 1100 }} onClick={onClose}>
      <div
        style={{ background: '#ffffff', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: 'calc(100dvh - 20px)', overflowY: 'auto', boxSizing: 'border-box' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>{booking.pickup} → {booking.destination}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 9999, background: statusColor.bg, color: statusColor.text, whiteSpace: 'nowrap' }}>
              {label}
            </span>
            <button
              onClick={onClose}
              style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#F5F5F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Only once the driver has actually started the trip — a 'booked' (assigned,
            not yet started) trip has no live position/route to show yet. */}
        {['on_trip', 'waiting_trip'].includes(booking.status) && booking.taxi_id && (
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
          <Section title={t.sectionTime}>
            <DetailRow label={t.scheduled} value={scheduledAt} highlight />
            {completedAt && <DetailRow label={t.completed} value={completedAt} valueColor="#059669" />}
            {booking.auto_complete_at && <DetailRow label={t.windowEnd} value={new Date(booking.auto_complete_at).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} valueColor="#6f7979" />}
            {durationMin != null && <DetailRow label={t.actualDuration} value={`${durationMin} ${t.min}`} highlight />}
            {windowMin != null && <DetailRow label={t.bookingWindow} value={`${windowMin} ${t.min}`} />}
          </Section>

          <Section title={t.sectionPassenger}>
            <DetailRow label={t.name} value={booking.passenger_name} highlight />
            {booking.passenger_phone && <DetailRow label={t.phone} value={booking.passenger_phone} link={`tel:${booking.passenger_phone}`} />}
          </Section>

          <Section title={t.sectionDriver}>
            <DetailRow label={t.driver} value={booking.driver_name || t.notAssigned} highlight={!!booking.driver_name} />
            {booking.driver_phone && <DetailRow label={t.driverPhone} value={booking.driver_phone} link={`tel:${booking.driver_phone}`} />}
            <DetailRow label={t.taxi} value={booking.taxi_name || '—'} />
          </Section>

          <Section title={t.sectionRoute}>
            <DetailRow label={t.from} value={booking.pickup} highlight />
            <DetailRow label={t.to} value={booking.destination} highlight />
            <DetailRow label={t.tripType} value={booking.trip_type === 'DROP' ? t.drop : t.waitMin(booking.wait_minutes)} />
            {booking.pickup_lat && booking.pickup_lng && booking.destination_lat && booking.destination_lng && (
              <DetailRow label={t.bufferTime} value={formatDurationMin(travel.bufferSec, lang)} />
            )}
          </Section>

          {(booking.notes || booking.rejection_reason) && (
            <Section title={t.sectionNotes}>
              {booking.notes && <DetailRow label={t.sectionNotes} value={booking.notes} />}
              {booking.rejection_reason && <DetailRow label={t.rejectionReason} value={booking.rejection_reason} valueColor="#DC2626" />}
            </Section>
          )}
        </div>

        {booking.driver_phone && !showCancel && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 20 }}>
            <a
              href={`tel:${booking.driver_phone}`}
              style={{ padding: '12px 8px', background: '#EFF6FF', color: '#0369A1', border: '1px solid #BAE6FD', borderRadius: 16, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}
            >
              {t.callDriver}
            </a>
            <a
              href={`https://wa.me/${toWaNumber(booking.driver_phone)}?text=${encodeURIComponent(buildWaMessage(booking))}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '12px 8px', background: '#25D366', color: '#ffffff', border: 'none', borderRadius: 16, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}
            >
              {t.whatsappDriver}
            </a>
          </div>
        )}

        {canCancel && !showCancel && (
          <button
            onClick={() => setShowCancel(true)}
            style={{ width: '100%', padding: '12px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 16, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 16 }}
          >
            {t.cancelBooking}
          </button>
        )}

        {canCancel && showCancel && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 6 }}>
                {t.reasonLabel}
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder={t.reasonPlaceholder}
                style={{ width: '100%', padding: '11px 14px', fontSize: 14, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            {error && (
              <p style={{ fontSize: 12, color: '#991B1B', margin: '0 0 10px', background: '#ffdad6', padding: '8px 12px', borderRadius: 8 }}>{error}</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setShowCancel(false)} style={{ padding: '12px', background: 'transparent', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {t.goBack}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ padding: '12px', background: cancelling ? '#c9a0a0' : '#991B1B', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: cancelling ? 'not-allowed' : 'pointer' }}
              >
                {cancelling ? t.cancelling : t.confirmCancel}
              </button>
            </div>
          </div>
        )}

        {!canCancel && (
          <div style={{ background: '#F5F5F2', borderRadius: 10, padding: '10px 14px', textAlign: 'center', marginTop: 16 }}>
            <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>
              {booking.status === 'completed' ? t.tripCompleted : t.cannotCancel}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
