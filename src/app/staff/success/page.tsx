'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function SuccessContent() {
  const params     = useSearchParams()
  const code       = params.get('code')   || ''
  const taxiName   = params.get('taxi')   || ''
  const driverName = params.get('driver') || ''
  const isAssigned = !!taxiName

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
            Booking submitted!
          </h1>
          <p style={{ fontSize: '13px', color: '#3f4949', margin: 0 }}>
            {isAssigned
              ? 'A driver has been automatically assigned.'
              : 'The coordinator will assign a driver shortly.'}
          </p>
        </div>

        {/* Booking details */}
        <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #F0EEE8' }}>
            <span style={{ fontSize: '12px', color: '#3f4949' }}>Booking ID</span>
            <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace' }}>{code}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: isAssigned ? '1px solid #F0EEE8' : 'none' }}>
            <span style={{ fontSize: '12px', color: '#3f4949' }}>Status</span>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: isAssigned ? '#FEF3C7' : '#DBEAFE', color: isAssigned ? '#92400E' : '#1E3A5F' }}>
              {isAssigned ? 'Awaiting driver' : 'Submitted'}
            </span>
          </div>
          {isAssigned && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px' }}>
              <span style={{ fontSize: '12px', color: '#3f4949' }}>Assigned to</span>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{taxiName} · {driverName}</span>
            </div>
          )}
        </div>

        {/* Info box */}
        {isAssigned ? (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', color: '#92400E', margin: 0 }}>
              Driver will accept or decline the trip. You will be notified once confirmed.
            </p>
          </div>
        ) : (
          <div style={{ background: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', color: '#1E3A5F', margin: 0 }}>
              Coordinator will review and assign a driver. You will be notified once confirmed.
            </p>
          </div>
        )}

        <Link href="/staff/home" style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
          <button style={{ width: '100%', padding: '14px', background: '#006064', color: '#fff', border: 'none', borderRadius: 16, fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
            Back to schedule
          </button>
        </Link>

        <Link href="/staff/book" style={{ textDecoration: 'none', display: 'block' }}>
          <button style={{ width: '100%', padding: '12px', background: 'transparent', color: '#006064', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Book another trip
          </button>
        </Link>

      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#9ca3af', fontFamily: 'system-ui' }}>Loading...</p>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
