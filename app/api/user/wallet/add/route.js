import { NextResponse } from 'next/server';

/**
 * Direct unverified wallet top-up is disabled now that automated UPI
 * payment verification (FamGateway) is active.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Direct instant top-up is disabled. Please complete a verified UPI payment via /api/user/wallet/famgateway/create.',
    },
    { status: 410 }
  );
}
