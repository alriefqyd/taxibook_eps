import { STATUS_LABELS, STATUS_COLORS } from '@/types'
import type { BookingStatus } from '@/types'

interface StatusBadgeProps {
  status: BookingStatus
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const color = STATUS_COLORS[status]
  return (
    <span
      className={`badge ${size === 'sm' ? 'text-[9px] px-2 py-0.5' : ''}`}
      style={{ background: color.bg, color: color.text }}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

export function TripTypeBadge({
  type,
  waitMinutes = 0,
}: {
  type: 'DROP' | 'WAITING'
  waitMinutes?: number
}) {
  return (
    <span className={`badge ${type === 'DROP' ? 'badge-drop' : 'badge-wait'}`}>
      {type === 'DROP' ? 'Drop' : `Wait ${waitMinutes}min`}
    </span>
  )
}
