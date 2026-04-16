/**
 * waymark open — Open a project dashboard in browser
 *
 * Usage: waymark open PROJECT_NAME
 *
 * If the project is not running, starts it first.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getProject, listProjects, cleanupStaleEntries } from '../registry';

function openBrowser(url: string): void {
  try {
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    execSync(`${cmd} ${url}`, { stdio: 'ignore' });
  } catch {
    console.log(`Open this URL in your browser: ${url}`);
  }
}

export function run(): void {
  const projectName = process.argv[3];

  if (!projectName) {
    console.error('Usage: waymark open PROJECT_NAME');
    console.error('');
    console.error('Example:');
    console.error('  waymark open my-app');
    console.error('');
    console.error('Registered projects:');
    cleanupStaleEntries();
    const projects = listProjects('running');
    if (projects.length > 0) {
      projects.forEach(p => {
        console.error(`  - ${p.id} (port ${p.port})`);
      });
    } else {
      console.error('  (none running — run: waymark start)');
    }
    process.exit(1);
  }

  cleanupStaleEntries();
  const project = getProject(projectName);

  if (!project) {
    console.error(`Project not found: ${projectName}`);
    console.error('');
    console.error('Available projects:');
    const all = listProjects();
    if (all.length > 0) {
      all.forEach(p => {
        const status = p.status === 'running' ? '🟢' : '🔴';
        console.error(`  ${status} ${p.id} (port ${p.port})`);
      });
    } else {
      console.error('  (none registered)');
    }
    process.exit(1);
  }

  if (project.status !== 'running') {
    console.log(`Project "${projectName}" is ${project.status}. Starting...`);

    // Try to start it by running `waymark start` in its directory
    const cwd = process.cwd();
    try {
      process.chdir(project.projectRoot);
      execSync('npx @way_marks/cli start', { stdio: 'inherit' });
    } finally {
      process.chdir(cwd);
    }
  }

  const url = `http://localhost:${project.port}`;
  console.log(`Opening dashboard: ${url}`);
  openBrowser(url);
}
