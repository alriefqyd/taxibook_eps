'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

let _trigger: (() => void) | null = null
export function navStart() { _trigger?.() }

// Rough stroke length of the teal swoosh (path2386) in rendered SVG coordinates
const PERIM = 120
const LINE  = 28

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
        @keyframes vale-trace {
          0%   { stroke-dashoffset: ${PERIM}; }
          100% { stroke-dashoffset: 0; }
        }
      `}</style>

      <div style={{ position: 'relative', width: 110, height: 45 }}>
        <img src="/vale-logo.svg" alt="Loading…" style={{ width: 110, height: 45, display: 'block' }} />

        {/* Animated stroke overlay tracing the teal swoosh path of the Vale logo */}
        <svg
          width="110" height="45" viewBox="0 0 110 45"
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <g transform="translate(-268.45764,-342.61778)">
            <g transform="matrix(0.9623665,0,0,0.9623665,270.84808,345.00818)">
              {/* Glow layer */}
              <path
                d="M 51.138,11.879 C 31.745,29.432 24.14,-12.087 0,3.626 L 27.202,42.346"
                fill="none" stroke="rgba(0,147,154,0.5)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${LINE} ${PERIM - LINE}`}
                style={{ animation: `vale-trace ${PERIM / 90}s linear infinite` }}
              />
              {/* Sharp line */}
              <path
                d="M 51.138,11.879 C 31.745,29.432 24.14,-12.087 0,3.626 L 27.202,42.346"
                fill="none" stroke="#00939a" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${LINE} ${PERIM - LINE}`}
                style={{ animation: `vale-trace ${PERIM / 90}s linear infinite` }}
              />
              {/* Gold leading dot */}
              <path
                d="M 51.138,11.879 C 31.745,29.432 24.14,-12.087 0,3.626 L 27.202,42.346"
                fill="none" stroke="#ecb833" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`5 ${PERIM - 5}`}
                style={{ animation: `vale-trace ${PERIM / 90}s linear infinite` }}
              />
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}
