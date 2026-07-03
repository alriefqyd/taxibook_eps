import { useState, useEffect } from 'react'

export type Lang = 'en' | 'id'
const KEY = 'taxibook_lang'
const EV  = 'taxibook_lang'

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  return (localStorage.getItem(KEY) as Lang) || 'en'
}

export function setLang(lang: Lang) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, lang)
  window.dispatchEvent(new Event(EV))
}

export function useLang(): Lang {
  const [lang, setL] = useState<Lang>('en')
  useEffect(() => {
    setL(getLang())
    const h = () => setL(getLang())
    window.addEventListener(EV, h)
    return () => window.removeEventListener(EV, h)
  }, [])
  return lang
}
