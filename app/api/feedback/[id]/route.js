import { NextResponse } from 'next/server';
import { getFeedback, applyAction, updateDetails, deleteFeedback } from '@/lib/db';

export const dynamic = 'force-dynamic';

const idOf = async (params) => Number((await params).id);

export async function GET(_req, { params }) {
  const data = await getFeedback(await idOf(params));
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

// Workflow actions: start | fix | verify | reopen | note
export async function POST(req, { params }) {
  const id = await idOf(params);
  const b = await req.json().catch(() => ({}));
  const r = await applyAction(id, b.action, b.actor, b.note);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.code });
  return NextResponse.json(await getFeedback(id));
}

// Edit section / area / persona / name (also clears the "needs review" flag).
export async function PATCH(req, { params }) {
  const id = await idOf(params);
  const b = await req.json().catch(() => ({}));
  const r = await updateDetails(id, b.actor, { section: b.section, area: b.area, persona: b.persona, name: b.name });
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.code });
  return NextResponse.json(await getFeedback(id));
}

export async function DELETE(_req, { params }) {
  if (!(await deleteFeedback(await idOf(params)))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
