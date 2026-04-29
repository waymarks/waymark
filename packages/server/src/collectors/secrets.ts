/**
 * Secret pattern redaction utility.
 *
 * Mirrors abtop/src/collector/mod.rs `redact_secrets`.
 * Best-effort: covers well-known prefixed tokens, not arbitrary high-entropy strings.
 */

const SECRET_PATTERNS = [
  // Anthropic / OpenAI / OpenRouter
  'sk-ant-', 'sk-proj-', 'sk-or-',
  // Stripe
  'sk_live_', 'sk_test_', 'rk_live_', 'rk_test_',
  // GitHub
  'ghp_', 'gho_', 'ghs_', 'ghr_', 'ghu_', 'github_pat_',
  // GitLab
  'glpat-',
  // Slack
  'xoxb-', 'xoxp-', 'xoxa-', 'xoxs-',
  // AWS access key ids
  'AKIA', 'ASIA',
  // Bearer-prefixed headers
  'Bearer ',
];

/**
 * Replace known secret prefixes and following non-whitespace chars with [REDACTED].
 */
export function redactSecrets(s: string): string {
  let result = s;
  for (const pat of SECRET_PATTERNS) {
    let pos = result.indexOf(pat);
    while (pos !== -1) {
      // Find end: next whitespace or end of string
      let end = pos + pat.length;
      while (end < result.length && !/\s/.test(result.charAt(end))) end++;
      result = result.slice(0, pos) + '[REDACTED]' + result.slice(end);
      pos = result.indexOf(pat, pos + '[REDACTED]'.length);
    }
  }
  return result;
}
