import { detectGitContext, getLastCommitHash, getLastCommitMessage } from '../src/git';

describe('git detection', () => {
  describe('detectGitContext', () => {
    it('should return null when not in a git repository', () => {
      // Create a temp directory that is not a git repo
      const { execSync } = require('child_process');
      const { mkdtempSync, rmSync } = require('fs');
      const { tmpdir } = require('os');
      const path = require('path');

      const tempDir = mkdtempSync(path.join(tmpdir(), 'sentry-timer-test-'));
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
  });

  describe('getLastCommitHash', () => {
    it('should return null when not in a git repository', () => {
      const { execSync } = require('child_process');
      const { mkdtempSync, rmSync } = require('fs');
      const { tmpdir } = require('os');
      const path = require('path');

      const tempDir = mkdtempSync(path.join(tmpdir(), 'sentry-timer-test-'));
      try {
        const result = getLastCommitHash(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });

    it('should return a commit hash when in a git repository', () => {
      const result = getLastCommitHash();
      expect(result).not.toBeNull();
      if (result) {
        expect(result).toMatch(/^[0-9a-f]{40}$/);
      }
    });
  });

  describe('getLastCommitMessage', () => {
    it('should return null when not in a git repository', () => {
      const { execSync } = require('child_process');
      const { mkdtempSync, rmSync } = require('fs');
      const { tmpdir } = require('os');
      const path = require('path');

      const tempDir = mkdtempSync(path.join(tmpdir(), 'sentry-timer-test-'));
      try {
        const result = getLastCommitMessage(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true });
      }
    });

    it('should return a commit message when in a git repository', () => {
      const result = getLastCommitMessage();
      expect(result).not.toBeNull();
      if (result) {
        expect(typeof result).toBe('string');
      }
    });
  });
});
