'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Ridr global error]', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, 'Inter', sans-serif", background: '#F5F5F2' }}>
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: '#FEE2E2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1c1b', margin: '0 0 8px', textAlign: 'center' }}>
            App failed to load
          </h1>
          <p style={{ fontSize: 14, color: '#6f7979', margin: '0 0 28px', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
            A critical error occurred. Please reload the page.
          </p>

          {error.digest && (
            <p style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 24, background: 'rgba(0,0,0,0.04)', padding: '4px 10px', borderRadius: 6 }}>
              ref: {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            style={{
              padding: '13px 32px', fontSize: 14, fontWeight: 700,
              background: '#006064', color: '#fff',
              border: 'none', borderRadius: 12, cursor: 'pointer',
              width: '100%', maxWidth: 280,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
