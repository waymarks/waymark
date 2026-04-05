import { ActionRow } from '../db/database';

function parseIso(iso: string): Date {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const withZ = normalized.endsWith('Z') ? normalized : normalized + 'Z';
  return new Date(withZ);
}

export async function notifyPendingAction(action: ActionRow): Promise<void> {
  const webhookUrl = process.env.WAYMARK_SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const baseUrl = process.env.WAYMARK_BASE_URL || 'http://localhost:3001';
  const dashboardUrl = `${baseUrl}/action/${action.action_id}`;

  const timeAgo = (() => {
    const diff = Math.floor((Date.now() - parseIso(action.created_at).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  })();

  const body = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '⏳ Waymark — Approval Required', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Tool:*\n${action.tool_name}` },
          { type: 'mrkdwn', text: `*Path:*\n${action.target_path || '—'}` },
          { type: 'mrkdwn', text: `*Rule:*\n${action.matched_rule || '—'}` },
          { type: 'mrkdwn', text: `*Time:*\n${timeAgo}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View in Dashboard', emoji: true },
            url: dashboardUrl,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve', emoji: true },
            style: 'primary',
            action_id: 'waymark_approve',
            value: action.action_id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Reject', emoji: true },
            style: 'danger',
            action_id: 'waymark_reject',
            value: action.action_id,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      process.stderr.write(`Waymark Slack notification failed: ${res.status} ${res.statusText}\n`);
    }
  } catch (err: any) {
    process.stderr.write(`Waymark Slack notification error: ${err.message}\n`);
  }
}
