import { BottomNav } from '@/components/BottomNav'

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100dvh', background: '#F4F3EF', paddingBottom: '72px' }}>
      {children}
      <BottomNav role="staff" />
    </div>
  )
}
