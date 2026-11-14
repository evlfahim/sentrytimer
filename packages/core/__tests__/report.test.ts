import {
  generateWeeklyReport,
  generateMarkdownReport,
  generateCSVReport,
  writeMarkdownReport,
  writeCSVReport,
} from '../src/report';
import { TimeEntry } from '../src/logger';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('report generation', () => {
  const createEntry = (
    repoPath: string,
    branch: string,
    startTime: string,
    durationMs: number
  ): TimeEntry => ({
    id: 1,
    repoPath,
    branch,
    startTime,
    endTime: new Date(new Date(startTime).getTime() + durationMs).toISOString(),
    durationMs,
    commitHash: null,
    commitMessage: null,
    tags: '[]',
  });

  const createEntryWithId = (
    id: number,
    repoPath: string,
    branch: string,
    startTime: string,
    durationMs: number
  ): TimeEntry => ({
    id,
    repoPath,
    branch,
    startTime,
    endTime: new Date(new Date(startTime).getTime() + durationMs).toISOString(),
    durationMs,
    commitHash: null,
    commitMessage: null,
    tags: '[]',
  });

  const getCurrentWeekEntries = (): { weekStart: Date; weekEnd: Date; startDate: string } => {
    const now = new Date();
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return {
      weekStart,
      weekEnd,
      startDate: weekStart.toISOString(),
    };
  };

  describe('generateWeeklyReport', () => {
    it('should filter entries to the current week', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
        createEntry('/test/repo', 'develop', startDate, 7200000),
        createEntry('/test/repo', 'main', '2020-01-01T00:00:00.000Z', 3600000), // outside week
      ];

      const report = generateWeeklyReport(entries);

      expect(report.entries.length).toBe(2);
      expect(report.totalDurationMs).toBe(10800000);
      expect(report.byRepo.size).toBe(1);
      expect(report.byBranch.size).toBe(2);
    });

    it('should handle empty entries', () => {
      const report = generateWeeklyReport([]);
      expect(report.entries.length).toBe(0);
      expect(report.totalDurationMs).toBe(0);
      expect(report.byRepo.size).toBe(0);
      expect(report.byBranch.size).toBe(0);
    });

    it('should group by repo correctly', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/repo/a', 'main', startDate, 3600000),
        createEntry('/repo/b', 'main', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      expect(report.byRepo.size).toBe(2);
      expect(report.byRepo.has('/repo/a')).toBe(true);
      expect(report.byRepo.has('/repo/b')).toBe(true);
      expect(report.byRepo.get('/repo/a')!.totalMs).toBe(3600000);
      expect(report.byRepo.get('/repo/b')!.totalMs).toBe(7200000);
    });

    it('should group by branch correctly', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
        createEntry('/test/repo', 'develop', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      expect(report.byBranch.size).toBe(2);
      expect(report.byBranch.has('/test/repo|||main')).toBe(true);
      expect(report.byBranch.has('/test/repo|||develop')).toBe(true);
    });

    it('should handle branch names with slashes using ||| separator', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/projects/sentry-timer', 'feature/reports', startDate, 3600000),
        createEntry('/projects/sentry-timer', 'feature/reports-v2', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      expect(report.byBranch.size).toBe(2);
      expect(report.byBranch.has('/projects/sentry-timer|||feature/reports')).toBe(true);
      expect(report.byBranch.has('/projects/sentry-timer|||feature/reports-v2')).toBe(true);
    });

    it('should calculate total duration correctly', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000), // 1 hour
        createEntry('/test/repo', 'develop', startDate, 7200000), // 2 hours
        createEntry('/test/repo', 'main', startDate, 1800000), // 30 minutes
      ];

      const report = generateWeeklyReport(entries);
      expect(report.totalDurationMs).toBe(12600000); // 1h + 2h + 0.5h = 3.5h
    });

    it('should include weekStart and weekEnd dates', () => {
      const { startDate } = getCurrentWeekEntries();
      const report = generateWeeklyReport([createEntry('/test/repo', 'main', startDate, 3600000)]);

      expect(report.weekStart).toBeDefined();
      expect(report.weekEnd).toBeDefined();
      expect(typeof report.weekStart).toBe('string');
      expect(typeof report.weekEnd).toBe('string');
    });

    it('should include all filtered entries in the entries array', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntryWithId(1, '/test/repo', 'main', startDate, 3600000),
        createEntryWithId(2, '/test/repo', 'develop', startDate, 7200000),
        createEntryWithId(3, '/other/repo', 'main', startDate, 1800000),
      ];

      const report = generateWeeklyReport(entries);
      expect(report.entries.length).toBe(3);
      expect(report.entries.map((e) => e.id)).toEqual([1, 2, 3]);
    });

    it('should exclude entries outside the current week', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', '2020-01-01T00:00:00.000Z', 3600000), // old
        createEntry('/test/repo', 'develop', '2030-01-01T00:00:00.000Z', 7200000), // future
      ];

      const report = generateWeeklyReport(entries);
      expect(report.entries.length).toBe(0);
      expect(report.totalDurationMs).toBe(0);
    });

    it('should handle entries with null durationMs', () => {
      const { startDate } = getCurrentWeekEntries();

      const entry: TimeEntry = {
        id: 1,
        repoPath: '/test/repo',
        branch: 'main',
        startTime: startDate,
        endTime: null,
        durationMs: null,
        commitHash: null,
        commitMessage: null,
        tags: '[]',
      };

      const report = generateWeeklyReport([entry]);
      expect(report.totalDurationMs).toBe(0);
      expect(report.entries.length).toBe(1);
    });

    it('should aggregate repo totals correctly with multiple repos', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/repo/a', 'main', startDate, 3600000),
        createEntry('/repo/a', 'develop', startDate, 1800000),
        createEntry('/repo/b', 'main', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      expect(report.byRepo.get('/repo/a')!.totalMs).toBe(5400000);
      expect(report.byRepo.get('/repo/b')!.totalMs).toBe(7200000);
      expect(report.byRepo.get('/repo/a')!.entries.length).toBe(2);
      expect(report.byRepo.get('/repo/b')!.entries.length).toBe(1);
    });

    it('should aggregate branch totals correctly', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
        createEntry('/test/repo', 'main', startDate, 1800000),
        createEntry('/test/repo', 'develop', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      expect(report.byBranch.get('/test/repo|||main')!.totalMs).toBe(5400000);
      expect(report.byBranch.get('/test/repo|||main')!.entries.length).toBe(2);
      expect(report.byBranch.get('/test/repo|||develop')!.totalMs).toBe(7200000);
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate a valid markdown report', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('# Weekly Time Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## By Repository');
      expect(markdown).toContain('## By Branch');
      expect(markdown).toContain('/test/repo');
      expect(markdown).toContain('main');
    });

    it('should handle empty report', () => {
      const report = generateWeeklyReport([]);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('# Weekly Time Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).not.toContain('## By Repository');
      expect(markdown).not.toContain('## By Branch');
      expect(markdown).not.toContain('## Detailed Entries');
    });

    it('should include total time in summary', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('Total Time');
      expect(markdown).toContain('1h 0m');
    });

    it('should include session count in summary', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
        createEntry('/test/repo', 'develop', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('**Sessions:** 2');
    });

    it('should include repository table', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/repo/a', 'main', startDate, 3600000),
        createEntry('/repo/b', 'develop', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('| Repository | Time |');
      expect(markdown).toContain('| `/repo/a` |');
      expect(markdown).toContain('| `/repo/b` |');
    });

    it('should include branch table', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('| Repository | Branch | Time |');
      expect(markdown).toContain('/test/repo');
      expect(markdown).toContain('main');
    });

    it('should include detailed entries table', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('## Detailed Entries');
      expect(markdown).toContain('| Start | End | Duration | Repository | Branch |');
    });

    it('should handle branch names with slashes in markdown', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/projects/sentry-timer', 'feature/reports', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('feature/reports');
      expect(markdown).toContain('/projects/sentry-timer');
    });

    it('should format duration correctly for minutes', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 300000), // 5 minutes
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('5m 0s');
    });

    it('should format duration correctly for seconds', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 45000), // 45 seconds
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('45s');
    });

    it('should include period dates in header', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('Period:');
      expect(markdown).toContain('—');
    });
  });

  describe('generateCSVReport', () => {
    it('should generate a valid CSV report', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const csv = generateCSVReport(report);

      expect(csv).toContain('id,repo_path,branch,start_time,end_time,duration_ms');
      expect(csv).toContain('/test/repo');
      expect(csv).toContain('main');
    });

    it('should handle empty report', () => {
      const report = generateWeeklyReport([]);
      const csv = generateCSVReport(report);

      expect(csv).toContain('id,repo_path,branch,start_time,end_time,duration_ms');
      // CSV has header + trailing newline, so split gives 2 elements
      expect(csv.trim().split('\n').length).toBe(1); // only header line
    });

    it('should include all entry fields in CSV', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const csv = generateCSVReport(report);

      expect(csv).toContain('commit_hash');
      expect(csv).toContain('commit_message');
    });

    it('should handle multiple entries in CSV', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntryWithId(1, '/test/repo', 'main', startDate, 3600000),
        createEntryWithId(2, '/test/repo', 'develop', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      const csv = generateCSVReport(report);

      const lines = csv.trim().split('\n');
      expect(lines.length).toBe(3); // header + 2 data rows
      expect(csv).toContain('1,');
      expect(csv).toContain('2,');
    });

    it('should handle branch names with slashes in CSV', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/projects/sentry-timer', 'feature/reports', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const csv = generateCSVReport(report);

      expect(csv).toContain('feature/reports');
    });

    it('should quote fields containing special characters', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      const csv = generateCSVReport(report);

      // repo_path should be quoted
      expect(csv).toContain('"/test/repo"');
    });
  });

  describe('writeMarkdownReport', () => {
    it('should write a markdown report to a file', () => {
      const { startDate } = getCurrentWeekEntries();
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-report-test-'));
      const outputPath = join(tempDir, 'report.md');

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      writeMarkdownReport(report, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('# Weekly Time Report');
      expect(content).toContain('/test/repo');

      rmSync(tempDir, { recursive: true });
    });

    it('should create directories if they do not exist', () => {
      const { startDate } = getCurrentWeekEntries();
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-report-test-'));
      const nestedPath = join(tempDir, 'nested', 'deep', 'report.md');

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      writeMarkdownReport(report, nestedPath);

      expect(existsSync(nestedPath)).toBe(true);
      rmSync(tempDir, { recursive: true });
    });

    it('should write empty report correctly', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-report-test-'));
      const outputPath = join(tempDir, 'empty-report.md');

      const report = generateWeeklyReport([]);
      writeMarkdownReport(report, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('# Weekly Time Report');

      rmSync(tempDir, { recursive: true });
    });
  });

  describe('writeCSVReport', () => {
    it('should write a CSV report to a file', () => {
      const { startDate } = getCurrentWeekEntries();
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-report-test-'));
      const outputPath = join(tempDir, 'report.csv');

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      writeCSVReport(report, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('id,repo_path,branch,start_time,end_time,duration_ms');
      expect(content).toContain('/test/repo');

      rmSync(tempDir, { recursive: true });
    });

    it('should create directories if they do not exist', () => {
      const { startDate } = getCurrentWeekEntries();
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-report-test-'));
      const nestedPath = join(tempDir, 'nested', 'deep', 'report.csv');

      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 3600000),
      ];

      const report = generateWeeklyReport(entries);
      writeCSVReport(report, nestedPath);

      expect(existsSync(nestedPath)).toBe(true);
      rmSync(tempDir, { recursive: true });
    });

    it('should write empty report correctly', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sentry-timer-report-test-'));
      const outputPath = join(tempDir, 'empty-report.csv');

      const report = generateWeeklyReport([]);
      writeCSVReport(report, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('id,repo_path,branch,start_time,end_time,duration_ms');

      rmSync(tempDir, { recursive: true });
    });
  });

  describe('formatDuration helper', () => {
    it('should format hours correctly', () => {
      const { startDate } = getCurrentWeekEntries();
      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 7200000), // 2 hours
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('2h 0m');
    });

    it('should format mixed hours and minutes correctly', () => {
      const { startDate } = getCurrentWeekEntries();
      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 5400000), // 1h 30m
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('1h 30m');
    });

    it('should format minutes correctly', () => {
      const { startDate } = getCurrentWeekEntries();
      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 300000), // 5 minutes
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('5m 0s');
    });

    it('should format seconds correctly', () => {
      const { startDate } = getCurrentWeekEntries();
      const entries: TimeEntry[] = [
        createEntry('/test/repo', 'main', startDate, 45000), // 45 seconds
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('45s');
    });
  });

  describe('end-to-end report generation', () => {
    it('should produce consistent markdown and CSV from the same report', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntryWithId(1, '/repo/a', 'main', startDate, 3600000),
        createEntryWithId(2, '/repo/a', 'develop', startDate, 7200000),
        createEntryWithId(3, '/repo/b', 'main', startDate, 1800000),
      ];

      const report = generateWeeklyReport(entries);
      const markdown = generateMarkdownReport(report);
      const csv = generateCSVReport(report);

      // Both should contain the repo paths
      expect(markdown).toContain('/repo/a');
      expect(csv).toContain('/repo/a');
      expect(markdown).toContain('/repo/b');
      expect(csv).toContain('/repo/b');

      // Both should contain the branch names
      expect(markdown).toContain('main');
      expect(csv).toContain('main');
      expect(markdown).toContain('develop');
      expect(csv).toContain('develop');
    });

    it('should handle a realistic multi-repo, multi-branch scenario', () => {
      const { startDate } = getCurrentWeekEntries();

      const entries: TimeEntry[] = [
        createEntryWithId(1, '/projects/web-app', 'main', startDate, 3600000),
        createEntryWithId(2, '/projects/web-app', 'feature/auth', startDate, 7200000),
        createEntryWithId(3, '/projects/api-server', 'main', startDate, 5400000),
        createEntryWithId(4, '/projects/api-server', 'develop', startDate, 1800000),
        createEntryWithId(5, '/projects/web-app', 'main', startDate, 900000),
      ];

      const report = generateWeeklyReport(entries);

      // Verify totals
      expect(report.entries.length).toBe(5);
      // 3600000 + 7200000 + 5400000 + 1800000 + 900000 = 18900000
      expect(report.totalDurationMs).toBe(18900000);

      // Verify repo grouping
      expect(report.byRepo.size).toBe(2);
      expect(report.byRepo.get('/projects/web-app')!.totalMs).toBe(11700000); // 3.6 + 7.2 + 0.9
      expect(report.byRepo.get('/projects/api-server')!.totalMs).toBe(7200000); // 5.4 + 1.8

      // Verify branch grouping
      expect(report.byBranch.size).toBe(4);
      expect(report.byBranch.get('/projects/web-app|||main')!.totalMs).toBe(4500000); // 3.6 + 0.9
      expect(report.byBranch.get('/projects/web-app|||feature/auth')!.totalMs).toBe(7200000);
      expect(report.byBranch.get('/projects/api-server|||main')!.totalMs).toBe(5400000);
      expect(report.byBranch.get('/projects/api-server|||develop')!.totalMs).toBe(1800000);

      // Verify markdown output
      const markdown = generateMarkdownReport(report);
      expect(markdown).toContain('# Weekly Time Report');
      expect(markdown).toContain('/projects/web-app');
      expect(markdown).toContain('/projects/api-server');
      expect(markdown).toContain('feature/auth');

      // Verify CSV output
      const csv = generateCSVReport(report);
      expect(csv).toContain('/projects/web-app');
      expect(csv).toContain('/projects/api-server');
      expect(csv).toContain('feature/auth');
    });
  });
});
