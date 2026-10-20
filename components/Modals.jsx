'use client';

import { useEffect, useRef, useState } from 'react';
import { AREAS, PERSONAS } from '@/lib/ui';
import { Close } from './Icons';

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><Close size={10} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function NewFeedback({ me, onClose, onSaved }) {
  const [f, setF] = useState({ section: '', description: '', area: '', persona: '', name: me });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => first.current?.focus(), []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    onSaved(j);
  }

  return (
    <Modal title="Log feedback" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Section / feature
          <input ref={first} value={f.section} onChange={set('section')} maxLength={120} placeholder="e.g. Checkout Flow / Stripe Modal" required />
        </label>
        <label>Description
          <textarea value={f.description} onChange={set('description')} maxLength={4000} placeholder="What's wrong, or what should change?" required />
        </label>
        <div className="form-row">
          <label>Area
            <select value={f.area} onChange={set('area')} required>
              <option value="" disabled>Select…</option>
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label>Persona
            <select value={f.persona} onChange={set('persona')} required>
              <option value="" disabled>Select…</option>
              {PERSONAS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label><span>Name <em className="opt">optional</em></span>
          <input value={f.name} onChange={set('name')} maxLength={60} placeholder="Who's reporting this?" />
        </label>
        {err && <div className="form-err" role="alert">{err}</div>}
        <div className="form-foot">
          <button type="button" className="btn-soft" onClick={onClose}>Cancel</button>
          <button className="btn-dark" disabled={busy}>{busy ? 'Saving…' : 'Log feedback'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmDelete({ item, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Delete this issue?" onClose={onClose}>
      <div className="form">
        <div className="del-card">
          <strong>#FB-{item.id} · {item.section}</strong>
          <p>{item.description}</p>
        </div>
        <p className="modal-copy">This permanently deletes the issue and its whole history. It can’t be undone.</p>
        <div className="form-foot">
          <button className="btn-soft" onClick={onClose} autoFocus>Cancel</button>
          <button className="btn-danger" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); }}>
            {busy ? 'Deleting…' : 'Delete issue'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function IdentityModal({ me, onSave, onClose }) {
  const [v, setV] = useState(me);
  const ref = useRef();
  useEffect(() => ref.current?.focus(), []);
  return (
    <Modal title="Who are you?" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onSave(v); onClose(); } }}>
        <p className="modal-copy">Your name is saved in this browser and signs your fixes, verifications and notes.
          The two-person rule compares names, so use the one your teammates know.</p>
        <label>Your name
          <input ref={ref} value={v} onChange={(e) => setV(e.target.value)} maxLength={60} placeholder="e.g. Alex M." required />
        </label>
        <div className="form-foot">
          <button type="button" className="btn-soft" onClick={onClose}>Cancel</button>
          <button className="btn-dark">Save</button>
        </div>
      </form>
    </Modal>
  );
}

const TEMPLATE = `Section: <feature or screen name>
Description: <what is wrong, or what should change>
Area: <UI, UX, Frontend, Backend, API, Performance or Other>
Persona: <Fixer, Clients or Both>
Name: <your name, optional>
---
`;

// Lines starting with // are ignored by the importer, so the instructions never become feedback.
const TEAM_STARTER = `// Feedback log. Everyone on the team can add to this doc.
// Lines starting with // are ignored by the feedback board.
//
// How to add feedback:
//  1. Find your name below. If it isn't there, add a line: Reporter: <your name>
//  2. Under it, add one issue per line, in plain words.
//     Or use the Section / Description / Area / Persona format for more detail.
//  3. Add new lines. Don't rewrite lines the board has already picked up: change those on the board.
//  4. The board picks up new lines about a minute after you stop typing.

Reporter: <your name>
<write your first issue here>
`;

function since(iso) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}

