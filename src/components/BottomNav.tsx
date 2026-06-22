'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PRIMARY = '#006064'

const ICONS: Record<string, { outline: string; filled: string }> = {
  home:         { outline: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10', filled: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  taxi:         { outline: 'M5 17H3v-5l2-5h14l2 5v5h-2 M7.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M16.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', filled: 'M5 17H3v-5l2-5h14l2 5v5h-2 M7.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M16.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
  bell:         { outline: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0', filled: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0' },
  person:       { outline: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', filled: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  dashboard:    { outline: 'M3 3h7v7H3z M3 14h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z', filled: 'M3 3h7v7H3z M3 14h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z' },
  group:        { outline: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 3.13a4 4 0 0 1 0 7.75', filled: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  users:        { outline: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M22 11h-6', filled: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  map:          { outline: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16', filled: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z' },
}

const SvgIcon = ({ d, size = 22, color = 'currentColor', fill = 'none', strokeWidth = 2 }: {
  d: string; size?: number; color?: string; fill?: string; strokeWidth?: number
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {d.split(' M').map((part, i) => (
      <path key={i} d={i === 0 ? part : 'M' + part} />
    ))}
  </svg>
)

type NavItem = { href: string; label: string; iconKey: string }

const NAV: Record<string, NavItem[]> = {
  staff: [
    { href: '/staff/home',    label: 'Home',    iconKey: 'home'   },
    { href: '/staff/book',    label: 'Book',    iconKey: 'taxi'   },
    { href: '/staff/profile', label: 'Profile', iconKey: 'person' },
  ],
  coordinator: [
    { href: '/coordinator/home',    label: 'Home',    iconKey: 'dashboard' },
    { href: '/coordinator/drivers', label: 'Drivers', iconKey: 'group'     },
    { href: '/coordinator/users',   label: 'Users',   iconKey: 'users'     },
    { href: '/coordinator/map',     label: 'Map',     iconKey: 'map'       },
    { href: '/coordinator/profile', label: 'Profile', iconKey: 'person'    },
  ],
  driver: [
    { href: '/driver/home',    label: 'Trips',   iconKey: 'home'   },
    { href: '/driver/profile', label: 'Profile', iconKey: 'person' },
  ],
}

export function BottomNav({ role }: { role: 'staff' | 'coordinator' | 'driver' }) {
  const pathname = usePathname()
  const items = NAV[role] || []

  return (
    <>
      <div style={{ height: 68 }} />
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#ffffff',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 -4px 10px rgba(0,96,100,0.06)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '8px 8px 14px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {items.map(item => {
          const active = pathname.startsWith(item.href)
          const icon   = ICONS[item.iconKey]
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', flex: 1 }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '6px 4px', borderRadius: 12,
                background: active ? 'rgba(0,96,100,0.08)' : 'transparent',
              }}>
                <div style={{ position: 'relative', color: active ? PRIMARY : '#9ca3af' }}>
                  <SvgIcon
                    d={icon?.outline || ''}
                    color={active ? PRIMARY : '#9ca3af'}
                    fill={active ? 'rgba(0,96,100,0.15)' : 'none'}
                    strokeWidth={active ? 2.5 : 1.8}
                  />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  color: active ? PRIMARY : '#9ca3af',
                  letterSpacing: '0.01em',
                }}>
                  {item.label}
                </span>
              </div>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

export default BottomNav
