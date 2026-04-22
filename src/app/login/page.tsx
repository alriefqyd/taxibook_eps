'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router                  = useRouter()
  const supabase                = createClient()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [debug, setDebug]       = useState('')

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
      background: '#F4F3EF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px',
            background: '#0F0F0F',
            borderRadius: '16px',
            margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24"
              fill="none" stroke="white" strokeWidth="2">
              <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
              <rect x="9" y="11" width="14" height="10" rx="2"/>
              <circle cx="16" cy="16" r="1" fill="white"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px' }}>
            TaxiBook
          </h1>
          <p style={{ fontSize: '13px', color: '#6B6963', margin: 0 }}>
            Book your taxi easily and quickly
          </p>
        </div>

        {/* Form */}
        <div style={{
          background: 'white',
          border: '1px solid #E0DED8',
          borderRadius: '16px',
          padding: '24px',
        }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: '700',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#A8A6A0', marginBottom: '6px',
              }}>
                Work email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: '14px',
                  border: '1.5px solid #E0DED8', borderRadius: '10px',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: '700',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#A8A6A0', marginBottom: '6px',
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: '14px',
                  border: '1.5px solid #E0DED8', borderRadius: '10px',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
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

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: loading ? '#888' : '#0F0F0F',
                color: 'white', border: 'none', borderRadius: '10px',
                fontSize: '14px', fontWeight: '700', cursor: 'pointer',
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: 'center', fontSize: '12px',
          color: '#A8A6A0', marginTop: '16px',
        }}>
          Role is assigned by your admin
        </p>
      </div>
    </div>
  )
}
