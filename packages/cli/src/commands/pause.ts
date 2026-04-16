/**
 * waymark pause — Pause a project (keep port allocation, but mark as paused)
 *
 * Usage: waymark pause [PROJECT_NAME]
 *
 * If PROJECT_NAME is omitted, pauses the current project.
 */

import * as fs from 'fs';
import * as path from 'path';
import { updateProjectStatus, getProject } from '../registry';

export function run(): void {
  const projectName = process.argv[3];
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, '.waymark', 'config.json');

  if (!fs.existsSync(configPath)) {
    console.error('No .waymark/config.json found. Run: waymark init');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const name = projectName || config.projectName || path.basename(projectRoot);

  try {
    const project = getProject(name);
    if (!project) {
      console.error(`Project not found: ${name}`);
      console.error('Hint: Use "waymark list" to see registered projects');
      process.exit(1);
    }

    if (project.status === 'paused') {
      console.log(`Project "${name}" is already paused.`);
      process.exit(0);
    }

    updateProjectStatus(name, 'paused');
    console.log(`✓ Paused project: ${name}`);
    console.log(`  Port allocated: ${project.port} (reserved for this project)`);
    console.log(`  Resume with: waymark resume ${name}`);
  } catch (err: any) {
    console.error(`Failed to pause project: ${err.message}`);
    process.exit(1);
  }
}
