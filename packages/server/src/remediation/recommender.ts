/**
 * Remediation Recommender — Phase 4C
 *
 * Suggests safe rollback strategies:
 * - Partial rollback (safe operations only)
 * - Staged rollback (phases with verification)
 * - Retry strategy (don't rollback, retry)
 * - Workaround strategy (data fixes instead)
 * - Escalation (manual expert review)
 */

import { Action, Session, RiskAssessment } from '../risk/analyzer';
import { PolicyViolation } from '../policy/engine';

export type RemediationStrategyType =
  | 'partial_rollback'
  | 'staged_rollback'
  | 'retry'
  | 'workaround'
  | 'escalation';

export interface RemediationStrategy {
  name: RemediationStrategyType;
  description: string;
  safe_operations: string[];           // action IDs to include
  risky_operations: string[];          // action IDs to exclude
  retry_instead: boolean;
  manual_steps: string[];
  estimated_time: string;
  success_probability: number;         // 0-100%
  estimated_downtime?: string;
}

export interface Remediation {
  primary_strategy: RemediationStrategy;
  alternative_strategies: RemediationStrategy[];
  estimated_safety: number;            // 0-100%
  estimated_downtime: string;
  requires_manual_review: boolean;
  required_approvals: string[];        // team members needed
  reasoning: string;
}

/**
 * Get remediation recommendations based on risk assessment and policy violations
 */
export function getRemediations(
  session: Session,
  actions: Action[],
  riskAssessment: RiskAssessment,
  policyViolations: PolicyViolation[] = []
): Remediation {
  const strategies: RemediationStrategy[] = [];

  // Analyze action types
  const writeActions = actions.filter(a => a.tool_name === 'write_file');
  const deleteActions = actions.filter(a => a.tool_name === 'delete_file');
  const bashActions = actions.filter(a => a.tool_name === 'bash');
  const readActions = actions.filter(a => a.tool_name === 'read_file' || a.tool_name === 'grep');
  const errorActions = actions.filter(a => a.status === 'error');

  // Strategy 1: Partial Rollback (safest for mixed operations)
  const partialStrategy = createPartialRollbackStrategy(actions, riskAssessment);
  strategies.push(partialStrategy);

  // Strategy 2: Staged Rollback (safe for large scales)
  if (actions.length > 10) {
    const stagedStrategy = createStagedRollbackStrategy(actions, riskAssessment);
    strategies.push(stagedStrategy);
  }

  // Strategy 3: Retry (if transient errors)
  if (errorActions.length > 0 && hasTransientErrors(errorActions)) {
    const retryStrategy = createRetryStrategy(actions, errorActions);
    strategies.push(retryStrategy);
  }

  // Strategy 4: Workaround (for data issues)
  if (writeActions.length > 0 && deleteActions.length === 0) {
    const workaroundStrategy = createWorkaroundStrategy(actions);
    strategies.push(workaroundStrategy);
  }

  // Strategy 5: Escalation (high risk or policy violations)
  if (riskAssessment.score > 6 || policyViolations.length > 0) {
    const escalationStrategy = createEscalationStrategy(
      actions,
      riskAssessment,
      policyViolations
    );
    strategies.push(escalationStrategy);
  }

  // Determine primary strategy
  const primary = selectPrimaryStrategy(strategies, riskAssessment, errorActions.length);
  const alternatives = strategies.filter(s => s.name !== primary.name);

  // Determine required approvals
  const requiredApprovals = determineRequiredApprovals(
    riskAssessment,
    policyViolations,
    actions
  );

  // Calculate overall metrics
  const estimatedSafety = Math.round(
    (100 - riskAssessment.score * 10) + primary.success_probability
  );
  const estimatedDowntime = calculateDowntime(primary);

  const reasoning = generateReasoning(riskAssessment, errorActions, deleteActions, policyViolations);

  return {
    primary_strategy: primary,
    alternative_strategies: alternatives.slice(0, 2), // Top 2 alternatives
    estimated_safety: Math.max(0, Math.min(100, estimatedSafety)),
    estimated_downtime: estimatedDowntime,
    requires_manual_review: primary.name === 'escalation' || riskAssessment.score > 7,
    required_approvals: requiredApprovals,
    reasoning,
  };
}

/**
 * Create partial rollback strategy (safe operations only)
 */
