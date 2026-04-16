/**
 * Waymark Project Registry
 *
 * Central registry for managing active Waymark projects.
 * Stored at ~/.waymark/registry.json
 *
 * This enables:
 * - `waymark list` — enumerate all active projects
 * - `waymark open PROJECT` — quickly switch between projects
 * - Port broker — central allocation system (Phase 2 future)
 * - Project lifecycle tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ProjectEntry {
  // Identification
  id: string;                      // kebab-case project name
  projectRoot: string;             // absolute path
  projectName: string;             // human-readable name

  // Process management
  port: number;                    // allocated port (3001-4000)
  mcp_pid?: number;               // MCP process ID (optional, for cleanup)
  api_pid?: number;               // API process ID (optional, for cleanup)

  // Status tracking
  status: 'running' | 'paused' | 'stopped';  // lifecycle state
  startedAt: string;              // ISO 8601 timestamp
  stoppedAt?: string;             // ISO 8601 timestamp (when stopped)
  pausedAt?: string;              // ISO 8601 timestamp (when paused)

  // Metadata
  hostname: string;               // machine where running
  user: string;                   // user who started it
}

export interface Registry {
  version: 1;                     // schema version (for future migrations)
  projects: { [id: string]: ProjectEntry };
  releasedPorts: number[];        // Phase 4: ports freed for reuse
  lastUpdated: string;            // ISO 8601 timestamp
}

const REGISTRY_DIR = path.join(os.homedir(), '.waymark');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'registry.json');

/**
 * Ensure registry directory and file exist
 */
function ensureRegistry(): Registry {
  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  }

  if (!fs.existsSync(REGISTRY_PATH)) {
    const empty: Registry = {
      version: 1,
      projects: {},
      releasedPorts: [],
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(empty, null, 2) + '\n');
    return empty;
  }

  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    // Ensure releasedPorts exists for Phase 4
    if (!reg.releasedPorts) {
      reg.releasedPorts = [];
    }
    return reg;
  } catch (err) {
    throw new Error(`Failed to read registry: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Get the current registry
 */
export function getRegistry(): Registry {
  return ensureRegistry();
}

/**
 * Register a project (called on `waymark start`)
 */
export function registerProject(entry: ProjectEntry): void {
  const registry = ensureRegistry();

  entry.startedAt = entry.startedAt || new Date().toISOString();
  entry.status = entry.status || 'running';
  entry.hostname = entry.hostname || os.hostname();
  entry.user = entry.user || process.env.USER || 'unknown';

  registry.projects[entry.id] = entry;
  registry.lastUpdated = new Date().toISOString();

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
}

/**
 * Unregister a project (called on `waymark stop`)
 */
export function unregisterProject(id: string): void {
  const registry = ensureRegistry();
  delete registry.projects[id];
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
}

/**
 * Update project status
 */
export function updateProjectStatus(id: string, status: 'running' | 'paused' | 'stopped'): void {
  const registry = ensureRegistry();
  const entry = registry.projects[id];

  if (!entry) {
    throw new Error(`Project not found: ${id}`);
  }

  entry.status = status;

  if (status === 'stopped') {
    entry.stoppedAt = new Date().toISOString();
  } else if (status === 'paused') {
    entry.pausedAt = new Date().toISOString();
  }

  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
}

/**
 * Phase 4: Release a port when project stops (enables reuse)
 */
export function releasePort(projectId: string): void {
  const registry = ensureRegistry();
  const entry = registry.projects[projectId];

  if (!entry) {
    return; // Project not found, nothing to do
  }

  // Add port to released queue for reuse
  if (!registry.releasedPorts) {
    registry.releasedPorts = [];
  }

  registry.releasedPorts.push(entry.port);
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
}

/**
 * Get a project by ID
 */
export function getProject(id: string): ProjectEntry | null {
  const registry = ensureRegistry();
  return registry.projects[id] || null;
}

/**
 * Find a project by directory path
 */
export function findProjectByPath(projectRoot: string): ProjectEntry | null {
  const registry = ensureRegistry();
  const normalized = path.resolve(projectRoot);

  for (const entry of Object.values(registry.projects)) {
    if (path.resolve(entry.projectRoot) === normalized) {
      return entry;
    }
  }

  return null;
}

/**
 * List all projects
 */
export function listProjects(filter?: 'running' | 'paused' | 'stopped'): ProjectEntry[] {
  const registry = ensureRegistry();
  const entries = Object.values(registry.projects);

  if (filter) {
    return entries.filter(e => e.status === filter);
  }

  return entries;
}

/**
 * Find available port in the 3001-4000 range
 * (Phase 2 future: will be replaced by central port broker)
 */
export function findAvailablePort(preferred: number = 3001): number {
  const registry = ensureRegistry();
  const usedPorts = new Set(
    Object.values(registry.projects)
      .filter(p => p.status === 'running')
      .map(p => p.port)
  );

  // Phase 4: Check if we have a released port to reuse first
  if (registry.releasedPorts && registry.releasedPorts.length > 0) {
    const releasedPort = registry.releasedPorts.shift();
    if (releasedPort && !usedPorts.has(releasedPort)) {
      // Save updated registry with shifted port
      registry.lastUpdated = new Date().toISOString();
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
      return releasedPort;
    }
  }

  // Check if preferred is available
  if (!usedPorts.has(preferred)) {
    return preferred;
  }

  // Find next available
  for (let port = 3001; port <= 4000; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error('No available ports in range 3001-4000');
}

/**
 * Clean up stale entries (processes that are dead but not unregistered)
 * Called periodically by waymark list/status commands
 */
export function cleanupStaleEntries(): void {
  const registry = ensureRegistry();
  let changed = false;

  for (const [id, entry] of Object.entries(registry.projects)) {
    if (entry.status === 'running' && entry.mcp_pid) {
      try {
        process.kill(entry.mcp_pid, 0);  // Check if process exists
      } catch {
        // Process is dead — mark as stopped
        entry.status = 'stopped';
        entry.stoppedAt = new Date().toISOString();
        changed = true;
      }
    }
  }

  if (changed) {
    registry.lastUpdated = new Date().toISOString();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
  }
}

/**
 * Phase 4: Garbage collect stale entries (cleanup old stopped projects)
 * Removes entries older than daysOld that are marked as stopped
 */
export function garbageCollectRegistry(daysOld: number = 7): number {
  const registry = ensureRegistry();
  const cutoffTime = new Date();
  cutoffTime.setDate(cutoffTime.getDate() - daysOld);

  let removed = 0;
  const idsToRemove: string[] = [];

  for (const [id, entry] of Object.entries(registry.projects)) {
    if (entry.status === 'stopped' && entry.stoppedAt) {
      const stoppedTime = new Date(entry.stoppedAt);
      if (stoppedTime < cutoffTime) {
        idsToRemove.push(id);
      }
    }
  }

  for (const id of idsToRemove) {
    delete registry.projects[id];
    removed++;
  }

  if (removed > 0) {
    // Clean up released ports queue (keep only last 20)
    if (registry.releasedPorts && registry.releasedPorts.length > 20) {
      registry.releasedPorts = registry.releasedPorts.slice(-20);
    }
    
    registry.lastUpdated = new Date().toISOString();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
  }

  return removed;
}