export function SyncModal({ onClose, onSynced }) {
  const [cfg, setCfg] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedTeam, setCopiedTeam] = useState(false);

  useEffect(() => {
    fetch('/api/sync', { cache: 'no-store' }).then((r) => r.json()).then((c) => { setCfg(c); setUrl(c.url || ''); });
  }, []);

  async function call(method, body) {
    setBusy(true); setErr('');
    const r = await fetch('/api/sync', { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    setCfg(j.config);
    if (method === 'PUT' && body && 'url' in body && !body.url) setUrl('');
    onSynced();
  }

  const linked = Boolean(cfg?.docId);
  return (
    <Modal title="Google Doc sync" onClose={onClose} wide>
      <div className="form">
        <p className="modal-copy">
          Link a Google Doc and anything logged in it is imported here automatically: about every minute while someone has
          this board open, and once a day otherwise.
          Imported issues are added once; editing or deleting them on the board never changes the doc.
        </p>

        <ol className="rules steps">
          <li>In the doc, choose <b>Share → General access → Anyone with the link → Viewer</b>. That lets this board read it.</li>
          <li>Still in Share, add your teammates by email as <b>Editors</b> so they can type in the doc.</li>
          <li>Paste the doc link below.</li>
          <li>Everyone adds feedback under their own name: a line <code>Reporter: Elena</code> (or a heading like “Feedback from Elena”),
            then one issue per line. Add new lines rather than rewriting old ones.</li>
        </ol>
        <div className="sync-tip">
          <span>New doc? Paste the team starter text to give everyone the same instructions.</span>
          <button className="btn-soft sm" onClick={() => { navigator.clipboard?.writeText(TEAM_STARTER); setCopiedTeam(true); setTimeout(() => setCopiedTeam(false), 1500); }}>
            {copiedTeam ? 'Copied' : 'Copy team starter doc'}
          </button>
        </div>

        <div className="sync-grid">
          <div className="sync-col">
            <label>Google Doc link
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…" />
            </label>
            {err && <div className="form-err" role="alert">{err}</div>}
            <div className="form-foot start">
              <button className="btn-dark" disabled={busy || !url.trim()} onClick={() => call('PUT', { url })}>
                {busy ? 'Syncing…' : linked ? 'Update link & sync' : 'Link & sync'}
              </button>
              {linked && <button className="btn-soft" disabled={busy} onClick={() => call('POST')}>Sync now</button>}
              {linked && <button className="btn-soft" disabled={busy} onClick={() => call('PUT', { url: '' })}>Unlink</button>}
            </div>

            <div className="sync-free">
              <strong>Plain sentences</strong>
              <p>Lines that don’t use the format are imported too: one issue per line, with a keyword-based guess for
                Section, Area and Persona. They get a <b>Needs review</b> tag until someone confirms or corrects them.
                Very short lines and headings (“Checkout Page”, “Meeting notes”) are skipped. A line that mixes several issues stays one entry.</p>
              <label className="check">
                <input type="checkbox" checked={cfg?.freeText ?? true} disabled={busy || !cfg}
                  onChange={(e) => call('PUT', { freeText: e.target.checked })} />
                Import plain sentences
              </label>
            </div>

            {linked && cfg.lastAt && (
              <div className={`sync-status ${cfg.lastOk ? 'ok' : 'bad'}`}>
                <strong>{cfg.lastOk ? 'Linked' : 'Sync failed'}</strong>
                <span>{cfg.lastMessage}</span>
                <small>Checked {since(cfg.lastAt)} · {cfg.totalImported} imported so far · <a href={cfg.url} target="_blank" rel="noreferrer">Open doc</a></small>
              </div>
            )}
            {linked && cfg.errors?.length > 0 && (
              <div className="sync-errors">
                <strong>{cfg.errors.length} {cfg.errors.length === 1 ? 'entry was' : 'entries were'} skipped. Fix {cfg.errors.length === 1 ? 'it' : 'them'} in the doc:</strong>
                <ul>{cfg.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
          </div>

          <div className="sync-col">
            <div className="sync-tpl-head">
              <strong>Format</strong>
              <button className="btn-soft sm" onClick={() => { navigator.clipboard?.writeText(TEMPLATE); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? 'Copied' : 'Copy template'}
              </button>
            </div>
            <pre className="md-pre tpl">{TEMPLATE}</pre>
            <p className="modal-copy">Paste the template into the doc and replace each <code>&lt;…&gt;</code>. Unfilled templates are ignored.
              Description can run over several lines. The <code>---</code> line is optional.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function HelpModal({ onClose }) {
  const keys = [['⌘K / Ctrl K', 'Search issues'], ['F', 'Quick filter (jump to search)'], ['N', 'Log new feedback'], ['?', 'This panel'], ['Esc', 'Close dialogs']];
  return (
    <Modal title="Shortcuts & how verification works" onClose={onClose}>
      <div className="help">
        <ul className="keys">{keys.map(([k, d]) => <li key={k}><kbd>{k}</kbd><span>{d}</span></li>)}</ul>
        <ol className="rules">
          <li><b>Open</b> → <b>In Progress</b>: someone starts work.</li>
          <li><b>Fixed</b>: the fixer writes what changed (PR or commit link).</li>
          <li><b>Verified</b>: a <i>different</i> person confirms the fix works.</li>
          <li><b>Reopened</b>: if it still fails, say what is broken and it goes back to the queue.</li>
        </ol>
      </div>
    </Modal>
  );
}

export function PreviewModal({ query, onClose }) {
  const [text, setText] = useState('Loading…');
  useEffect(() => {
    fetch('/api/export?' + query).then((r) => r.text()).then(setText).catch(() => setText('Could not load the export.'));
  }, [query]);
  return (
    <Modal title="Markdown output" onClose={onClose} wide>
      <pre className="md-pre">{text}</pre>
      <div className="form-foot">
        <button className="btn-soft" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
        <a className="btn-dark" href={'/api/export?' + query} download>Download .md</a>
      </div>
    </Modal>
  );
}
