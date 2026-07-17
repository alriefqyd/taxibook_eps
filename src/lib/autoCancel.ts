// Set by the auto-complete cron (api/cron/auto-complete/route.ts) when a driver never
// starts an assigned trip within 15 minutes of its scheduled time. Shared so anywhere
// that needs to distinguish "driver-caused" cancellations from manual ones (analytics,
// driver scoring) stays in sync with the exact string the cron writes.
export const AUTO_CANCEL_REASON = 'Driver did not start trip within 15 minutes of the scheduled time'
