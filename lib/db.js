import pg from 'pg';

export const AREAS = ['UI', 'UX', 'Frontend', 'Backend', 'API', 'Performance', 'Other'];
export const PERSONAS = ['Fixer', 'Clients', 'Both'];
// open -> in-progress -> fixed (awaiting verification) -> verified. Failed fixes go back to open.
export const STATUSES = ['open', 'in-progress', 'fixed', 'verified'];

// "Now" as 'YYYY-MM-DD HH:MM:SS' in UTC. Timestamps are stored as text in this shape so the UI and
// the Markdown export can treat them the same way everywhere.
const NOW = "to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    section TEXT NOT NULL,
    description TEXT NOT NULL,
    area TEXT NOT NULL,
    persona TEXT NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT ${NOW},
    fixed_by TEXT,
    fixed_at TEXT,
    verified_by TEXT,
    verified_at TEXT,
    source TEXT,
    needs_review INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    actor TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX IF NOT EXISTS events_fb ON events(feedback_id);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS doc_pending (
    hash TEXT PRIMARY KEY,
    first_seen DOUBLE PRECISION NOT NULL
  );
  CREATE TABLE IF NOT EXISTS doc_imports (
    hash TEXT PRIMARY KEY,
    feedback_id INTEGER,
    imported_at TEXT NOT NULL DEFAULT ${NOW}
  );
`;

// ---- connection -----------------------------------------------------------------------------------------
// An adapter is { query(sql, params) -> { rows }, exec(sql), tx(fn) }. Production uses `pg` against the
// DATABASE_URL (Supabase). Tests can swap in another Postgres with useAdapter().

function pgAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Add your Supabase connection string (see README).');
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  u.searchParams.delete('sslmode'); // we set SSL explicitly below; a sslmode in the URL would override it
  const pool = new pg.Pool({
    connectionString: u.toString(),
    ssl: local ? false : { rejectUnauthorized: false }, // Supabase terminates TLS with its own CA
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 10000,
  });
  return {
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({ query: (s, p) => client.query(s, p) });
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

export function useAdapter(adapter) {
  globalThis.__feedbackAdapter = adapter;
  globalThis.__feedbackSchema = null;
}

async function ready() {
  if (!globalThis.__feedbackAdapter) globalThis.__feedbackAdapter = pgAdapter();
  const a = globalThis.__feedbackAdapter;
  // Create the tables once per server instance. Safe to repeat: every statement is IF NOT EXISTS.
  if (!globalThis.__feedbackSchema) {
    globalThis.__feedbackSchema = a.exec(SCHEMA).catch((e) => { globalThis.__feedbackSchema = null; throw e; });
  }
  await globalThis.__feedbackSchema;
  return a;
}

// Run one statement; resolves to the rows.
export async function query(sql, params = []) {
  const a = await ready();
  return (await a.query(sql, params)).rows;
}

// Run several statements atomically. `fn` receives q(sql, params) -> rows.
export async function tx(fn) {
  const a = await ready();
  return a.tx((t) => fn(async (sql, params = []) => (await t.query(sql, params)).rows));
}

// ---- reads ----------------------------------------------------------------------------------------------

// "reopened" is a view over open items that have been through a failed verification.
// It is exclusive with "open" so the five status counts add up to the total.
export const FILTER_STATUSES = [...STATUSES, 'reopened'];

const LIST_SQL = `
  SELECT f.*,
    EXISTS(SELECT 1 FROM events e WHERE e.feedback_id = f.id AND e.type = 'reopen') AS reopened_ever,
    (SELECT actor FROM events e WHERE e.feedback_id = f.id AND e.type = 'start' ORDER BY e.id DESC LIMIT 1) AS started_by,
    (SELECT note FROM events e WHERE e.feedback_id = f.id AND e.type = 'reopen' ORDER BY e.id DESC LIMIT 1) AS reopen_note,
    (SELECT actor FROM events e WHERE e.feedback_id = f.id AND e.type = 'reopen' ORDER BY e.id DESC LIMIT 1) AS reopen_by
  FROM feedback f`;

export async function listFeedback(params) {
  const where = [];
  const args = [];
  const p = (v) => { args.push(v); return `$${args.length}`; };
  const persona = params.get('persona');
  const area = params.get('area');
  const status = params.get('status');
  const q = (params.get('q') || '').trim();
  if (PERSONAS.includes(persona)) where.push(`persona = ${p(persona)}`);
  if (AREAS.includes(area)) where.push(`area = ${p(area)}`);
  if (status === 'reopened') where.push("status = 'open' AND reopened_ever");
  else if (status === 'open') where.push("status = 'open' AND NOT reopened_ever");
  else if (STATUSES.includes(status)) where.push(`status = ${p(status)}`);
  if (q) {
    const like = p(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(section ILIKE ${like} ESCAPE '\\' OR description ILIKE ${like} ESCAPE '\\' OR name ILIKE ${like} ESCAPE '\\')`);
  }
  return query(`SELECT * FROM (${LIST_SQL}) t ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`, args);
}

export async function getSetting(key, fallback = null) {
  const rows = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function setSetting(key, value) {
  if (value === null || value === undefined) await query('DELETE FROM settings WHERE key = $1', [key]);
  else await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, String(value)]);
}

