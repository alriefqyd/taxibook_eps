import * as XLSX from 'xlsx'
import { differenceInMinutes, format } from 'date-fns'

export interface ExportRow {
  id: string
  booking_code: string
  scheduled_at: string
  completed_at: string | null
  auto_complete_at: string | null
  passenger_name: string
  passenger_phone: string | null
  driver_name: string | null
  driver_phone: string | null
  taxi_name: string | null
  taxi_plate: string | null
  taxi_color: string | null
  taxi_id: string | null
  pickup: string
  destination: string
  trip_type: 'DROP' | 'WAITING'
  wait_minutes: number | null
  status: string
  notes: string | null
  rejection_reason: string | null
  created_at: string
}

function fmt(iso: string | null) {
  if (!iso) return ''
  return format(new Date(iso), 'yyyy-MM-dd HH:mm')
}

function pct(num: number, den: number) {
  if (den === 0) return '0%'
  return Math.round((num / den) * 100) + '%'
}

export function exportBookingsExcel(rows: ExportRow[], dateFrom: string, dateTo: string) {
  const wb = XLSX.utils.book_new()

  // ── 1. Summary ─────────────────────────────────────────────────────────────
  const total     = rows.length
  const completed = rows.filter(r => r.status === 'completed').length
  const cancelled = rows.filter(r => r.status === 'cancelled').length
  const rejected  = rows.filter(r => r.status === 'rejected').length
  const active    = rows.filter(r => ['booked','on_trip','waiting_trip','submitted','pending_coordinator_approval'].includes(r.status)).length

  const doneRows = rows.filter(r => r.status === 'completed' && r.completed_at)
  const avgMin   = doneRows.length > 0
    ? Math.round(doneRows.reduce((s, r) => s + differenceInMinutes(new Date(r.completed_at!), new Date(r.scheduled_at)), 0) / doneRows.length)
    : 0

  const passByCount = countBy(rows, r => r.passenger_name)
  const topPassenger = topEntry(passByCount)

  const driverByCount = countBy(rows.filter(r => r.driver_name), r => r.driver_name!)
  const topDriver = topEntry(driverByCount)

  const summaryData = [
    ['TaxiBook — Booking Report Export'],
    ['Date Range', `${dateFrom}  →  ${dateTo}`],
    ['Generated at', fmt(new Date().toISOString())],
    [],
    ['Metric', 'Value'],
    ['Total Bookings',        total],
    ['Completed',             completed],
    ['Cancelled',             cancelled],
    ['Rejected',              rejected],
    ['Active / Pending',      active],
    ['Completion Rate',       pct(completed, total)],
    ['Avg. Trip Duration (min)', avgMin],
    ['Most Active Passenger', topPassenger],
    ['Top Driver',            topDriver],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 28 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // ── 2. All Bookings ─────────────────────────────────────────────────────────
  const allHeaders = [
    'No.', 'Booking Code', 'Status', 'Scheduled Date', 'Scheduled Time',
    'Created At', 'Completed At', 'Duration (min)',
    'Passenger', 'Passenger Phone',
    'Driver', 'Driver Phone', 'Taxi', 'Plate',
    'Pickup', 'Destination', 'Trip Type', 'Wait (min)',
    'Notes', 'Rejection Reason',
  ]
  const allData = rows.map((r, i) => {
    const dMin = r.completed_at
      ? differenceInMinutes(new Date(r.completed_at), new Date(r.scheduled_at))
      : ''
    const sched = new Date(r.scheduled_at)
    return [
      i + 1,
      r.booking_code,
      r.status,
      format(sched, 'yyyy-MM-dd'),
      format(sched, 'HH:mm'),
      fmt(r.created_at),
      fmt(r.completed_at),
      dMin,
      r.passenger_name,
      r.passenger_phone ?? '',
      r.driver_name ?? '',
      r.driver_phone ?? '',
      r.taxi_name ?? '',
      r.taxi_plate ?? '',
      r.pickup,
      r.destination,
      r.trip_type,
      r.wait_minutes ?? '',
      r.notes ?? '',
      r.rejection_reason ?? '',
    ]
  })
  const wsAll = XLSX.utils.aoa_to_sheet([allHeaders, ...allData])
  wsAll['!cols'] = [4, 14, 14, 14, 13, 16, 16, 13, 22, 15, 22, 15, 14, 10, 26, 26, 10, 10, 28, 28].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsAll, 'All Bookings')

  // ── 3. Top Passengers ──────────────────────────────────────────────────────
  const passMap: Record<string, { phone: string; total: number; completed: number; cancelled: number; rejected: number; active: number }> = {}
  rows.forEach(r => {
    if (!passMap[r.passenger_name]) {
      passMap[r.passenger_name] = { phone: r.passenger_phone ?? '', total: 0, completed: 0, cancelled: 0, rejected: 0, active: 0 }
    }
    const p = passMap[r.passenger_name]
    p.total++
    if (r.status === 'completed')  p.completed++
    else if (r.status === 'cancelled') p.cancelled++
    else if (r.status === 'rejected')  p.rejected++
    else p.active++
  })
  const passRows = Object.entries(passMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, d], i) => [
      i + 1, name, d.phone, d.total, d.completed, d.cancelled, d.rejected, d.active, pct(d.completed, d.total),
    ])
  const wsPass = XLSX.utils.aoa_to_sheet([
    ['Rank', 'Passenger', 'Phone', 'Total Bookings', 'Completed', 'Cancelled', 'Rejected', 'Active/Pending', 'Completion Rate'],
    ...passRows,
  ])
  wsPass['!cols'] = [6, 26, 16, 14, 11, 11, 10, 14, 14].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsPass, 'Top Passengers')

  // ── 4. Top Drivers ─────────────────────────────────────────────────────────
  const driverMap: Record<string, { phone: string; taxi: string; total: number; completed: number; onTrip: number; cancelRej: number }> = {}
  rows.filter(r => r.driver_name).forEach(r => {
    const key = r.driver_name!
    if (!driverMap[key]) {
      driverMap[key] = { phone: r.driver_phone ?? '', taxi: r.taxi_name ?? '', total: 0, completed: 0, onTrip: 0, cancelRej: 0 }
    }
    const d = driverMap[key]
    d.total++
    if (r.status === 'completed')  d.completed++
    else if (['on_trip','waiting_trip'].includes(r.status)) d.onTrip++
    else if (['cancelled','rejected'].includes(r.status))  d.cancelRej++
  })
  const driverRows = Object.entries(driverMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, d], i) => [
      i + 1, name, d.phone, d.taxi, d.total, d.completed, d.onTrip, d.cancelRej, pct(d.completed, d.total),
    ])
  const wsDriver = XLSX.utils.aoa_to_sheet([
    ['Rank', 'Driver', 'Phone', 'Taxi', 'Total Trips', 'Completed', 'On Trip', 'Cancelled/Rejected', 'Completion Rate'],
    ...driverRows,
  ])
  wsDriver['!cols'] = [6, 26, 16, 16, 12, 11, 10, 18, 14].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsDriver, 'Top Drivers')

  // ── 5. Most Cancellations ──────────────────────────────────────────────────
  const cancelMap: Record<string, { total: number; cancelled: number; rejected: number }> = {}
  rows.forEach(r => {
    if (!cancelMap[r.passenger_name]) cancelMap[r.passenger_name] = { total: 0, cancelled: 0, rejected: 0 }
    cancelMap[r.passenger_name].total++
    if (r.status === 'cancelled') cancelMap[r.passenger_name].cancelled++
    if (r.status === 'rejected')  cancelMap[r.passenger_name].rejected++
  })
  const cancelRows = Object.entries(cancelMap)
    .map(([name, d]) => ({ name, ...d, sum: d.cancelled + d.rejected }))
    .filter(d => d.sum > 0)
    .sort((a, b) => b.sum - a.sum)
    .map((d, i) => [
      i + 1, d.name, d.cancelled, d.rejected, d.sum, pct(d.sum, d.total), d.total,
    ])
  const wsCancel = XLSX.utils.aoa_to_sheet([
    ['Rank', 'Passenger', 'Cancelled', 'Rejected', 'Total Cancel/Reject', '% of Their Bookings', 'Total Bookings'],
    ...cancelRows,
  ])
  wsCancel['!cols'] = [6, 26, 11, 10, 20, 20, 15].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsCancel, 'Most Cancellations')

  // ── 6. Popular Routes ──────────────────────────────────────────────────────
  const routeMap: Record<string, { total: number; drop: number; waiting: number }> = {}
  rows.forEach(r => {
    const key = `${r.pickup}|||${r.destination}`
    if (!routeMap[key]) routeMap[key] = { total: 0, drop: 0, waiting: 0 }
    routeMap[key].total++
    if (r.trip_type === 'DROP') routeMap[key].drop++
    else routeMap[key].waiting++
  })
  const routeRows = Object.entries(routeMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([key, d], i) => {
      const [pickup, destination] = key.split('|||')
      return [i + 1, pickup, destination, d.total, d.drop, d.waiting]
    })
  const wsRoute = XLSX.utils.aoa_to_sheet([
    ['Rank', 'Pickup', 'Destination', 'Total Trips', 'Drop Count', 'Waiting Count'],
    ...routeRows,
  ])
  wsRoute['!cols'] = [6, 30, 30, 12, 12, 14].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsRoute, 'Popular Routes')

  // ── 7. Monthly Trend ───────────────────────────────────────────────────────
  const monthMap: Record<string, { total: number; completed: number; cancelled: number; rejected: number }> = {}
  rows.forEach(r => {
    const mo = format(new Date(r.scheduled_at), 'yyyy-MM')
    if (!monthMap[mo]) monthMap[mo] = { total: 0, completed: 0, cancelled: 0, rejected: 0 }
    monthMap[mo].total++
    if (r.status === 'completed')  monthMap[mo].completed++
    if (r.status === 'cancelled') monthMap[mo].cancelled++
    if (r.status === 'rejected')  monthMap[mo].rejected++
  })
  const monthRows = Object.entries(monthMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mo, d]) => [
      mo, d.total, d.completed, d.cancelled, d.rejected, pct(d.completed, d.total),
    ])
  const wsMonth = XLSX.utils.aoa_to_sheet([
    ['Month', 'Total', 'Completed', 'Cancelled', 'Rejected', 'Completion Rate'],
    ...monthRows,
  ])
  wsMonth['!cols'] = [12, 8, 11, 11, 10, 15].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsMonth, 'Monthly Trend')

  // ── Download ────────────────────────────────────────────────────────────────
  const filename = `taxibook-report_${dateFrom}_${dateTo}.xlsx`
  XLSX.writeFile(wb, filename)
}

function countBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, number> {
  const map: Record<string, number> = {}
  arr.forEach(item => {
    const k = keyFn(item)
    map[k] = (map[k] ?? 0) + 1
  })
  return map
}

function topEntry(map: Record<string, number>): string {
  const entries = Object.entries(map)
  if (!entries.length) return '—'
  entries.sort((a, b) => b[1] - a[1])
  return `${entries[0][0]} (${entries[0][1]})`
}
