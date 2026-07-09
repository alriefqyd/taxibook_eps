'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useLang } from '@/lib/language'
import PageLoader from '@/components/PageLoader'

const MSG = {
  en: {
    title:        'Notifications',
    unread:       (n: number) => `${n} unread`,
    allRead:      'All caught up',
    markAllRead:  'Mark all read',
    noTitle:      'No notifications yet',
    noBody:       "You'll be notified about your bookings here",
    close:        'Close',
  },
  id: {
    title:        'Notifikasi',
    unread:       (n: number) => `${n} belum dibaca`,
    allRead:      'Semua sudah dibaca',
    markAllRead:  'Tandai semua dibaca',
    noTitle:      'Belum ada notifikasi',
    noBody:       'Anda akan diberitahu tentang booking Anda di sini',
    close:        'Tutup',
  },
}

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
  const lang     = useLang()
  const t        = MSG[lang]

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading,       setLoading]       = useState(true)
  const [userId,        setUserId]        = useState('')
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null)

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
      const { data: { session } } = await supabase.auth.getSession()
      const au = session?.user
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

  if (loading) return <PageLoader />

  const unreadCount = notifications.filter(n => !n.is_read).length

  const homeMap: Record<string, string> = {
    staff:       '/staff/home',
    coordinator: '/coordinator/home',
    driver:      '/driver/home',
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", minHeight:'100vh', background:'#F5F5F2' }}>

      {/* Header */}
      <div style={{ background:'#ffffff', padding:'16px 20px 14px', borderBottom:'1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <button
              onClick={() => router.push(homeMap[role])}
              style={{ width:32, height:32, borderRadius:'50%', background:'#F5F5F2', border:'1px solid rgba(0,0,0,0.08)', cursor:'pointer', fontSize:'15px', display:'flex', alignItems:'center', justifyContent:'center' }}
            >
              ←
            </button>
            <div>
              <h1 style={{ fontSize:'18px', fontWeight:700, margin:'0 0 2px', letterSpacing:'-0.3px' }}>
                {t.title}
              </h1>
              <p style={{ fontSize:'12px', color:'#8A9BB0', margin:0 }}>
                {unreadCount > 0 ? t.unread(unreadCount) : t.allRead}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{ fontSize:'12px', fontWeight:600, color:'#2563EB', background:'transparent', border:'none', cursor:'pointer', padding:'4px 8px' }}
            >
              {t.markAllRead}
            </button>
          )}
        </div>
      </div>

      {/* Notification detail popup */}
      {selectedNotif && (() => {
        const c = TYPE_COLORS[selectedNotif.type] || { bg:'#f3f4f6', border:'rgba(0,0,0,0.08)', dot:'#9ca3af' }
        const ic = TYPE_ICONS[selectedNotif.type] || '🔔'
        const time = formatDistanceToNow(new Date(selectedNotif.sent_at), { addSuffix: true, locale: idLocale })
        const fullDate = new Date(selectedNotif.sent_at).toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
        return (
          <>
            <div onClick={() => setSelectedNotif(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:200 }} />
            <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:201, background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 36px', maxHeight:'75vh', overflowY:'auto' }}>
              <div style={{ width:36, height:4, borderRadius:9999, background:'rgba(0,0,0,0.12)', margin:'0 auto 20px' }} />

              {/* Icon + title */}
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
                <div style={{ width:52, height:52, borderRadius:'50%', background:c.bg, border:`1.5px solid ${c.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>
                  {ic}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:16, fontWeight:700, color:'#006064', margin:'0 0 3px', lineHeight:1.3 }}>{selectedNotif.title}</p>
                  <p style={{ fontSize:11, color:'#9ca3af', margin:0 }}>{time} · {fullDate}</p>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height:1, background:'rgba(0,0,0,0.07)', margin:'0 0 14px' }} />

              {/* Body */}
              <p style={{ fontSize:14, color:'#374151', lineHeight:1.65, margin:'0 0 24px', whiteSpace:'pre-line' }}>
                {selectedNotif.body}
              </p>

              <button
                onClick={() => setSelectedNotif(null)}
                style={{ width:'100%', padding:'14px', background:'#006064', color:'#fff', border:'none', borderRadius:16, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
              >
                {t.close}
              </button>
            </div>
          </>
        )
      })()}

      {/* Notifications list */}
      <div style={{ padding:'12px 16px 20px' }}>
        {notifications.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px' }}>
            <p style={{ fontSize:'32px', margin:'0 0 12px' }}>🔔</p>
            <p style={{ fontSize:'14px', fontWeight:600, color:'#006064', margin:'0 0 6px' }}>{t.noTitle}</p>
            <p style={{ fontSize:'13px', color:'#6B7C8F', margin:0 }}>
              {t.noBody}
            </p>
          </div>
        ) : (
          notifications.map(n => {
            const colors = TYPE_COLORS[n.type] || { bg:'rgba(0,0,0,0.04)', border:'rgba(0,0,0,0.08)', dot:'#9ca3af' }
            const icon   = TYPE_ICONS[n.type] || '🔔'
            const timeAgo = formatDistanceToNow(new Date(n.sent_at), { addSuffix:true, locale: idLocale })

            async function openNotif() {
              setSelectedNotif(n)
              if (!n.is_read) {
                await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
                setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
              }
            }

            return (
              <div
                key={n.id}
                onClick={openNotif}
                style={{
                  background: n.is_read ? '#fff' : colors.bg,
                  border: `1px solid ${n.is_read ? 'rgba(0,0,0,0.08)' : colors.border}`,
                  borderLeft: `3px solid ${n.is_read ? 'rgba(0,0,0,0.08)' : colors.dot}`,
                  borderRadius:'12px', padding:'12px 14px', marginBottom:'8px',
                  display:'flex', gap:'12px', alignItems:'flex-start',
                  cursor: 'pointer',
                }}
              >
                {/* Icon */}
                <div style={{ fontSize:'20px', flexShrink:0, lineHeight:1, marginTop:'1px' }}>
                  {icon}
                </div>

                {/* Content */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'3px' }}>
                    <p style={{ fontSize:'13px', fontWeight: n.is_read ? 600 : 700, margin:0, color:'#006064' }}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span style={{ width:8, height:8, borderRadius:'50%', background:colors.dot, flexShrink:0, marginLeft:'8px', marginTop:'3px' }} />
                    )}
                  </div>
                  <p style={{ fontSize:'12px', color:'#8A9BB0', margin:'0 0 4px', lineHeight:1.5 }}>
                    {n.body}
                  </p>
                  <p style={{ fontSize:'11px', color:'#6B7C8F', margin:0 }}>
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
