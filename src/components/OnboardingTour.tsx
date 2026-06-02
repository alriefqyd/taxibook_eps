'use client'

import { useEffect, useMemo, useState } from 'react'

type Role = 'staff' | 'coordinator' | 'driver'

type TourStep = {
  title: string
  description: string
}

const TOUR_STORAGE_KEY = 'taxibook-onboarding-tour-v1'

function getRoleStep(role: Role): TourStep {
  if (role === 'coordinator') {
    return {
      title: 'Coordinator controls',
      description: 'Approve bookings, manage saved locations, and review fleet status from your dashboard and menu.',
    }
  }
  if (role === 'driver') {
    return {
      title: 'Driver workflow',
      description: 'See upcoming trips, active trips, and your taxi availability from the home screen.',
    }
  }
  return {
    title: 'Staff workflow',
    description: 'View your active trips, request new bookings, and see today’s fleet activity from one screen.',
  }
}

export default function OnboardingTour({ role }: { role: Role }) {
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  const steps = useMemo<TourStep[]>(() => [
    {
      title: 'Install TaxiBook on your phone',
      description: 'Open your browser menu and choose Add to Home screen to install TaxiBook as a phone app.',
    },
    {
      title: 'Open the app from your home screen',
      description: 'Launch TaxiBook from your phone and sign in. The app works like a native mobile experience.',
    },
    {
      title: 'Use the top menu',
      description: 'Tap the notification bell and profile menu to access alerts, saved locations, and account settings.',
    },
    getRoleStep(role),
  ], [role])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const seen = window.localStorage.getItem(TOUR_STORAGE_KEY)
    if (!seen) {
      setOpen(true)
    }
  }, [])

  const handleClose = (remember = true) => {
    if (remember && typeof window !== 'undefined') {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'true')
    }
    setOpen(false)
    setStepIndex(0)
  }

  const prev = () => setStepIndex(i => Math.max(0, i - 1))
  const next = () => setStepIndex(i => Math.min(steps.length - 1, i + 1))

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 9999,
          background: '#006064',
          color: '#ffffff',
          border: 'none',
          boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>?</span>
        Tour
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 'min(660px,100%)', background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#006064' }}>Welcome to TaxiBook</p>
              <h2 style={{ margin: '10px 0 0', fontSize: 22, fontWeight: 800, color: '#102a43' }}>{steps[stepIndex].title}</h2>
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.7, color: '#334155' }}>{steps[stepIndex].description}</p>
            </div>
            <div style={{ padding: '16px 28px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Step {stepIndex + 1} of {steps.length}</span>
                <button onClick={() => handleClose(true)} style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>Close</button>
              </div>
              <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
                {steps.map((step, idx) => (
                  <div key={step.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', opacity: stepIndex === idx ? 1 : 0.5 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9999, background: stepIndex === idx ? '#006064' : '#e2e8f0', color: stepIndex === idx ? '#fff' : '#94a3b8', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{idx + 1}</div>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: stepIndex === idx ? '#0f172a' : '#475569' }}>{step.title}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <button
                  onClick={prev}
                  disabled={stepIndex === 0}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: stepIndex === 0 ? '#f8fafc' : '#ffffff',
                    color: stepIndex === 0 ? '#94a3b8' : '#0f172a',
                    cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={stepIndex === steps.length - 1 ? () => handleClose(true) : next}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#006064',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {stepIndex === steps.length - 1 ? 'Finish tour' : 'Next'}
                </button>
              </div>
              <button
                onClick={() => handleClose(false)}
                style={{ marginTop: 14, width: '100%', border: 'none', background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer' }}
              >
                Maybe later — don’t show again
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
