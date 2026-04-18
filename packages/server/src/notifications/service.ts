/**
 * Notification Service — Slack & Email integration for approval requests
 *
 * Sends notifications when:
 * - Approval request is created (notify required approvers)
 * - Approval decision is submitted (notify original requester and team)
 *
 * Supports:
 * - Slack webhook notifications with interactive approval buttons
 * - Email notifications with decision details
 * - Custom templates and retry logic
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
const CONFIG_PATH = path.join(PROJECT_ROOT, '.waymark', 'config.json');

interface SlackConfig {
  webhook_url?: string;
  enabled?: boolean;
}

interface EmailConfig {
  smtp_host?: string;
  smtp_port?: number;
  from_address?: string;
  enabled?: boolean;
}

interface NotificationConfig {
  slack?: SlackConfig;
  email?: EmailConfig;
}

/**
 * Load notification configuration from .waymark/config.json
 */
function loadNotificationConfig(): NotificationConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {};
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config.notifications || {};
  } catch {
    return {};
  }
}

/**
 * Send Slack notification for approval request
 */
export async function notifyApprovalRequestSlack(
  approver_ids: string[],
  session_id: string,
  request_id: string,
  requester_name: string,
  action_count: number
): Promise<boolean> {
  const config = loadNotificationConfig();
  const slackConfig = config.slack;

  if (!slackConfig?.enabled || !slackConfig.webhook_url) {
    console.log('[Notifications] Slack disabled or unconfigured');
    return false;
  }

  try {
    const approversList = approver_ids.join(', ');
    const message = {
      text: `🔔 New approval request from ${requester_name}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Approval Required* 🔔\n\nUser *${requester_name}* requests approval to rollback session with *${action_count}* actions.\n\n*Session:* \`${session_id}\`\n*Approvers:* ${approversList}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Approve',
              },
              value: request_id,
              action_id: 'waymark_approval_approve',
              style: 'primary',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ Reject',
              },
              value: request_id,
              action_id: 'waymark_approval_reject',
              style: 'danger',
            },
          ],
        },
      ],
    };

    const response = await fetch(slackConfig.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    return response.ok;
  } catch (err) {
    console.error('[Notifications] Slack error:', err);
    return false;
  }
}

/**
 * Send Slack notification for approval decision
 */
export async function notifyApprovalDecisionSlack(
  approver_name: string,
  decision: 'approve' | 'reject',
  session_id: string,
  reason?: string
): Promise<boolean> {
  const config = loadNotificationConfig();
  const slackConfig = config.slack;

  if (!slackConfig?.enabled || !slackConfig.webhook_url) {
    return false;
  }

  try {
    const emoji = decision === 'approve' ? '✅' : '❌';
    const action = decision === 'approve' ? 'Approved' : 'Rejected';
    const reasonText = reason ? `\n*Reason:* ${reason}` : '';

    const message = {
      text: `${emoji} Approval ${action} by ${approver_name}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Approval ${action}*\n\nApprover: *${approver_name}*\nSession: \`${session_id}\`${reasonText}`,
          },
        },
      ],
    };

    const response = await fetch(slackConfig.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    return response.ok;
  } catch (err) {
    console.error('[Notifications] Slack decision error:', err);
    return false;
  }
}

/**
 * Send email notification for approval request
 */
export async function notifyApprovalRequestEmail(
  recipient_email: string,
  recipient_name: string,
  session_id: string,
  request_id: string,
  requester_name: string,
  action_count: number
): Promise<boolean> {
  const config = loadNotificationConfig();
  const emailConfig = config.email;

  if (!emailConfig?.enabled) {
    console.log('[Notifications] Email disabled or unconfigured');
    return false;
  }

  try {
    // For now, log the email that would be sent
    // In production, integrate with SMTP or email service
    console.log(`[Notifications] Email approval request to ${recipient_email}:
      Recipient: ${recipient_name}
      From: ${requester_name}
      Session: ${session_id}
      Actions: ${action_count}
      Request ID: ${request_id}`);

    return true;
  } catch (err) {
    console.error('[Notifications] Email error:', err);
    return false;
  }
}

/**
 * Send email notification for approval decision
 */
