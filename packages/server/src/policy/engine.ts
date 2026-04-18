/**
 * Policy Engine — Phase 4B
 *
 * Implements policy matching and evaluation for:
 * - Compliance policies (HIPAA, SOC2, PCI-DSS, GDPR)
 * - Operational policies (business hours, action limits)
 * - Security policies (auth changes, patch downgrades)
 * - Data policies (backup protection, schema migration)
 *
 * Evaluates whether actions violate any active policies
 */

import { Action, Session } from '../risk/analyzer';

export type PolicyCategory = 'compliance' | 'operational' | 'security' | 'data';
export type ConditionType =
  | 'operation_type'
  | 'file_pattern'
  | 'action_count'
  | 'data_type'
  | 'time_of_day'
  | 'tool_name'
  | 'error_present';
export type ConditionOperator = 'equals' | 'contains' | 'greater_than' | 'less_than' | 'matches_regex' | 'in';
export type PolicyAction = 'block' | 'require_approval' | 'require_remediation' | 'log_only';
export type PolicySeverity = 'info' | 'warning' | 'error';

export interface PolicyCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value: string | number | string[];
  caseSensitive?: boolean;
}

export interface PolicyRule {
  condition: PolicyCondition;
  action: PolicyAction;
  severity: PolicySeverity;
  message: string;
}

export interface Policy {
  policy_id: string;
  name: string;
  description: string;
  category: PolicyCategory;
  rules: PolicyRule[];
  enabled: boolean;
  created_at: string;
  created_by: string;
  updated_at?: string;
}

export interface PolicyViolation {
  policy_id: string;
  policy_name: string;
  category: PolicyCategory;
  rule_index: number;
  action: PolicyAction;
  severity: PolicySeverity;
  message: string;
  violated_at: string;
}

export interface PolicyEvaluationResult {
  violations: PolicyViolation[];
  has_blocks: boolean;
  has_warnings: boolean;
  requires_approval: boolean;
  requires_remediation: boolean;
  log_entries: string[];
}

/**
 * Evaluate actions against all policies
 */
export function evaluatePolicies(
  session: Session,
  actions: Action[],
  policies: Policy[]
): PolicyEvaluationResult {
  const violations: PolicyViolation[] = [];
  const log_entries: string[] = [];

  // Filter enabled policies
  const enabledPolicies = policies.filter(p => p.enabled);

  for (const policy of enabledPolicies) {
    const policyViolations = evaluatePolicy(session, actions, policy);
    violations.push(...policyViolations);

    if (policyViolations.length > 0) {
      log_entries.push(
        `[${policy.category.toUpperCase()}] ${policy.name}: ${policyViolations.length} violation(s)`
      );
    }
  }

  const has_blocks = violations.some(v => v.action === 'block');
  const has_warnings = violations.some(v => v.severity === 'warning');
  const requires_approval = violations.some(v => v.action === 'require_approval');
  const requires_remediation = violations.some(v => v.action === 'require_remediation');

  return {
    violations,
    has_blocks,
    has_warnings,
    requires_approval,
    requires_remediation,
    log_entries,
  };
}

/**
 * Evaluate actions against a single policy
 */
export function evaluatePolicy(
  session: Session,
  actions: Action[],
  policy: Policy
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const timestamp = new Date().toISOString();

  for (let ruleIndex = 0; ruleIndex < policy.rules.length; ruleIndex++) {
    const rule = policy.rules[ruleIndex];

    // Check if any action matches this rule
    for (const action of actions) {
      if (evaluateCondition(rule.condition, action, session)) {
        violations.push({
          policy_id: policy.policy_id,
          policy_name: policy.name,
          category: policy.category,
          rule_index: ruleIndex,
          action: rule.action,
          severity: rule.severity,
          message: rule.message,
          violated_at: timestamp,
        });
        // Only record once per rule (not per action)
        break;
      }
    }
  }

  return violations;
}

/**
 * Evaluate a single condition against an action
 */
