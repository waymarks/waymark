import { useState } from 'react';
import { Icon } from './Icon';
import { ActionRow } from './ActionRow';
import type { ActionRow as ActionRowT } from '@/api/types';
import type { SessionGroupRow } from '@/lib/format';
import { timeAgo } from '@/lib/format';

interface Props {
  group: SessionGroupRow;
  focusedId?: string | null;
  onOpen: (row: ActionRowT) => void;
}

export function SessionGroup({ group, focusedId, onOpen }: Props) {
  const [open, setOpen] = useState(group.live);
  const initials = (group.agent || '??').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <section className={`session-group ${open ? '' : 'collapsed'} ${group.live ? 'live' : ''}`}>
      <button
        className="session-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ background: 'transparent', width: '100%' }}
      >
        <div className="session-chevron" aria-hidden>
          <Icon name="chevron" size={14} />
        </div>
        <div className="session-avatar" aria-hidden>{initials}</div>
        <div className="session-summary">
          <div className="session-summary-top">
            <span>{group.summary}</span>
            {group.live && <span className="session-live-tag">live</span>}
          </div>
          <div className="session-summary-bottom">
            {group.agent}{group.model ? ` · ${group.model}` : ''} · session <code>{group.session_id}</code> · {timeAgo(group.rows[0].created_at)}
          </div>
        </div>
        <div className="session-stats">
          <span className="stat"><strong>{group.total}</strong> actions</span>
          <span className="stat"><strong>{group.writes}</strong> writes</span>
          {group.pending > 0 && <span className="stat warn"><strong>{group.pending}</strong> pending</span>}
          {group.errors > 0 && <span className="stat err"><strong>{group.errors}</strong> errors</span>}
        </div>
      </button>
      <div className="session-body">
        {group.rows.map((r) => (
          <ActionRow key={r.action_id} row={r} focused={r.action_id === focusedId} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