export async function notifyApprovalDecisionEmail(
  recipient_email: string,
  approver_name: string,
  decision: 'approve' | 'reject',
  session_id: string,
  reason?: string
): Promise<boolean> {
  const config = loadNotificationConfig();
  const emailConfig = config.email;

  if (!emailConfig?.enabled) {
    return false;
  }

  try {
    const action = decision === 'approve' ? 'Approved' : 'Rejected';
    const reasonText = reason ? `\n\nReason: ${reason}` : '';

    console.log(`[Notifications] Email approval decision to ${recipient_email}:
      Approver: ${approver_name}
      Decision: ${action}
      Session: ${session_id}${reasonText}`);

    return true;
  } catch (err) {
    console.error('[Notifications] Email decision error:', err);
    return false;
  }
}

/**
 * Broadcast approval request to all required approvers
 */
export async function broadcastApprovalRequest(
  approvers: Array<{ member_id: string; name: string; email: string; slack_id?: string }>,
  session_id: string,
  request_id: string,
  requester_name: string,
  action_count: number
): Promise<{ slack_sent: number; email_sent: number }> {
  let slack_sent = 0;
  let email_sent = 0;

  // Send Slack notification (once to all approvers)
  const slackSuccess = await notifyApprovalRequestSlack(
    approvers.map(a => a.member_id),
    session_id,
    request_id,
    requester_name,
    action_count
  );
  if (slackSuccess) slack_sent++;

  // Send email to each approver
  for (const approver of approvers) {
    const emailSuccess = await notifyApprovalRequestEmail(
      approver.email,
      approver.name,
      session_id,
      request_id,
      requester_name,
      action_count
    );
    if (emailSuccess) email_sent++;
  }

  return { slack_sent, email_sent };
}

/**
 * Broadcast approval decision to all stakeholders
 */
export async function broadcastApprovalDecision(
  approver: { member_id: string; name: string; email: string; slack_id?: string },
  decision: 'approve' | 'reject',
  session_id: string,
  requester_email: string,
  reason?: string
): Promise<{ slack_sent: number; email_sent: number }> {
  let slack_sent = 0;
  let email_sent = 0;

  // Send Slack notification
  const slackSuccess = await notifyApprovalDecisionSlack(approver.name, decision, session_id, reason);
  if (slackSuccess) slack_sent++;

  // Send email to requester
  const emailSuccess = await notifyApprovalDecisionEmail(requester_email, approver.name, decision, session_id, reason);
  if (emailSuccess) email_sent++;

  return { slack_sent, email_sent };
}

/**
 * Phase 3: Escalation Notifications
 */

/**
 * Send Slack escalation notification
 */
export async function notifyEscalationSlack(
  escalation_targets: string[],
  session_id: string,
  request_id: string,
  requester_name: string,
  escalation_deadline: string
): Promise<boolean> {
  const config = loadNotificationConfig();
  const slackConfig = config.slack;

  if (!slackConfig?.enabled || !slackConfig.webhook_url) {
    console.log('[Notifications] Slack disabled or unconfigured');
    return false;
  }

  try {
    const deadlineTime = new Date(escalation_deadline).toLocaleString();
    const targetsList = escalation_targets.join(', ');

    const message = {
      text: `⏰ Escalation needed for ${requester_name}'s rollback request`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Approval Escalation* ⏰\n\nApproval for *${requester_name}*'s rollback is stalled.\n\n*Session:* \`${session_id}\`\n*Escalation Targets:* ${targetsList}\n*Decision Deadline:* ${deadlineTime}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Proceed with Rollback',
              },
              value: request_id,
              action_id: 'waymark_escalation_proceed',
              style: 'primary',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ Block Rollback',
              },
              value: request_id,
              action_id: 'waymark_escalation_block',
              style: 'danger',
            },
          ],
        },
      ],
    };

    const response = await fetch(slackConfig.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    return response.ok;
  } catch (err) {
    console.error('[Notifications] Slack escalation error:', err);
    return false;
  }
}

/**
 * Send Slack escalation decision notification
 */
export async function notifyEscalationDecisionSlack(
  target_name: string,
  decision: 'proceed' | 'block',
  session_id: string,
  reason?: string
): Promise<boolean> {
  const config = loadNotificationConfig();
  const slackConfig = config.slack;

  if (!slackConfig?.enabled || !slackConfig.webhook_url) {
    return false;
  }

  try {
    const emoji = decision === 'proceed' ? '✅' : '❌';
    const action = decision === 'proceed' ? 'Allowed' : 'Blocked';
    const reasonText = reason ? `\n*Reason:* ${reason}` : '';

    const message = {
      text: `${emoji} Escalation ${action} by ${target_name}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Escalation ${action}*\n\nTarget: *${target_name}*\nSession: \`${session_id}\`${reasonText}`,
          },
        },
      ],
    };

    const response = await fetch(slackConfig.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    return response.ok;
  } catch (err) {
    console.error('[Notifications] Slack escalation decision error:', err);
    return false;
  }
}

