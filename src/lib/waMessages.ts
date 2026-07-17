export function toWaNumber(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

export function gpsStaleWaMsg(params: {
  driverName: string | null; taxiName: string; plate: string | null; sinceText: string
}): string {
  const { driverName, taxiName, plate, sinceText } = params
  return [
    `Halo${driverName ? ` ${driverName}` : ''} 👋`,
    ``,
    `Lokasi GPS taksi *${taxiName}${plate ? ` (${plate})` : ''}* belum update sejak *${sinceText}*.`,
    `Mohon cek koneksi GPS/internet di HP Anda ya. Terima kasih! 🙏`,
  ].join('\n')
}

export function overdueWaMsg(params: {
  driverName: string | null; passengerName: string; destination: string; bookingCode: string; lateMin: number
}): string {
  const { driverName, passengerName, destination, bookingCode, lateMin } = params
  return [
    `Halo${driverName ? ` ${driverName}` : ''} 👋`,
    ``,
    `Trip untuk *${passengerName}* ke *${destination}* sudah terlambat *${lateMin} menit* dari jadwal (booking ${bookingCode}).`,
    `Mohon segera mulai perjalanannya ya. Terima kasih! 🙏`,
  ].join('\n')
}

export function pendingWaMsg(params: {
  passengerName: string; destination: string; scheduledAtText: string; waitMinutes: number
}): string {
  const { passengerName, destination, scheduledAtText, waitMinutes } = params
  return [
    `Halo *${passengerName}* 👋`,
    ``,
    `Booking Anda ke *${destination}* pada *${scheduledAtText}* (menunggu ${waitMinutes} menit) sedang kami tinjau untuk persetujuan karena durasi tunggunya lebih dari 1 jam.`,
    `Mohon ditunggu ya, kami akan segera konfirmasi. Terima kasih! 🙏`,
  ].join('\n')
}

export function offlineUpcomingWaMsg(params: {
  driverName: string | null; passengerName: string; destination: string; bookingCode: string; timeText: string
}): string {
  const { driverName, passengerName, destination, bookingCode, timeText } = params
  return [
    `Halo${driverName ? ` ${driverName}` : ''} 👋`,
    ``,
    `Anda terlihat *offline*, padahal ada trip untuk *${passengerName}* ke *${destination}* pukul *${timeText}* (booking ${bookingCode}).`,
    `Mohon segera online di aplikasi ya. Terima kasih! 🙏`,
  ].join('\n')
}
