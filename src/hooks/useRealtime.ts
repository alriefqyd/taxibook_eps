'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BookingDetail } from '@/types'

export function useRealtimeBookings(initialBookings: BookingDetail[]) {
  const [bookings, setBookings] = useState<BookingDetail[]>(initialBookings)
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('bookings-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch full detail for new booking
            const { data } = await supabase
              .from('booking_details')
              .select('*')
              .eq('id', payload.new.id)
              .single()
            if (data) setBookings(prev => [data, ...prev])
          }

          if (payload.eventType === 'UPDATE') {
            // Fetch updated detail
            const { data } = await supabase
              .from('booking_details')
              .select('*')
              .eq('id', payload.new.id)
              .single()
            if (data) {
              setBookings(prev =>
                prev.map(b => b.id === data.id ? data : b)
              )
            }
          }

          if (payload.eventType === 'DELETE') {
            setBookings(prev => prev.filter(b => b.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  return bookings
}

export function useRealtimeNotifications(userId: string) {
  const [unreadCount, setUnreadCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    // Get initial unread count
    supabase
      .from('notifications')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_read', false)
      .then(({ count }) => setUnreadCount(count || 0))

    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => setUnreadCount(prev => prev + 1)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase])

  return { unreadCount }
}
