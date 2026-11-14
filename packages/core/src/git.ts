import { execSync } from 'child_process';

/**
 * Detects the active git repository and branch for a given directory.
 * @param dir - The directory to check (defaults to current working directory).
 * @returns An object with repoPath and branch, or null if not in a git repo.
 */
export function detectGitContext(dir: string = process.cwd()): { repoPath: string; branch: string } | null {
  try {
    // Check if we're in a git repository
    const repoPath = execSync('git rev-parse --show-toplevel', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Get the current branch name
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return { repoPath, branch };
  } catch {
    return null;
  }
}

/**
 * Gets the last commit hash for a given directory.
 * @param dir - The directory to check.
 * @returns The commit hash or null if not in a git repo.
 */
export function getLastCommitHash(dir: string = process.cwd()): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Gets the last commit message for a given directory.
 * @param dir - The directory to check.
 * @returns The commit message or null if not in a git repo.
 */
export function getLastCommitMessage(dir: string = process.cwd()): string | null {
  try {
    return execSync('git log -1 --pretty=%B', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}
