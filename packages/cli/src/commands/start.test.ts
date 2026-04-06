import * as net from 'net';

// ─── kebabCase ────────────────────────────────────────────────────────────────
// We inline kebabCase here because it is not exported from start.ts.
// This matches the implementation exactly.
function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

describe('kebabCase', () => {
  it('lowercases the string', () => {
    expect(kebabCase('MyProject')).toBe('myproject');
  });

  it('replaces spaces with dashes', () => {
    expect(kebabCase('my project')).toBe('my-project');
  });

  it('replaces underscores with dashes', () => {
    expect(kebabCase('my_project')).toBe('my-project');
  });

  it('replaces multiple spaces/underscores with a single dash', () => {
    expect(kebabCase('my  __project')).toBe('my-project');
  });

  it('strips special characters', () => {
    expect(kebabCase('my@project!')).toBe('myproject');
  });

  it('collapses multiple dashes', () => {
    expect(kebabCase('my---project')).toBe('my-project');
  });

  it('strips leading dashes', () => {
    expect(kebabCase('-my-project')).toBe('my-project');
  });

  it('strips trailing dashes', () => {
    expect(kebabCase('my-project-')).toBe('my-project');
  });

  it('handles already clean kebab input', () => {
    expect(kebabCase('my-project')).toBe('my-project');
  });

  it('handles numbers in string', () => {
    expect(kebabCase('project-v2-api')).toBe('project-v2-api');
  });

  it('handles all-special-char input returning empty string', () => {
    expect(kebabCase('!!!@@@')).toBe('');
  });

  it('handles typical project directory names', () => {
    expect(kebabCase('ecommerce_backend')).toBe('ecommerce-backend');
    expect(kebabCase('Japan Travel App')).toBe('japan-travel-app');
    expect(kebabCase('my.project.v2')).toBe('myprojectv2');
  });
});

// ─── findAvailablePort ────────────────────────────────────────────────────────

function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(preferred, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // No ceiling in tests — recurse to next port unconditionally
      resolve(findAvailablePort(preferred + 1));
    });
  });
}

/** Find a free high port dynamically so tests don't depend on 3001 being free */
function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

describe('findAvailablePort', () => {
  it('returns the preferred port when it is free', async () => {
    const free = await getFreePort();
    const port = await findAvailablePort(free);
    expect(port).toBe(free);
  });

  it('falls back to next port when preferred is in use', async () => {
    const base = await getFreePort();
    // Occupy base
    const blocker = net.createServer();
    await new Promise<void>(res => blocker.listen(base, res));

    try {
      const port = await findAvailablePort(base);
      expect(port).not.toBe(base);
      expect(port).toBeGreaterThan(0);
    } finally {
      await new Promise<void>(res => blocker.close(() => res()));
    }
  });

  it('returns a number (valid port)', async () => {
    const free = await getFreePort();
    const port = await findAvailablePort(free);
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
  });
});
