'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { useLang } from '@/lib/language'

const MSG = {
  en: {
    title:          'Booking submitted!',
    assignedSub:    'A driver has been automatically assigned.',
    pendingSub:     'The coordinator will assign a driver shortly.',
    bookingId:      'Booking ID',
    status:         'Status',
    assignedTo:     'Assigned to',
    statusBooked:   'Booked',
    statusSubmit:   'Submitted',
    infoAssigned:   'A driver has been assigned to your trip. You will be notified when the trip starts.',
    infoPending:    'Coordinator will review and assign a driver. You will be notified once confirmed.',
    backBtn:        'Back to home',
    bookAgainBtn:   '+ Book another trip',
    dutyTitle:      'Duty assigned!',
    dutySub:        'The driver has been assigned to this duty.',
    dutyTaxi:       'Taxi',
    dutyDate:       'Date',
    dutyReason:     'Notes',
    dutyBackBtn:    'Back to Drivers',
    dutyAgainBtn:   '+ Assign another duty',
  },
  id: {
    title:          'Booking terkirim!',
    assignedSub:    'Driver telah otomatis ditugaskan.',
    pendingSub:     'Koordinator akan segera menugaskan driver.',
    bookingId:      'ID Booking',
    status:         'Status',
    assignedTo:     'Ditugaskan ke',
    statusBooked:   'Dipesan',
    statusSubmit:   'Terkirim',
    infoAssigned:   'Driver telah ditugaskan untuk perjalanan Anda. Anda akan diberitahu saat perjalanan dimulai.',
    infoPending:    'Koordinator akan meninjau dan menugaskan driver. Anda akan diberitahu setelah dikonfirmasi.',
    backBtn:        'Kembali ke beranda',
    bookAgainBtn:   '+ Pesan perjalanan lain',
    dutyTitle:      'Tugas ditetapkan!',
    dutySub:        'Driver telah ditugaskan untuk tugas ini.',
    dutyTaxi:       'Taksi',
    dutyDate:       'Tanggal',
    dutyReason:     'Keterangan',
    dutyBackBtn:    'Kembali ke Drivers',
    dutyAgainBtn:   '+ Tugaskan lagi',
  },
}

function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

function buildWaMessage(params: {
  code: string; driverName: string; pickup: string
  dest: string; time: string; type: string; wait: string; notes: string
}): string {
  const { code, driverName, pickup, dest, time, type, wait, notes } = params
  const dateStr = time
    ? new Date(time).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
  const tripType = type === 'DROP' ? 'Drop' : `Waiting ${wait} menit`
  return [
    `📋 *Ridr – Penugasan Perjalanan*`,
    `━━━━━━━━━━━━━`,
    `🔖 *${code}*`,
    `📍 Dari: ${pickup}`,
    `🏁 Tujuan: *${dest}*`,
    ...(dateStr ? [`🕐 Jadwal: ${dateStr}`] : []),
    `🚗 Jenis: ${tripType}`,
    ...(notes ? [`📝 Catatan: ${notes}`] : []),
    `━━━━━━━━━━━━━`,
    `Halo ${driverName}, mohon konfirmasi kesiapan Anda untuk perjalanan ini.`,
  ].join('\n')
}

