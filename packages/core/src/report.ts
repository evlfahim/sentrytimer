import { TimeEntry } from './logger';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  totalDurationMs: number;
  entries: TimeEntry[];
  byRepo: Map<string, { totalMs: number; entries: TimeEntry[] }>;
  byBranch: Map<string, { totalMs: number; entries: TimeEntry[] }>;
}

/**
 * Gets the start of the week (Monday) for a given date.
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Gets the end of the week (Sunday) for a given date.
 */
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Generates a weekly report from a list of time entries.
 */
export function generateWeeklyReport(entries: TimeEntry[]): WeeklyReport {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  const startDate = weekStart.toISOString();
  const endDate = weekEnd.toISOString();

  const filteredEntries = entries.filter(
    (entry) => entry.startTime >= startDate && entry.startTime <= endDate
  );

  const byRepo = new Map<string, { totalMs: number; entries: TimeEntry[] }>();
  const byBranch = new Map<string, { totalMs: number; entries: TimeEntry[] }>();

  let totalDurationMs = 0;

  for (const entry of filteredEntries) {
    const duration = entry.durationMs ?? 0;
    totalDurationMs += duration;

    // Group by repo
    if (!byRepo.has(entry.repoPath)) {
      byRepo.set(entry.repoPath, { totalMs: 0, entries: [] });
    }
    byRepo.get(entry.repoPath)!.totalMs += duration;
    byRepo.get(entry.repoPath)!.entries.push(entry);

    // Group by branch (keyed as "repoPath|||branch")
    const branchKey = `${entry.repoPath}|||${entry.branch}`;
    if (!byBranch.has(branchKey)) {
      byBranch.set(branchKey, { totalMs: 0, entries: [] });
    }
    byBranch.get(branchKey)!.totalMs += duration;
    byBranch.get(branchKey)!.entries.push(entry);
  }

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    totalDurationMs,
    entries: filteredEntries,
    byRepo,
    byBranch,
  };
}

/**
 * Generates a Markdown report from a weekly report.
 */
export function generateMarkdownReport(report: WeeklyReport): string {
  const weekStart = new Date(report.weekStart).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const weekEnd = new Date(report.weekEnd).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let md = `# Weekly Time Report\n\n`;
  md += `**Period:** ${weekStart} — ${weekEnd}\n\n`;
  md += `## Summary\n\n`;
  md += `- **Total Time:** ${formatDuration(report.totalDurationMs)}\n`;
  md += `- **Sessions:** ${report.entries.length}\n\n`;

  // By repo
  if (report.byRepo.size > 0) {
    md += `## By Repository\n\n`;
    md += `| Repository | Time |\n`;
    md += `| ---------- | ---- |\n`;
    for (const [repoPath, data] of report.byRepo) {
      md += `| \`${repoPath}\` | ${formatDuration(data.totalMs)} |\n`;
    }
    md += `\n`;
  }

  // By branch
  if (report.byBranch.size > 0) {
    md += `## By Branch\n\n`;
    md += `| Repository | Branch | Time |\n`;
    md += `| ---------- | ------ | ---- |\n`;
    for (const [branchKey, data] of report.byBranch) {
      // branchKey is "${repoPath}|||${branch}"
      const sepIdx = branchKey.indexOf('|||');
      const repoPath = branchKey.substring(0, sepIdx);
      const branch = branchKey.substring(sepIdx + 3);
      md += `| \`${repoPath}\` | \`${branch}\` | ${formatDuration(data.totalMs)} |\n`;
    }
    md += `\n`;
  }

  // Detailed entries
  if (report.entries.length > 0) {
    md += `## Detailed Entries\n\n`;
    md += `| Start | End | Duration | Repository | Branch |\n`;
    md += `| ----- | --- | -------- | ---------- | ------ |\n`;
    for (const entry of report.entries) {
      const start = new Date(entry.startTime).toLocaleString();
      const end = entry.endTime ? new Date(entry.endTime).toLocaleString() : '—';
      const duration = entry.durationMs ? formatDuration(entry.durationMs) : '—';
      md += `| ${start} | ${end} | ${duration} | \`${entry.repoPath}\` | \`${entry.branch}\` |\n`;
    }
    md += `\n`;
  }

  return md;
}

/**
 * Generates a CSV report from a weekly report.
 */
export function generateCSVReport(report: WeeklyReport): string {
  let csv = 'id,repo_path,branch,start_time,end_time,duration_ms,commit_hash,commit_message\n';

  for (const entry of report.entries) {
    csv += `${entry.id},"${entry.repoPath}","${entry.branch}",${entry.startTime},${entry.endTime || ''},${entry.durationMs || ''},"${entry.commitHash || ''}","${entry.commitMessage || ''}"\n`;
  }

  return csv;
}

/**
 * Writes a Markdown report to a file.
 */
export function writeMarkdownReport(report: WeeklyReport, outputPath: string): void {
  const content = generateMarkdownReport(report);
  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(outputPath, content);
}

/**
 * Writes a CSV report to a file.
 */
export function writeCSVReport(report: WeeklyReport, outputPath: string): void {
  const content = generateCSVReport(report);
  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(outputPath, content);
}
