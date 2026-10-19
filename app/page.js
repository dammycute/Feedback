'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header, Sidebar, StatusBar } from '@/components/Chrome';
import { StatCards, FilterBar, IssueCard } from '@/components/Board';
import Detail from '@/components/Detail';
import { NewFeedback, IdentityModal, HelpModal, PreviewModal, SyncModal } from '@/components/Modals';
import { STATUS_KEYS, statusKey, useIdentity } from '@/lib/ui';

export default function Home() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [syncedAt, setSyncedAt] = useState(0);
  const [, tick] = useState(0);

  const [persona, setPersona] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false); // only entries auto-sorted from plain sentences
  const [view, setView] = useState('list');

  const [selectedId, setSelectedId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false); // narrow screens show the detail as an overlay
  const [focusNonce, setFocusNonce] = useState(0);
  const [modal, setModal] = useState(null); // 'new' | 'identity' | 'help' | 'preview'
  const [toast, setToast] = useState('');
  const [me, saveMe] = useIdentity();
  const searchRef = useRef();
  const toastTimer = useRef();
  const didAutoSelect = useRef(false);

  const [doc, setDoc] = useState(null); // Google Doc link + last sync result

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([
      fetch('/api/feedback', { cache: 'no-store' }),
      fetch('/api/sync', { cache: 'no-store' }).catch(() => null),
    ]);
    const j = await r.json();
    setItems(j.items);
    if (d?.ok) setDoc(await d.json());
    setLoaded(true);
    setSyncedAt(Date.now());
  }, []);

  // Initial load, then poll so a teammate's changes show up without a refresh.
  // An open board also nudges the Google Doc sync once a minute. There is no background timer on the server
  // (Vercel only runs code per request), and the server skips the nudge if a sync already ran in the last minute.
  useEffect(() => {
    load();
    const nudge = () => fetch('/api/sync?auto=1', { method: 'POST' }).catch(() => {});
    nudge();
    const poll = setInterval(load, 20000);
    const sync = setInterval(nudge, 60000);
    const clock = setInterval(() => tick((n) => n + 1), 5000);
    return () => { clearInterval(poll); clearInterval(sync); clearInterval(clock); };
  }, [load]);

  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
    for (const i of items) c[statusKey(i)]++;
    return c;
  }, [items]);

  const reviewCount = useMemo(() => items.filter((i) => i.needs_review).length, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) =>
      (!reviewOnly || i.needs_review) &&
      (!persona || i.persona === persona) &&
      (!area || i.area === area) &&
      (!status || statusKey(i) === status) &&
      (!needle || `${i.section} ${i.description} ${i.name || ''}`.toLowerCase().includes(needle)));
  }, [items, persona, area, status, q, reviewOnly]);

  const hasFilters = Boolean(persona || area || status || q.trim() || reviewOnly);
  const clearAll = useCallback(() => { setPersona(''); setArea(''); setStatus(''); setQ(''); setReviewOnly(false); }, []);

  // Same filter semantics as the server, so the export matches what is on screen.
  const exportQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (persona) p.set('persona', persona);
    if (area) p.set('area', area);
    if (status) p.set('status', status);
    if (q.trim()) p.set('q', q.trim());
    return p.toString();
  }, [persona, area, status, q]);

  // Select the newest issue the first time data arrives so the detail pane is never empty on desktop.
  useEffect(() => {
    if (loaded && !didAutoSelect.current && items.length) {
      didAutoSelect.current = true;
      setSelectedId(items[0].id);
    }
  }, [loaded, items]);

  const selected = items.find((i) => i.id === selectedId) || null;

  const select = (id) => { setSelectedId(id); setDetailOpen(true); };

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); return; }
      const t = e.target;
      if (t.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey || modal) return;
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setModal('new'); }
      else if (e.key === '?') setModal('help');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  async function quickVerify(item) {
    if (!me) return setModal('identity');
    const r = await fetch(`/api/feedback/${item.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', actor: me, note: '' }),
    });
    const j = await r.json();
    if (!r.ok) return say(j.error);
    say(`${`#FB-${item.id}`} verified`);
    load();
  }

  const quickReopen = (item) => { select(item.id); setFocusNonce((n) => n + 1); };

  const onChanged = (action) => {
    const msg = { edit: 'Details saved', start: 'Work started', fix: 'Marked fixed, awaiting verification', verify: 'Fix verified', reopen: 'Issue reopened', note: 'Note added' }[action];
    if (msg) say(msg);
    load();
  };

  const nextIssue = () => {
    const list = filtered.length ? filtered : items;
    const idx = list.findIndex((i) => i.id === selectedId);
    const n = list[(idx + 1) % list.length];
    if (n) setSelectedId(n.id);
  };

  async function remove() {
    if (!selected || !confirm(`Delete #FB-${selected.id} and its history? This cannot be undone.`)) return;
    await fetch(`/api/feedback/${selected.id}`, { method: 'DELETE' });
    setSelectedId(null); setDetailOpen(false);
    say('Issue deleted');
    load();
  }

  const syncedAgo = !syncedAt ? '…' : (() => {
    const s = Math.max(0, Math.round((Date.now() - syncedAt) / 1000));
    return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
  })();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="app">
      <Header me={me} status={status} setStatus={setStatus} q={q} setQ={setQ} searchRef={searchRef}
        exportHref={`/api/export?${exportQuery}`} exportCount={filtered.length} filtered={hasFilters}
        toVerify={counts.fixed} onNew={() => setModal('new')} onIdentity={() => setModal('identity')}
        onPreview={() => setModal('preview')} />

      <div className="body">
        <Sidebar total={items.length} counts={counts} status={status} setStatus={setStatus} clearAll={clearAll}
          focusSearch={() => searchRef.current?.focus()} onIdentity={() => setModal('identity')} onHelp={() => setModal('help')}
          onSync={() => setModal('sync')} docLinked={Boolean(doc?.docId)}
          reviewCount={reviewCount} reviewOnly={reviewOnly} onReview={() => setReviewOnly((v) => !v)} />

        <div className="main-col">
          <main className="main">
            <StatCards total={items.length} counts={counts} status={status} setStatus={setStatus} />
            <FilterBar persona={persona} setPersona={setPersona} area={area} setArea={setArea} status={status}
              setStatus={setStatus} q={q} setQ={setQ} shown={filtered.length} total={items.length}
              view={view} setView={setView} clearAll={clearAll} reviewOnly={reviewOnly} setReviewOnly={setReviewOnly} />

            <div className={`split ${detailOpen ? 'detail-open' : ''}`}>
              <div className={`feed ${view}`}>
                {!loaded && <div className="empty">Loading…</div>}
                {loaded && filtered.length === 0 && (
                  <div className="empty">
                    <div className="empty-ic">✎</div>
                    <h2>{hasFilters ? 'No issues match these filters' : 'No feedback yet'}</h2>
                    <p>{hasFilters ? 'Try removing a filter.' : 'Log the first piece of feedback to get started.'}</p>
                    {hasFilters
                      ? <button className="btn-soft" onClick={clearAll}>Clear all filters</button>
                      : <button className="btn-dark" onClick={() => setModal('new')}>Log Feedback</button>}
                  </div>
                )}
                {filtered.map((i) => (
                  <IssueCard key={i.id} item={i} me={me} selected={i.id === selectedId}
                    onSelect={select} onQuickVerify={quickVerify} onQuickReopen={quickReopen} />
                ))}
              </div>

              {selected ? (
                <Detail key={selected.id} item={selected} me={me} focusNonce={focusNonce}
                  needName={() => setModal('identity')} onChanged={onChanged}
                  onClose={() => { setSelectedId(null); setDetailOpen(false); }} onNext={nextIssue} onDelete={remove} />
              ) : (
                <aside className="detail empty-detail">
                  <p>Select an issue to see its history and verify or reopen it.</p>
                </aside>
              )}
            </div>
          </main>
          <StatusBar count={filtered.length} today={today} syncedAgo={syncedAgo} onPreview={() => setModal('preview')}
            doc={doc} onSync={() => setModal('sync')} />
        </div>
      </div>

      {modal === 'new' && <NewFeedback me={me} onClose={() => setModal(null)}
        onSaved={(row) => { setModal(null); say('Feedback logged'); setSelectedId(row.id); didAutoSelect.current = true; load(); }} />}
      {modal === 'identity' && <IdentityModal me={me} onSave={saveMe} onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'preview' && <PreviewModal query={exportQuery} onClose={() => setModal(null)} />}
      {modal === 'sync' && <SyncModal onClose={() => setModal(null)} onSynced={load} />}
      <div className={`toast ${toast ? 'show' : ''}`} role="status">{toast}</div>
    </div>
  );
}
