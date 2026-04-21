import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { STATUS_LABELS, STATUS_COLORS } from '@/types'
import type { BookingDetail } from '@/types'

interface BookingCardProps {
  booking: BookingDetail
  onClick?: () => void
  showPassenger?: boolean
  showDriver?: boolean
}

export function BookingCard({
  booking,
  onClick,
  showPassenger = true,
  showDriver    = true,
}: BookingCardProps) {
  const statusColor = STATUS_COLORS[booking.status]
  const time = format(new Date(booking.scheduled_at), 'HH:mm')
  const date = format(new Date(booking.scheduled_at), 'EEE, d MMM', { locale: id })

  return (
    <div
      className="trip-card"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Top row: name + status */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 mr-2">
          {showPassenger && (
            <p className="font-semibold text-sm text-stone-900 truncate">
              {booking.passenger_name}
            </p>
          )}
          <p className="text-xs text-stone-500 mt-0.5 truncate">
            {time} · {booking.pickup} → {booking.destination}
          </p>
        </div>
        <span
          className="badge flex-shrink-0 text-[10px]"
          style={{
            background: statusColor.bg,
            color:       statusColor.text,
          }}
        >
          {STATUS_LABELS[booking.status]}
        </span>
      </div>

      {/* Bottom row: type + taxi */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`badge ${
          booking.trip_type === 'DROP' ? 'badge-drop' : 'badge-wait'
        }`}>
          {booking.trip_type === 'DROP'
            ? 'Drop'
            : `Wait ${booking.wait_minutes}min`}
        </span>

        {showDriver && booking.taxi_name ? (
          <span className="flex items-center gap-1 text-xs text-stone-500">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: booking.taxi_color || '#888' }}
            />
            {booking.taxi_name}
            {booking.driver_name && ` · ${booking.driver_name}`}
          </span>
        ) : (
          <span className="text-xs text-stone-400">Unassigned</span>
        )}

        {booking.notes && (
          <span className="text-xs text-stone-400 italic truncate max-w-[120px]">
            {booking.notes}
          </span>
        )}
      </div>
    </div>
  )
}