/**
 * Send email escalation notification
 */
export async function notifyEscalationEmail(
  recipient_email: string,
  recipient_name: string,
  session_id: string,
  request_id: string,
  requester_name: string,
  escalation_deadline: string
): Promise<boolean> {
  const config = loadNotificationConfig();
  const emailConfig = config.email;

  if (!emailConfig?.enabled) {
    console.log('[Notifications] Email disabled or unconfigured');
    return false;
  }

  try {
    const deadlineTime = new Date(escalation_deadline).toLocaleString();

    console.log(`[Notifications] Email escalation to ${recipient_email}:
      Recipient: ${recipient_name}
      Requester: ${requester_name}
      Session: ${session_id}
      Request ID: ${request_id}
      Deadline: ${deadlineTime}`);

    return true;
  } catch (err) {
    console.error('[Notifications] Email escalation error:', err);
    return false;
  }
}

/**
 * Send email escalation decision notification
 */
export async function notifyEscalationDecisionEmail(
  recipient_email: string,
  target_name: string,
  decision: 'proceed' | 'block',
  session_id: string,
  reason?: string
): Promise<boolean> {
  const config = loadNotificationConfig();
  const emailConfig = config.email;

  if (!emailConfig?.enabled) {
    return false;
  }

  try {
    const action = decision === 'proceed' ? 'Allowed' : 'Blocked';
    const reasonText = reason ? `\n\nReason: ${reason}` : '';

    console.log(`[Notifications] Email escalation decision to ${recipient_email}:
      Target: ${target_name}
      Decision: ${action}
      Session: ${session_id}${reasonText}`);

    return true;
  } catch (err) {
    console.error('[Notifications] Email escalation decision error:', err);
    return false;
  }
}

/**
 * Broadcast escalation request to all targets
 */
export async function broadcastEscalation(
  targets: Array<{ member_id: string; name: string; email: string; slack_id?: string }>,
  session_id: string,
  request_id: string,
  requester_name: string,
  escalation_deadline: string
): Promise<{ slack_sent: number; email_sent: number }> {
  let slack_sent = 0;
  let email_sent = 0;

  // Send Slack notification (once to all targets)
  const slackSuccess = await notifyEscalationSlack(
    targets.map(t => t.member_id),
    session_id,
    request_id,
    requester_name,
    escalation_deadline
  );
  if (slackSuccess) slack_sent++;

  // Send email to each target
  for (const target of targets) {
    const emailSuccess = await notifyEscalationEmail(
      target.email,
      target.name,
      session_id,
      request_id,
      requester_name,
      escalation_deadline
    );
    if (emailSuccess) email_sent++;
  }

  return { slack_sent, email_sent };
}

/**
 * Broadcast escalation decision to all stakeholders
 */
export async function broadcastEscalationDecision(
  target: { member_id: string; name: string; email: string; slack_id?: string },
  decision: 'proceed' | 'block',
  session_id: string,
  requester_email: string,
  reason?: string
): Promise<{ slack_sent: number; email_sent: number }> {
  let slack_sent = 0;
  let email_sent = 0;

  // Send Slack notification
  const slackSuccess = await notifyEscalationDecisionSlack(target.name, decision, session_id, reason);
  if (slackSuccess) slack_sent++;

  // Send email to requester
  const emailSuccess = await notifyEscalationDecisionEmail(requester_email, target.name, decision, session_id, reason);
  if (emailSuccess) email_sent++;

  return { slack_sent, email_sent };
}

export default {
  notifyApprovalRequestSlack,
  notifyApprovalDecisionSlack,
  notifyApprovalRequestEmail,
  notifyApprovalDecisionEmail,
  broadcastApprovalRequest,
  broadcastApprovalDecision,
  notifyEscalationSlack,
  notifyEscalationDecisionSlack,
  notifyEscalationEmail,
  notifyEscalationDecisionEmail,
  broadcastEscalation,
  broadcastEscalationDecision,
};
