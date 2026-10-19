'use client';

import { useCallback, useEffect, useState } from 'react';

export const AREAS = ['UI', 'UX', 'Frontend', 'Backend', 'API', 'Performance', 'Other'];
export const PERSONAS = ['Fixer', 'Clients', 'Both'];
export const PERSONA_HINT = { Fixer: 'Engineers', Clients: 'End Users' };

// Display status. "reopened" is an open item whose fix failed verification.
export const STATUS_META = {
  open: { label: 'Open', chip: 'Needs dev', sub: 'unassigned' },
  'in-progress': { label: 'In Progress', sub: 'active sprint' },
  fixed: { label: 'Fixed (Awaiting Verify)', short: 'Fixed (Verify)', long: 'Fixed (Needs Verification)', sub: 'awaiting peer' },
  verified: { label: 'Verified', sub: 'signed off' },
  reopened: { label: 'Reopened', chip: 'Fix failed', sub: 'regression' },
};
export const STATUS_KEYS = ['open', 'in-progress', 'fixed', 'verified', 'reopened'];

export const statusKey = (i) => (i.status === 'open' && i.reopened_ever ? 'reopened' : i.status);
export const code = (i) => `#FB-${i.id}`;
export const initials = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

const parse = (sql) => new Date(sql.replace(' ', 'T') + 'Z');

export function ago(sql) {
  const mins = Math.max(0, Math.round((Date.now() - parse(sql).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(mins / 1440);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}

export const day = (sql) => parse(sql).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Who is using the board. Stored per browser; used to sign workflow actions.
export function useIdentity() {
  const [name, setName] = useState('');
  useEffect(() => {
    try { setName(localStorage.getItem('fb-name') || ''); } catch {}
  }, []);
  const save = useCallback((n) => {
    const v = n.trim().slice(0, 60);
    setName(v);
    try { localStorage.setItem('fb-name', v); } catch {}
  }, []);
  return [name, save];
}
