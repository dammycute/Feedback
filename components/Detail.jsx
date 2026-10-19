'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AREAS, PERSONAS, STATUS_META, statusKey, code, ago, day, initials } from '@/lib/ui';
import { Check, ChevronDown, Close, Undo } from './Icons';

const EVENT_TEXT = {
  edit: 'updated the details',
  created: 'reported this issue',
  start: 'started work',
  fix: 'marked it fixed',
  verify: 'verified the fix',
  reopen: 'reopened it',
  note: 'added a note',
};

// Confirm or correct Section / Area / Persona. Saving clears the "needs review" flag.
function DetailsForm({ item, me, needName, onSaved, onCancel }) {
  const [f, setF] = useState({ section: item.section, area: item.area, persona: item.persona, name: item.name || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!me) return needName();
    setBusy(true); setErr('');
    const r = await fetch(`/api/feedback/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, actor: me }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    onSaved(j);
  }

  return (
    <form className={`review-box ${item.needs_review ? 'flagged' : ''}`} onSubmit={save}>
      {item.needs_review && (
        <div>
          <strong>Auto-sorted from a plain sentence</strong>
          <p>Section, area and persona were guessed from keywords. Check them (and who reported it), fix anything that is off, then confirm.</p>
        </div>
      )}
      <label>Section / feature
        <input value={f.section} onChange={set('section')} maxLength={120} required />
      </label>
      <div className="form-row">
        <label>Area
          <select value={f.area} onChange={set('area')}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
        </label>
        <label>Persona
          <select value={f.persona} onChange={set('persona')}>{PERSONAS.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
      </div>
      <label>Reported by
        <input value={f.name} onChange={set('name')} maxLength={60} placeholder="Who wrote this?" />
      </label>
      {err && <div className="form-err" role="alert">{err}</div>}
      <div className="ac-row">
        <button className="btn-verify" disabled={busy}><Check size={12} /> {item.needs_review ? 'Looks right' : 'Save details'}</button>
        {!item.needs_review && <button type="button" className="btn-soft" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export default function Detail({ item, me, needName, focusNonce, onChanged, onClose, onNext, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [events, setEvents] = useState([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const composer = useRef();

  // Reload history when the issue changes (or its status changes elsewhere).
  useEffect(() => {
    let live = true;
    setNote(''); setErr('');
    fetch(`/api/feedback/${item.id}`).then((r) => r.json()).then((d) => live && d.events && setEvents(d.events));
    return () => { live = false; };
  }, [item.id, item.status]);

  // "Reopen" on a card sends people here: focus the composer and say why it is needed.
  useEffect(() => {
    if (!focusNonce) return;
    setErr('Say what is still broken, then press Reopen.');
    composer.current?.focus();
  }, [focusNonce]);

  const act = useCallback(async (action) => {
    setErr('');
    if (!me) return needName();
    if ((action === 'fix' || action === 'reopen' || action === 'note') && !note.trim()) {
      setErr(action === 'fix' ? 'Describe what changed first (a PR or commit link helps).'
        : action === 'reopen' ? 'Say what is still broken so the next fixer can reproduce it.'
        : 'Write a note first.');
      composer.current?.focus();
      return;
    }
    setBusy(true);
    const r = await fetch(`/api/feedback/${item.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, actor: me, note }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    setEvents(j.events); setNote('');
    onChanged(action);
  }, [me, note, item.id, needName, onChanged]);

  const k = statusKey(item);
  const meta = STATUS_META[k];
  const selfFixed = me && item.fixed_by && me.toLowerCase() === item.fixed_by.toLowerCase();

  return (
    <aside className="detail" aria-label="Issue details">
      <div className="dt-head">
        <div className="dt-crumb">
          <span className="code">{code(item)}</span><span className="slash">/</span><strong>{item.section}</strong>
        </div>
        <div className="dt-tools">
          <button onClick={onNext} aria-label="Next issue" title="Next issue"><ChevronDown size={13} /></button>
          <button onClick={onClose} aria-label="Close details" title="Close"><Close size={10} /></button>
        </div>
      </div>

      <div className="dt-body">
        <div className={`dt-title k-${k}`}>
          <div className="dt-status">
            <span className="pill"><i className="dot" />{meta.long || meta.label}</span>
            <span className="mono muted">{item.area} • Issue {item.id}</span>
          </div>
          <h2>{item.description}</h2>
          <p className="dt-meta">
            <span className="avatar sm">{initials(item.name)}</span>
            {item.name || 'Anonymous'} · {ago(item.created_at)} · <span className={`tag persona p-${item.persona.toLowerCase()}`}>{item.persona}</span>
            {!item.needs_review && !editing && <button className="link-btn" onClick={() => setEditing(true)}>Edit details</button>}
          </p>
        </div>

        {(item.needs_review || editing) && (
          <DetailsForm key={`${item.id}-${item.section}-${item.area}-${item.persona}`} item={item} me={me} needName={needName}
            onCancel={() => setEditing(false)}
            onSaved={(j) => { setEvents(j.events); setEditing(false); onChanged('edit'); }} />
        )}

        {k === 'fixed' && (
          <div className="callout-amber">
            <strong>Two-Person Verification Rule</strong>
            <p>This fix was marked fixed by <b>{item.fixed_by}</b>. To move it to Verified, someone else has to
              validate it. Add what you checked in the note box below.</p>
          </div>
        )}
        {k === 'verified' && (
          <div className="callout-green">
            <strong>Signed off</strong>
            <p>Fixed by <b>{item.fixed_by}</b>, verified by <b>{item.verified_by}</b> on {day(item.verified_at)}.</p>
          </div>
        )}
        {k === 'reopened' && (
          <div className="callout-red">
            <strong>Regression: reopened by {item.reopen_by}</strong>
            <p>{item.reopen_note}</p>
          </div>
        )}

        <section className="action-card">
          <div className="ac-head">
            <strong>{k === 'fixed' ? 'Triage Verification Action' : k === 'verified' ? 'Regression check' : 'Triage Action'}</strong>
            <span className="mono muted">{k === 'fixed' ? 'Active peer' : 'Signing as'}: {me || 'not set'}</span>
          </div>

          {k === 'fixed' && (
            <>
              <button className="btn-verify" disabled={busy || selfFixed} onClick={() => act('verify')}>
                <Check size={12} /> Confirm &amp; Verify Fix (Sign as {me || '…'})
              </button>
              {selfFixed && <p className="ac-hint">You marked this fixed, so a teammate has to verify it.</p>}
            </>
          )}
          {k === 'open' || k === 'reopened' || k === 'in-progress' ? (
            <div className="ac-row">
              {item.status === 'open' && <button className="btn-soft" disabled={busy} onClick={() => act('start')}>Start work</button>}
              <button className="btn-verify" disabled={busy} onClick={() => act('fix')}>
                <Check size={12} /> Mark Fixed (note required)
              </button>
            </div>
          ) : (
            <button className="btn-reopen" disabled={busy} onClick={() => act('reopen')}>
              <Undo size={11} /> Reopen Issue (Requires regression reason)
            </button>
          )}
        </section>

        <section>
          <h3 className="dt-sub">Activity</h3>
          <ol className="timeline">
            {events.map((e) => (
              <li key={e.id} className={`ev ev-${e.type}`}>
                <span className="ev-dot" />
                <div>
                  <div><strong>{e.actor || 'Someone'}</strong> {EVENT_TEXT[e.type]} <span className="muted">· {ago(e.created_at)}</span></div>
                  {e.note && <div className="ev-note">{e.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <button className="del" onClick={onDelete}>Delete issue</button>
      </div>

      {err && <div className="dt-err" role="alert">{err}</div>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); act('note'); }}>
        <input ref={composer} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder={k === 'fixed' ? 'Add verification note or QA reproduction…' : 'Add a note, or describe the change before marking fixed…'}
          aria-label="Note" />
        <button disabled={busy}>Send</button>
      </form>
    </aside>
  );
}
