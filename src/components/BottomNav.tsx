'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = {
  staff: [
    {
      href: '/staff/home',
      label: 'Schedule',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    },
    {
      href: '/staff/book',
      label: 'New',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
    },
    {
      href: '/staff/notifications',
      label: 'Alerts',
      badge: true,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    },
    {
      href: '/staff/profile',
      label: 'Profile',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    },
  ],
  coordinator: [
    {
      href: '/coordinator/home',
      label: 'Bookings',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    },
    {
      href: '/coordinator/dispatch',
      label: 'Dispatch',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>,
    },
    {
      href: '/coordinator/notifications',
      label: 'Alerts',
      badge: true,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    },
    {
      href: '/coordinator/profile',
      label: 'Profile',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    },
  ],
  driver: [
    {
      href: '/driver/home',
      label: 'My trips',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="2"/><circle cx="16" cy="16" r="1" fill="currentColor"/></svg>,
    },
    {
      href: '/driver/notifications',
      label: 'Alerts',
      badge: true,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    },
    {
      href: '/driver/profile',
      label: 'Profile',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    },
  ],
}

interface BottomNavProps {
  role: 'staff' | 'coordinator' | 'driver'
}

export function BottomNav({ role }: BottomNavProps) {
  const pathname    = usePathname()
  const supabase    = createClient()
  const items       = NAV_ITEMS[role]
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let userId = ''

    async function loadUnread(uid: string) {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('is_read', false)
      setUnread(count || 0)
    }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      userId = user.id
      await loadUnread(userId)
    }

    init()

    // Realtime unread count
    const ch = supabase.channel('nav-notifications')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => { if (userId) loadUnread(userId) }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  return (
    <nav style={{
      position:      'fixed',
      bottom:        0,
      left:          0,
      right:         0,
      background:    '#FFFFFF',
      borderTop:     '1px solid #E0DED8',
      display:       'flex',
      zIndex:        50,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {items.map(item => {
        const active = pathname === item.href ||
          (item.href !== '/staff/home' &&
           item.href !== '/coordinator/home' &&
           item.href !== '/driver/home' &&
           pathname.startsWith(item.href))

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              gap:            '3px',
              padding:        '8px 4px',
              textDecoration: 'none',
              color:          active ? '#0F0F0F' : '#A8A6A0',
              fontSize:       '9px',
              fontWeight:     700,
              letterSpacing:  '0.06em',
              textTransform:  'uppercase',
              position:       'relative',
            }}
          >
            {/* Bell badge */}
            <div style={{ position:'relative' }}>
              {item.icon}
              {item.badge && unread > 0 && (
                <span style={{
                  position:   'absolute',
                  top:        -4,
                  right:      -6,
                  background: '#EF4444',
                  color:      '#fff',
                  fontSize:   '9px',
                  fontWeight: 700,
                  borderRadius: '999px',
                  minWidth:   16,
                  height:     16,
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding:    '0 4px',
                  lineHeight: 1,
                }}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
