'use client'

import { useEffect } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[Ridr error]', error)
  }, [error])

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F5F5F2',
      fontFamily: "var(--font-inter), 'Inter', sans-serif",
      padding: '24px',
    }}>
      {/* Icon */}
      <div style={{
        width: 64, height: 64, borderRadius: 20,
        background: '#FEF3C7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>

      {/* Heading */}
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1c1b', margin: '0 0 8px', textAlign: 'center', letterSpacing: '-0.3px' }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 14, color: '#6f7979', margin: '0 0 28px', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
        An unexpected error occurred. Try again or return to the home screen.
      </p>

      {/* Error digest (for support) */}
      {error.digest && (
        <p style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 24, background: 'rgba(0,0,0,0.04)', padding: '4px 10px', borderRadius: 6 }}>
          ref: {error.digest}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
        <button
          onClick={reset}
          style={{
            padding: '13px', fontSize: 14, fontWeight: 700,
            background: '#006064', color: '#fff',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Try again
        </button>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '13px', fontSize: 14, fontWeight: 600,
            background: 'transparent', color: '#006064',
            border: '1.5px solid rgba(0,96,100,0.2)', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Go to home
        </button>
      </div>
    </div>
  )
}
