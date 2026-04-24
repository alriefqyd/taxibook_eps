// Shared UI constants — reference design tokens
export const C = {
  primary:     '#006064',
  primaryDk:   '#00464a',
  primaryCont: '#a6eff3',
  secondary:   '#feb300',
  secondaryCont:'#ffdeac',
  bg:          '#F5F5F2',
  surface:     '#ffffff',
  surfaceLow:  '#f4f4f1',
  surfaceMid:  '#eeeeeb',
  border:      'rgba(0,0,0,0.08)',
  text:        '#1a1c1b',
  textSec:     '#3f4949',
  textTert:    '#6f7979',
  outline:     '#6f7979',
  error:       '#ba1a1a',
  errorCont:   '#ffdad6',
  shadow:      '0 4px 12px rgba(0,96,100,0.08)',
  shadowSm:    '0 2px 8px rgba(0,0,0,0.06)',
}
export const H = "'Plus Jakarta Sans', sans-serif"
export const B = "'Inter', sans-serif"

// Status chip styles matching reference
export const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  submitted:                    { bg:'#eeeeeb',               color:'#3f4949',  label:'Submitted'   },
  pending_coordinator_approval: { bg:'#ffdeac',               color:'#7e5700',  label:'Needs Approval'},
  pending_driver_approval:      { bg:'rgba(0,96,100,0.12)',   color:'#006064',  label:'Pending Driver'},
  booked:                       { bg:'rgba(0,96,100,0.12)',   color:'#006064',  label:'Confirmed'   },
  waiting_trip:                 { bg:'rgba(0,96,100,0.12)',   color:'#006064',  label:'Waiting'     },
  on_trip:                      { bg:'#d8f3dc',               color:'#344500',  label:'On Trip'     },
  completed:                    { bg:'#d8f3dc',               color:'#344500',  label:'Done'        },
  cancelled:                    { bg:'#ffdad6',               color:'#ba1a1a',  label:'Cancelled'   },
  rejected:                     { bg:'#ffdad6',               color:'#ba1a1a',  label:'Rejected'    },
}
