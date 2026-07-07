'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

let _trigger: (() => void) | null = null
export function navStart() { _trigger?.() }

const PERIM = 225
const LINE  = 32

const BORDER =
  'M 51.138,11.879 ' +
  'L 56.015,4.901 ' +
  'C 49.426,-1.617 42.663,5.985 29.826,10.905 ' +
  'C 36.159,17.69 43.042,18.291 51.138,11.879 ' +
  'C 31.745,29.432 24.14,-12.087 0,3.626 ' +
  'L 27.202,42.346 ' +
  'Z'

export default function NavigationLoader() {
  const [visible, setVisible] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    _trigger = () => setVisible(true)
    return () => { _trigger = null }
  }, [])

  useEffect(() => { setVisible(false) }, [pathname])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(245,245,242,0.88)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <style>{`
        @keyframes vale-border {
          0%   { stroke-dashoffset: ${PERIM}; }
          100% { stroke-dashoffset: 0; }
        }
      `}</style>

      <div style={{ position: 'relative', width: 110, height: 45 }}>
        <img src="/vale-logo.svg" alt="Loading…" style={{ width: 110, height: 45, display: 'block' }} />

        <svg
          width="110" height="45" viewBox="0 0 110 45"
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <g transform="translate(-268.45764,-342.61778)">
            <g transform="matrix(0.9623665,0,0,0.9623665,270.84808,345.00818)">
              <path d={BORDER} fill="none"
                stroke="rgba(236,184,51,0.4)" strokeWidth="8"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={`${LINE} ${PERIM - LINE}`}
                style={{ animation: `vale-border ${PERIM / 90}s linear infinite` }}
              />
              <path d={BORDER} fill="none"
                stroke="#ecb833" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={`${LINE} ${PERIM - LINE}`}
                style={{ animation: `vale-border ${PERIM / 90}s linear infinite` }}
              />
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}
