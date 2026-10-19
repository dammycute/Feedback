import { NextResponse } from 'next/server';
import { listFeedback, createFeedback, AREAS, PERSONAS } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const items = await listFeedback(new URL(req.url).searchParams);
  return NextResponse.json({ items });
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const section = String(b.section || '').trim();
  const description = String(b.description || '').trim();
  const name = String(b.name || '').trim().slice(0, 60) || null;
  if (!section || section.length > 120) return NextResponse.json({ error: 'Section / feature is required (max 120 chars)' }, { status: 400 });
  if (description.length < 5 || description.length > 4000) return NextResponse.json({ error: 'Description must be 5-4000 characters' }, { status: 400 });
  if (!AREAS.includes(b.area)) return NextResponse.json({ error: 'Pick an area' }, { status: 400 });
  if (!PERSONAS.includes(b.persona)) return NextResponse.json({ error: 'Pick a persona' }, { status: 400 });
  const id = await createFeedback({ section, description, area: b.area, persona: b.persona, name }, name, null);
  return NextResponse.json({ id }, { status: 201 });
}
