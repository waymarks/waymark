/**
 * Approval Manager — Core logic for team approval routing
 *
 * Responsibilities:
 * - Determine which approvers are required for a given session rollback
 * - Create approval requests (pending approvals)
 * - Process approval decisions (approve/reject)
 * - Check if all required approvals are satisfied
 * - Track approval history and audit trail
 */

import {
  getAllApprovalRoutes,
  createApprovalRequest,
  getApprovalRequest,
  submitApprovalDecision as dbSubmitApprovalDecision,
  getApprovalDecisions,
  getSessionApprovalRequests,
  ApprovalRoute,
  ApprovalRequest,
} from '../db/database';
import { SessionRow, ActionRow } from '../db/database';

/**
 * Approval flow determines required approvers for a session based on routes
 *
 * Pattern: validation → determination → request creation
 */

export interface ApprovalCheckResult {
  requiresApproval: boolean;
  requiredApprovers: string[];
  routes: ApprovalRoute[];
  reason: string;
}

export interface ApprovalCreationResult {
  success: boolean;
  request_id: string;
  requires_approval: boolean;
  required_approvers: string[];
  pending_approvers: string[];
  error?: string;
}

export interface ApprovalStatusResult {
  request_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'mixed';
  approved_count: number;
  rejected_count: number;
  pending_count: number;
  required_approvers: number;
  decisions: Array<{
    approver_id: string;
    decision: string;
    reason?: string;
  }>;
  can_proceed: boolean; // true if approved or no approval needed
}

export interface ApprovalRuleCondition {
  type: 'all_sessions' | 'tool_name' | 'action_count' | 'risk_level';
  value?: string | number;
}

/**
 * Determine if a session rollback requires approval based on routes
 */
export function determineRequiredApprovers(
  session: SessionRow,
  actions: ActionRow[]
): ApprovalCheckResult {
  const routes = getAllApprovalRoutes();

  // Collect all unique approvers from matching routes
  const requiredApprovers = new Set<string>();
  const matchedRoutes: ApprovalRoute[] = [];

  for (const route of routes) {
    if (routeMatches(route, session, actions)) {
      matchedRoutes.push(route);
      const approvers = JSON.parse(route.approver_ids) as string[];
      approvers.forEach(a => requiredApprovers.add(a));
    }
  }

  const approverArray = Array.from(requiredApprovers);
  const requiresApproval = approverArray.length > 0;

  return {
    requiresApproval,
    requiredApprovers: approverArray,
    routes: matchedRoutes,
    reason: requiresApproval
      ? `${matchedRoutes.length} approval route(s) matched`
      : 'No approval routes matched',
  };
}

/**
 * Check if an approval route matches the given session
 */
function routeMatches(route: ApprovalRoute, session: SessionRow, actions: ActionRow[]): boolean {
  const condition_type = route.condition_type || 'all_sessions';

  switch (condition_type) {
    case 'all_sessions':
      return true;

    case 'tool_name':
      // Match if any action uses specified tool
      if (!route.condition_json) return false;
      try {
        const condition = JSON.parse(route.condition_json) as ApprovalRuleCondition;
        return actions.some(a => a.tool_name === condition.value);
      } catch {
        return false;
      }

    case 'action_count':
      // Match if action count exceeds threshold
      if (!route.condition_json) return false;
      try {
        const condition = JSON.parse(route.condition_json) as ApprovalRuleCondition;
        const threshold = (condition.value as number) || 5;
        return actions.length >= threshold;
      } catch {
        return false;
      }

    case 'risk_level':
      // Match if any action is flagged as high-risk
      if (!route.condition_json) return false;
      try {
        const condition = JSON.parse(route.condition_json) as ApprovalRuleCondition;
        // Check if any action has is_reversible = 0 (irreversible = high risk)
        return actions.some(a => a.is_reversible === 0);
      } catch {
        return false;
      }

    default:
      return false;
  }
}

/**
 * Create an approval request for a session rollback
 * Returns request_id and list of required approvers
 */
