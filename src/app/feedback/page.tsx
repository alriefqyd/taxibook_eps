'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageLoader from '@/components/PageLoader'
import { useLang } from '@/lib/language'

const FONT = "var(--font-inter), 'Inter', sans-serif"

const MSG = {
  en: {
    title:       'Feedback',
    subtitle:    "Tell us what's working, what's not, or what you'd like to see.",
    category:    'Category',
    categories: {
      general:    'General',
      suggestion: 'Suggestion',
      bug:        'Report a bug',
      complaint:  'Complaint',
    },
    message:     'Your feedback',
    placeholder: 'Type your feedback here…',
    submit:      'Send feedback',
    sending:     'Sending…',
    required:    'Please write your feedback before sending.',
    failed:      'Failed to send: ',
    thanksTitle: 'Thanks for your feedback!',
    thanksBody:  "We've received your message and will use it to improve Ridr.",
    sendAnother: 'Send another',
    back:        'Back',
  },
  id: {
    title:       'Masukan',
    subtitle:    'Beri tahu kami apa yang sudah baik, kurang, atau yang ingin Anda lihat.',
    category:    'Kategori',
    categories: {
      general:    'Umum',
      suggestion: 'Saran',
      bug:        'Laporkan bug',
      complaint:  'Keluhan',
    },
    message:     'Masukan Anda',
    placeholder: 'Tulis masukan Anda di sini…',
    submit:      'Kirim masukan',
    sending:     'Mengirim…',
    required:    'Silakan tulis masukan Anda sebelum mengirim.',
    failed:      'Gagal mengirim: ',
    thanksTitle: 'Terima kasih atas masukan Anda!',
    thanksBody:  'Kami telah menerima pesan Anda dan akan menggunakannya untuk meningkatkan Ridr.',
    sendAnother: 'Kirim lagi',
    back:        'Kembali',
  },
}

type Category = 'general' | 'suggestion' | 'bug' | 'complaint'

export default function FeedbackPage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [loading,  setLoading]  = useState(true)
  const [category, setCategory] = useState<Category>('general')
  const [message,  setMessage]  = useState('')
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [sent,     setSent]     = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setError(null)
    if (!message.trim()) { setError(t.required); return }

    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { error: insertError } = await supabase.from('feedback').insert({
      user_id:  session.user.id,
      category,
      message:  message.trim(),
    })
    setSending(false)

    if (insertError) {
      setError(t.failed + insertError.message)
    } else {
      setSent(true)
    }
  }

  if (loading) return <PageLoader />

  const categories: Category[] = ['general', 'suggestion', 'bug', 'complaint']

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F5F5F2', WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ background: '#ffffff', padding: '20px 20px 24px', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: '50%', background: '#F5F5F2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#006064" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-0.2px' }}>{t.title}</h1>
          <p style={{ fontSize: 12, color: '#6f7979', margin: '2px 0 0' }}>{t.subtitle}</p>
        </div>
      </div>

      <div style={{ padding: '20px 16px 100px' }}>
        {sent ? (
          <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🙏</div>
            <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>{t.thanksTitle}</p>
            <p style={{ fontSize: 13, color: '#6f7979', margin: '0 0 20px', lineHeight: 1.5 }}>{t.thanksBody}</p>
            <button
              onClick={() => { setSent(false); setMessage(''); setCategory('general') }}
              style={{ width: '100%', padding: '13px', background: '#006064', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
            >
              {t.sendAnother}
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>{t.category}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 20 }}>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{
                    padding: '12px 10px', borderRadius: 14, cursor: 'pointer', fontFamily: FONT,
                    fontSize: 13, fontWeight: 700, textAlign: 'center',
                    border: category === c ? '1.5px solid #006064' : '1px solid rgba(0,0,0,0.08)',
                    background: category === c ? 'rgba(0,96,100,0.08)' : '#ffffff',
                    color: category === c ? '#006064' : '#6f7979',
                  }}
                >
                  {t.categories[c]}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px' }}>{t.message}</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t.placeholder}
              rows={7}
              style={{ width: '100%', padding: '14px', fontSize: 14, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 16, outline: 'none', fontFamily: FONT, boxSizing: 'border-box', resize: 'vertical', marginBottom: 12, background: '#ffffff' }}
            />

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 12, background: '#FEE2E2' }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: '#991B1B' }}>{error}</p>
              </div>
            )}

            <button
              onClick={submit}
              disabled={sending}
              style={{ width: '100%', padding: '14px', background: sending ? '#9ca3af' : '#006064', color: '#fff', border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', fontFamily: FONT }}
            >
              {sending ? t.sending : t.submit}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
