'use client';

import { AREAS, PERSONAS, PERSONA_HINT, STATUS_KEYS, STATUS_META, statusKey, code, ago } from '@/lib/ui';
import { Check, Close, ChevronDown, Compact, IconClock, IconShield, IconStack, IconWrench, Layers, List, Person, Undo } from './Icons';

const STAT_ICON = { 'in-progress': <IconClock />, fixed: <IconWrench />, verified: <IconShield /> };

export function StatCards({ total, counts, status, setStatus }) {
  return (
    <section className="stats" aria-label="Issue counts by status">
      <button className={`stat k-all ${!status ? 'is-on' : ''}`} onClick={() => setStatus('')}>
        <div className="stat-top"><span className="stat-label">All Issues</span><IconStack /></div>
        <div className="stat-num"><strong>{total}</strong><span>total</span></div>
      </button>
      {STATUS_KEYS.map((k) => {
        const m = STATUS_META[k];
        const on = status === k;
        return (
          <button key={k} className={`stat k-${k} ${on ? 'is-on' : ''}`} onClick={() => setStatus(on ? '' : k)} aria-pressed={on}>
            <div className="stat-top">
              <span className="stat-label"><i className="dot" />{m.short || m.label}</span>
              {m.chip ? <span className="stat-chip">{m.chip}</span> : STAT_ICON[k]}
            </div>
            <div className="stat-num"><strong>{counts[k]}</strong><span>{m.sub}</span></div>
            {on && <span className="stat-active">Filter active</span>}
          </button>
        );
      })}
    </section>
  );
}

export function FilterBar({ persona, setPersona, area, setArea, status, setStatus, q, setQ, shown, total, view, setView, clearAll, reviewOnly, setReviewOnly }) {
  const chips = [];
  if (reviewOnly) chips.push(['Needs review', 'k-chip-review', () => setReviewOnly(false)]);
  if (persona) chips.push([`Persona: ${persona}`, 'k-chip-persona', () => setPersona('')]);
  if (area) chips.push([`Area: ${area}`, 'k-chip-area', () => setArea('')]);
  if (status) chips.push([`Status: ${STATUS_META[status].label}`, `k-${status}`, () => setStatus('')]);
  if (q.trim()) chips.push([`Search: “${q.trim()}”`, 'k-chip-persona', () => setQ('')]);

  return (
    <section className="filters">
      <div className="f-row">
        <div className="seg" role="radiogroup" aria-label="Persona">
          {['', ...PERSONAS].map((p) => (
            <button key={p} role="radio" aria-checked={persona === p} className={persona === p ? 'on' : ''} onClick={() => setPersona(p)}>
              <span>{p || 'All'}</span>
              {PERSONA_HINT[p] && <em>({PERSONA_HINT[p]})</em>}
            </button>
          ))}
        </div>
        <label className="area">
          <Layers />
          <span>Area: {area || 'All Areas (UI, UX, Backend…)'}</span>
          <ChevronDown />
          <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
            <option value="">All Areas</option>
            {AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
      </div>

      {chips.length > 0 && (
        <div className="f-row chips">
          {chips.map(([label, cls, clear]) => (
            <span key={label} className={`fchip ${cls}`}>
              {label}
              <button onClick={clear} aria-label={`Remove ${label}`}><Close size={7} /></button>
            </span>
          ))}
          <button className="clear-all" onClick={clearAll}>Clear all ({chips.length})</button>
        </div>
      )}

      <div className="f-row">
        <span className="showing">Showing {shown} of {total} issue{total === 1 ? '' : 's'}</span>
        <div className="view-toggle" role="radiogroup" aria-label="Density">
          <button role="radio" aria-checked={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="Comfortable"><List /></button>
          <button role="radio" aria-checked={view === 'compact'} className={view === 'compact' ? 'on' : ''} onClick={() => setView('compact')} title="Compact"><Compact /></button>
        </div>
      </div>
    </section>
  );
}

export function IssueCard({ item, selected, me, onSelect, onQuickVerify, onQuickReopen }) {
  const k = statusKey(item);
  const meta = STATUS_META[k];
  const selfFixed = me && item.fixed_by && me.toLowerCase() === item.fixed_by.toLowerCase();
  return (
    <article className={`card k-${k} ${selected ? 'sel' : ''}`} tabIndex={0} role="button" aria-pressed={selected}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(item.id); } }}>
      <div className="card-top">
        <div className="card-tags">
          <span className="code">{code(item)}</span>
          <span className="tag section">{item.section}</span>
          <span className={`tag persona p-${item.persona.toLowerCase()}`}>{item.persona}</span>
          <span className="tag area">{item.area}</span>
          {item.needs_review ? <span className="tag review" title="Section, area and persona were guessed from a plain sentence. Open it to confirm.">Needs review</span> : null}
        </div>
        <span className="pill"><i className="dot" />{meta.label}</span>
      </div>

      <h3 className="card-title">{item.description}</h3>

      {k === 'reopened' && item.reopen_note && (
        <div className="callout-red"><strong>Regression Note:</strong> {item.reopen_note}</div>
      )}

      <div className="card-foot">
        <div className="foot-l">
          <span>{item.name || 'Anonymous'}</span><span className="sep">•</span><span>{ago(item.created_at)}</span>
          {k === 'fixed' && (<><span className="sep">•</span><span className="mono ok">Resolved by {item.fixed_by}</span></>)}
        </div>
        <div className="foot-r">
          {k === 'fixed' && (
            <div className="quick-actions" onClick={(e) => e.stopPropagation()}>
              <button className="qa-verify" disabled={selfFixed} onClick={() => onQuickVerify(item)}
                title={selfFixed ? 'Someone else has to verify your fix' : 'Confirm the fix works'}>
                <Check /> Verify Fix
              </button>
              <button className="qa-reopen" onClick={() => onQuickReopen(item)}><Undo /> Reopen</button>
            </div>
          )}
          {k === 'in-progress' && item.started_by && (<span className="mono assigned"><Person /> Assigned to {item.started_by}</span>)}
          {k === 'verified' && <span className="mono">Fixed by {item.fixed_by}, verified by {item.verified_by}</span>}
          {k === 'reopened' && <span className="mono bad">Reopened by {item.reopen_by}</span>}
        </div>
      </div>
      {selected && <span className="pin" />}
    </article>
  );
}
