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
  // npm tokens
  'npm_',
  // Datadog
  'dd-api-key=',
  // SendGrid
  'SG.',
  // Sendinblue / Brevo
  'xkeysib-',
  // HashiCorp Vault (long prefixes only — 'AC'/'s.'/'b.' are too short and cause false positives)
  'hvs.',
  // Heroku
  'hz_',
  // Vercel
  'vercel_',
];

// Regex for ENV_KEY=<secret-value> patterns in bash commands / env exports
const ENV_KEY_PATTERN = /\b([A-Z][A-Z0-9_]{3,}(?:KEY|TOKEN|SECRET|PASSWORD|PASS|AUTH|API|CREDENTIAL|CERT|PRIVATE)[A-Z0-9_]*)=([^\s"']+)/g;

/**
 * Replace known secret prefixes and following non-whitespace chars with [REDACTED].
 * Also redacts ENV_VAR=<value> patterns for keys that look like secrets.
 */
export function redactSecrets(s: string): string {
  // 1. Redact by well-known prefix patterns
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
  // 2. Redact ENV_VAR=value where the var name suggests a secret
  result = result.replace(ENV_KEY_PATTERN, '$1=[REDACTED]');
  return result;
}
