'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const FONT = "'DM Sans', -apple-system, sans-serif"

interface Stats {
  total:     number
  thisMonth: number
  thisWeek:  number
}

interface Props {
  role: 'staff' | 'coordinator' | 'driver'
}

export default function ProfilePage({ role }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [user,         setUser]         = useState<any>(null)
  const [taxi,         setTaxi]         = useState<any>(null)
  const [stats,        setStats]        = useState<Stats>({ total: 0, thisMonth: 0, thisWeek: 0 })
  const [loading,      setLoading]      = useState(true)
  const [loggingOut,   setLoggingOut]   = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [pushResult,   setPushResult]   = useState<string | null>(null)
  const [testingPush,  setTestingPush]  = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user: au } } = await supabase.auth.getUser()
      if (!au) { router.push('/login'); return }

      const { data: p } = await supabase
        .from('users').select('*').eq('id', au.id).single()
      setUser({ ...p, email: au.email })

      // Load taxi if driver
      if (role === 'driver') {
        const { data: t } = await supabase
          .from('taxis').select('*, users!driver_id(name)')
          .eq('driver_id', au.id).single()
        setTaxi(t)
      }

      // Load stats based on role
      const now       = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const weekStart  = new Date(now); weekStart.setDate(now.getDate() - now.getDay())

      if (role === 'staff') {
        const [{ count: total }, { count: month }, { count: week }] = await Promise.all([
          supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('passenger_id', au.id),
          supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('passenger_id', au.id).gte('created_at', monthStart.toISOString()),
          supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('passenger_id', au.id).gte('created_at', weekStart.toISOString()),
        ])
        setStats({ total: total || 0, thisMonth: month || 0, thisWeek: week || 0 })

      } else if (role === 'driver') {
        const { data: myTaxi } = await supabase
          .from('taxis').select('id').eq('driver_id', au.id).single()
        if (myTaxi) {
          const [{ count: total }, { count: month }, { count: week }] = await Promise.all([
            supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('taxi_id', myTaxi.id).eq('status', 'completed'),
            supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('taxi_id', myTaxi.id).eq('status', 'completed').gte('completed_at', monthStart.toISOString()),
            supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('taxi_id', myTaxi.id).eq('status', 'completed').gte('completed_at', weekStart.toISOString()),
          ])
          setStats({ total: total || 0, thisMonth: month || 0, thisWeek: week || 0 })
        }

      } else if (role === 'coordinator') {
        const [{ count: total }, { count: month }, { count: pending }] = await Promise.all([
          supabase.from('bookings').select('id', { count: 'exact', head: true }),
          supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString()),
          supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending_coordinator_approval'),
        ])
        setStats({ total: total || 0, thisMonth: month || 0, thisWeek: pending || 0 })
      }

      setLoading(false)
    }
    init()
  }, [])

  async function testPush() {
    setTestingPush(true)
    setPushResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPushResult('❌ Not logged in'); setTestingPush(false); return }

      // First ensure subscribed
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
          if (vapidKey) {
            const perm = await Notification.requestPermission()
            if (perm === 'granted') {
              sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
              })
              await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ subscription: sub }),
              })
            }
          }
        }
      }

      const res  = await fetch('/api/push/test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (data.success) {
        setPushResult('✅ Test push sent! Check your notifications.')
      } else {
        setPushResult(`❌ ${data.error || 'Failed'} — ${data.hint || ''}`)
      }
    } catch (err: any) {
      setPushResult('❌ Error: ' + err.message)
    }
    setTestingPush(false)
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
  }

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, background: '#F4F3EF' }}>
      <p style={{ color: '#A8A6A0' }}>Loading...</p>
    </div>
  )

  const roleLabels: Record<string, string> = {
    staff:       'Staff',
    coordinator: 'Coordinator',
    driver:      'Driver',
  }

  const roleBg:  Record<string, string> = { staff: '#DBEAFE', coordinator: '#FEF3C7', driver: '#D8F3DC' }
  const roleClr: Record<string, string> = { staff: '#1E3A5F', coordinator: '#92400E', driver: '#2D6A4F' }

  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0,2).join('') || '?'

  const statLabels: Record<string, [string, string, string]> = {
    staff:       ['Total bookings', 'This month', 'This week'],
    driver:      ['Trips completed', 'This month', 'This week'],
    coordinator: ['Total bookings', 'This month', 'Pending approval'],
  }

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F4F3EF', WebkitFontSmoothing: 'antialiased' }}>

      {/* Header */}
      <div style={{ background: '#fff', padding: '20px 20px 24px', borderBottom: '1px solid #E0DED8' }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 20px', letterSpacing: '-0.2px' }}>Profile</h1>

        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: roleBg[role], color: roleClr[role], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>{user?.name}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: roleBg[role], color: roleClr[role] }}>
                {roleLabels[role]}
              </span>
              {taxi && (
                <span style={{ fontSize: 11, color: '#6B6963', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: taxi.color || '#888', display: 'inline-block' }} />
                  {taxi.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px 32px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: statLabels[role][0], value: stats.total },
            { label: statLabels[role][1], value: stats.thisMonth },
            { label: statLabels[role][2], value: stats.thisWeek },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.5px' }}>{s.value}</p>
              <p style={{ fontSize: 10, color: '#A8A6A0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, lineHeight: 1.3 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Account info */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A6A0', margin: '0 0 8px' }}>Account</p>
        <div style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          {[
            { label: 'Full name',  value: user?.name },
            { label: 'Email',      value: user?.email },
            { label: 'Role',       value: roleLabels[role] },
            ...(taxi ? [{ label: 'Assigned taxi', value: `${taxi.name} · ${taxi.plate_number || ''}` }] : []),
            { label: 'Member since', value: user?.created_at ? format(new Date(user.created_at), 'd MMM yyyy', { locale: idLocale }) : '—' },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid #F4F3EF' : 'none' }}>
              <span style={{ fontSize: 13, color: '#6B6963' }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* App info */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A6A0', margin: '0 0 8px' }}>App</p>
        <div style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: 14, overflow: 'hidden', marginBottom: 28 }}>
          {[
            { label: 'App name',    value: 'TaxiBook' },
            { label: 'Version',     value: '1.0.0' },
            { label: 'Company',     value: 'PT Vale Indonesia' },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid #F4F3EF' : 'none' }}>
              <span style={{ fontSize: 13, color: '#6B6963' }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#A8A6A0' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Push notification test */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A6A0', margin: '0 0 8px' }}>Push Notifications</p>
        <div style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: '#6B6963', margin: '0 0 10px' }}>
            Test if push notifications are working on this device.
          </p>
          <button
            onClick={testPush}
            disabled={testingPush}
            style={{ width: '100%', padding: '10px', background: testingPush ? '#E0DED8' : '#0F0F0F', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, marginBottom: pushResult ? 10 : 0 }}
          >
            {testingPush ? 'Sending...' : '🔔 Send test notification'}
          </button>
          {pushResult && (
            <div style={{ background: pushResult.startsWith('✅') ? '#D8F3DC' : '#FEE2E2', borderRadius: 8, padding: '8px 12px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: pushResult.startsWith('✅') ? '#2D6A4F' : '#991B1B', margin: 0 }}>{pushResult}</p>
            </div>
          )}
        </div>

        {/* Logout */}
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            style={{ width: '100%', padding: '13px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
          >
            Sign out
          </button>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E0DED8', borderRadius: 14, padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Sign out of TaxiBook?</p>
            <p style={{ fontSize: 13, color: '#6B6963', margin: '0 0 14px' }}>You'll need to log in again to use the app.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ padding: '11px', background: '#F4F3EF', color: '#0F0F0F', border: '1px solid #E0DED8', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                style={{ padding: '11px', background: '#991B1B', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
              >
                {loggingOut ? 'Signing out...' : 'Yes, sign out'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
