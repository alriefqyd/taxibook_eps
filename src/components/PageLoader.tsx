'use client'

// Single closed path tracing the full outer border of the Vale logo mark.
//
// Route (starting at the teal/yellow junction ~(51,12)):
//   1. Short line up to yellow top-right peak      (56.015, 4.901)
//   2. Curve across yellow top to left peak        (29.826, 10.905)   ← reversed yellow curve 2
//   3. Curve back down to junction                 (51.138, 11.879)   ← reversed yellow curve 1
//   4. Teal swoosh curve down-left                 (0,      3.626 )
//   5. Line to teal bottom                         (27.202, 42.346)
//   6. Z — diagonal back to junction (right edge of teal swoosh)
//
// Result: one seamless closed loop around every visible edge of the mark.

const PERIM = 225   // approximate total perimeter
const LINE  = 32    // dash length

const BORDER =
  'M 51.138,11.879 ' +
  'L 56.015,4.901 ' +                                           // yellow right edge
  'C 49.426,-1.617 42.663,5.985 29.826,10.905 ' +             // yellow top edge (reversed)
  'C 36.159,17.69 43.042,18.291 51.138,11.879 ' +             // yellow bottom edge (reversed)
  'C 31.745,29.432 24.14,-12.087 0,3.626 ' +                  // teal swoosh
  'L 27.202,42.346 ' +                                          // teal bottom
  'Z'                                                            // diagonal close = teal right edge

export default function PageLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F5F5F2',
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

              {/* Soft glow */}
              <path d={BORDER} fill="none"
                stroke="rgba(236,184,51,0.4)" strokeWidth="8"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={`${LINE} ${PERIM - LINE}`}
                style={{ animation: `vale-border ${PERIM / 90}s linear infinite` }}
              />
              {/* Crisp edge line */}
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