export async function getFeedback(id) {
  const [item] = await query(`SELECT * FROM (${LIST_SQL}) t WHERE id = $1`, [id]);
  if (!item) return null;
  const events = await query('SELECT * FROM events WHERE feedback_id = $1 ORDER BY id', [id]);
  return { item, events };
}

// ---- writes ---------------------------------------------------------------------------------------------

// `q` lets callers run this inside a transaction.
export async function addEvent(feedbackId, type, actor, note, q = query) {
  await q('INSERT INTO events (feedback_id, type, actor, note) VALUES ($1, $2, $3, $4)', [feedbackId, type, actor || null, note || null]);
}

export async function createFeedback({ section, description, area, persona, name, source = null, needsReview = 0 }, actor, note, q) {
  const run = async (run) => {
    const [row] = await run(
      'INSERT INTO feedback (section, description, area, persona, name, source, needs_review) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [section, description, area, persona, name, source, needsReview]);
    await addEvent(row.id, 'created', actor, note, run);
    return row.id;
  };
  return q ? run(q) : tx(run);
}

// Correct or confirm an entry's details. Any save here counts as a human review.
export async function updateDetails(id, actor, fields) {
  return tx(async (q) => {
    const [fb] = await q('SELECT * FROM feedback WHERE id = $1 FOR UPDATE', [id]);
    if (!fb) return { error: 'Not found', code: 404 };
    actor = (actor || '').trim().slice(0, 60);
    if (!actor) return { error: 'Enter your name first', code: 400 };
    const next = {
      section: String(fields.section ?? fb.section).trim(),
      area: fields.area ?? fb.area,
      persona: fields.persona ?? fb.persona,
      name: fields.name === undefined ? fb.name : (String(fields.name).trim().slice(0, 60) || null),
    };
    if (!next.section || next.section.length > 120) return { error: 'Section is required (max 120 characters)', code: 400 };
    if (!AREAS.includes(next.area)) return { error: 'Pick a valid area', code: 400 };
    if (!PERSONAS.includes(next.persona)) return { error: 'Pick a valid persona', code: 400 };

    const changes = ['section', 'area', 'persona', 'name'].filter((k) => next[k] !== fb[k])
      .map((k) => `${k[0].toUpperCase()}${k.slice(1)}: ${fb[k] ?? '(none)'} → ${next[k] ?? '(none)'}`);
    await q('UPDATE feedback SET section = $1, area = $2, persona = $3, name = $4, needs_review = 0 WHERE id = $5',
      [next.section, next.area, next.persona, next.name, id]);
    if (changes.length || fb.needs_review) {
      await addEvent(id, 'edit', actor, changes.length ? changes.join('\n') : 'Confirmed the auto-sorted details', q);
    }
    return { ok: true };
  });
}

const same = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

// Workflow rules live here so the UI can't skip steps.
// Returns { error, code } or { ok: true }.
export async function applyAction(id, action, actor, note) {
  return tx(async (q) => {
    const [fb] = await q('SELECT * FROM feedback WHERE id = $1 FOR UPDATE', [id]); // lock: two people acting at once can't both win
    if (!fb) return { error: 'Not found', code: 404 };
    actor = (actor || '').trim().slice(0, 60);
    note = (note || '').trim().slice(0, 2000);
    if (!actor) return { error: 'Enter your name first', code: 400 };

    switch (action) {
      case 'note':
        if (!note) return { error: 'Write a note', code: 400 };
        break;
      case 'start':
        if (fb.status !== 'open') return { error: 'Only open items can be started', code: 409 };
        await q("UPDATE feedback SET status = 'in-progress' WHERE id = $1", [id]);
        break;
      case 'fix':
        if (fb.status !== 'open' && fb.status !== 'in-progress') return { error: 'Item is already fixed', code: 409 };
        if (!note) return { error: 'Describe what was changed (a link to the PR or commit helps)', code: 400 };
        await q(`UPDATE feedback SET status = 'fixed', fixed_by = $1, fixed_at = ${NOW}, verified_by = NULL, verified_at = NULL WHERE id = $2`, [actor, id]);
        break;
      case 'verify':
        if (fb.status !== 'fixed') return { error: 'Only fixed items can be verified', code: 409 };
        if (same(actor, fb.fixed_by)) return { error: `${fb.fixed_by} marked this fixed, so someone else must verify it`, code: 403 };
        await q(`UPDATE feedback SET status = 'verified', verified_by = $1, verified_at = ${NOW} WHERE id = $2`, [actor, id]);
        break;
      case 'reopen':
        if (fb.status !== 'fixed' && fb.status !== 'verified') return { error: 'Item is not fixed yet', code: 409 };
        if (!note) return { error: 'Say what is still broken', code: 400 };
        await q("UPDATE feedback SET status = 'open', fixed_by = NULL, fixed_at = NULL, verified_by = NULL, verified_at = NULL WHERE id = $1", [id]);
        break;
      default:
        return { error: 'Unknown action', code: 400 };
    }
    await addEvent(id, action, actor, note, q);
    return { ok: true };
  });
}

export async function deleteFeedback(id) {
  const rows = await query('DELETE FROM feedback WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}