function createPartialRollbackStrategy(
  actions: Action[],
  riskAssessment: RiskAssessment
): RemediationStrategy {
  // Safe operations: read, info gathering
  const safeOps = actions.filter(a =>
    ['read_file', 'grep', 'find_files'].includes(a.tool_name)
  );

  // Risky operations: write, delete, bash
  const riskyOps = actions.filter(
    a => a.status !== 'success' || ['write_file', 'delete_file', 'bash'].includes(a.tool_name)
  );

  const successProb = Math.max(50, 100 - riskAssessment.score * 5);

  return {
    name: 'partial_rollback',
    description: 'Rollback safe read-only and information gathering operations only; exclude write/delete/bash',
    safe_operations: safeOps.map(a => a.action_id),
    risky_operations: riskyOps.map(a => a.action_id),
    retry_instead: false,
    manual_steps: [
      'Review list of safe operations to rollback',
      'Verify no dependencies on risky operations',
      'Execute rollback of safe operations',
      'Manually address risky operations as needed',
    ],
    estimated_time: `${Math.ceil(safeOps.length / 5)} minutes`,
    success_probability: successProb,
    estimated_downtime: '5-15 minutes',
  };
}

/**
 * Create staged rollback strategy (phases with verification)
 */
function createStagedRollbackStrategy(
  actions: Action[],
  riskAssessment: RiskAssessment
): RemediationStrategy {
  const stageSize = Math.ceil(actions.length / 3); // 3 stages
  const stages: string[] = [];

  for (let i = 0; i < 3; i++) {
    const start = i * stageSize;
    const end = Math.min(start + stageSize, actions.length);
    stages.push(`${i + 1}. Rollback actions ${start + 1}-${end}`);
  }

  return {
    name: 'staged_rollback',
    description: `Rollback in ${stages.length} phases with health verification between stages`,
    safe_operations: actions.map(a => a.action_id),
    risky_operations: [],
    retry_instead: false,
    manual_steps: [
      ...stages,
      'Verify system health after each stage',
      'Check error rates and key metrics',
      'Proceed to next stage or rollback if issues detected',
    ],
    estimated_time: `${stages.length * 30} minutes`,
    success_probability: Math.max(65, 100 - riskAssessment.score * 3),
    estimated_downtime: '1-2 hours',
  };
}

/**
 * Create retry strategy (don't rollback, try again)
 */
function createRetryStrategy(
  actions: Action[],
  errorActions: Action[]
): RemediationStrategy {
  const failedTools = [...new Set(errorActions.map(a => a.tool_name))];

  return {
    name: 'retry',
    description: 'Instead of rolling back, retry failed operations with same or adjusted parameters',
    safe_operations: [],
    risky_operations: [],
    retry_instead: true,
    manual_steps: [
      'Review errors from failed operations',
      `Failed tools: ${failedTools.join(', ')}`,
      'Identify root cause (timeout, resource, permissions)',
      'Retry with same parameters or adjusted timeout',
      'Monitor retry execution',
    ],
    estimated_time: '5-15 minutes',
    success_probability: 60,
    estimated_downtime: 'Minimal (0-5 minutes)',
  };
}

/**
 * Create workaround strategy (data fixes instead of rollback)
 */
function createWorkaroundStrategy(actions: Action[]): RemediationStrategy {
  return {
    name: 'workaround',
    description: 'Apply targeted data fixes instead of full rollback',
    safe_operations: [],
    risky_operations: [],
    retry_instead: false,
    manual_steps: [
      'Identify specific data that needs correction',
      'Create targeted fix script (minimal scope)',
      'Test fix on staging environment',
      'Apply fix to production with DBA oversight',
      'Verify data consistency post-fix',
    ],
    estimated_time: '30-60 minutes',
    success_probability: 75,
    estimated_downtime: '5-20 minutes',
  };
}

/**
 * Create escalation strategy (manual expert review)
 */
function createEscalationStrategy(
  actions: Action[],
  riskAssessment: RiskAssessment,
  policyViolations: PolicyViolation[]
): RemediationStrategy {
  const reasons: string[] = [];

  if (riskAssessment.score > 7) {
    reasons.push(`High risk score (${riskAssessment.score.toFixed(1)}/10)`);
  }

  if (policyViolations.length > 0) {
    const categories = [...new Set(policyViolations.map(v => v.category))];
    reasons.push(`Policy violations in: ${categories.join(', ')}`);
  }

  if (actions.some(a => a.tool_name === 'delete_file')) {
    reasons.push('Delete operations involved (data loss risk)');
  }

  if (actions.length > 20) {
    reasons.push('Large number of actions (complex scenario)');
  }

  return {
    name: 'escalation',
    description: 'Request expert manual review and guidance on safe remediation approach',
    safe_operations: [],
    risky_operations: [],
    retry_instead: false,
    manual_steps: [
      'Escalate to on-call expert/DBA',
      'Provide risk assessment and policy violations',
      'Discuss safe remediation options',
      'Expert recommends specific approach',
      'Execute under expert guidance',
    ],
    estimated_time: '30+ minutes (waiting for expert)',
    success_probability: 95,
    estimated_downtime: 'Depends on expert recommendation',
  };
}

