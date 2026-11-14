import {
  generateWeeklyReport,
  generateMarkdownReport,
  generateCSVReport,
} from '../src/report';
import { TimeEntry } from '../src/logger';

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

  describe('generateWeeklyReport', () => {
    it('should filter entries to the current week', () => {
      const now = new Date();
      const weekStart = new Date(now);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const startDate = weekStart.toISOString();
      const endDate = weekEnd.toISOString();

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
      const now = new Date();
      const weekStart = new Date(now);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);
      const startDate = weekStart.toISOString();

      const entries: TimeEntry[] = [
        createEntry('/repo/a', 'main', startDate, 3600000),
        createEntry('/repo/b', 'main', startDate, 7200000),
      ];

      const report = generateWeeklyReport(entries);
      expect(report.byRepo.size).toBe(2);
      expect(report.byRepo.has('/repo/a')).toBe(true);
      expect(report.byRepo.has('/repo/b')).toBe(true);
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate a valid markdown report', () => {
      const now = new Date();
      const weekStart = new Date(now);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);
      const startDate = weekStart.toISOString();

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
    });
  });

  describe('generateCSVReport', () => {
    it('should generate a valid CSV report', () => {
      const now = new Date();
      const weekStart = new Date(now);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);
      const startDate = weekStart.toISOString();

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
  });
});
