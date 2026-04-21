import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'
import type { NotificationType } from '@/types'

function initVapid() {
  const subject   = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey= process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey ||
      publicKey === 'your-vapid-public-key') {
    console.warn('VAPID keys not configured — push notifications disabled')
    return false
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    return true
  } catch (e) {
    console.warn('VAPID init failed:', e)
    return false
  }
}

interface SendNotificationParams {
  userIds: string[]
  title: string
  body: string
  type: NotificationType
  bookingId?: string
  url?: string
}

export async function sendNotification({
  userIds,
  title,
  body,
  type,
  bookingId,
  url = '/',
}: SendNotificationParams) {
  const supabase = createAdminClient()

  // Save to notifications table
  const notifications = userIds.map(userId => ({
    user_id:    userId,
    booking_id: bookingId || null,
    title,
    body,
    type,
  }))

  await supabase.from('notifications').insert(notifications)

  // Get push subscriptions for these users
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds)

  if (!subscriptions || subscriptions.length === 0) return

  // Only send push if VAPID is configured
  if (!initVapid()) return

  const payload = JSON.stringify({ title, body, url, type })

  // Send push to all subscriptions
  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  )

  // Clean up expired subscriptions
  const expired = subscriptions.filter(
    (_, i) =>
      results[i].status === 'rejected' &&
      (results[i] as PromiseRejectedResult).reason?.statusCode === 410
  )

  if (expired.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expired.map(s => s.endpoint))
  }
}

// ── Notification helpers per event ──────────────────────────

export async function notifyBookingSubmitted(
  bookingId: string,
  coordinatorIds: string[],
  passengerName: string,
  destination: string,
  needsApproval: boolean
) {
  await sendNotification({
    userIds: coordinatorIds,
    title: needsApproval ? 'Booking needs approval' : 'New booking submitted',
    body: needsApproval
      ? `${passengerName} → ${destination} (waiting >60 min)`
      : `${passengerName} → ${destination}`,
    type: needsApproval ? 'needs_approval' : 'booking_confirmed',
    bookingId,
    url: '/coordinator/home',
  })
}

export async function notifyBookingConfirmed(
  bookingId: string,
  passengerId: string,
  taxiName: string,
  driverName: string,
  destination: string
) {
  await sendNotification({
    userIds: [passengerId],
    title: 'Trip confirmed!',
    body: `Your trip to ${destination} is confirmed — ${taxiName} · ${driverName}`,
    type: 'booking_confirmed',
    bookingId,
    url: '/staff/home',
  })
}

export async function notifyBookingRejected(
  bookingId: string,
  passengerId: string,
  destination: string,
  reason?: string
) {
  await sendNotification({
    userIds: [passengerId],
    title: 'Trip request rejected',
    body: reason
      ? `Your trip to ${destination} was rejected: ${reason}`
      : `Your trip to ${destination} was rejected`,
    type: 'booking_rejected',
    bookingId,
    url: '/staff/home',
  })
}

export async function notifyDriverAssigned(
  bookingId: string,
  driverId: string,
  passengerName: string,
  destination: string,
  scheduledAt: string,
  isReassignment = false
) {
  const time = new Date(scheduledAt).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
  await sendNotification({
    userIds: [driverId],
    title: isReassignment ? 'Trip reassigned to you' : 'New trip assigned',
    body: `${passengerName} → ${destination} at ${time}`,
    type: isReassignment ? 'driver_reassigned' : 'driver_assigned',
    bookingId,
    url: '/driver/home',
  })
}

export async function notifyDriverReassigned(
  bookingId: string,
  oldDriverId: string,
  passengerId: string,
  newTaxiName: string,
  newDriverName: string,
  destination: string
) {
  // Notify old driver — removed from trip
  await sendNotification({
    userIds: [oldDriverId],
    title: 'Trip reassigned by coordinator',
    body: `Your trip to ${destination} has been reassigned. You are now available.`,
    type: 'driver_reassigned',
    bookingId,
    url: '/driver/home',
  })

  // Notify passenger — driver changed
  await sendNotification({
    userIds: [passengerId],
    title: 'Driver updated',
    body: `Your trip driver has been updated — ${newTaxiName} · ${newDriverName}`,
    type: 'booking_reassigned',
    bookingId,
    url: '/staff/home',
  })
}

export async function notifyDriverDeclined(
  bookingId: string,
  coordinatorIds: string[],
  driverName: string,
  destination: string
) {
  await sendNotification({
    userIds: coordinatorIds,
    title: 'Driver declined a trip',
    body: `${driverName} declined trip to ${destination}. Please reassign.`,
    type: 'driver_declined',
    bookingId,
    url: '/coordinator/home',
  })
}

export async function notifyTripCompleted(
  bookingId: string,
  passengerId: string,
  destination: string,
  isAutoComplete = false
) {
  await sendNotification({
    userIds: [passengerId],
    title: 'Trip completed',
    body: isAutoComplete
      ? `Your trip to ${destination} has been auto-completed`
      : `Your trip to ${destination} is complete`,
    type: isAutoComplete ? 'auto_completed' : 'trip_completed',
    bookingId,
    url: '/staff/home',
  })
}
