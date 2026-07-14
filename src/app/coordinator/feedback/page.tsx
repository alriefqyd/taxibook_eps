'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import PageLoader from '@/components/PageLoader'
import { useLang } from '@/lib/language'
import { exportFeedbackExcel } from '@/lib/exportExcel'

const FONT = "var(--font-inter), 'Inter', sans-serif"

const MSG = {
  en: {
    title:       'Feedback',
    subtitle:    'What staff and drivers are telling us',
    all:         'All',
    categories: {
      general:    'General',
      suggestion: 'Suggestion',
      bug:        'Bug',
      complaint:  'Complaint',
    },
    empty:       'No feedback yet.',
    exportExcel: 'Export Excel',
    exporting:   'Exporting…',
    roleLabels: { staff: 'Staff', coordinator: 'Coordinator', driver: 'Driver' },
  },
  id: {
    title:       'Masukan',
    subtitle:    'Apa yang disampaikan staff dan driver',
    all:         'Semua',
    categories: {
      general:    'Umum',
      suggestion: 'Saran',
      bug:        'Bug',
      complaint:  'Keluhan',
    },
    empty:       'Belum ada masukan.',
    exportExcel: 'Export Excel',
    exporting:   'Mengekspor…',
    roleLabels: { staff: 'Staff', coordinator: 'Koordinator', driver: 'Driver' },
  },
}

type Category = 'general' | 'suggestion' | 'bug' | 'complaint'

interface FeedbackRow {
  id:         string
  category:   Category
  message:    string
  created_at: string
  users:      { name: string; role: 'staff' | 'coordinator' | 'driver' } | null
}

const CATEGORY_STYLE: Record<Category, { bg: string; color: string }> = {
  general:    { bg: '#E0F2F1', color: '#006064' },
  suggestion: { bg: '#D8F3DC', color: '#2D6A4F' },
  bug:        { bg: '#FEE2E2', color: '#991B1B' },
  complaint:  { bg: '#FEF3C7', color: '#92400E' },
}

export default function CoordinatorFeedbackPage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [loading,   setLoading]   = useState(true)
  const [rows,      setRows]      = useState<FeedbackRow[]>([])
  const [filter,    setFilter]    = useState<Category | 'all'>('all')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const au = session?.user
      if (!au) { router.push('/login'); return }

      const { data: p } = await supabase.from('users').select('role').eq('id', au.id).single()
      if (p?.role !== 'coordinator') { router.push('/login'); return }

      const { data } = await supabase
        .from('feedback')
        .select('id, category, message, created_at, users(name, role)')
        .order('created_at', { ascending: false })

      setRows((data as any) || [])
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageLoader />

  const categories: Category[] = ['general', 'suggestion', 'bug', 'complaint']
  const filtered = filter === 'all' ? rows : rows.filter(r => r.category === filter)
  const dateLocale = lang === 'id' ? idLocale : undefined

  function handleExport() {
    setExporting(true)
    try {
      exportFeedbackExcel(filtered.map(r => ({
        category:   t.categories[r.category],
        message:    r.message,
        created_at: r.created_at,
        user_name:  r.users?.name || '',
        user_role:  r.users?.role ? t.roleLabels[r.users.role] : '',
      })))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F5F5F2', WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ background: '#ffffff', padding: '20px 20px 16px', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: -8, marginTop: -2 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 2px', letterSpacing: '-0.2px' }}>{t.title}</h1>
            <p style={{ fontSize: 12, color: '#6f7979', margin: 0 }}>{t.subtitle}</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || filtered.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: exporting || filtered.length === 0 ? '#e5e7eb' : 'rgba(0,96,100,0.08)', border: '1px solid rgba(0,96,100,0.2)', borderRadius: 10, fontSize: 12, fontWeight: 700, color: exporting || filtered.length === 0 ? '#9ca3af' : '#006064', cursor: exporting || filtered.length === 0 ? 'not-allowed' : 'pointer', fontFamily: FONT, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {exporting ? t.exporting : t.exportExcel}
        </button>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>
        {/* Category filter pills */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 2 }}>
          {(['all', ...categories] as const).map(c => {
            const active = filter === c
            const label  = c === 'all' ? t.all : t.categories[c]
            return (
              <button
                key={c}
                onClick={() => setFilter(c)}
                style={{
                  flexShrink: 0, padding: '8px 14px', borderRadius: 9999, cursor: 'pointer', fontFamily: FONT,
                  fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                  border: active ? '1.5px solid #006064' : '1px solid rgba(0,0,0,0.08)',
                  background: active ? '#006064' : '#ffffff',
                  color: active ? '#ffffff' : '#6f7979',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '32px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{t.empty}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(row => {
              const style = CATEGORY_STYLE[row.category]
              return (
                <div key={row.id} style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.users?.name || '—'}
                      </p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
                        {row.users?.role ? t.roleLabels[row.users.role] : ''} · {format(new Date(row.created_at), 'd MMM yyyy, HH:mm', { locale: dateLocale })}
                      </p>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: style.bg, color: style.color }}>
                      {t.categories[row.category]}
                    </span>
                  </div>
                  <p style={{ fontSize: 13.5, color: '#334155', margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {row.message}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
