import { detectGitContext, getLastCommitHash, getLastCommitMessage } from '../src/git';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('git detection', () => {
  describe('detectGitContext', () => {
    it('should return null when not in a git repository', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-test-'));
      try {
        const result = detectGitContext(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });

    it('should return repo path and branch when in a git repository', () => {
      const result = detectGitContext();
      expect(result).not.toBeNull();
      if (result) {
        expect(result.repoPath).toBeDefined();
        expect(typeof result.repoPath).toBe('string');
        expect(result.branch).toBeDefined();
        expect(typeof result.branch).toBe('string');
        expect(result.branch.length).toBeGreaterThan(0);
      }
    });

    it('should return the correct repo path for the project', () => {
      const result = detectGitContext();
      expect(result).not.toBeNull();
      if (result) {
        expect(result.repoPath).toContain('sentrytimer');
      }
    });

    it('should handle custom directory argument', () => {
      const result = detectGitContext(process.cwd());
      expect(result).not.toBeNull();
      if (result) {
        expect(result.repoPath).toBeDefined();
        expect(result.branch).toBeDefined();
      }
    });

    it('should return a valid branch name', () => {
      const result = detectGitContext();
      expect(result).not.toBeNull();
      if (result) {
        // Branch should be alphanumeric with /, -, _ allowed
        expect(result.branch).toMatch(/^[a-zA-Z0-9/_-]+$/);
      }
    });

    it('should return null for a directory with no .git folder', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-test-'));
      try {
        // Create a file to make it look like a directory with content
        writeFileSync(join(tempDir, 'test.txt'), 'hello');
        const result = detectGitContext(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });
  });

  describe('getLastCommitHash', () => {
    it('should return null when not in a git repository', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-test-'));
      try {
        const result = getLastCommitHash(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });

    it('should return a valid 40-character hex commit hash when in a git repository', () => {
      const result = getLastCommitHash();
      expect(result).not.toBeNull();
      if (result) {
        expect(result).toMatch(/^[0-9a-f]{40}$/);
      }
    });

    it('should return the same hash on repeated calls', () => {
      const hash1 = getLastCommitHash();
      const hash2 = getLastCommitHash();
      expect(hash1).toBe(hash2);
    });

    it('should return null for a non-git directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-test-'));
      try {
        const result = getLastCommitHash(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });
  });

  describe('getLastCommitMessage', () => {
    it('should return null when not in a git repository', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-test-'));
      try {
        const result = getLastCommitMessage(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });

    it('should return a non-empty commit message when in a git repository', () => {
      const result = getLastCommitMessage();
      expect(result).not.toBeNull();
      if (result) {
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should return the same message on repeated calls', () => {
      const msg1 = getLastCommitMessage();
      const msg2 = getLastCommitMessage();
      expect(msg1).toBe(msg2);
    });

    it('should return null for a non-git directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-test-'));
      try {
        const result = getLastCommitMessage(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });
  });

  describe('git context consistency', () => {
    it('should return consistent results across all git functions', () => {
      const context = detectGitContext();
      const hash = getLastCommitHash();
      const message = getLastCommitMessage();

      expect(context).not.toBeNull();
      expect(hash).not.toBeNull();
      expect(message).not.toBeNull();

      if (context && hash && message) {
        expect(context.repoPath).toBeDefined();
        expect(context.branch).toBeDefined();
        expect(hash).toMatch(/^[0-9a-f]{40}$/);
        expect(message.length).toBeGreaterThan(0);
      }
    });

    it('should all return null together for non-git directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-test-'));
      try {
        const context = detectGitContext(tempDir);
        const hash = getLastCommitHash(tempDir);
        const message = getLastCommitMessage(tempDir);

        expect(context).toBeNull();
        expect(hash).toBeNull();
        expect(message).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });
  });
});