function DutySuccessContent() {
  const lang   = useLang()
  const t      = MSG[lang]
  const params = useSearchParams()
  const taxiName   = params.get('taxi')     || ''
  const driverName = params.get('driver')   || ''
  const date       = params.get('date')     || ''
  const endDate    = params.get('endDate')  || ''
  const startTime  = params.get('startTime')|| ''
  const endTime    = params.get('endTime')  || ''
  const reason     = params.get('reason')   || ''

  const fmtDate = (d: string) => d
    ? new Date(d + 'T12:00:00').toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  const dateLabel = endDate ? `${fmtDate(date)} – ${fmtDate(endDate)}` : fmtDate(date)

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", minHeight: '100vh', background: '#F5F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>

        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
            {t.dutyTitle}
          </h1>
          <p style={{ fontSize: '13px', color: '#3f4949', margin: 0 }}>
            {t.dutySub}
          </p>
        </div>

        {/* Duty details */}
        <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #F0EEE8' }}>
            <span style={{ fontSize: '12px', color: '#3f4949' }}>{t.dutyTaxi}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right' }}>{taxiName}{driverName ? ` · ${driverName}` : ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: startTime || reason ? '1px solid #F0EEE8' : 'none' }}>
            <span style={{ fontSize: '12px', color: '#3f4949' }}>{t.dutyDate}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right', maxWidth: '65%' }}>{dateLabel}</span>
          </div>
          {startTime && endTime && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: reason ? '1px solid #F0EEE8' : 'none' }}>
              <span style={{ fontSize: '12px', color: '#3f4949' }}>{lang === 'id' ? 'Jam' : 'Time'}</span>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{startTime}–{endTime}</span>
            </div>
          )}
          {reason && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px' }}>
              <span style={{ fontSize: '12px', color: '#3f4949' }}>{t.dutyReason}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right', maxWidth: '65%' }}>{reason}</span>
            </div>
          )}
        </div>

        <Link href="/coordinator/home" style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
          <button style={{ width: '100%', padding: '14px', background: '#006064', color: '#fff', border: 'none', borderRadius: 16, fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
            {t.dutyBackBtn}
          </button>
        </Link>

        <Link href="/coordinator/book" style={{ textDecoration: 'none', display: 'block' }}>
          <button style={{ width: '100%', padding: '12px', background: 'transparent', color: '#006064', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {t.dutyAgainBtn}
          </button>
        </Link>

      </div>
    </div>
  )
}

function TripSuccessContent() {
  const lang       = useLang()
  const t          = MSG[lang]
  const params     = useSearchParams()
  const code       = params.get('code')   || ''
  const taxiName   = params.get('taxi')   || ''
  const driverName = params.get('driver') || ''
  const driverPhone = params.get('phone') || ''
  const pickup     = params.get('pickup') || ''
  const dest       = params.get('dest')   || ''
  const time       = params.get('time')   || ''
  const type       = params.get('type')   || ''
  const wait       = params.get('wait')   || ''
  const notes      = params.get('notes')  || ''
  const isAssigned = !!taxiName

  const waMsg = driverPhone
    ? buildWaMessage({ code, driverName, pickup, dest, time, type, wait, notes })
    : ''

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", minHeight: '100vh', background: '#F5F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>

        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
            {t.title}
          </h1>
          <p style={{ fontSize: '13px', color: '#3f4949', margin: 0 }}>
            {isAssigned ? t.assignedSub : t.pendingSub}
          </p>
        </div>

        {/* Booking details */}
        <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #F0EEE8' }}>
            <span style={{ fontSize: '12px', color: '#3f4949' }}>{t.bookingId}</span>
            <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace' }}>{code}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: isAssigned ? '1px solid #F0EEE8' : 'none' }}>
            <span style={{ fontSize: '12px', color: '#3f4949' }}>{t.status}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: isAssigned ? '#D1FAE5' : '#DBEAFE', color: isAssigned ? '#065F46' : '#1E3A5F' }}>
              {isAssigned ? t.statusBooked : t.statusSubmit}
            </span>
          </div>
          {isAssigned && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px' }}>
              <span style={{ fontSize: '12px', color: '#3f4949' }}>{t.assignedTo}</span>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{taxiName} · {driverName}</span>
            </div>
          )}
        </div>

        {/* Info box */}
        {isAssigned ? (
          <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#065F46', margin: 0 }}>
              {t.infoAssigned}
            </p>
          </div>
        ) : (
          <div style={{ background: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#1E3A5F', margin: 0 }}>
              {t.infoPending}
            </p>
          </div>
        )}

        {/* WhatsApp driver button */}
        {isAssigned && driverPhone && (
          <a
            href={`https://wa.me/${toWaNumber(driverPhone)}?text=${encodeURIComponent(waMsg)}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 16, fontSize: '14px', fontWeight: 700, textDecoration: 'none', boxSizing: 'border-box', marginBottom: 10 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
            </svg>
            WhatsApp {driverName || 'driver'}
          </a>
        )}

        <Link href="/coordinator/home" style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
          <button style={{ width: '100%', padding: '14px', background: '#006064', color: '#fff', border: 'none', borderRadius: 16, fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
            {t.backBtn}
          </button>
        </Link>

        <Link href="/coordinator/book" style={{ textDecoration: 'none', display: 'block' }}>
          <button style={{ width: '100%', padding: '12px', background: 'transparent', color: '#006064', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {t.bookAgainBtn}
          </button>
        </Link>

      </div>
    </div>
  )
}

function SuccessRouter() {
  const params = useSearchParams()
  return params.get('kind') === 'duty' ? <DutySuccessContent /> : <TripSuccessContent />
}

export default function CoordinatorSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(0,96,100,0.15)', borderTop: '3px solid #006064', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
      <SuccessRouter />
    </Suspense>
  )
}
