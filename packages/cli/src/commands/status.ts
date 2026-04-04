const BASE = 'http://localhost:3001';

export async function run(): Promise<void> {
  try {
    const [countRes, actionsRes] = await Promise.all([
      fetch(`${BASE}/api/actions?count=true`),
      fetch(`${BASE}/api/actions`)
    ]);

    if (!countRes.ok || !actionsRes.ok) throw new Error('Bad response');

    const { count: pending } = await countRes.json() as { count: number };
    const actions = await actionsRes.json() as unknown[];
    const total = actions.length;

    console.log('Waymark status');
    console.log(`Dashboard:          ${BASE} (running)`);
    console.log(`Pending approvals:  ${pending}`);
    console.log(`Total actions logged: ${total}`);
  } catch {
    console.log('Waymark is not running. Start with: waymark start');
  }
}
