import { listFeedback, PERSONAS } from '@/lib/db';

export const dynamic = 'force-dynamic';

const LABEL = { open: 'Open', 'in-progress': 'In progress', fixed: 'Fixed, awaiting verification', verified: 'Verified' };
const labelOf = (i) => (i.status === 'open' && i.reopened_ever ? 'Reopened' : LABEL[i.status]) + (i.needs_review ? ', needs review' : '');

// Markdown export, grouped by persona then area. Honors the same filters as the list.
export async function GET(req) {
  const items = (await listFeedback(new URL(req.url).searchParams)).reverse();
  const today = new Date().toISOString().slice(0, 10);
  const count = (s) => items.filter((i) => i.status === s && !i.reopened_ever).length;
  const reopened = items.filter((i) => i.status === 'open' && i.reopened_ever).length;
  const out = [
    '# Feedback export', '',
    `_${today} · ${items.length} item${items.length === 1 ? '' : 's'}_`, '',
    `**Open:** ${count('open')} · **In progress:** ${items.filter((i) => i.status === 'in-progress').length} · **Awaiting verification:** ${items.filter((i) => i.status === 'fixed').length} · **Verified:** ${items.filter((i) => i.status === 'verified').length} · **Reopened:** ${reopened}`, '',
  ];

  for (const persona of PERSONAS) {
    const group = items.filter((i) => i.persona === persona);
    if (!group.length) continue;
    out.push(`## ${persona}`, '');
    for (const area of [...new Set(group.map((i) => i.area))]) {
      out.push(`### ${area}`, '');
      for (const i of group.filter((g) => g.area === area)) {
        const by = i.name ? ` — ${i.name}` : '';
        out.push(`- [${i.status === 'verified' ? 'x' : ' '}] **${i.section}**${by} (${i.created_at.slice(0, 10)}) · _${labelOf(i)}_`);
        if (i.status === 'open' && i.reopened_ever && i.reopen_note) out.push(`  - Reopened by ${i.reopen_by}: ${i.reopen_note.replace(/\r?\n/g, ' ')}`);
        out.push(`  ${i.description.replace(/\r?\n/g, '\n  ')}`);
        if (i.fixed_by) out.push(`  - Fixed by ${i.fixed_by} on ${i.fixed_at.slice(0, 10)}`);
        if (i.verified_by) out.push(`  - Verified by ${i.verified_by} on ${i.verified_at.slice(0, 10)}`);
      }
      out.push('');
    }
  }
  if (!items.length) out.push('_No feedback yet._', '');

  return new Response(out.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="feedback-${today}.md"`,
    },
  });
}
