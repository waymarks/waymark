import { redactSecrets } from './secrets';

describe('redactSecrets', () => {
  it('leaves clean strings unchanged', () => {
    expect(redactSecrets('hello world')).toBe('hello world');
    expect(redactSecrets('')).toBe('');
  });

  it('redacts Anthropic sk-ant- tokens', () => {
    const input = 'key=sk-ant-abc123XYZ and rest';
    expect(redactSecrets(input)).toBe('key=[REDACTED] and rest');
  });

  it('redacts OpenAI sk-proj- tokens', () => {
    expect(redactSecrets('sk-proj-foobar')).toBe('[REDACTED]');
  });

  it('redacts GitHub PAT ghp_ tokens', () => {
    expect(redactSecrets('GITHUB_TOKEN=ghp_xxxxxxxxxxxx')).toBe('GITHUB_TOKEN=[REDACTED]');
  });

  it('redacts github_pat_ tokens', () => {
    expect(redactSecrets('auth: github_pat_11ABCDEF')).toBe('auth: [REDACTED]');
  });

  it('redacts Slack xoxb- tokens', () => {
    expect(redactSecrets('slack: xoxb-000-111-aaa')).toBe('slack: [REDACTED]');
  });

  it('redacts AWS AKIA access keys', () => {
    expect(redactSecrets('AWS_KEY=AKIAIOSFODNN7EXAMPLE')).toBe('AWS_KEY=[REDACTED]');
  });

  it('redacts AWS ASIA session keys', () => {
    expect(redactSecrets('AWS_KEY=ASIAIOSFODNN7EXAMPLE')).toBe('AWS_KEY=[REDACTED]');
  });

  it('redacts Stripe sk_live_ keys', () => {
    expect(redactSecrets('stripe_key: sk_live_abc123')).toBe('stripe_key: [REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    expect(redactSecrets('Authorization: Bearer mytoken123')).toBe('Authorization: [REDACTED]');
  });

  it('redacts multiple secrets in one string', () => {
    const input = 'a=sk-ant-abc b=ghp_xyz rest';
    const out = redactSecrets(input);
    expect(out).not.toContain('sk-ant-abc');
    expect(out).not.toContain('ghp_xyz');
    expect(out).toBe('a=[REDACTED] b=[REDACTED] rest');
  });

  it('preserves text after redacted secret when followed by space', () => {
    const input = 'token=ghp_abc123 and more text';
    expect(redactSecrets(input)).toBe('token=[REDACTED] and more text');
  });
});
