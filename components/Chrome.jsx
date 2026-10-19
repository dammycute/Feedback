'use client';

import { initials } from '@/lib/ui';

const Ic = ({ n, className }) => <img className={className} src={`/icons/${n}.svg`} alt="" />;

export function Header({ me, status, setStatus, q, setQ, searchRef, exportHref, exportCount, filtered, toVerify,
  onNew, onIdentity, onPreview }) {
  const tabs = [
    ['', 'All Issues'],
    ['in-progress', 'Active'],
    ['open', 'Backlog'],
    ['verified', 'Verified'],
  ];
  return (
    <header className="header">
      <div className="hd-left">
        <div className="brand">
          <span className="brand-mark"><Ic n="logo" /></span>
          <div>
            <div className="brand-row">
              <strong>TriageOps</strong>
              <span className="brand-sub">Feedback Board</span>
            </div>
            <div className="brand-status">
              <span className="live" />
              <span>localhost:3000 · SQLite</span>
            </div>
          </div>
        </div>
        <span className="vr" />
        <label className="search">
          <Ic n="search" className="search-ic" />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search issues, sections, people…" aria-label="Search issues" />
          <kbd>⌘K</kbd>
        </label>
        <nav className="tabs" aria-label="Quick views">
          {tabs.map(([s, label]) => (
            <button key={label} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{label}</button>
          ))}
        </nav>
      </div>

      <div className="hd-right">
        <a className="btn-export" href={exportHref} download title="Export Markdown" aria-label="Export Markdown">
          <Ic n="export" />
          <span>Export Markdown</span>
          <span className="count-pill">{filtered ? 'Filtered' : 'All'} ({exportCount})</span>
        </a>
        <button className="btn-dark" onClick={onNew}>
          <Ic n="plus" />
          <span>Log Feedback</span>
        </button>
        <span className="vr short" />
        <button className="icon-btn" onClick={onPreview} aria-label="Preview Markdown output" title="Preview Markdown output">
          <Ic n="terminal" />
        </button>
        <button className="icon-btn" onClick={() => setStatus('fixed')} aria-label={`${toVerify} awaiting verification`}
          title={`${toVerify} awaiting verification`}>
          <Ic n="bell" />
          {toVerify > 0 && <span className="notif" />}
        </button>
        <button className="identity" onClick={onIdentity} title="Change your name">
          <span className="avatar">{initials(me)}</span>
          <span className="who">
            <strong>{me || 'Set your name'}</strong>
            <small>{me ? 'Signed in locally' : 'Needed to sign actions'}</small>
          </span>
        </button>
      </div>
    </header>
  );
}

export function Sidebar({ total, counts, status, setStatus, clearAll, focusSearch, onIdentity, onHelp, onSync, docLinked, reviewCount, reviewOnly, onReview }) {
  const link = (key, label, icon, opts = {}) => {
    const active = opts.active ?? status === key;
    return (
      <button className={`nav-link ${active ? 'on' : ''}`} title={label} aria-label={label} onClick={opts.onClick || (() => setStatus(key))}>
        <Ic n={icon} />
        <span>{label}</span>
        {opts.badge != null && <span className="nav-badge">{opts.badge}</span>}
        {opts.dot && <span className="nav-dot" />}
      </button>
    );
  };
  return (
    <aside className="sidebar">
      <div className="sb-top">
        <div className="workspace">
          <span className="ws-mark">LE</span>
          <div>
            <strong>Localhost Engine</strong>
            <small>SQLite • :3000</small>
          </div>
          <Ic n="chevrons" className="ws-chev" />
        </div>
        <button className="quick" onClick={focusSearch}>
          <Ic n="filter" />
          <span>Quick Filter</span>
          <kbd>F</kbd>
        </button>
        <nav className="nav" aria-label="Triage workspace">
          <div className="nav-label">Triage Workspace</div>
          {link('', 'Issues', 'nav-issues', { active: !status, badge: total, onClick: clearAll })}
          {link('open', 'Triage Inbox', 'nav-inbox', { dot: counts.open > 0 })}
          {link('fixed', 'Needs Verification', 'nav-views', { badge: counts.fixed || null })}
          {link('reopened', 'Reopened', 'nav-cycles', { badge: counts.reopened || null })}
          {reviewCount > 0 && link('', 'Needs Review', 'nav-views', { active: reviewOnly, badge: reviewCount, onClick: onReview })}
          {link('', 'Google Doc Sync', 'docs', { active: false, onClick: onSync, dot: !docLinked })}
          {link('', 'Settings', 'nav-settings', { active: false, onClick: onIdentity })}
        </nav>
      </div>
      <div className="sb-foot">
        <button onClick={onHelp}><Ic n="docs" /><span>Docs</span></button>
        <button onClick={onHelp}><Ic n="keyboard" /><span>Keyboard Shortcuts</span><kbd>?</kbd></button>
      </div>
    </aside>
  );
}

export function StatusBar({ count, today, syncedAgo, onPreview, doc, onSync }) {
  const docLabel = !doc?.docId ? 'Google Doc: not linked' : doc.lastOk ? 'Google Doc: synced' : 'Google Doc: sync failed';
  return (
    <footer className="statusbar">
      <span className="live" />
      <span>Export preview ready:</span>
      <code># Feedback Export ({today}) • Grouped by Persona &amp; Area ({count} item{count === 1 ? '' : 's'})</code>
      <span className="sb-spacer" />
      <button onClick={onPreview}>View MD Output</button>
      <span className="sync">•</span>
      <button className={`doc-state ${doc?.docId ? (doc.lastOk ? 'ok' : 'bad') : ''}`} onClick={onSync}>{docLabel}</button>
      <span className="sync">• SQLite sync {syncedAgo}</span>
    </footer>
  );
}