export function createApprovalRequestForSession(
  session_id: string,
  session: SessionRow,
  actions: ActionRow[],
  triggered_by: string
): ApprovalCreationResult {
  try {
    const check = determineRequiredApprovers(session, actions);

    if (!check.requiresApproval) {
      // No approval needed
      return {
        success: true,
        request_id: '', // No request created
        requires_approval: false,
        required_approvers: [],
        pending_approvers: [],
      };
    }

    // Create approval request
    const request_id = `approval-${session_id}-${Date.now()}`;
    const route_id = check.routes[0].route_id; // Use first matching route

    createApprovalRequest(
      request_id,
      session_id,
      route_id,
      triggered_by,
      check.requiredApprovers
    );

    return {
      success: true,
      request_id,
      requires_approval: true,
      required_approvers: check.requiredApprovers,
      pending_approvers: check.requiredApprovers, // All are pending initially
    };
  } catch (error: any) {
    return {
      success: false,
      request_id: '',
      requires_approval: false,
      required_approvers: [],
      pending_approvers: [],
      error: error.message,
    };
  }
}

/**
 * Submit an approval decision (approve or reject)
 */
export function submitApprovalDecision(
  request_id: string,
  approver_id: string,
  decision: 'approve' | 'reject',
  reason?: string
): ApprovalStatusResult {
  try {
    const request = getApprovalRequest(request_id);
    if (!request) {
      throw new Error(`Approval request ${request_id} not found`);
    }

    // Verify approver is authorized for this request
    const approvers = JSON.parse(request.approver_ids) as string[];
    if (!approvers.includes(approver_id)) {
      throw new Error(`${approver_id} is not authorized to approve this request`);
    }

    // Check if already decided by this approver
    const existingDecisions = getApprovalDecisions(request_id);
    if (existingDecisions.some(d => d.approver_id === approver_id)) {
      throw new Error(`${approver_id} has already made a decision on this request`);
    }

    // Record decision
    const decision_id = `decision-${request_id}-${approver_id}-${Date.now()}`;
    dbSubmitApprovalDecision(decision_id, request_id, approver_id, decision, reason);

    // Return updated status
    return getApprovalStatus(request_id);
  } catch (error: any) {
    throw new Error(`Failed to submit decision: ${error.message}`);
  }
}

/**
 * Get the current approval status
 */
export function getApprovalStatus(request_id: string): ApprovalStatusResult {
  const request = getApprovalRequest(request_id);
  if (!request) {
    throw new Error(`Approval request ${request_id} not found`);
  }

  const decisions = getApprovalDecisions(request_id);
  const approvers = JSON.parse(request.approver_ids) as string[];
  const pendingApprovers = approvers.filter(
    a => !decisions.some(d => d.approver_id === a)
  );

  const approvedCount = decisions.filter(d => d.decision === 'approve').length;
  const rejectedCount = decisions.filter(d => d.decision === 'reject').length;

  // Determine if we can proceed
  let can_proceed = false;
  const approverIds = JSON.parse(request.approver_ids);
  let status: 'pending' | 'approved' | 'rejected' | 'mixed' = 'pending';

  if (rejectedCount > 0) {
    status = 'rejected';
    can_proceed = false;
  } else if (approvedCount >= approverIds.length) {
    status = 'approved';
    can_proceed = true;
  } else if (approvedCount > 0 && rejectedCount === 0) {
    status = 'mixed';
    can_proceed = false;
  }

  return {
    request_id,
    status,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    pending_count: pendingApprovers.length,
    required_approvers: approverIds.length,
    decisions: decisions.map(d => ({
      approver_id: d.approver_id,
      decision: d.decision,
      reason: d.reason ?? undefined,
    })),
    can_proceed,
  };
}

/**
 * Check if all required approvals are satisfied for a session rollback
 */
export function canProceedWithRollback(request_id: string): boolean {
  try {
    const status = getApprovalStatus(request_id);
    return status.can_proceed;
  } catch {
    return false;
  }
}

/**
 * Get all pending approvals for a specific approver
 */
export function getPendingApprovalsForUser(approver_id: string): ApprovalRequest[] {
  const allRequests = getSessionApprovalRequests(''); // Get all (filter by approver below)

  // Filter: only pending requests where user is an approver and hasn't decided
  return allRequests.filter(req => {
    if (req.status !== 'pending') return false;

    const approvers = JSON.parse(req.approver_ids) as string[];
    if (!approvers.includes(approver_id)) return false;

    const decisions = getApprovalDecisions(req.request_id);
    return !decisions.some(d => d.approver_id === approver_id);
  });
}

/**
 * Get approval history for a session
 */
export function getApprovalHistory(session_id: string): ApprovalRequest[] {
  return getSessionApprovalRequests(session_id);
}

export default {
  determineRequiredApprovers,
  createApprovalRequestForSession,
  submitApprovalDecision,
  getApprovalStatus,
  canProceedWithRollback,
  getPendingApprovalsForUser,
  getApprovalHistory,
};
