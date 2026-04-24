'use client'
import { useEffect, useState } from 'react'
import { BottomNav } from '@/components/BottomNav'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import DriverTripAlert from '@/components/DriverTripAlert'
import { createClient } from '@/lib/supabase/client'
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [userId, setUserId] = useState('')
  usePushNotifications()
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])
  return (
    <div style={{ minHeight: '100dvh', background: '#F5F5F2', paddingBottom: '72px' }}>
      {children}
      <BottomNav role="driver" />
      {userId && <DriverTripAlert userId={userId} />}
    </div>
  )
}
