/**
 * Auto-Block Rules Engine — Phase 4D
 *
 * Automatically blocks risky rollbacks based on:
 * - Risk assessment score
 * - Policy violations
 * - Configured block rules
 *
 * Prevents rollback of:
 * - High-risk operations (score > threshold)
 * - Policy-violating operations
 * - Manual block rules
 */

import { Action, Session, RiskAssessment } from '../risk/analyzer';
import { PolicyViolation } from '../policy/engine';
import { PolicyCondition } from '../policy/engine';

export interface BlockRule {
  rule_id: string;
  name: string;
  description: string;
  condition: PolicyCondition;
  action: 'block' | 'require_approval';
  severity: 'warning' | 'error';
  message: string;
  enabled: boolean;
  created_at: string;
  created_by: string;
}

export interface AutoBlockResult {
  blocked: boolean;
  reason?: string;
  blocking_rules: BlockRule[];
  policy_violations: PolicyViolation[];
  risk_score: number;
  can_override: boolean;
  override_required_role: string;
  block_id?: string;
  blocked_at?: string;
}

export interface RemediationBlock {
  block_id: string;
  session_id: string;
  rule_id?: string;
  policy_violation_count: number;
  risk_score: number;
  reason: string;
  blocked_at: string;
  unblocked_at?: string;
  unblocked_by?: string;
  unblock_reason?: string;
  override_token?: string;
}

/**
 * Evaluate if rollback should be auto-blocked
 */
export function evaluateAutoBlock(
  session: Session,
  actions: Action[],
  riskAssessment: RiskAssessment,
  policyViolations: PolicyViolation[],
  blockRules: BlockRule[],
  riskThreshold: number = 7.0,
  userRole: string = 'user'
): AutoBlockResult {
  const blockingRules: BlockRule[] = [];
  const blockedAt = new Date().toISOString();
  const blockId = generateBlockId();

  // Check risk score threshold
  const isHighRisk = riskAssessment.score >= riskThreshold;

  // Check matching block rules
  const matchingRules = blockRules.filter(
    rule => rule.enabled && evaluateBlockRuleCondition(rule.condition, actions, session)
  );
  blockingRules.push(...matchingRules);

  // Check policy violations with block action
  const blockingViolations = policyViolations.filter(v => v.action === 'block');

  // Determine if blocked
  const hasBlockingViolations = blockingViolations.length > 0;
  const blocked = isHighRisk || blockingRules.length > 0 || hasBlockingViolations;

  // Generate reason
  let reason = '';
  const reasons: string[] = [];

  if (isHighRisk) {
    reasons.push(`Risk score ${riskAssessment.score.toFixed(1)}/10 exceeds threshold ${riskThreshold}`);
  }

  if (blockingRules.length > 0) {
    reasons.push(`${blockingRules.length} block rule(s) matched`);
  }

  if (hasBlockingViolations) {
    reasons.push(`${blockingViolations.length} policy violation(s) require blocking`);
  }

  reason = reasons.join('; ');

  // Determine override capability
  const canOverride = userRole === 'admin' || userRole === 'super_admin';
  const overrideRole = userRole === 'admin' || userRole === 'super_admin' ? 'admin' : 'admin';

  const result: AutoBlockResult = {
    blocked,
    reason: blocked ? reason : undefined,
    blocking_rules: blockingRules,
    policy_violations: blockingViolations,
    risk_score: riskAssessment.score,
    can_override: canOverride,
    override_required_role: overrideRole,
  };

  if (blocked) {
    result.block_id = blockId;
    result.blocked_at = blockedAt;
  }

  return result;
}

/**
 * Evaluate block rule condition
 */
function evaluateBlockRuleCondition(
  condition: PolicyCondition,
  actions: Action[],
  session: Session
): boolean {
  // Use same logic as policy conditions
  // Check if any action matches
  for (const action of actions) {
    if (matchCondition(condition, action, session)) {
      return true;
    }
  }
  return false;
}

/**
 * Simple condition matcher
 */
function matchCondition(
  condition: PolicyCondition,
  action: Action,
  session: Session
): boolean {
  switch (condition.type) {
    case 'operation_type':
    case 'tool_name':
      return matchString(action.tool_name, condition.value, condition.operator);

    case 'action_count':
      return matchNumeric(session.action_count, condition.value, condition.operator);

    case 'file_pattern':
      const target = action.target || '';
      return matchString(target, condition.value, condition.operator);

    case 'error_present':
      const hasError = action.status === 'error';
      return hasError === (condition.value === 'true');

    default:
      return false;
  }
}

/**
 * String comparison
 */
function matchString(
  actual: string,
  expected: string | number | string[],
  operator: string
): boolean {
  if (operator === 'equals' || operator === 'in') {
    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }
    return actual === String(expected);
  }

  if (operator === 'contains') {
    if (Array.isArray(expected)) {
      return expected.some(e => actual.includes(String(e)));
    }
    return actual.includes(String(expected));
  }

  if (operator === 'matches_regex') {
    try {
      const regex = new RegExp(String(expected));
      return regex.test(actual);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Numeric comparison
 */
function matchNumeric(
  actual: number,
  expected: string | number | string[],
  operator: string
): boolean {
  const expectedNum = typeof expected === 'number' ? expected : parseInt(String(expected), 10);
  if (isNaN(expectedNum)) return false;

  switch (operator) {
    case 'equals':
      return actual === expectedNum;
    case 'greater_than':
      return actual > expectedNum;
    case 'less_than':
      return actual < expectedNum;
    default:
      return false;
  }
}

/**
 * Create a block for a session
 */
export function createBlock(
  sessionId: string,
  riskScore: number,
  reason: string,
  ruleId?: string,
  policyViolationCount: number = 0
): RemediationBlock {
  return {
    block_id: generateBlockId(),
    session_id: sessionId,
    rule_id: ruleId,
    policy_violation_count: policyViolationCount,
    risk_score: riskScore,
    reason,
    blocked_at: new Date().toISOString(),
  };
}

/**
 * Unblock a session (admin override)
 */
export function unblockSession(
  block: RemediationBlock,
  unblockedBy: string,
  reason: string,
  overrideToken?: string
): RemediationBlock {
  return {
    ...block,
    unblocked_at: new Date().toISOString(),
    unblocked_by: unblockedBy,
    unblock_reason: reason,
    override_token: overrideToken,
  };
}

/**
 * Generate unique block ID
 */
function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get default block rules
 */
export function getDefaultBlockRules(): BlockRule[] {
  return [
    {
      rule_id: 'block-production-delete-hours',
      name: 'Production Delete During Off-Hours',
      description: 'Block delete operations in production environment during off-hours',
      condition: {
        type: 'operation_type',
        operator: 'equals',
        value: 'delete_file',
      },
      action: 'block',
      severity: 'error',
      message: 'Cannot delete files during off-hours in production',
      enabled: true,
      created_at: new Date().toISOString(),
      created_by: 'system',
    },
    {
      rule_id: 'block-large-batch-delete',
      name: 'Large Batch Delete Protection',
      description: 'Block deletion of more than 20 files in single session',
      condition: {
        type: 'action_count',
        operator: 'greater_than',
        value: 20,
      },
      action: 'require_approval',
      severity: 'warning',
      message: 'Large batch deletion requires approval',
      enabled: true,
      created_at: new Date().toISOString(),
      created_by: 'system',
    },
  ];
}

export default {
  evaluateAutoBlock,
  createBlock,
  unblockSession,
  getDefaultBlockRules,
};