/**
 * Select primary strategy based on context
 */
function selectPrimaryStrategy(
  strategies: RemediationStrategy[],
  riskAssessment: RiskAssessment,
  errorCount: number
): RemediationStrategy {
  // Escalation if critical risk
  if (riskAssessment.score > 8) {
    const esc = strategies.find(s => s.name === 'escalation');
    if (esc) return esc;
  }

  // Retry if many transient errors and no risky operations
  if (errorCount > 0) {
    const retry = strategies.find(s => s.name === 'retry');
    if (retry) return retry;
  }

  // Partial rollback if medium risk
  if (riskAssessment.score < 5) {
    const partial = strategies.find(s => s.name === 'partial_rollback');
    if (partial && partial.safe_operations.length > 0) return partial;
  }

  // Staged rollback if large scale
  const staged = strategies.find(s => s.name === 'staged_rollback');
  if (staged) return staged;

  // Partial as fallback
  const partial = strategies.find(s => s.name === 'partial_rollback');
  if (partial) return partial;

  // Escalation as last resort
  return strategies.find(s => s.name === 'escalation') || strategies[0];
}

/**
 * Determine required approvals
 */
function determineRequiredApprovals(
  riskAssessment: RiskAssessment,
  policyViolations: PolicyViolation[],
  actions: Action[]
): string[] {
  const approvals: string[] = [];

  if (riskAssessment.score > 7) {
    approvals.push('cto');
  } else if (riskAssessment.score > 5) {
    approvals.push('engineering_lead');
  }

  const categories = new Set(policyViolations.map(v => v.category));

  if (categories.has('data')) {
    approvals.push('dba');
  }
  if (categories.has('security')) {
    approvals.push('security_lead');
  }
  if (categories.has('compliance')) {
    approvals.push('compliance_officer');
  }

  if (actions.some(a => a.tool_name === 'delete_file')) {
    approvals.push('data_steward');
  }

  return [...new Set(approvals)]; // Deduplicate
}

/**
 * Check if errors are transient (retryable)
 */
function hasTransientErrors(errorActions: Action[]): boolean {
  const transientPatterns = ['timeout', 'network', 'connection', 'temporary', 'unavailable'];

  return errorActions.some(a => {
    const errorMsg = (a.error_message || '').toLowerCase();
    return transientPatterns.some(p => errorMsg.includes(p));
  });
}

/**
 * Calculate estimated downtime
 */
function calculateDowntime(strategy: RemediationStrategy): string {
  const timeMap: Record<RemediationStrategyType, string> = {
    partial_rollback: '5-15 minutes',
    staged_rollback: '1-2 hours',
    retry: '5-15 minutes',
    workaround: '15-45 minutes',
    escalation: '30+ minutes',
  };

  return timeMap[strategy.name];
}

/**
 * Generate reasoning for recommendations
 */
function generateReasoning(
  riskAssessment: RiskAssessment,
  errorActions: Action[],
  deleteActions: Action[],
  policyViolations: PolicyViolation[]
): string {
  const parts: string[] = [];

  parts.push(`Risk Level: ${riskAssessment.level.toUpperCase()} (${riskAssessment.score.toFixed(1)}/10)`);

  if (deleteActions.length > 0) {
    parts.push(`⚠️ Data Risk: ${deleteActions.length} delete operation(s) - data loss possible`);
  }

  if (errorActions.length > 0) {
    parts.push(`Errors: ${errorActions.length} operation(s) failed - review error messages`);
  }

  if (policyViolations.length > 0) {
    parts.push(`Compliance: ${policyViolations.length} policy violation(s)`);
  }

  parts.push(`Recommendation: Use primary strategy, alternatives available`);

  return parts.join('\n');
}

export default {
  getRemediations,
  createPartialRollbackStrategy,
  createStagedRollbackStrategy,
  createRetryStrategy,
  createWorkaroundStrategy,
  createEscalationStrategy,
};
