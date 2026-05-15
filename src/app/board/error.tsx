'use client'

import { useEffect } from 'react'

export default function BoardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Board error]', error)
  }, [error])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#F5F5F2', fontFamily: "var(--font-inter), 'Inter', sans-serif",
    }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Dispatch board error</h1>
      <p style={{ fontSize: 13, color: '#6f7979', margin: '0 0 28px' }}>
        Failed to load the dispatch board.
      </p>
      <button
        onClick={reset}
        style={{ padding: '12px 32px', fontSize: 14, fontWeight: 700, background: '#006064', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' }}
      >
        Reload board
      </button>
    </div>
  )
}