export function evaluateCondition(
  condition: PolicyCondition,
  action: Action,
  session: Session
): boolean {
  const value = condition.value;
  const op = condition.operator;

  switch (condition.type) {
    case 'operation_type':
      return evaluateEquals(action.tool_name, value, op, condition.caseSensitive);

    case 'tool_name':
      return evaluateEquals(action.tool_name, value, op, condition.caseSensitive);

    case 'file_pattern':
      return evaluatePattern(action.target || '', value, op, condition.caseSensitive);

    case 'action_count':
      return evaluateNumeric(session.action_count, value, op);

    case 'data_type':
      return evaluateDataType(action, value);

    case 'time_of_day':
      return evaluateTimeOfDay(value as string);

    case 'error_present':
      return evaluateErrorPresent(action, op === 'equals' ? (value === 'true') : (value !== 'true'));

    default:
      return false;
  }
}

/**
 * Evaluate equality/contains conditions
 */
function evaluateEquals(
  actual: string,
  expected: string | number | string[],
  operator: ConditionOperator,
  caseSensitive?: boolean
): boolean {
  const a = caseSensitive ? actual : actual.toLowerCase();
  const normalizeValue = (v: string | number | string[]) => {
    if (Array.isArray(v)) {
      return v.map(x => (caseSensitive ? String(x) : String(x).toLowerCase()));
    }
    return caseSensitive ? String(v) : String(v).toLowerCase();
  };
  const e = normalizeValue(expected);

  if (operator === 'equals') {
    if (Array.isArray(e)) {
      return e.includes(a);
    }
    return a === e;
  }

  if (operator === 'contains') {
    if (Array.isArray(e)) {
      return e.some(x => a.includes(x));
    }
    return a.includes(String(e));
  }

  if (operator === 'in') {
    if (Array.isArray(e)) {
      return e.includes(a);
    }
    return a === String(e);
  }

  return false;
}

/**
 * Evaluate pattern matching (file paths, regex)
 */
function evaluatePattern(
  actual: string,
  pattern: string | number | string[],
  operator: ConditionOperator,
  caseSensitive?: boolean
): boolean {
  const patternStr = Array.isArray(pattern) ? pattern[0] : String(pattern);

  if (operator === 'matches_regex') {
    const flags = caseSensitive ? '' : 'i';
    try {
      const regex = new RegExp(patternStr, flags);
      return regex.test(actual);
    } catch {
      return false;
    }
  }

  if (operator === 'contains') {
    const a = caseSensitive ? actual : actual.toLowerCase();
    const p = caseSensitive ? patternStr : patternStr.toLowerCase();
    return a.includes(p);
  }

  return false;
}

/**
 * Evaluate numeric comparisons
 */
