import { NextResponse } from 'next/server';
import { syncNow } from '@/lib/gdoc';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Safety-net sync, called once a day by Vercel Cron (see vercel.json). The free plan can't schedule anything
// more often, so day-to-day syncing happens whenever someone has the board open (POST /api/sync?auto=1).
export async function GET() {
  const result = await syncNow({ auto: true });
  return NextResponse.json(result);
}
