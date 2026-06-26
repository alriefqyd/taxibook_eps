import { NextRequest, NextResponse } from 'next/server'

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Driver accept/decline flow has been removed. Bookings are assigned directly.' },
    { status: 410 }
  )
}
