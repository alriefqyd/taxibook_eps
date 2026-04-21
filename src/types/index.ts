// ============================================================
// TaxiBook — TypeScript Types
// ============================================================

export type Role = 'staff' | 'coordinator' | 'driver'
export type TripType = 'DROP' | 'WAITING'
export type BookingStatus =
  | 'submitted'
  | 'pending_coordinator_approval'
  | 'pending_driver_approval'
  | 'booked'
  | 'on_trip'
  | 'waiting_trip'
  | 'completed'
  | 'rejected'
  | 'cancelled'

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'booking_reassigned'
  | 'driver_assigned'
  | 'driver_declined'
  | 'trip_completed'
  | 'needs_approval'
  | 'driver_reassigned'
  | 'auto_completed'
  | 'reminder_15min'
  | 'reminder_start'
  | 'reminder_overdue'

export type TaxiAvailability = 'available' | 'on_trip'

// ── Database row types ──────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
  role: Role
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Taxi {
  id: string
  name: string
  plate: string | null
  driver_id: string | null
  color: string
  is_active: boolean
  created_at: string
}

export interface Booking {
  id: string
  booking_code: string
  passenger_id: string
  pickup: string
  destination: string
  trip_type: TripType
  wait_minutes: number
  notes: string | null
  scheduled_at: string
  taxi_id: string | null
  status: BookingStatus
  rejection_reason: string | null
  auto_complete_at: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface BookingDetail extends Booking {
  passenger_name: string
  passenger_email: string
  passenger_phone: string | null
  taxi_name: string | null
  taxi_plate: string | null
  taxi_color: string | null
  driver_name: string | null
  driver_phone: string | null
}

export interface TaxiWithAvailability extends Taxi {
  driver_name: string | null
  driver_phone: string | null
  active_booking_id: string | null
  active_destination: string | null
  active_status: BookingStatus | null
  availability: TaxiAvailability
}

export interface Notification {
  id: string
  user_id: string
  booking_id: string | null
  title: string
  body: string
  type: NotificationType
  is_read: boolean
  sent_at: string
}

export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

// ── Status display helpers ──────────────────────────────────

export const STATUS_LABELS: Record<BookingStatus, string> = {
  submitted:                      'Submitted',
  pending_coordinator_approval:   'Needs approval',
  pending_driver_approval:        'Awaiting driver',
  booked:                         'Booked',
  on_trip:                        'On trip',
  waiting_trip:                   'Waiting',
  completed:                      'Completed',
  rejected:                       'Rejected',
  cancelled:                      'Cancelled',
}

export const STATUS_COLORS: Record<BookingStatus, {
  bg: string; text: string; border: string
}> = {
  submitted:                      { bg: '#DBEAFE', text: '#1E3A5F', border: '#93C5FD' },
  pending_coordinator_approval:   { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  pending_driver_approval:        { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  booked:                         { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  on_trip:                        { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  waiting_trip:                   { bg: '#EDE9FE', text: '#4C1D95', border: '#C4B5FD' },
  completed:                      { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
  rejected:                       { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  cancelled:                      { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
}

export const TAXI_COLORS: Record<string, string> = {
  't1': '#2563EB',
  't2': '#059669',
  't3': '#DB2777',
  't4': '#D97706',
  't5': '#7C3AED',
}
