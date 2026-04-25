import type { ActionRow } from '@/api/types';

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

// SQLite CURRENT_TIMESTAMP emits "YYYY-MM-DD HH:MM:SS" in UTC with no tz suffix.
// Always treat such strings as UTC, not local time.
export function parseServerDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr);
  const hasTz = s.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(s);
  const iso = hasTz ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function timeAgo(dateStr: string | null | undefined): string {
  const then = parseServerDate(dateStr);
  if (!then) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function parseInput(row: ActionRow): Record<string, unknown> {
  try { return JSON.parse(row.input_payload || '{}'); } catch { return {}; }
}

export function bashCommand(row: ActionRow): string {
  const p = parseInput(row);
  return String(p.command ?? '').trim();
}

export function basename(p: string | null | undefined): string {
  if (!p) return '';
  const clean = String(p).replace(/\\/g, '/');
  return clean.split('/').pop() || clean;
}

export function compressPath(p: string | null | undefined, keep = 3): string {
  if (!p) return '—';
  const parts = String(p).replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= keep) return String(p);
  return '…/' + parts.slice(-keep).join('/');
}

export function deriveIntent(row: ActionRow): string {
  const p = parseInput(row);
  if (row.tool_name === 'bash') {
    const cmd = String(p.command ?? '').trim();
    const verb = cmd.split(/\s+/).slice(0, 2).join(' ');
    return verb ? `Run ${verb}` : 'Run command';
  }
  if (row.tool_name === 'write_file') return 'Edit file';
  if (row.tool_name === 'read_file') return 'Read file';
  if (row.tool_name === 'delete_file') return 'Delete file';
  return row.tool_name;
}

export type RowState =
  | 'rolledback'
  | 'blocked'
  | 'rejected'
  | 'error'
  | 'pending'
  | 'approved'
  | 'ok';

export function rowState(row: ActionRow): RowState {
  if (row.rolled_back) return 'rolledback';
  if (row.status === 'blocked' || row.decision === 'block') return 'blocked';
  if (row.status === 'rejected' || row.decision === 'rejected') return 'rejected';
  if (row.status === 'error') return 'error';
  if (row.status === 'pending' || row.decision === 'pending') return 'pending';
  if (row.approved_by) return 'approved';
  return 'ok';
}

export interface SessionGroupRow {
  session_id: string;
  rows: ActionRow[];
  latest: number;
  live: boolean;
  pending: number;
  errors: number;
  writes: number;
  total: number;
  summary: string;
  agent: string;
  model: string;
  cwd: string;
  branch: string;
}

export function groupBySession(actions: ActionRow[]): SessionGroupRow[] {
  const byId = new Map<string, ActionRow[]>();
  for (const a of actions) {
    const sid = a.session_id || 'unknown';
    if (!byId.has(sid)) byId.set(sid, []);
    byId.get(sid)!.push(a);
  }
  const now = Date.now();
  const groups: SessionGroupRow[] = [];
  for (const [sid, rows] of byId.entries()) {
    const ts = (r: ActionRow) => parseServerDate(r.created_at)?.getTime() ?? 0;
    rows.sort((x, y) => ts(y) - ts(x));
    const latest = ts(rows[0]);
    const live = now - latest < 5 * 60 * 1000;
    const pending = rows.filter((r) => r.status === 'pending').length;
    const errors = rows.filter((r) => r.status === 'error' || r.status === 'blocked' || r.status === 'rejected').length;
    const writes = rows.filter((r) => r.tool_name === 'write_file' && !r.rolled_back).length;
    const headline = rows.find((r) => r.event_type !== 'observation') ?? rows[0];
    groups.push({
      session_id: sid,
      rows,
      latest,
      live,
      pending,
      errors,
      writes,
      total: rows.length,
      summary: deriveIntent(headline),
      agent: 'agent',
      model: '',
      cwd: '',
      branch: '',
    });
  }
  groups.sort((a, b) => b.latest - a.latest);
  return groups;
}

export function simpleLineDiff(a: string | null | undefined, b: string | null | undefined) {
  const al = (a || '').split('\n');
  const bl = (b || '').split('\n');
  const out: Array<{ l: string; r: string; t: 'eq' | 'ch' | 'add' | 'del' }> = [];
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < max; i++) {
    const x = al[i];
    const y = bl[i];
    if (x === y) out.push({ l: x || '', r: y || '', t: 'eq' });
    else if (x !== undefined && y !== undefined) out.push({ l: x, r: y, t: 'ch' });
    else if (x !== undefined) out.push({ l: x, r: '', t: 'del' });
    else out.push({ l: '', r: y ?? '', t: 'add' });
  }
  return out;
}
