'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import PageLoader from '@/components/PageLoader'
import { useLang, setLang } from '@/lib/language'
import type { Lang } from '@/lib/language'

const MSG = {
  en: {
    profile:       'Profile',
    account:       'Account',
    fullName:      'Full name',
    email:         'Email',
    role:          'Role',
    assignedTaxi:  'Assigned taxi',
    memberSince:   'Member since',
    phone:         'Phone',
    notSet:        'Not set',
    edit:          'Edit',
    phoneNumber:   'Phone number',
    cancel:        'Cancel',
    save:          'Save',
    saving:        'Saving…',
    phoneUpdated:  'Phone number updated.',
    security:      'Security',
    changePw:      'Change password',
    newPw:         'New password',
    confirmPw:     'Confirm password',
    min8:          'Min 8 characters',
    repeatPw:      'Repeat new password',
    updatePw:      'Update password',
    savingPw:      'Saving…',
    app:           'App',
    appName:       'App name',
    version:       'Version',
    company:       'Company',
    pushTitle:     'Push Notifications',
    enableNotif:   'Enable notifications',
    enableDesc:    'Get alerts for trip updates, driver assignments, and reminders.',
    enabling:      'Enabling…',
    enableBtn:     'Enable notifications',
    installTip:    'Tip: install the app to your homescreen for reliable background alerts.',
    registering:   'Registering device…',
    registered:    'Device registered — notifications active',
    notRegistered: 'Device not registered',
    testPush:         'Send test push',
    testingPush:      'Sending…',
    howToUse:         'How to use',
    signOut:          'Sign out',
    signOutConfirm:   'Sign out of TaxiBook?',
    signOutBody:      "You'll need to log in again to use the app.",
    yesSignOut:       'Yes, sign out',
    signingOut:       'Signing out…',
    viewProfile:      'View profile',
    statLabels: {
      staff:       ['Total bookings', 'This month', 'This week'],
      driver:      ['Trips completed', 'This month', 'This week'],
      coordinator: ['Total bookings', 'This month', 'Pending approval'],
    },
    roleLabels: { staff: 'Staff', coordinator: 'Coordinator', driver: 'Driver' },
  },
  id: {
    profile:       'Profil',
    account:       'Akun',
    fullName:      'Nama lengkap',
    email:         'Email',
    role:          'Peran',
    assignedTaxi:  'Taksi yang ditugaskan',
    memberSince:   'Bergabung sejak',
    phone:         'Telepon',
    notSet:        'Belum diatur',
    edit:          'Ubah',
    phoneNumber:   'Nomor telepon',
    cancel:        'Batal',
    save:          'Simpan',
    saving:        'Menyimpan…',
    phoneUpdated:  'Nomor telepon diperbarui.',
    security:      'Keamanan',
    changePw:      'Ganti kata sandi',
    newPw:         'Kata sandi baru',
    confirmPw:     'Konfirmasi kata sandi',
    min8:          'Min 8 karakter',
    repeatPw:      'Ulangi kata sandi baru',
    updatePw:      'Perbarui kata sandi',
    savingPw:      'Menyimpan…',
    app:           'Aplikasi',
    appName:       'Nama aplikasi',
    version:       'Versi',
    company:       'Perusahaan',
    pushTitle:     'Notifikasi Push',
    enableNotif:   'Aktifkan notifikasi',
    enableDesc:    'Dapatkan notifikasi untuk pembaruan perjalanan, penugasan driver, dan pengingat.',
    enabling:      'Mengaktifkan…',
    enableBtn:     'Aktifkan notifikasi',
    installTip:    'Tips: instal aplikasi ke layar utama untuk notifikasi latar belakang yang andal.',
    registering:   'Mendaftarkan perangkat…',
    registered:    'Perangkat terdaftar — notifikasi aktif',
    notRegistered: 'Perangkat belum terdaftar',
    testPush:         'Kirim push test',
    testingPush:      'Mengirim…',
    howToUse:         'Cara penggunaan',
    signOut:          'Keluar',
    signOutConfirm:   'Keluar dari TaxiBook?',
    signOutBody:      'Anda perlu masuk kembali untuk menggunakan aplikasi.',
    yesSignOut:       'Ya, keluar',
    signingOut:       'Keluar…',
    viewProfile:      'Lihat profil',
    statLabels: {
      staff:       ['Total booking', 'Bulan ini', 'Minggu ini'],
      driver:      ['Perjalanan selesai', 'Bulan ini', 'Minggu ini'],
      coordinator: ['Total booking', 'Bulan ini', 'Menunggu persetujuan'],
    },
    roleLabels: { staff: 'Staff', coordinator: 'Koordinator', driver: 'Driver' },
  },
}

