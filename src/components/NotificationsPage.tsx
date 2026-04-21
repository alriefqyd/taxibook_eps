'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

interface Notification {
  id:         string
  booking_id: string | null
  title:      string
  body:       string
  type:       string
  is_read:    boolean
  sent_at:    string
}

const TYPE_ICONS: Record<string, string> = {
  booking_confirmed:   '✅',
  booking_rejected:    '❌',
  booking_reassigned:  '🔄',
  driver_assigned:     '🚗',
  driver_declined:     '⚠️',
  trip_completed:      '🏁',
  needs_approval:      '⏳',
  driver_reassigned:   '🔄',
  auto_completed:      '🏁',
  reminder_15min:      '⏰',
  reminder_start:      '🚗',
  reminder_overdue:    '⚠️',
}

const TYPE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  booking_confirmed:   { bg: '#D1FAE5', border: '#6EE7B7', dot: '#059669' },
  booking_rejected:    { bg: '#FEE2E2', border: '#FCA5A5', dot: '#DC2626' },
  booking_reassigned:  { bg: '#DBEAFE', border: '#93C5FD', dot: '#2563EB' },
  driver_assigned:     { bg: '#D1FAE5', border: '#6EE7B7', dot: '#059669' },
  driver_declined:     { bg: '#FEF3C7', border: '#FCD34D', dot: '#D97706' },
  trip_completed:      { bg: '#F1F5F9', border: '#CBD5E1', dot: '#64748B' },
  needs_approval:      { bg: '#FEF3C7', border: '#FCD34D', dot: '#D97706' },
  driver_reassigned:   { bg: '#DBEAFE', border: '#93C5FD', dot: '#2563EB' },
  auto_completed:      { bg: '#F1F5F9', border: '#CBD5E1', dot: '#64748B' },
  reminder_15min:      { bg: '#EFF6FF', border: '#93C5FD', dot: '#2563EB' },
  reminder_start:      { bg: '#DBEAFE', border: '#2563EB', dot: '#2563EB' },
  reminder_overdue:    { bg: '#FEF3C7', border: '#FCD34D', dot: '#D97706' },
}

interface Props {
  role: 'staff' | 'coordinator' | 'driver'
}

export default function NotificationsPage({ role }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading,       setLoading]       = useState(true)
  const [userId,        setUserId]        = useState('')

  const loadNotifications = useCallback(async (uid: string) => {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('sent_at', { ascending: false })
      .limit(50)

    // Driver assignment notifications are handled by popup — exclude from list
    if (role === 'driver') {
      query = query.neq('type', 'driver_assigned').neq('type', 'driver_reassigned')
    }

    const { data } = await query
    setNotifications(data || [])
  }, [supabase, role])

  useEffect(() => {
    let uid = ''

    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }
      uid = au.id
      setUserId(uid)
      await loadNotifications(uid)
      setLoading(false)

      // Mark all as read after 2 seconds
      setTimeout(async () => {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', uid)
          .eq('is_read', false)
      }, 2000)
    }

    init()

    const ch = supabase.channel('notifications-page')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => { if (uid) loadNotifications(uid) }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function deleteNotification(id: string) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <p style={{ color:'#A8A6A0' }}>Loading...</p>
    </div>
  )

  const unreadCount = notifications.filter(n => !n.is_read).length

  const homeMap: Record<string, string> = {
    staff:       '/staff/home',
    coordinator: '/coordinator/home',
    driver:      '/driver/home',
  }

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', minHeight:'100vh', background:'#F4F3EF' }}>

      {/* Header */}
      <div style={{ background:'#fff', padding:'16px 20px 14px', borderBottom:'1px solid #E0DED8' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <button
              onClick={() => router.push(homeMap[role])}
              style={{ width:32, height:32, borderRadius:'50%', background:'#F4F3EF', border:'1px solid #E0DED8', cursor:'pointer', fontSize:'15px', display:'flex', alignItems:'center', justifyContent:'center' }}
            >
              ←
            </button>
            <div>
              <h1 style={{ fontSize:'18px', fontWeight:700, margin:'0 0 2px', letterSpacing:'-0.3px' }}>
                Notifications
              </h1>
              <p style={{ fontSize:'12px', color:'#6B6963', margin:0 }}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{ fontSize:'12px', fontWeight:600, color:'#2563EB', background:'transparent', border:'none', cursor:'pointer', padding:'4px 8px' }}
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Notifications list */}
      <div style={{ padding:'12px 16px 20px' }}>
        {notifications.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px' }}>
            <p style={{ fontSize:'32px', margin:'0 0 12px' }}>🔔</p>
            <p style={{ fontSize:'14px', fontWeight:600, color:'#0F0F0F', margin:'0 0 6px' }}>No notifications yet</p>
            <p style={{ fontSize:'13px', color:'#A8A6A0', margin:0 }}>
              You'll be notified about your bookings here
            </p>
          </div>
        ) : (
          notifications.map(n => {
            const colors = TYPE_COLORS[n.type] || { bg:'#F4F3EF', border:'#E0DED8', dot:'#A8A6A0' }
            const icon   = TYPE_ICONS[n.type] || '🔔'
            const timeAgo = formatDistanceToNow(new Date(n.sent_at), { addSuffix:true, locale: idLocale })

            return (
              <div
                key={n.id}
                style={{
                  background: n.is_read ? '#fff' : colors.bg,
                  border: `1px solid ${n.is_read ? '#E0DED8' : colors.border}`,
                  borderLeft: `3px solid ${n.is_read ? '#E0DED8' : colors.dot}`,
                  borderRadius:'12px', padding:'12px 14px', marginBottom:'8px',
                  display:'flex', gap:'12px', alignItems:'flex-start',
                }}
              >
                {/* Icon */}
                <div style={{ fontSize:'20px', flexShrink:0, lineHeight:1, marginTop:'1px' }}>
                  {icon}
                </div>

                {/* Content */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'3px' }}>
                    <p style={{ fontSize:'13px', fontWeight: n.is_read ? 600 : 700, margin:0, color:'#0F0F0F' }}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span style={{ width:8, height:8, borderRadius:'50%', background:colors.dot, flexShrink:0, marginLeft:'8px', marginTop:'3px' }} />
                    )}
                  </div>
                  <p style={{ fontSize:'12px', color:'#6B6963', margin:'0 0 4px', lineHeight:1.5 }}>
                    {n.body}
                  </p>
                  <p style={{ fontSize:'11px', color:'#A8A6A0', margin:0 }}>
                    {timeAgo}
                  </p>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteNotification(n.id)}
                  style={{ background:'transparent', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:'16px', padding:'0', flexShrink:0, lineHeight:1 }}
                >
                  ×
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
