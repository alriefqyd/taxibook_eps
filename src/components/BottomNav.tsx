'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useLang } from '@/lib/language'

const PRIMARY = '#006064'

const ICONS: Record<string, { outline: string; filled: string }> = {
  home:      { outline: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10', filled: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  taxi:      { outline: 'M5 17H3v-5l2-5h14l2 5v5h-2 M7.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M16.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', filled: 'M5 17H3v-5l2-5h14l2 5v5h-2 M7.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M16.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
  bell:      { outline: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0', filled: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0' },
  person:    { outline: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', filled: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  dashboard: { outline: 'M3 3h7v7H3z M3 14h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z', filled: 'M3 3h7v7H3z M3 14h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z' },
  group:     { outline: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 3.13a4 4 0 0 1 0 7.75', filled: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  steering:  { outline: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M12 9V2 M9.4 13.5L3.3 17 M14.6 13.5L20.7 17', filled: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M12 9V2 M9.4 13.5L3.3 17 M14.6 13.5L20.7 17' },
  users:     { outline: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M22 11h-6', filled: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  map:       { outline: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16', filled: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z' },
  list:      { outline: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01', filled: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01' },
  route:     { outline: 'M9 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15 M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', filled: 'M9 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15 M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
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

type NavItem = { href: string; labelEn: string; labelId: string; iconKey: string }

const NAV: Record<string, NavItem[]> = {
  staff: [
    { href: '/staff/home',  labelEn: 'Home',    labelId: 'Beranda', iconKey: 'home' },
    { href: '/staff/trips', labelEn: 'Trips',   labelId: 'Riwayat', iconKey: 'route' },
  ],
  coordinator: [
    { href: '/coordinator/home',    labelEn: 'Home',     labelId: 'Beranda', iconKey: 'dashboard' },
    { href: '/coordinator/report',  labelEn: 'Bookings', labelId: 'Booking', iconKey: 'list'      },
    { href: '/coordinator/drivers', labelEn: 'Drivers',  labelId: 'Driver',  iconKey: 'taxi'      },
    { href: '/coordinator/profile', labelEn: 'Profile',  labelId: 'Profil',  iconKey: 'person'    },
  ],
  driver: [
    { href: '/driver/home',    labelEn: 'Home',    labelId: 'Beranda',  iconKey: 'home'   },
    { href: '/driver/trips',   labelEn: 'History', labelId: 'Riwayat',  iconKey: 'list'   },
    { href: '/driver/profile', labelEn: 'Profile', labelId: 'Profil',   iconKey: 'person' },
  ],
}

const CENTER_FAB_HREF: Partial<Record<string, string>> = {
  staff:       '/staff/book',
  coordinator: '/coordinator/book',
}

export function BottomNav({ role }: { role: 'staff' | 'coordinator' | 'driver' }) {
  const pathname = usePathname()
  const lang     = useLang()
  const items    = NAV[role] || []
  const fabHref  = CENTER_FAB_HREF[role]

  const [tapped, setTapped]       = useState<string | null>(null)
  const [fabTapped, setFabTapped] = useState(false)

  const half       = fabHref ? Math.floor(items.length / 2) : items.length
  const leftItems  = fabHref ? items.slice(0, half) : items
  const rightItems = fabHref ? items.slice(half)    : []

  const handleTap = (key: string) => {
    setTapped(key)
    setTimeout(() => setTapped(null), 500)
  }

  const handleFabTap = () => {
    setFabTapped(true)
    setTimeout(() => setFabTapped(false), 500)
  }

  const renderItem = (item: NavItem) => {
    const active  = pathname.startsWith(item.href)
    const icon    = ICONS[item.iconKey]
    const popping = tapped === item.href
    return (
      <Link
        key={item.href}
        href={item.href}
        style={{ textDecoration: 'none', flex: 1 }}
        onClick={() => handleTap(item.href)}
      >
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 3, padding: '6px 4px', borderRadius: 12,
          background: active ? 'rgba(0,96,100,0.08)' : 'transparent',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: popping ? 'navPop 420ms cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
          }}>
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
            {lang === 'id' ? item.labelId : item.labelEn}
          </span>
        </div>
      </Link>
    )
  }

  return (
    <>
      <style>{`
        @keyframes navPop {
          0%   { transform: scale(1)    }
          35%  { transform: scale(1.35) }
          60%  { transform: scale(0.92) }
          80%  { transform: scale(1.08) }
          100% { transform: scale(1)    }
        }
        @keyframes fabPop {
          0%   { transform: scale(1)    }
          35%  { transform: scale(0.88) }
          65%  { transform: scale(1.12) }
          100% { transform: scale(1)    }
        }
      `}</style>
      <div style={{ height: 68 }} />
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
        background: '#ffffff',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 -4px 10px rgba(0,96,100,0.06)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '8px 8px 14px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        overflow: 'visible',
      }}>
        {leftItems.map(renderItem)}

        {fabHref && (
          <div style={{ position: 'relative', flex: '0 0 72px', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              position: 'absolute',
              width: 60, height: 60,
              borderRadius: '50%',
              background: '#ffffff',
              top: -30,
              zIndex: 1,
            }} />
            <Link href={fabHref} style={{ textDecoration: 'none', position: 'relative', zIndex: 2 }} onClick={handleFabTap}>
              <div style={{
                width: 52, height: 52,
                borderRadius: '50%',
                background: PRIMARY,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: -26,
                boxShadow: '0 4px 18px rgba(0,96,100,0.45)',
                animation: fabTapped ? 'fabPop 420ms cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <rect x="10.5" y="4" width="3" height="16" rx="1.5"/>
                  <rect x="4" y="10.5" width="16" height="3" rx="1.5"/>
                </svg>
              </div>
            </Link>
          </div>
        )}

        {rightItems.map(renderItem)}
      </nav>
    </>
  )
}

export default BottomNav
