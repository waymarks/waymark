/**
 * waymark resume — Resume a paused project
 *
 * Usage: waymark resume [PROJECT_NAME]
 *
 * If PROJECT_NAME is omitted, resumes the current project.
 * The project keeps its previously allocated port.
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

    if (project.status !== 'paused') {
      console.error(`Project "${name}" is not paused (current status: ${project.status})`);
      process.exit(1);
    }

    updateProjectStatus(name, 'running');
    console.log(`✓ Resumed project: ${name}`);
    console.log(`  Dashboard: http://localhost:${project.port}`);
  } catch (err: any) {
    console.error(`Failed to resume project: ${err.message}`);
    process.exit(1);
  }
}