const FONT = "var(--font-inter), 'Inter', sans-serif"

interface Stats {
  total:     number
  thisMonth: number
  thisWeek:  number
}

interface Props {
  role: 'staff' | 'coordinator' | 'driver'
}

// Convert any Indonesian phone format to WhatsApp-ready number (no + or spaces)
function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

export default function ProfilePage({ role }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [user,           setUser]           = useState<any>(null)
  const [taxi,           setTaxi]           = useState<any>(null)
  const [stats,          setStats]          = useState<Stats>({ total: 0, thisMonth: 0, thisWeek: 0 })
  const [loading,        setLoading]        = useState(true)
  const [loggingOut,     setLoggingOut]     = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [pushResult,     setPushResult]     = useState<string | null>(null)
  const [testingPush,    setTestingPush]    = useState(false)
  const [notifPerm,      setNotifPerm]      = useState<NotificationPermission | 'unsupported'>('default')
  const [enablingNotif,  setEnablingNotif]  = useState(false)
  const [isPWA,          setIsPWA]          = useState(false)
  const [subStatus,      setSubStatus]      = useState<'idle' | 'checking' | 'registered' | 'failed'>('idle')

  // ── Language preference ────────────────────────────────────
  const lang = useLang()
  const t    = MSG[lang]

  function toggleLang(l: Lang) {
    setLang(l)
  }

  // ── Phone editing ──────────────────────────────────────────
  const [editPhone,   setEditPhone]   = useState(false)
  const [phoneInput,  setPhoneInput]  = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneMsg,    setPhoneMsg]    = useState<{ text: string; ok: boolean } | null>(null)

  // ── Password change ────────────────────────────────────────
  const [showChangePw, setShowChangePw] = useState(false)
  const [pwForm,       setPwForm]       = useState({ newPw: '', confirmPw: '' })
  const [showNewPw,    setShowNewPw]    = useState(false)
  const [showConfirmPw,setShowConfirmPw]= useState(false)
  const [savingPw,     setSavingPw]     = useState(false)
  const [pwMsg,        setPwMsg]        = useState<{ text: string; ok: boolean } | null>(null)

  // ── Shared push helper ─────────────────────────────────────
  async function subscribeAndSave(): Promise<string | null> {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window))
        return 'Push not supported on this browser'

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) return 'VAPID key not configured'

      const allRegs = await navigator.serviceWorker.getRegistrations()
      for (const r of allRegs) {
        const swUrl = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || ''
        if (swUrl && !swUrl.endsWith('/sw.js')) await r.unregister()
      }

      const swReg = await navigator.serviceWorker.getRegistration('/')
      if (!swReg) {
        try { await navigator.serviceWorker.register('/sw.js', { scope: '/' }) } catch { /* ignore */ }
      }

      const reg: ServiceWorkerRegistration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Service worker not ready — please reload the page and try again')), 20000)
        ),
      ])

      const staleSub = await reg.pushManager.getSubscription()
      if (staleSub) await staleSub.unsubscribe()

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      })

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return 'Session expired — please log in again'

      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body:    JSON.stringify({ subscription: sub }),
      })

      if (res.ok) return null
      const d = await res.json()
      return d.error || 'Server error saving subscription'
    } catch (err: any) {
      return err.message || 'Unknown error'
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsPWA(
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    )
    if (!('Notification' in window)) { setNotifPerm('unsupported'); return }
    const perm = Notification.permission
    setNotifPerm(perm)
    if (perm === 'granted') {
      setSubStatus('checking')
      subscribeAndSave().then(err => {
        setSubStatus(err ? 'failed' : 'registered')
        if (err) setPushResult('❌ ' + err)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const au = session?.user
      if (!au) { router.push('/login'); return }

      const { data: p } = await supabase.from('users').select('*').eq('id', au.id).single()
      setUser({ ...p, email: au.email })

      if (role === 'driver') {
        const { data: t } = await supabase
          .from('taxis').select('*, users!driver_id(name)')
          .eq('driver_id', au.id).single()
        setTaxi(t)
      }

      const now        = new Date()
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
        const { data: myTaxi } = await supabase.from('taxis').select('id').eq('driver_id', au.id).single()
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePhone() {
    const phone = phoneInput.trim()
    setSavingPhone(true)
    setPhoneMsg(null)
    const { error } = await supabase
      .from('users')
      .update({ phone: phone || null })
      .eq('id', user.id)
    setSavingPhone(false)
    if (error) {
      setPhoneMsg({ text: 'Failed to save: ' + error.message, ok: false })
    } else {
      setUser((prev: any) => ({ ...prev, phone: phone || null }))
      setEditPhone(false)
      setPhoneMsg({ text: 'Phone number updated.', ok: true })
      setTimeout(() => setPhoneMsg(null), 3000)
    }
  }

  async function changePassword() {
    setPwMsg(null)
    const { newPw, confirmPw } = pwForm
    if (newPw.length < 8) { setPwMsg({ text: 'Password must be at least 8 characters.', ok: false }); return }
    if (newPw !== confirmPw) { setPwMsg({ text: 'Passwords do not match.', ok: false }); return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (error) {
      setPwMsg({ text: 'Failed: ' + error.message, ok: false })
    } else {
      setPwMsg({ text: 'Password changed successfully.', ok: true })
      setPwForm({ newPw: '', confirmPw: '' })
      setShowChangePw(false)
      setTimeout(() => setPwMsg(null), 4000)
    }
  }

  async function testPush() {
    setTestingPush(true)
    setPushResult(null)
    try {
      const subErr = await subscribeAndSave()
      if (subErr) { setPushResult('❌ ' + subErr); setTestingPush(false); return }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPushResult('❌ Not logged in'); setTestingPush(false); return }

      const res  = await fetch('/api/push/test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      setPushResult(data.success ? '✅ Test push sent! Check your notifications.' : `❌ ${data.error || 'Failed'} — ${data.hint || ''}`)
    } catch (err: any) {
      setPushResult('❌ Error: ' + err.message)
    }
    setTestingPush(false)
  }

  async function enableNotifications() {
    setEnablingNotif(true)
    setPushResult(null)

    const permission = await Notification.requestPermission()
    setNotifPerm(permission)

    if (permission !== 'granted') {
      if (permission === 'denied')
        setPushResult('❌ Blocked. Go to phone/browser settings and allow notifications, then reload.')
      setEnablingNotif(false)
      return
    }

    setSubStatus('checking')
    const err = await subscribeAndSave()
    if (err) {
      setSubStatus('failed')
      setPushResult('❌ ' + err)
    } else {
      setSubStatus('registered')
      setPushResult('✅ Notifications enabled! This device is now registered.')
    }
    setEnablingNotif(false)
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

  if (loading) return <PageLoader />

  const roleLabels = t.roleLabels
  const roleBg:  Record<string, string> = { staff: '#DBEAFE', coordinator: '#FEF3C7', driver: '#D8F3DC' }
  const roleClr: Record<string, string> = { staff: '#1E3A5F', coordinator: '#92400E', driver: '#2D6A4F' }
  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0,2).join('') || '?'

  const statLabels = t.statLabels

  const hasPhone = !!user?.phone

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F5F5F2', WebkitFontSmoothing: 'antialiased' }}>

      {/* Header */}
      <div style={{ background: '#ffffff', padding: '20px 20px 24px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 20px', letterSpacing: '-0.2px' }}>{t.profile}</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: roleBg[role], color: roleClr[role], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px' }}>{user?.name}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 9999, background: roleBg[role], color: roleClr[role] }}>
                {roleLabels[role]}
              </span>
              {taxi && (
                <span style={{ fontSize: 11, color: '#6f7979', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: taxi.color || '#888', display: 'inline-block' }} />
                  {taxi.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: statLabels[role][0], value: stats.total },
            { label: statLabels[role][1], value: stats.thisMonth },
            { label: statLabels[role][2], value: stats.thisWeek },
          ].map(s => (
            <div key={s.label} style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '12px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.5px' }}>{s.value}</p>
              <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, lineHeight: 1.3 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Account info ── */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>{t.account}</p>
        <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>

          {/* Static rows */}
          {[
            { label: t.fullName,     value: user?.name },
            { label: t.email,        value: user?.email },
            { label: t.role,         value: roleLabels[role] },
            ...(taxi ? [{ label: t.assignedTaxi, value: `${taxi.name} · ${taxi.plate_number || ''}` }] : []),
            { label: t.memberSince,  value: user?.created_at ? format(new Date(user.created_at), 'd MMM yyyy', { locale: idLocale }) : '—' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize: 13, color: '#6f7979' }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
            </div>
          ))}

          {/* Phone row — editable */}
          <div style={{ padding: '12px 16px' }}>
            {!editPhone ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#6f7979' }}>{t.phone}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: hasPhone ? '#1a1c1b' : '#9ca3af' }}>
                    {user?.phone || t.notSet}
                  </span>
                  <button
                    onClick={() => { setPhoneInput(user?.phone || ''); setEditPhone(true); setPhoneMsg(null) }}
                    style={{ fontSize: 12, fontWeight: 700, color: '#006064', background: 'rgba(0,96,100,0.08)', border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}
                  >
                    {t.edit}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0 0 8px' }}>{t.phoneNumber}</p>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="e.g. 081234567890"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1.5px solid #006064', borderRadius: 10, outline: 'none', fontFamily: FONT, boxSizing: 'border-box', marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setEditPhone(false); setPhoneMsg(null) }}
                    style={{ flex: 1, padding: '10px', background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, color: '#006064' }}>
                    {t.cancel}
                  </button>
                  <button onClick={savePhone} disabled={savingPhone}
                    style={{ flex: 1, padding: '10px', background: savingPhone ? '#9ca3af' : '#006064', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: savingPhone ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                    {savingPhone ? t.saving : t.save}
                  </button>
                </div>
              </div>
            )}
            {phoneMsg && (
              <p style={{ fontSize: 12, fontWeight: 600, margin: '8px 0 0', color: phoneMsg.ok ? '#2D6A4F' : '#991B1B' }}>
                {phoneMsg.text}
              </p>
            )}
          </div>
        </div>

        {/* ── Contact actions ── */}
        {hasPhone && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <a
              href={`tel:${user.phone}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 10px', background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, textDecoration: 'none', color: '#006064', fontSize: 14, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.63 4.35 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Call
            </a>
            <a
              href={`https://wa.me/${toWaNumber(user.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 10px', background: '#25D366', border: 'none', borderRadius: 16, textDecoration: 'none', color: '#ffffff', fontSize: 14, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
          </div>
        )}

        {/* ── Security ── */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>{t.security}</p>
        <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
          {!showChangePw ? (
            <button
              onClick={() => { setShowChangePw(true); setPwMsg(null); setPwForm({ newPw: '', confirmPw: '' }) }}
              style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#006064' }}>{t.changePw}</span>
              </div>
              <span style={{ fontSize: 16, color: '#9ca3af' }}>›</span>
            </button>
          ) : (
            <div style={{ padding: '16px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px', color: '#006064' }}>{t.changePw}</p>

              {/* New password */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>{t.newPw}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={pwForm.newPw}
                    onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
                    placeholder={t.min8}
                    style={{ width: '100%', padding: '10px 40px 10px 12px', fontSize: 15, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, outline: 'none', fontFamily: FONT, boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}
                  >
                    {showNewPw ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>{t.confirmPw}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    value={pwForm.confirmPw}
                    onChange={e => setPwForm(f => ({ ...f, confirmPw: e.target.value }))}
                    placeholder={t.repeatPw}
                    style={{ width: '100%', padding: '10px 40px 10px 12px', fontSize: 15, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, outline: 'none', fontFamily: FONT, boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}
                  >
                    {showConfirmPw ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              {pwMsg && (
                <div style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 12, background: pwMsg.ok ? '#D8F3DC' : '#FEE2E2' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: pwMsg.ok ? '#2D6A4F' : '#991B1B' }}>{pwMsg.text}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowChangePw(false); setPwMsg(null) }}
                  style={{ flex: 1, padding: '11px', background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, color: '#006064' }}>
                  {t.cancel}
                </button>
                <button onClick={changePassword} disabled={savingPw}
                  style={{ flex: 1, padding: '11px', background: savingPw ? '#9ca3af' : '#006064', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: savingPw ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                  {savingPw ? t.savingPw : t.updatePw}
                </button>
              </div>
            </div>
          )}
          {pwMsg && !showChangePw && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: pwMsg.ok ? '#2D6A4F' : '#991B1B' }}>{pwMsg.text}</p>
            </div>
          )}
        </div>

        {/* ── Language ── */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>Language / Bahasa</p>
        <div style={{ background: '#ECEAE4', borderRadius: 16, padding: 4, display: 'flex', gap: 4, marginBottom: 20 }}>
          {(['en', 'id'] as Lang[]).map(l => (
            <button
              key={l}
              onClick={() => toggleLang(l)}
              style={{ flex: 1, padding: '11px 8px', border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13, transition: 'all 0.15s', background: lang === l ? '#ffffff' : 'transparent', color: lang === l ? '#006064' : '#9ca3af', boxShadow: lang === l ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}
            >
              {l === 'en' ? '🇬🇧 English' : '🇮🇩 Bahasa Indonesia'}
            </button>
          ))}
        </div>

        {/* App info */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>{t.app}</p>
        <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
          {[
            { label: t.appName, value: 'TaxiBook' },
            { label: t.version, value: '1.1.0' },
            { label: t.company, value: 'PT Vale Indonesia' },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
              <span style={{ fontSize: 13, color: '#6f7979' }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Push Notifications */}
        {notifPerm !== 'unsupported' && (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>{t.pushTitle}</p>
            <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px 16px', marginBottom: 20 }}>

              {notifPerm === 'default' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 22 }}>🔔</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{t.enableNotif}</p>
                      <p style={{ fontSize: 12, color: '#6f7979', margin: '2px 0 0' }}>
                        {t.enableDesc}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={enableNotifications}
                    disabled={enablingNotif}
                    style={{ width: '100%', padding: '11px', background: enablingNotif ? 'rgba(0,0,0,0.08)' : '#006064', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: enablingNotif ? 'not-allowed' : 'pointer', fontFamily: FONT, marginBottom: pushResult ? 10 : 0 }}
                  >
                    {enablingNotif ? t.enabling : t.enableBtn}
                  </button>
                  {pushResult && (
                    <div style={{ background: pushResult.startsWith('✅') ? '#D8F3DC' : '#FEE2E2', borderRadius: 10, padding: '8px 12px' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: pushResult.startsWith('✅') ? '#2D6A4F' : '#991B1B', margin: 0 }}>{pushResult}</p>
                    </div>
                  )}
                  {!pushResult && !isPWA && (
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '8px 0 0', textAlign: 'center' }}>
                      {t.installTip}
                    </p>
                  )}
                </>
              )}

              {notifPerm === 'granted' && (
                <>
                  {subStatus === 'checking' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: '#F3F4F6', borderRadius: 10 }}>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>{t.registering}</span>
                    </div>
                  )}
                  {subStatus === 'registered' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: '#D8F3DC', borderRadius: 10 }}>
                      <span style={{ fontSize: 15 }}>✅</span>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#2D6A4F', margin: 0 }}>{t.registered}</p>
                    </div>
                  )}
                  {subStatus === 'failed' && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ marginBottom: 8, padding: '8px 12px', background: '#FEE2E2', borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: pushResult ? 4 : 0 }}>
                          <span style={{ fontSize: 15 }}>⚠️</span>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', margin: 0 }}>{t.notRegistered}</p>
                        </div>
                        {pushResult && (
                          <p style={{ fontSize: 11, color: '#991B1B', margin: '0 0 0 23px', lineHeight: 1.4 }}>{pushResult.replace('❌ ', '')}</p>
                        )}
                      </div>
                      <button
                        onClick={async () => { setPushResult(null); setSubStatus('checking'); const e = await subscribeAndSave(); setSubStatus(e ? 'failed' : 'registered'); if (e) setPushResult('❌ ' + e) }}
                        style={{ width: '100%', padding: '9px', background: '#006064', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, marginBottom: 8 }}
                      >
                        Retry registration
                      </button>
                    </div>
                  )}
                  <button
                    onClick={testPush}
                    disabled={testingPush || subStatus === 'checking'}
                    style={{ width: '100%', padding: '10px', background: (testingPush || subStatus === 'checking') ? 'rgba(0,0,0,0.08)' : '#006064', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, marginBottom: pushResult ? 10 : 0 }}
                  >
                    {testingPush ? t.testingPush : t.testPush}
                  </button>
                  {pushResult && (
                    <div style={{ background: pushResult.startsWith('✅') ? '#D8F3DC' : '#FEE2E2', borderRadius: 10, padding: '8px 12px' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: pushResult.startsWith('✅') ? '#2D6A4F' : '#991B1B', margin: 0 }}>{pushResult}</p>
                    </div>
                  )}
                </>
              )}

              {notifPerm === 'denied' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>🚫</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 3px' }}>Notifications blocked</p>
                    <p style={{ fontSize: 12, color: '#6f7979', margin: 0, lineHeight: 1.5 }}>
                      Open your browser or phone settings, find this site, and allow notifications. Then re-open the app.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* How to use */}
        <button
          onClick={() => {
            localStorage.removeItem('taxibook-onboarding-tour-v1')
            window.location.href = window.location.origin + (role === 'coordinator' ? '/coordinator/home' : role === 'driver' ? '/driver/home' : '/staff/home')
          }}
          style={{ width: '100%', padding: '13px', background: '#E0F2F1', color: '#006064', border: '1px solid rgba(0,96,100,0.15)', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {t.howToUse}
        </button>

        {/* Logout */}
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            style={{ width: '100%', padding: '13px', background: '#ffdad6', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
          >
            {t.signOut}
          </button>
        ) : (
          <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>{t.signOutConfirm}</p>
            <p style={{ fontSize: 13, color: '#6f7979', margin: '0 0 14px' }}>{t.signOutBody}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ padding: '11px', background: '#F5F5F2', color: '#006064', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                {t.cancel}
              </button>
              <button onClick={handleLogout} disabled={loggingOut}
                style={{ padding: '11px', background: '#991B1B', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                {loggingOut ? t.signingOut : t.yesSignOut}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}
