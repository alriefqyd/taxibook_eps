import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Inter } from 'next/font/google'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title:       'TaxiBook',
  description: 'Company fleet booking system — PT Vale Indonesia',
  manifest:    '/manifest.json',
}

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor:   '#006064',
}

import AuthProvider from '@/components/AuthProvider'
import AppInitializer from '@/components/AppInitializer'
import NavigationLoader from '@/components/NavigationLoader'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${inter.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="TaxiBook EPS" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
      </head>
      <body style={{ fontFamily: "var(--font-inter), sans-serif", background: '#F5F5F2', margin: 0, padding: 0 }}>
        <AuthProvider>
          <AppInitializer />
          <NavigationLoader />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
