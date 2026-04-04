const BASE = 'http://localhost:3001';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function truncate(str: string, len: number): string {
  if (!str) return '—';
  const s = str.split('/').pop() || str;
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

function pad(str: string, len: number): string {
  return str.padEnd(len).slice(0, len);
}

export async function run(): Promise<void> {
  const args = process.argv.slice(3);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 20 : 20;
  const pendingOnly = args.includes('--pending');
  const blockedOnly = args.includes('--blocked');

  let rows: any[];
  try {
    const res = await fetch(`${BASE}/api/actions`);
    if (!res.ok) throw new Error('Bad response');
    rows = await res.json() as any[];
  } catch {
    console.log('Waymark is not running. Start with: waymark start');
    return;
  }

  if (pendingOnly) rows = rows.filter((r: any) => r.status === 'pending');
  if (blockedOnly) rows = rows.filter((r: any) => r.status === 'blocked');
  rows = rows.slice(0, limit);

  if (rows.length === 0) {
    console.log('No actions found.');
    return;
  }

  console.log(
    pad('Time', 10) + '  ' +
    pad('Tool', 12) + '  ' +
    pad('Path / Command', 40) + '  ' +
    pad('Decision', 10) + '  ' +
    'Status'
  );
  console.log('─'.repeat(86));

  for (const r of rows) {
    const target = r.target_path
      ? truncate(r.target_path, 40)
      : truncate(JSON.parse(r.input_payload || '{}').command || '—', 40);
    console.log(
      pad(relativeTime(r.created_at), 10) + '  ' +
      pad(r.tool_name, 12) + '  ' +
      pad(target, 40) + '  ' +
      pad(r.decision || '—', 10) + '  ' +
      r.status
    );
  }
}
