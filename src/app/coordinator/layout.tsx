'use client'
import { BottomNav } from '@/components/BottomNav'
import { usePushNotifications } from '@/hooks/usePushNotifications'
export default function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  usePushNotifications()
  return (
    <div style={{ minHeight: '100dvh', background: '#F5F5F2', paddingBottom: '72px' }}>
      {children}
      <BottomNav role="coordinator" />
    </div>
  )
}
