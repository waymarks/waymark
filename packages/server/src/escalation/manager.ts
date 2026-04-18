/**
 * Escalation Manager — Core logic for approval escalation
 *
 * Responsibilities:
 * - Check for stalled approval requests
 * - Create escalation requests when approvals timeout
 * - Determine escalation targets
 * - Process escalation decisions
 * - Track escalation history and audit trail
 *
 * Integration with Phase 2 Approval System:
 * - Monitors approval_requests for timeout
 * - Creates escalation_requests when deadline passed
 * - Prevents rollback if escalation is blocked
 */

import {
  getAllEscalationRules,
  createEscalationRequest,
  getEscalationRequest,
  getPendingEscalations,
  getStaleApprovals,
  submitEscalationDecision as dbSubmitEscalationDecision,
  getEscalationDecisions,
  getEscalationHistory,
  EscalationRule,
  EscalationRequest,
  getApprovalRequest,
} from '../db/database';

/**
 * Escalation flow:
 * 1. Approval request created → deadline = now + timeout_hours
 * 2. Scheduler checks for stale approvals every minute
 * 3. If approval past deadline → create escalation request
 * 4. Notify escalation targets (managers, leads)
 * 5. Wait for escalation decisions
 * 6. If any "block" decision → prevent rollback
 * 7. If all "proceed" decisions → allow rollback
 * 8. Record in audit trail
 */

export interface EscalationCheckResult {
  hasStaleApprovals: boolean;
  staleApprovals: Array<{ approval_request_id: string; session_id: string }>;
  escalationsCreated: string[];
  timestamp: string;
}

export interface EscalationStatusResult {
  request_id: string;
  status: 'pending' | 'proceeded' | 'blocked';
  escalation_triggered_at: string;
  escalation_deadline: string;
  targets_count: number;
  decisions_received: number;
  decisions: Array<{
    target_id: string;
    decision: string;
    reason?: string;
  }>;
  can_proceed: boolean; // true if all targets approved proceeding
}

/**
 * Check for stalled approval requests and trigger escalations
 * Called periodically by scheduler (e.g., every minute)
 */
export function checkAndEscalateStaleApprovals(): EscalationCheckResult {
  const now = new Date().toISOString();
  const staleApprovals = getStaleApprovals(now);
  const rules = getAllEscalationRules();
  const escalationsCreated: string[] = [];

  for (const approval of staleApprovals) {
    // For now, use default rule (escalate to all-targets rule if exists)
    // In future, could match escalation rules based on approval attributes
    const rule = rules.length > 0 ? rules[0] : null;
    if (!rule) continue;

    const escalationTargets = JSON.parse(rule.escalation_targets) as string[];
    const deadline = new Date(now);
    deadline.setHours(deadline.getHours() + rule.timeout_hours);

    const requestId = `escalation-${approval.approval_request_id}-${Date.now()}`;

    try {
      createEscalationRequest(
        requestId,
        approval.approval_request_id,
        approval.session_id,
        escalationTargets,
        deadline.toISOString()
      );
      escalationsCreated.push(requestId);
    } catch (err) {
      console.error(`Failed to create escalation for ${approval.approval_request_id}:`, err);
    }
  }

  return {
    hasStaleApprovals: staleApprovals.length > 0,
    staleApprovals,
    escalationsCreated,
    timestamp: now,
  };
}

/**
 * Determine escalation targets for a given approval request
 */
export function determineEscalationTargets(approval_request_id: string): string[] {
  const rules = getAllEscalationRules();

  // Simple logic: use first active rule's targets
  // In future, could match based on approval attributes (session type, user, etc)
  if (rules.length > 0) {
    return JSON.parse(rules[0].escalation_targets) as string[];
  }

  return [];
}

/**
 * Submit escalation decision
 */
