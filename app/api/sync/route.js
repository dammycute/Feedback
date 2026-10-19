import { NextResponse } from 'next/server';
import { setSetting } from '@/lib/db';
import { getSyncConfig, parseDocId, syncNow } from '@/lib/gdoc';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // fetching the doc can take a few seconds

// Current link and the outcome of the last sync.
export async function GET() {
  return NextResponse.json(await getSyncConfig());
}

// Link (or unlink, with an empty url) a Google Doc, then sync it straight away.
export async function PUT(req) {
  const b = await req.json().catch(() => ({}));
  // Switch plain-sentence reading on or off without touching the link.
  if (typeof b.freeText === 'boolean') {
    await setSetting('gdoc_free_text', b.freeText ? '1' : '0');
    return NextResponse.json({ config: await getSyncConfig(), result: null });
  }
  const url = String(b.url || '').trim();
  if (!url) {
    for (const k of ['gdoc_url', 'gdoc_last_at', 'gdoc_last_ok', 'gdoc_last_message', 'gdoc_last_imported', 'gdoc_last_errors']) await setSetting(k, null);
    return NextResponse.json({ config: await getSyncConfig(), result: null });
  }
  const id = parseDocId(url);
  if (!id) return NextResponse.json({ error: 'That does not look like a Google Doc link (docs.google.com/document/d/…).' }, { status: 400 });
  await setSetting('gdoc_url', `https://docs.google.com/document/d/${id}/edit`);
  const result = await syncNow();
  return NextResponse.json({ config: await getSyncConfig(), result });
}

// "Sync now" (always runs), or ?auto=1 from an open board (skipped if a sync ran in the last minute).
export async function POST(req) {
  const auto = new URL(req.url).searchParams.get('auto') === '1';
  const result = await syncNow({ auto });
  return NextResponse.json({ config: await getSyncConfig(), result });
}
