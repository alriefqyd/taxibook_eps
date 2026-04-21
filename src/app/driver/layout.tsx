'use client'

import { useEffect, useState } from 'react'
import { BottomNav } from '@/components/BottomNav'
import DriverTripAlert from '@/components/DriverTripAlert'
import { createClient } from '@/lib/supabase/client'

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [userId, setUserId] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: '#F4F3EF', paddingBottom: '72px' }}>
      {children}
      <BottomNav role="driver" />
      {/* Persistent trip alert — shows on ALL driver pages */}
      {userId && <DriverTripAlert userId={userId} />}
    </div>
  )
}
