'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLang } from '@/lib/language'
import type { Lang } from '@/lib/language'

type Role = 'staff' | 'coordinator' | 'driver'

type TourStep = {
  title: string
  description: string
}

type BilingualTourStep = {
  title: { en: string; id: string }
  description: { en: string; id: string }
}

const TOUR_STORAGE_KEY = 'taxibook-onboarding-tour-v1'

const MSG = {
  en: {
    welcomeToRidr: 'Welcome to Ridr',
    close:         'Close',
    stepOf:        (a: number, b: number) => `Step ${a} of ${b}`,
    previous:      'Previous',
    next:          'Next',
    finishTour:    'Finish tour',
    maybeLater:    'Maybe later',
    installTitle:  'Install Ridr on your phone',
    installDesc:   'Open your browser menu and choose Add to Home screen to install Ridr as a phone app for the best experience.',
  },
  id: {
    welcomeToRidr: 'Selamat Datang di Ridr',
    close:         'Tutup',
    stepOf:        (a: number, b: number) => `Langkah ${a} dari ${b}`,
    previous:      'Sebelumnya',
    next:          'Selanjutnya',
    finishTour:    'Selesai',
    maybeLater:    'Nanti saja',
    installTitle:  'Instal Ridr di ponsel Anda',
    installDesc:   'Buka menu browser Anda dan pilih Tambahkan ke Layar Utama untuk menginstal Ridr sebagai aplikasi ponsel demi pengalaman terbaik.',
  },
}

const ROLE_STEPS: Record<Role, BilingualTourStep[]> = {
  coordinator: [
    {
      title: { en: 'Coordinator controls', id: 'Kontrol Koordinator' },
      description: {
        en: 'Approve bookings, manage saved locations, and review fleet status from your dashboard and menu.',
        id: 'Setujui pemesanan, kelola lokasi tersimpan, dan pantau status armada dari dasbor dan menu Anda.',
      },
    },
  ],
  driver: [
    {
      title: { en: 'Driver workflow', id: 'Alur Kerja Pengemudi' },
      description: {
        en: 'See upcoming trips, active trips, and your taxi availability from the home screen.',
        id: 'Lihat perjalanan mendatang, perjalanan aktif, dan ketersediaan taksi Anda dari layar utama.',
      },
    },
  ],
  staff: [
    {
      title: { en: 'Request a taxi', id: 'Memesan Taksi' },
      description: {
        en: 'Tap the yellow + New booking button on the home screen to create a booking. Fill in your pickup location, destination, date, and time.',
        id: 'Ketuk tombol kuning + Pesanan Baru di layar utama untuk membuat pemesanan. Isi lokasi jemput, tujuan, tanggal, dan waktu Anda.',
      },
    },
    {
      title: { en: 'Schedule & map view', id: 'Tampilan Jadwal & Peta' },
      description: {
        en: 'The calendar icon shows the fleet schedule for all taxis. Switch to the map icon to see driver locations in real time.',
        id: 'Ikon kalender menampilkan jadwal armada untuk semua taksi. Beralih ke ikon peta untuk melihat lokasi pengemudi secara real-time.',
      },
    },
    {
      title: { en: 'Track your bookings', id: 'Lacak Pemesanan Anda' },
      description: {
        en: 'My bookings below the schedule lists your active and recent trips. Tap any card to view full details or cancel the booking.',
        id: 'Pemesanan Saya di bawah jadwal menampilkan daftar perjalanan aktif dan terbaru Anda. Ketuk kartu mana pun untuk melihat detail lengkap atau membatalkan pemesanan.',
      },
    },
    {
      title: { en: 'Notifications & profile menu', id: 'Notifikasi & Menu Profil' },
      description: {
        en: 'The bell icon shows booking status updates and alerts. Tap your profile avatar at the top right to access trip history, settings, and sign out.',
        id: 'Ikon lonceng menampilkan pembaruan status pemesanan dan peringatan. Ketuk avatar profil Anda di kanan atas untuk mengakses riwayat perjalanan, pengaturan, dan keluar.',
      },
    },
  ],
}

function getRoleSteps(role: Role, lang: Lang): TourStep[] {
  const steps = ROLE_STEPS[role] ?? ROLE_STEPS.staff
  return steps.map(step => ({
    title: step.title[lang],
    description: step.description[lang],
  }))
}

export default function OnboardingTour({ role }: { role: Role }) {
  const lang = useLang()
  const t = MSG[lang]
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  const steps = useMemo<TourStep[]>(() => [
    {
      title: t.installTitle,
      description: t.installDesc,
    },
    ...getRoleSteps(role, lang),
  ], [role, lang, t.installTitle, t.installDesc])

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

  if (!open) return null

  return (
    <>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 'min(660px,100%)', background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#006064' }}>{t.welcomeToRidr}</p>
              <h2 style={{ margin: '10px 0 0', fontSize: 22, fontWeight: 800, color: '#102a43' }}>{steps[stepIndex].title}</h2>
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.7, color: '#334155' }}>{steps[stepIndex].description}</p>
            </div>
            <div style={{ padding: '16px 28px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{t.stepOf(stepIndex + 1, steps.length)}</span>
                <button onClick={() => handleClose(true)} style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>{t.close}</button>
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
                  {t.previous}
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
                  {stepIndex === steps.length - 1 ? t.finishTour : t.next}
                </button>
              </div>
              <button
                onClick={() => handleClose(false)}
                style={{ marginTop: 14, width: '100%', border: 'none', background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer' }}
              >
                {t.maybeLater}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
