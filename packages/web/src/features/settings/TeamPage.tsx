import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useAddTeamMember, useRemoveTeamMember, useTeam } from '@/api/hooks';
import { timeAgo } from '@/lib/format';

export function TeamPage() {
  const { data: members = [], isLoading, isError, error } = useTeam();
  const add = useAddTeamMember();
  const remove = useRemoveTeamMember();

  const [memberId, setMemberId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [slack, setSlack] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const reset = () => { setMemberId(''); setName(''); setEmail(''); setSlack(''); };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId.trim() || !name.trim() || !email.trim()) return;
    add.mutate(
      { member_id: memberId.trim(), name: name.trim(), email: email.trim(), slack_id: slack.trim() || undefined },
      { onSuccess: reset },
    );
  };

  return (
    <>
      <h2>Team</h2>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Add member</div>
            <div className="card-sub">Members can be referenced from approval routes and escalation targets by their member id.</div>
          </div>
        </header>
        <form className="card-body" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="m-id">Member id</label>
              <input id="m-id" required value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="alice" />
            </div>
            <div className="field">
              <label htmlFor="m-name">Name</label>
              <input id="m-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice Wong" />
            </div>
            <div className="field">
              <label htmlFor="m-email">Email</label>
              <input id="m-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@waymark.dev" />
            </div>
            <div className="field">
              <label htmlFor="m-slack">Slack id (optional)</label>
              <input id="m-slack" value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="U01ABCD23" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn primary" type="submit" disabled={add.isPending}>
              <Icon name="plus" size={12} /> {add.isPending ? 'Adding…' : 'Add member'}
            </button>
            <button className="btn ghost" type="button" onClick={reset} disabled={add.isPending}>Reset</button>
          </div>
        </form>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Members</div>
            <div className="card-sub">{members.length} active</div>
          </div>
        </header>
        {isError ? (
          <div className="banner err" style={{ margin: 18 }}>
            Couldn't load team. {error instanceof Error ? error.message : ''}
          </div>
        ) : isLoading && members.length === 0 ? (
          <ListSkeleton />
        ) : members.length === 0 ? (
          <EmptyBlock title="No members yet." sub="Add at least one member before configuring approval routes." />
        ) : (
          <ul className="list">
            {members.map((m) => (
              <li key={m.member_id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-title">
                    {m.name} <span className="muted mono" style={{ fontSize: 11 }}>· {m.member_id}</span>
                  </div>
                  <div className="list-sub">
                    {m.email}{m.slack_id ? ` · slack ${m.slack_id}` : ''} · added {timeAgo(m.added_at)}
                  </div>
                </div>
                <button
                  className="btn ghost"
                  aria-label={`Remove ${m.name}`}
                  onClick={() => setConfirmRemove(m.member_id)}
                  disabled={remove.isPending}
                >
                  <Icon name="trash" size={12} /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={confirmRemove !== null}
        title="Remove this team member?"
        body={<span>They'll stop appearing in approval routes and escalation targets.</span>}
        confirmLabel="Remove"
        tone="danger"
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) remove.mutate(confirmRemove);
          setConfirmRemove(null);
        }}
      />
    </>
  );
}

function ListSkeleton() {
  return (
    <ul className="list">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} style={{ display: 'block' }}>
          <div className="skeleton" style={{ width: '40%', height: 12, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: '70%', height: 10 }} />
        </li>
      ))}
    </ul>
  );
}

function EmptyBlock({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="empty" style={{ margin: 18 }}>
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
}