function evaluateNumeric(
  actual: number,
  expected: string | number | string[],
  operator: ConditionOperator
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
 * Evaluate data type conditions
 */
function evaluateDataType(action: Action, dataType: string | number | string[]): boolean {
  const typeStr = Array.isArray(dataType) ? dataType[0] : String(dataType).toLowerCase();
  const target = (action.target || '').toLowerCase();

  const typePatterns: Record<string, string[]> = {
    sensitive_data: [
      '/password',
      '/api_key',
      '/secret',
      '/token',
      '/credential',
      '/pii',
      '/users',
      '/email',
      '/ssn',
      '/credit_card',
    ],
    database: ['.sql', '.db', '/migrations', '/schema', 'database'],
    config: ['.env', 'config.json', 'secrets', '.key', '.pem'],
    authentication: ['/auth', '/login', '/users', '/password', '/oauth'],
  };

  const patterns = typePatterns[typeStr] || [];
  return patterns.some(p => target.includes(p));
}

/**
 * Evaluate time of day conditions
 */
function evaluateTimeOfDay(timeRange: string): boolean {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Supported formats: 'business_hours', 'off_hours', 'weekday', 'weekend', 'night'
  switch (timeRange.toLowerCase()) {
    case 'business_hours':
      return hour >= 9 && hour < 17 && dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'off_hours':
      return hour < 9 || hour >= 17 || dayOfWeek === 0 || dayOfWeek === 6;
    case 'weekday':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekend':
      return dayOfWeek === 0 || dayOfWeek === 6;
    case 'night':
      return hour >= 22 || hour < 6;
    default:
      return false;
  }
}

/**
 * Evaluate error presence conditions
 */
function evaluateErrorPresent(action: Action, shouldHaveError: boolean): boolean {
  const hasError = action.status === 'error';
  return hasError === shouldHaveError;
}

/**
 * Get default compliance policies
 */
export function getDefaultCompliancePolicies(): Policy[] {
  return [
    {
      policy_id: 'compliance-hipaa',
      name: 'HIPAA Compliance',
      description: 'Protect health information data',
      category: 'compliance',
      enabled: false, // Opt-in
      created_at: new Date().toISOString(),
      created_by: 'system',
      rules: [
        {
          condition: {
            type: 'data_type',
            operator: 'equals',
            value: 'sensitive_data',
          },
          action: 'require_approval',
          severity: 'error',
          message: 'HIPAA: Protected health information requires additional approval',
        },
        {
          condition: {
            type: 'operation_type',
            operator: 'equals',
            value: 'delete_file',
          },
          action: 'require_approval',
          severity: 'error',
          message: 'HIPAA: Deletion of records requires audit trail verification',
        },
      ],
    },
    {
      policy_id: 'compliance-soc2',
      name: 'SOC2 Compliance',
      description: 'Ensure system security and availability',
      category: 'compliance',
      enabled: false, // Opt-in
      created_at: new Date().toISOString(),
      created_by: 'system',
      rules: [
        {
          condition: {
            type: 'time_of_day',
            operator: 'equals',
            value: 'off_hours',
          },
          action: 'require_approval',
          severity: 'warning',
          message: 'SOC2: Production changes outside business hours require approval',
        },
        {
          condition: {
            type: 'operation_type',
            operator: 'equals',
            value: 'bash',
          },
          action: 'require_approval',
          severity: 'warning',
          message: 'SOC2: System commands must be logged and approved',
        },
      ],
    },
  ];
}

/**
 * Get default operational policies
 */
export function getDefaultOperationalPolicies(): Policy[] {
  return [
    {
      policy_id: 'ops-scale-limit',
      name: 'Rollback Scale Limit',
      description: 'Prevent rollback of too many operations at once',
      category: 'operational',
      enabled: true,
      created_at: new Date().toISOString(),
      created_by: 'system',
      rules: [
        {
          condition: {
            type: 'action_count',
            operator: 'greater_than',
            value: 50,
          },
          action: 'require_remediation',
          severity: 'warning',
          message: 'Cannot rollback more than 50 actions at once; consider partial rollback',
        },
        {
          condition: {
            type: 'action_count',
            operator: 'greater_than',
            value: 100,
          },
          action: 'block',
          severity: 'error',
          message: 'Cannot rollback more than 100 actions; use staged rollback approach',
        },
      ],
    },
  ];
}

/**
 * Get default security policies
 */
export function getDefaultSecurityPolicies(): Policy[] {
  return [
    {
      policy_id: 'sec-auth-changes',
      name: 'Authentication Changes Protection',
      description: 'Require approval for authentication modifications',
      category: 'security',
      enabled: true,
      created_at: new Date().toISOString(),
      created_by: 'system',
      rules: [
        {
          condition: {
            type: 'file_pattern',
            operator: 'matches_regex',
            value: '/(auth|login|password|oauth|jwt)',
            caseSensitive: false,
          },
          action: 'require_approval',
          severity: 'error',
          message: 'Security: Authentication changes require security team approval',
        },
      ],
    },
  ];
}

/**
 * Get default data policies
 */
export function getDefaultDataPolicies(): Policy[] {
  return [
    {
      policy_id: 'data-schema-changes',
      name: 'Schema Change Protection',
      description: 'Require DBA approval for database schema changes',
      category: 'data',
      enabled: true,
      created_at: new Date().toISOString(),
      created_by: 'system',
      rules: [
        {
          condition: {
            type: 'file_pattern',
            operator: 'matches_regex',
            value: '/(migrations|schema|\.sql)$',
            caseSensitive: false,
          },
          action: 'require_approval',
          severity: 'error',
          message: 'Data: Database schema changes require DBA review',
        },
      ],
    },
  ];
}

/**
 * Create a custom policy
 */
export function createPolicy(
  name: string,
  description: string,
  category: PolicyCategory,
  rules: PolicyRule[],
  createdBy: string = 'system'
): Policy {
  return {
    policy_id: `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    category,
    rules,
    enabled: true,
    created_at: new Date().toISOString(),
    created_by: createdBy,
  };
}

export default {
  evaluatePolicies,
  evaluatePolicy,
  evaluateCondition,
  getDefaultCompliancePolicies,
  getDefaultOperationalPolicies,
  getDefaultSecurityPolicies,
  getDefaultDataPolicies,
  createPolicy,
};
