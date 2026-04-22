'use client'
import { BottomNav } from '@/components/BottomNav'
import { usePushNotifications } from '@/hooks/usePushNotifications'
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  usePushNotifications()
  return (
    <div style={{ minHeight: '100dvh', background: '#F4F3EF', paddingBottom: '72px' }}>
      {children}
      <BottomNav role="staff" />
    </div>
  )
}
