import { SessionLogger } from '../src/logger';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SessionLogger', () => {
  let logger: SessionLogger;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `sentry-timer-test-${Date.now()}.db`);
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
      expect(entry.repoPath).toBe('/test/repo');
      expect(entry.branch).toBe('main');
      expect(entry.startTime).toBeDefined();
      expect(entry.endTime).toBeNull();
      expect(entry.durationMs).toBeNull();
      expect(entry.tags).toBe('["test"]');
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
        expect(stopped.durationMs).toBeGreaterThan(0);
      }
    });

    it('should return null for non-existent session', () => {
      const result = logger.stopSession(9999);
      expect(result).toBeNull();
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
      }
    });

    it('should return null for non-existent entry', () => {
      const result = logger.getEntry(9999);
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

      logger.clearAll();
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
  });
});
