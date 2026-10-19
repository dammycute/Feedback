import crypto from 'node:crypto';
import { query, tx, createFeedback, getSetting, setSetting, AREAS, PERSONAS } from './db.js';
import { extractFreeText, normalizeKey } from './freetext.js';

// Only docs.google.com is ever fetched, and the URL is rebuilt from the doc id,
// so a pasted link can't point the server at anything else.
const DOC_URL = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/;
export const POLL_SECONDS = 60;
const SETTLE_MS = 45000; // an entry must stay unchanged this long before it is imported

export function parseDocId(input) {
  const s = String(input || '').trim();
  const m = s.match(DOC_URL);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{25,}$/.test(s) ? s : null; // bare document id
}

const KEYS = {
  section: 'section', feature: 'section', 'section / feature': 'section', 'section/feature': 'section',
  description: 'description', desc: 'description', details: 'description',
  area: 'area',
  persona: 'persona',
  name: 'name', 'reported by': 'name',
};
const KEY_LINE = /^\s*(section\s*\/\s*feature|section|feature|description|desc|details|area|persona|reported by|reporter|name)\s*[:：]\s*(.*)$/i;
const COMMENT_LINE = /^\s*\/\//; // "// instructions for the team" is never imported
// Headings that announce whose feedback follows: "Feedback from Elena", "Elena's feedback".
const REPORTER_HEADING = [
  /^(?:feedback|comments?|notes?|issues?)\s+(?:from|by)\s+(.{2,40})$/i,
  /^(.{2,40}?)['’]s\s+(?:feedback|comments?|notes?|issues?)$/i,
];
const cleanName = (v) => {
  const n = String(v || '').replace(/[:\s]+$/, '').trim().slice(0, 60);
  return !n || isPlaceholder(n) ? null : n;
};
const SEPARATOR = /^\s*([-_*=])\1{2,}\s*$/;
const isPlaceholder = (v) => /^\s*[<\[].*[>\]]\s*$/.test(v) || /^\s*e\.g\./i.test(v);

const PERSONA_ALIASES = { client: 'Clients', clients: 'Clients', fixer: 'Fixer', fixers: 'Fixer', both: 'Both' };
const pick = (list, v) => list.find((x) => x.toLowerCase() === String(v).trim().toLowerCase());

// Parse the text of the doc into feedback entries.
//
//   Section: Checkout Flow
//   Description: Payment fails with a GBP coupon.
//   Area: API
//   Persona: Clients
//   Name: Elena
//   ---
//
// "---" between entries is optional: a new "Section:" line also starts a new entry.
// Text outside entries (titles, plain sentences) is returned as `rest` for the free-text reader.
// Entries with <placeholder> values are skipped.
//
// Several people can share one doc. Who wrote an entry is decided by, in order:
//   1. its own "Name:" line,
//   2. the most recent "Reporter: Elena" line, or a heading like "Feedback from Elena" / "Elena's feedback".
// Lines starting with // are comments for the team and are ignored.
export function parseDoc(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const blocks = [];
  const rest = [];
  const reporters = new Set();
  let reporter = null;
  let cur = null;
  let key = null;
  let blank = false;

  const close = () => { cur = null; key = null; blank = false; };
  const setReporter = (v) => { reporter = cleanName(v); if (reporter) reporters.add(reporter); };
  for (const raw of lines) {
    const line = raw.replace(/\u000b/g, '\n').trimEnd(); // Docs exports soft line breaks as \v
    if (COMMENT_LINE.test(line)) continue;
    if (SEPARATOR.test(line)) { close(); continue; }
    const m = line.match(KEY_LINE);
    if (m) {
      const label = m[1].toLowerCase().replace(/\s+/g, ' ');
      if (label === 'reporter') { close(); setReporter(m[2]); continue; } // always means "entries below are from this person"
      const k = KEYS[label];
      if (k === 'section' && cur && (cur.fields.section !== undefined || cur.fields.description !== undefined)) close();
      if (!cur) {
        if (k === 'name') { setReporter(m[2]); continue; } // "Name: Elena" outside an entry also sets the reporter
        if (k !== 'section') continue; // a stray "Area:" line outside an entry means nothing on its own
        cur = { fields: {}, order: blocks.length + 1, reporter };
        blocks.push(cur);
      }
      cur.fields[k] = m[2].trim();
      key = k; blank = false;
      continue;
    }
    if (!cur || !key) {
      const t = line.trim();
      const h = t && t.split(/\s+/).length <= 7 && !/[.!?]$/.test(t)
        ? REPORTER_HEADING.map((re) => t.match(re)).find(Boolean) : null;
      if (h) { setReporter(h[1]); continue; }
      rest.push({ text: line, reporter });
      continue;
    }
    if (!line.trim()) { blank = true; continue; }
    // Continuation of a multi-line value (mostly descriptions).
    cur.fields[key] += (blank ? '\n\n' : '\n') + line.trim();
    blank = false;
  }

  const entries = [];
  const errors = [];
  for (const b of blocks) {
    const f = b.fields;
    const label = f.section ? `“${f.section.slice(0, 40)}”` : `entry ${b.order}`;
    if ([f.section, f.description, f.area, f.persona].some((v) => v && isPlaceholder(v))) continue;
    const problems = [];
    if (!f.section) problems.push('missing Section');
    if (!f.description || f.description.length < 5) problems.push('missing Description (5+ characters)');
    const area = pick(AREAS, f.area || '');
    if (!area) problems.push(f.area ? `Area “${f.area}” is not one of ${AREAS.join(', ')}` : 'missing Area');
    const persona = pick(PERSONAS, PERSONA_ALIASES[(f.persona || '').trim().toLowerCase()] || f.persona || '');
    if (!persona) problems.push(f.persona ? `Persona “${f.persona}” is not Fixer, Clients or Both` : 'missing Persona');
    if (f.section && f.section.length > 120) problems.push('Section is over 120 characters');
    if (f.description && f.description.length > 4000) problems.push('Description is over 4000 characters');
    if (problems.length) { errors.push(`${label}: ${problems.join('; ')}`); continue; }
    entries.push({
      section: f.section.trim(), description: f.description.trim(), area, persona,
      name: cleanName(f.name) || b.reporter || null,
    });
  }
  return { entries, errors, rest, reporters: [...reporters] };
}

const fingerprint = (e) => crypto.createHash('sha1')
  .update([e.section, e.description, e.area, e.persona].map((s) => s.trim().toLowerCase().replace(/\s+/g, ' ')).join('\u0001'))
  .digest('hex');

export async function getSyncConfig() {
  const rows = await query('SELECT key, value FROM settings WHERE key LIKE $1', ['gdoc_%']);
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const [{ n }] = await query('SELECT COUNT(*)::int AS n FROM doc_imports');
  const url = s.gdoc_url || null;
  return {
    url,
    docId: url ? parseDocId(url) : null,
    lastAt: s.gdoc_last_at || null,
    lastOk: s.gdoc_last_ok === '1',
    lastMessage: s.gdoc_last_message || null,
    lastImported: Number(s.gdoc_last_imported || 0),
    totalImported: n,
    errors: JSON.parse(s.gdoc_last_errors || '[]'),
    pollSeconds: POLL_SECONDS,
    freeText: (s.gdoc_free_text ?? '1') === '1',
  };
}

async function fetchDocText(docId) {
  const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`, {
    redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'TriageOps-sync' },
  });
  const type = res.headers.get('content-type') || '';
  const host = new URL(res.url).hostname;
  // Private docs redirect to a Google sign-in page instead of returning text.
  if (host !== 'docs.google.com' && host !== 'googleusercontent.com' && !host.endsWith('.googleusercontent.com')) {
    throw new Error('Google asked for a sign-in. Set the doc’s sharing to “Anyone with the link: Viewer”.');
  }
  if (res.status === 404) throw new Error('Doc not found. Check the link.');
  if (!res.ok) throw new Error(`Google returned ${res.status}. Make sure the doc is shared as “Anyone with the link: Viewer”.`);
  if (!type.startsWith('text/plain')) throw new Error('Could not read the doc as text. Make sure it is a Google Doc shared with “Anyone with the link”.');
  return res.text();
}

let running = false;

// Fetch the doc, import anything new, and record the outcome.
//   auto: true  -> called by an open board or the daily cron. Skipped if another run happened in the last
//                  minute, so many open browsers don't hammer Google. The claim is made in the database so
//                  it also holds across separate serverless instances.
//   auto: false -> the "Sync now" button. Always runs.
export async function syncNow({ auto = false } = {}) {
  const cfg = await getSyncConfig();
  if (!cfg.docId) return { ok: false, message: 'No Google Doc linked yet.', imported: 0, errors: [] };
  if (running) return { ok: true, message: 'A sync is already running.', imported: 0, errors: cfg.errors };

  if (auto) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - (POLL_SECONDS - 5) * 1000).toISOString();
    const claimed = await query(
      `INSERT INTO settings (key, value) VALUES ('gdoc_last_at', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE settings.value < $2 RETURNING key`,
      [now.toISOString(), cutoff]);
    if (!claimed.length) return { ok: cfg.lastOk, message: cfg.lastMessage, imported: 0, skipped: true, errors: cfg.errors };
  }

  running = true;
  try {
    const { entries, errors, rest, reporters } = parseDoc(await fetchDocText(cfg.docId));
    // People who may appear as an inline "Elena: ..." prefix: declared in the doc, or already on the board.
    const known = new Set(reporters.map((n) => n.toLowerCase()));
    for (const r of await query('SELECT DISTINCT name FROM feedback WHERE name IS NOT NULL')) known.add(r.name.toLowerCase());
    const freeTextOn = (await getSetting('gdoc_free_text', '1')) === '1';
    const sorted = freeTextOn ? extractFreeText(rest, known) : [];

    const settleMs = Number(process.env.GDOC_SETTLE_MS ?? SETTLE_MS);
    const now = Date.now();
    let structured = 0;
    let freeText = 0;
    let waiting = 0;

    await tx(async (q) => {
      // Structured entries are trusted. Free-text entries carry guessed fields, so they are flagged for review.
      const all = [
        ...entries.map((e) => ({ e, h: fingerprint(e), source: 'doc', review: 0 })),
        ...sorted.map((e) => ({ e, h: normalizeKey(e.description), source: 'doc-text', review: 1 })),
      ];
      const done = new Set((await q('SELECT hash FROM doc_imports WHERE hash = ANY($1)', [all.map((j) => j.h)])).map((r) => r.hash));
      const jobs = all.filter((j) => !done.has(j.h));

      // Teammates type in the doc while we poll. An entry is only imported once it has stayed unchanged for
      // `settleMs`, so a half-typed line is never logged. Edited or deleted lines drop out of the waiting list.
      const first = new Map((await q('SELECT hash, first_seen FROM doc_pending')).map((r) => [r.hash, Number(r.first_seen)]));
      await q('DELETE FROM doc_pending WHERE NOT (hash = ANY($1))', [jobs.map((j) => j.h)]);

      for (const { e, h, source, review } of jobs) {
        if (!first.has(h)) {
          await q('INSERT INTO doc_pending (hash, first_seen) VALUES ($1, $2) ON CONFLICT DO NOTHING', [h, now]);
          first.set(h, now);
        }
        if (now - first.get(h) < settleMs) { waiting++; continue; }
        // Claim the entry first: if another run imported it a moment ago, the insert returns nothing and we skip it.
        const claim = await q('INSERT INTO doc_imports (hash) VALUES ($1) ON CONFLICT DO NOTHING RETURNING hash', [h]);
        if (!claim.length) continue;
        const id = await createFeedback({ ...e, source, needsReview: review }, e.name || 'Google Doc',
          review ? 'Imported from a plain sentence in the Google Doc. Section, area and persona were guessed from keywords.'
            : 'Imported from the linked Google Doc', q);
        await q('UPDATE doc_imports SET feedback_id = $1 WHERE hash = $2', [id, h]);
        await q('DELETE FROM doc_pending WHERE hash = $1', [h]);
        if (review) freeText++; else structured++;
      }
    });

    const imported = structured + freeText;
    const total = entries.length + sorted.length;
    const plural = (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
    const message = imported
      ? `Imported ${plural(imported)}${freeText ? ` (${freeText} from plain sentences, flagged for review)` : ''}${waiting ? `; ${waiting} still being typed` : ''}.`
      : waiting ? `${plural(waiting)} found; importing once ${waiting === 1 ? 'it stops' : 'they stop'} changing.`
        : `Up to date (${total} ${total === 1 ? 'entry' : 'entries'} read).`;
    await save(true, message, imported, errors);
    return { ok: true, message, imported, waiting, errors };
  } catch (e) {
    const message = e?.name === 'TimeoutError' ? 'Google took too long to respond.' : e.message || String(e);
    await save(false, message, 0, []);
    return { ok: false, message, imported: 0, errors: [] };
  } finally {
    running = false;
  }
}

async function save(ok, message, imported, errors) {
  const rows = {
    gdoc_last_at: new Date().toISOString(),
    gdoc_last_ok: ok ? '1' : '0',
    gdoc_last_message: message,
    gdoc_last_imported: String(imported),
    gdoc_last_errors: JSON.stringify(errors.slice(0, 20)),
  };
  for (const [k, v] of Object.entries(rows)) await setSetting(k, v);
}
