// One-off: copy feedback from the old local SQLite file into the Postgres database in DATABASE_URL.
//
//   DATABASE_URL="postgresql://..." node scripts/import-sqlite.mjs [path/to/feedback.db]
//
// Safe to run more than once: rows that already exist are skipped. Needs Node 22+ (uses the built-in node:sqlite).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { tx } from '../lib/db.js';

const file = process.argv[2] || 'data/feedback.db';
if (!fs.existsSync(file)) { console.error(`No SQLite file at ${file}`); process.exit(1); }
const lite = new DatabaseSync(file, { readOnly: true });
const all = (sql) => lite.prepare(sql).all();
const has = (table) => all(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`).length > 0;

const feedback = all('SELECT * FROM feedback ORDER BY id');
const events = has('events') ? all('SELECT * FROM events ORDER BY id') : [];
const imports = has('doc_imports') ? all('SELECT * FROM doc_imports') : [];
const settings = has('settings') ? all("SELECT * FROM settings WHERE key IN ('gdoc_url', 'gdoc_free_text')") : [];

const n = (v) => (v === undefined ? null : v);
const counts = await tx(async (q) => {
  let f = 0, e = 0;
  for (const r of feedback) {
    const ins = await q(
      `INSERT INTO feedback (id, section, description, area, persona, name, status, created_at, fixed_by, fixed_at, verified_by, verified_at, source, needs_review)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [r.id, r.section, r.description, r.area, r.persona, n(r.name), r.status === 'done' ? 'fixed' : r.status, r.created_at,
        n(r.fixed_by), n(r.fixed_at), n(r.verified_by), n(r.verified_at), n(r.source), r.needs_review ?? 0]);
    if (!ins.length) continue; // already there; leave its events alone too
    f++;
    for (const ev of events.filter((x) => x.feedback_id === r.id)) {
      await q('INSERT INTO events (feedback_id, type, actor, note, created_at) VALUES ($1,$2,$3,$4,$5)', [r.id, ev.type, n(ev.actor), n(ev.note), ev.created_at]);
      e++;
    }
  }
  for (const r of imports) await q('INSERT INTO doc_imports (hash, feedback_id, imported_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [r.hash, n(r.feedback_id), r.imported_at]);
  for (const r of settings) await q('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [r.key, r.value]);
  // Keep new ids counting up from the highest imported one.
  await q("SELECT setval(pg_get_serial_sequence('feedback', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM feedback), 1))");
  return { f, e };
});

console.log(`Imported ${counts.f} issue(s) and ${counts.e} history event(s); skipped ${feedback.length - counts.f} that already existed.`);
process.exit(0);
