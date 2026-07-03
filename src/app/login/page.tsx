'use client'

import { useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import { useLang } from '@/lib/language'

const MSG = {
  en: {
    emailLabel:  'Work email',
    pwdLabel:    'Password',
    signingIn:   'Signing in...',
    signIn:      'Sign in',
    roleNote:    'Role is assigned by your admin',
  },
  id: {
    emailLabel:  'Email kerja',
    pwdLabel:    'Password',
    signingIn:   'Masuk...',
    signIn:      'Masuk',
    roleNote:    'Peran Anda ditentukan oleh admin',
  },
}

export default function LoginPage() {
  const lang                    = useLang()
  const t                       = MSG[lang]
  const router                  = useRouter()
  const supabase                = createClient()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [debug, setDebug]       = useState('')
  const [showPwd, setShowPwd]   = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setDebug('Attempting login...')

    try {
      // Step 1: Sign in
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        setError('Auth error: ' + authError.message)
        setDebug('Failed at auth step')
        setLoading(false)
        return
      }

      setDebug('Auth OK — user: ' + authData.user?.id?.slice(0, 8) + '...')

      // Step 2: Get profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', authData.user.id)
        .single()

      if (profileError) {
        setError('Profile error: ' + profileError.message)
        setDebug('Auth OK but profile not found. Did you insert into public.users?')
        setLoading(false)
        return
      }

      setDebug('Profile OK — role: ' + profile.role + ' · redirecting...')

      // Step 3: Redirect
      const homeMap: Record<string, string> = {
        staff:       '/staff/home',
        coordinator: '/coordinator/home',
        driver:      '/driver/home',
      }

      const destination = homeMap[profile.role] || '/staff/home'
      setDebug('Redirecting to: ' + destination)

      // Use window.location for reliable redirect
      window.location.href = destination

    } catch (err: any) {
      setError('Unexpected error: ' + err.message)
      setDebug('Check browser console for details')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F5F2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "var(--font-inter), 'Inter', sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/vale-logo.svg" alt="PT Vale" style={{ height: '48px', margin: '0 auto 14px', display: 'block' }} />
          <h1 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: '#006064' }}>
            TaxiBook EPS
          </h1>
        </div>

        {/* Form */}
        <div style={{
          background: 'white',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: '16px',
          padding: '24px',
        }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: '700',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#9ca3af', marginBottom: '6px',
              }}>
                {t.emailLabel}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: '14px',
                  border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: '10px',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: '700',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#9ca3af', marginBottom: '6px',
              }}>
                {t.pwdLabel}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%', padding: '10px 40px 10px 14px', fontSize: '14px',
                    border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: '10px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px', color: '#9ca3af', display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPwd ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div style={{
                background: '#FEE2E2', border: '1px solid #FCA5A5',
                borderRadius: '8px', padding: '10px 12px',
                fontSize: '12px', color: '#991B1B', marginBottom: '14px',
              }}>
                {error}
              </div>
            )}

            {/* Debug info */}
            {debug && (
              <div style={{
                background: '#F0F9FF', border: '1px solid #BAE6FD',
                borderRadius: '8px', padding: '10px 12px',
                fontSize: '11px', color: '#0369A1', marginBottom: '14px',
                fontFamily: 'monospace',
              }}>
                {debug}
              </div>
            )}

            <style>{`@keyframes btn-spin { to { transform: rotate(360deg) } }`}</style>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: loading ? '#888' : '#006064',
                color: 'white', border: 'none', borderRadius: '10px',
                fontSize: '14px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading && (
                <span style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', display: 'inline-block', animation: 'btn-spin 0.7s linear infinite', flexShrink: 0 }} />
              )}
              {loading ? t.signingIn : t.signIn}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: 'center', fontSize: '12px',
          color: '#9ca3af', marginTop: '16px',
        }}>
          {t.roleNote}
        </p>
      </div>
    </div>
  )
}