export function submitEscalationDecision(
  escalation_request_id: string,
  target_id: string,
  decision: 'proceed' | 'block',
  reason?: string
): EscalationStatusResult {
  const escalation = getEscalationRequest(escalation_request_id);
  if (!escalation) {
    throw new Error(`Escalation request ${escalation_request_id} not found`);
  }

  const targets = JSON.parse(escalation.escalation_targets) as string[];
  if (!targets.includes(target_id)) {
    throw new Error(`${target_id} is not authorized to decide on this escalation`);
  }

  // Check if already decided by this target
  const existingDecisions = getEscalationDecisions(escalation_request_id);
  if (existingDecisions.some(d => d.target_id === target_id)) {
    throw new Error(`${target_id} has already made a decision on this escalation`);
  }

  // Record decision
  const decision_id = `escalation-decision-${escalation_request_id}-${target_id}-${Date.now()}`;
  dbSubmitEscalationDecision(decision_id, escalation_request_id, target_id, decision, reason);

  // Return updated status
  return getEscalationStatus(escalation_request_id);
}

/**
 * Get escalation status
 */
export function getEscalationStatus(escalation_request_id: string): EscalationStatusResult {
  const escalation = getEscalationRequest(escalation_request_id);
  if (!escalation) {
    throw new Error(`Escalation request ${escalation_request_id} not found`);
  }

  const decisions = getEscalationDecisions(escalation_request_id);
  const targets = JSON.parse(escalation.escalation_targets) as string[];

  const blockDecisions = decisions.filter(d => d.decision === 'block');
  const proceedDecisions = decisions.filter(d => d.decision === 'proceed');

  // Status logic:
  // - If any "block" → blocked
  // - If all targets have decided with no blocks → proceeded
  // - Otherwise → pending
  let status: 'pending' | 'proceeded' | 'blocked' = 'pending';
  if (blockDecisions.length > 0) {
    status = 'blocked';
  } else if (proceedDecisions.length === targets.length) {
    status = 'proceeded';
  }

  return {
    request_id: escalation_request_id,
    status,
    escalation_triggered_at: escalation.escalation_triggered_at || new Date().toISOString(),
    escalation_deadline: escalation.escalation_deadline,
    targets_count: targets.length,
    decisions_received: decisions.length,
    decisions: decisions.map(d => ({
      target_id: d.target_id,
      decision: d.decision,
      reason: d.reason ?? undefined,
    })),
    can_proceed: status === 'proceeded',
  };
}

/**
 * Check if rollback can proceed given escalation status
 * If escalation exists and is blocked, prevent rollback
 */
export function canProceedWithRollbackAfterEscalation(approval_request_id: string): boolean {
  const pending = getPendingEscalations();
  const escalation = pending.find(e => e.approval_request_id === approval_request_id);

  if (!escalation) {
    // No pending escalation → can proceed
    return true;
  }

  // Check escalation status
  try {
    const status = getEscalationStatus(escalation.request_id);
    return status.can_proceed;
  } catch {
    // If error getting status, be conservative and block
    return false;
  }
}

/**
 * Get escalation history for a session
 */
export function getEscalationHistoryForSession(session_id: string): EscalationRequest[] {
  return getEscalationHistory(session_id);
}

/**
 * Scheduler for checking stale approvals
 * Should be called periodically (e.g., every 1-5 minutes)
 */
export interface SchedulerConfig {
  interval_ms: number; // How often to check for stale approvals
  enabled: boolean;
}

let schedulerHandle: NodeJS.Timeout | null = null;

export function startEscalationScheduler(config: SchedulerConfig = { interval_ms: 60000, enabled: true }): void {
  if (!config.enabled) {
    console.log('[Escalation] Scheduler disabled in config');
    return;
  }

  if (schedulerHandle) {
    console.log('[Escalation] Scheduler already running');
    return;
  }

  console.log(`[Escalation] Starting scheduler (check every ${config.interval_ms}ms)`);

  schedulerHandle = setInterval(() => {
    try {
      const result = checkAndEscalateStaleApprovals();
      if (result.escalationsCreated.length > 0) {
        console.log(`[Escalation] Created ${result.escalationsCreated.length} escalation requests`);
      }
    } catch (err) {
      console.error('[Escalation] Scheduler error:', err);
    }
  }, config.interval_ms);
}

export function stopEscalationScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
    console.log('[Escalation] Scheduler stopped');
  }
}

export function isSchedulerRunning(): boolean {
  return schedulerHandle !== null;
}

export default {
  checkAndEscalateStaleApprovals,
  determineEscalationTargets,
  submitEscalationDecision,
  getEscalationStatus,
  canProceedWithRollbackAfterEscalation,
  getEscalationHistoryForSession,
  startEscalationScheduler,
  stopEscalationScheduler,
  isSchedulerRunning,
};
