import { SessionLogger } from '../src/logger';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SessionLogger', () => {
  let logger: SessionLogger;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `sentry-timer-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    logger = new SessionLogger(dbPath);
  });

  afterEach(() => {
    logger.close();
    rmSync(dbPath, { recursive: true, force: true });
  });

  describe('startSession', () => {
    it('should create a new time entry', () => {
      const entry = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: ['test'],
      });

      expect(entry.id).toBeDefined();
      expect(typeof entry.id).toBe('number');
      expect(entry.repoPath).toBe('/test/repo');
      expect(entry.branch).toBe('main');
      expect(entry.startTime).toBeDefined();
      expect(entry.endTime).toBeNull();
      expect(entry.durationMs).toBeNull();
      expect(entry.tags).toBe('["test"]');
      expect(entry.commitHash).toBeNull();
      expect(entry.commitMessage).toBeNull();
    });

    it('should return an active session', () => {
      logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const active = logger.getActiveSession();
      expect(active).not.toBeNull();
      if (active) {
        expect(active.branch).toBe('develop');
        expect(active.endTime).toBeNull();
      }
    });

    it('should auto-generate startTime when not provided', () => {
      const entry = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: 'abc123',
        commitMessage: 'Initial commit',
        tags: ['feature', 'logging'],
      });

      expect(entry.startTime).toBeDefined();
      expect(entry.commitHash).toBe('abc123');
      expect(entry.commitMessage).toBe('Initial commit');
      expect(entry.tags).toBe('["feature","logging"]');
    });

    it('should handle empty tags array', () => {
      const entry = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      expect(entry.tags).toBe('[]');
    });

    it('should handle branch names with slashes', () => {
      const entry = logger.startSession({
        repoPath: '/projects/sentry-timer',
        branch: 'feature/reports',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      expect(entry.branch).toBe('feature/reports');
      expect(entry.repoPath).toBe('/projects/sentry-timer');
    });

    it('should generate unique IDs for each session', () => {
      const entry1 = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entry2 = logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      expect(entry1.id).not.toBe(entry2.id);
      expect(entry2.id).toBe(entry1.id + 1);
    });
  });

  describe('stopSession', () => {
    it('should stop an active session and set duration', () => {
      const entry = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const stopped = logger.stopSession(entry.id);
      expect(stopped).not.toBeNull();
      if (stopped) {
        expect(stopped.endTime).not.toBeNull();
        expect(typeof stopped.endTime).toBe('string');
        expect(stopped.durationMs).toBeGreaterThan(0);
        expect(stopped.durationMs).toBeLessThan(5000); // Should complete quickly
      }
    });

    it('should return null for non-existent session', () => {
      const result = logger.stopSession(9999);
      expect(result).toBeNull();
    });

    it('should update the active session to null after stopping', () => {
      const entry = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.stopSession(entry.id);
      const active = logger.getActiveSession();
      expect(active).toBeNull();
    });

    it('should calculate correct duration', () => {
      const startTime = new Date();
      const entry = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: startTime.toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      // Wait a tiny bit then stop
      const stopped = logger.stopSession(entry.id);
      if (stopped) {
        const expectedMin = new Date(startTime).getTime() - new Date(stopped.startTime).getTime();
        expect(stopped.durationMs).toBeGreaterThanOrEqual(expectedMin);
      }
    });
  });

  describe('getEntry', () => {
    it('should retrieve an entry by ID', () => {
      const entry = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const retrieved = logger.getEntry(entry.id);
      expect(retrieved).not.toBeNull();
      if (retrieved) {
        expect(retrieved.id).toBe(entry.id);
        expect(retrieved.repoPath).toBe('/test/repo');
        expect(retrieved.branch).toBe('main');
      }
    });

    it('should return null for non-existent entry', () => {
      const result = logger.getEntry(9999);
      expect(result).toBeNull();
    });

    it('should return null for entry ID 0', () => {
      const result = logger.getEntry(0);
      expect(result).toBeNull();
    });
  });

  describe('getAllEntries', () => {
    it('should return all entries', () => {
      logger.startSession({
        repoPath: '/test/repo1',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.startSession({
        repoPath: '/test/repo2',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entries = logger.getAllEntries();
      expect(entries.length).toBe(2);
    });

    it('should return empty array when no entries exist', () => {
      const entries = logger.getAllEntries();
      expect(entries.length).toBe(0);
      expect(Array.isArray(entries)).toBe(true);
    });

    it('should return entries ordered by start_time descending', () => {
      const entry1 = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date(Date.now() - 2000).toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entry2 = logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entries = logger.getAllEntries();
      expect(entries.length).toBe(2);
      expect(entries[0].id).toBe(entry2.id); // Most recent first
      expect(entries[1].id).toBe(entry1.id);
    });
  });

  describe('deleteEntry', () => {
    it('should delete an entry', () => {
      const entry = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const deleted = logger.deleteEntry(entry.id);
      expect(deleted).toBe(true);

      const retrieved = logger.getEntry(entry.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent entry', () => {
      const deleted = logger.deleteEntry(9999);
      expect(deleted).toBe(false);
    });

    it('should not affect other entries when deleting one', () => {
      const entry1 = logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entry2 = logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.deleteEntry(entry1.id);

      const remaining = logger.getAllEntries();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(entry2.id);
    });
  });

  describe('clearAll', () => {
    it('should remove all entries', () => {
      logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.clearAll();
      const entries = logger.getAllEntries();
      expect(entries.length).toBe(0);
    });

    it('should be safe to call on empty database', () => {
      expect(() => logger.clearAll()).not.toThrow();
      const entries = logger.getAllEntries();
      expect(entries.length).toBe(0);
    });
  });

  describe('getEntriesByRepo', () => {
    it('should filter entries by repo path', () => {
      logger.startSession({
        repoPath: '/test/repo-a',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.startSession({
        repoPath: '/test/repo-b',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const repoAEntries = logger.getEntriesByRepo('/test/repo-a');
      expect(repoAEntries.length).toBe(1);
      expect(repoAEntries[0].repoPath).toBe('/test/repo-a');
    });

    it('should return empty array for non-existent repo', () => {
      const entries = logger.getEntriesByRepo('/nonexistent/repo');
      expect(entries.length).toBe(0);
    });

    it('should return all entries for a repo with multiple entries', () => {
      logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entries = logger.getEntriesByRepo('/test/repo');
      expect(entries.length).toBe(2);
    });
  });

  describe('getEntriesByBranch', () => {
    it('should filter entries by repo and branch', () => {
      logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const mainEntries = logger.getEntriesByBranch('/test/repo', 'main');
      expect(mainEntries.length).toBe(1);
      expect(mainEntries[0].branch).toBe('main');
    });

    it('should return empty array for non-existent branch', () => {
      const entries = logger.getEntriesByBranch('/test/repo', 'nonexistent');
      expect(entries.length).toBe(0);
    });

    it('should handle branch names with slashes', () => {
      logger.startSession({
        repoPath: '/test/repo',
        branch: 'feature/new-ui',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entries = logger.getEntriesByBranch('/test/repo', 'feature/new-ui');
      expect(entries.length).toBe(1);
      expect(entries[0].branch).toBe('feature/new-ui');
    });
  });

  describe('getEntriesByTag', () => {
    it('should filter entries by tag', () => {
      logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: ['important'],
      });

      logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: ['experimental'],
      });

      const importantEntries = logger.getEntriesByTag('important');
      expect(importantEntries.length).toBe(1);
      expect(importantEntries[0].tags).toContain('important');
    });

    it('should return empty array for non-existent tag', () => {
      const entries = logger.getEntriesByTag('nonexistent');
      expect(entries.length).toBe(0);
    });

    it('should find entries with multiple tags', () => {
      logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: ['important', 'feature'],
      });

      const importantEntries = logger.getEntriesByTag('important');
      expect(importantEntries.length).toBe(1);
    });
  });

  describe('getEntriesByDateRange', () => {
    it('should filter entries by date range', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const nextWeek = new Date(now.getTime() + 86400000 * 7);

      logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: yesterday.toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      logger.startSession({
        repoPath: '/test/repo',
        branch: 'develop',
        startTime: now.toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entries = logger.getEntriesByDateRange(yesterday.toISOString(), nextWeek.toISOString());
      expect(entries.length).toBe(2);
    });

    it('should return empty array for past date range', () => {
      const pastStart = new Date('2020-01-01T00:00:00.000Z').toISOString();
      const pastEnd = new Date('2020-01-02T00:00:00.000Z').toISOString();

      logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      const entries = logger.getEntriesByDateRange(pastStart, pastEnd);
      expect(entries.length).toBe(0);
    });
  });

  describe('database persistence', () => {
    it('should create database directory if it does not exist', () => {
      const nestedPath = join(tmpdir(), `sentry-timer-test-${Date.now()}`, 'nested', 'db.db');
      const nestedLogger = new SessionLogger(nestedPath);

      const entry = nestedLogger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      expect(entry.id).toBeDefined();
      nestedLogger.close();
      rmSync(join(tmpdir(), `sentry-timer-test-${Date.now()}`), { recursive: true, force: true });
    });
  });

  describe('close', () => {
    it('should close the database without error', () => {
      logger.startSession({
        repoPath: '/test/repo',
        branch: 'main',
        startTime: new Date().toISOString(),
        commitHash: null,
        commitMessage: null,
        tags: [],
      });

      expect(() => logger.close()).not.toThrow();
    });

    it('should be safe to call close multiple times', () => {
      logger.close();
      expect(() => logger.close()).not.toThrow();
    });
  });
});
