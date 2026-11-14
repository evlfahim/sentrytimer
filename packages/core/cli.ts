#!/usr/bin/env node
/**
 * SentryTimer CLI - Command-line interface for the time tracker.
 *
 * Usage:
 *   node dist/cli.js start [options]
 *   node dist/cli.js stop
 *   node dist/cli.js status
 *   node dist/cli.js list [options]
 *   node dist/cli.js report [options]
 *   node dist/cli.js delete <id>
 *   node dist/cli.js clear
 *   node dist/cli.js --help
 */

import {
  detectGitContext,
  getLastCommitHash,
  getLastCommitMessage,
  SessionLogger,
  type TimeEntryCreate,
  generateWeeklyReport,
  generateMarkdownReport,
  generateCSVReport,
} from './src/index';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDbPath(): string {
  const defaultPath = join(process.cwd(), '.sentry-timer', 'sessions.db');
  const envPath = process.env.SENTRY_TIMER_DB;
  if (envPath) {
    const dir = envPath.substring(0, envPath.lastIndexOf('/'));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return envPath;
  }
  const dir = defaultPath.substring(0, defaultPath.lastIndexOf('/'));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return defaultPath;
}

function getGitContext(): { repoPath: string; branch: string } | null {
  return detectGitContext(process.cwd());
}

function getCommitInfo(): { hash: string | null; message: string | null } {
  return {
    hash: getLastCommitHash(),
    message: getLastCommitMessage(),
  };
}

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

function printTable(entries: { id: number; repoPath: string; branch: string; startTime: string; endTime: string | null; durationMs: number | null }[]): void {
  if (entries.length === 0) {
    console.log('No entries found.');
    return;
  }

  // Calculate column widths
  const idWidth = Math.max(3, ...entries.map((e) => String(e.id).length));
  const repoWidth = Math.max(12, ...entries.map((e) => e.repoPath.length));
  const branchWidth = Math.max(7, ...entries.map((e) => e.branch.length));
  const startWidth = Math.max(20, ...entries.map((e) => new Date(e.startTime).toLocaleString().length));
  const endWidth = Math.max(4, ...entries.map((e) => (e.endTime ? new Date(e.endTime).toLocaleString().length : 1)));
  const durationWidth = Math.max(8, ...entries.map((e) => (e.durationMs ? formatDuration(e.durationMs).length : 1)));

  // Header
  const header = [
    padRight('ID', idWidth),
    padRight('Repository', repoWidth),
    padRight('Branch', branchWidth),
    padRight('Start', startWidth),
    padRight('End', endWidth),
    padRight('Duration', durationWidth),
  ].join('  ');

  console.log(header);
  console.log(
    [
      padRight('-'.repeat(idWidth), idWidth),
      padRight('-'.repeat(repoWidth), repoWidth),
      padRight('-'.repeat(branchWidth), branchWidth),
      padRight('-'.repeat(startWidth), startWidth),
      padRight('-'.repeat(endWidth), endWidth),
      padRight('-'.repeat(durationWidth), durationWidth),
    ].join('  ')
  );

  // Rows
  for (const entry of entries) {
    const start = new Date(entry.startTime).toLocaleString();
    const end = entry.endTime ? new Date(entry.endTime).toLocaleString() : '—';
    const duration = entry.durationMs ? formatDuration(entry.durationMs) : '—';

    console.log(
      [
        padRight(String(entry.id), idWidth),
        padRight(entry.repoPath, repoWidth),
        padRight(entry.branch, branchWidth),
        padRight(start, startWidth),
        padRight(end, endWidth),
        padRight(duration, durationWidth),
      ].join('  ')
    );
  }
}

function padRight(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdStart(tags: string[]): void {
  const gitContext = getGitContext();
  if (!gitContext) {
    console.error('Error: Not in a git repository. Use --repo and --branch to specify manually.');
    process.exit(1);
  }

  const commitInfo = getCommitInfo();
  const entry: TimeEntryCreate = {
    repoPath: gitContext.repoPath,
    branch: gitContext.branch,
    startTime: new Date().toISOString(),
    commitHash: commitInfo.hash,
    commitMessage: commitInfo.message,
    tags,
  };

  const dbPath = getDbPath();
  const logger = new SessionLogger(dbPath);

  const session = logger.startSession(entry);
  console.log(`Started session #${session.id}`);
  console.log(`  Repository: ${session.repoPath}`);
  console.log(`  Branch:     ${session.branch}`);
  if (session.commitHash) {
    console.log(`  Commit:     ${session.commitHash}`);
  }
  if (session.commitMessage) {
    console.log(`  Message:    ${session.commitMessage}`);
  }
  if (tags.length > 0) {
    console.log(`  Tags:       ${tags.join(', ')}`);
  }
  console.log(`  Started at: ${new Date(session.startTime).toLocaleString()}`);

  logger.close();
}

function cmdStop(): void {
  const dbPath = getDbPath();
  const logger = new SessionLogger(dbPath);

  const active = logger.getActiveSession();
  if (!active) {
    console.log('No active session to stop.');
    logger.close();
    return;
  }

  const stopped = logger.stopSession(active.id);
  if (!stopped) {
    console.error('Error: Failed to stop session.');
    logger.close();
    process.exit(1);
  }

  const duration = stopped.durationMs ?? 0;
  console.log(`Stopped session #${stopped.id}`);
  console.log(`  Duration:   ${formatDuration(duration)}`);
  console.log(`  Ended at:   ${new Date(stopped.endTime!).toLocaleString()}`);

  logger.close();
}

function cmdStatus(): void {
  const dbPath = getDbPath();
  const logger = new SessionLogger(dbPath);

  const active = logger.getActiveSession();
  if (!active) {
    console.log('No active session.');
    logger.close();
    return;
  }

  const now = new Date();
  const start = new Date(active.startTime).getTime();
  const elapsed = now.getTime() - start;

  console.log(`Active session #${active.id}`);
  console.log(`  Repository: ${active.repoPath}`);
  console.log(`  Branch:     ${active.branch}`);
  console.log(`  Started at: ${new Date(active.startTime).toLocaleString()}`);
  console.log(`  Elapsed:    ${formatDuration(elapsed)}`);

  logger.close();
}

function cmdList(options: { repo?: string; branch?: string; tag?: string; from?: string; to?: string }): void {
  const dbPath = getDbPath();
  const logger = new SessionLogger(dbPath);

  let entries: { id: number; repoPath: string; branch: string; startTime: string; endTime: string | null; durationMs: number | null }[];

  if (options.from && options.to) {
    entries = logger.getEntriesByDateRange(options.from, options.to);
  } else if (options.repo && options.branch) {
    entries = logger.getEntriesByRepo(options.repo);
  } else if (options.repo) {
    entries = logger.getEntriesByRepo(options.repo);
  } else if (options.tag) {
    entries = logger.getEntriesByTag(options.tag);
  } else {
    entries = logger.getAllEntries();
  }

  printTable(entries);

  logger.close();
}

function cmdReport(options: { format?: string; output?: string }): void {
  const dbPath = getDbPath();
  const logger = new SessionLogger(dbPath);

  const entries = logger.getAllEntries();
  const report = generateWeeklyReport(entries);
  const format = options.format || 'markdown';

  let content: string;
  if (format === 'csv') {
    content = generateCSVReport(report);
  } else {
    content = generateMarkdownReport(report);
  }

  if (options.output) {
    const dir = options.output.substring(0, options.output.lastIndexOf('/'));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(options.output, content);
    console.log(`Report written to ${options.output}`);
  } else {
    console.log(content);
  }

  logger.close();
}

function cmdDelete(id: number): void {
  const dbPath = getDbPath();
  const logger = new SessionLogger(dbPath);

  const deleted = logger.deleteEntry(id);
  if (deleted) {
    console.log(`Deleted session #${id}`);
  } else {
    console.error(`Error: Session #${id} not found.`);
    logger.close();
    process.exit(1);
  }

  logger.close();
}

function cmdClear(): void {
  const dbPath = getDbPath();
  const logger = new SessionLogger(dbPath);

  logger.clearAll();
  console.log('All sessions cleared.');

  logger.close();
}

// ── CLI Parser ───────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`SentryTimer - Local time tracker with git context

Usage:
  node dist/cli.js <command> [options]

Commands:
  start [options]     Start a new time-tracking session
  stop                Stop the active session
  status              Show the active session and elapsed time
  list [options]      List time entries
  report [options]    Generate a weekly report
  delete <id>         Delete a session by ID
  clear               Delete all sessions

Start Options:
  --tags <tags>       Comma-separated tags (e.g., "core,report")

List Options:
  --repo <path>       Filter by repository path
  --branch <name>     Filter by branch name
  --tag <tag>         Filter by tag
  --from <date>       Filter entries from this date (ISO 8601)
  --to <date>         Filter entries to this date (ISO 8601)

Report Options:
  --format <format>   Report format: markdown (default) or csv
  --output <path>     Write report to file instead of stdout

Examples:
  node dist/cli.js start
  node dist/cli.js start --tags core,report
  node dist/cli.js stop
  node dist/cli.js status
  node dist/cli.js list
  node dist/cli.js list --repo /projects/sentry-timer
  node dist/cli.js list --tag core
  node dist/cli.js report
  node dist/cli.js report --format csv --output report.csv
  node dist/cli.js delete 1
  node dist/cli.js clear`);
}

function parseArgs(args: string[]): { command: string; options: Record<string, string | string[] | boolean> } {
  const result: { command: string; options: Record<string, string | string[] | boolean> } = {
    command: '',
    options: {},
  };

  let i = 0;
  // First non-flag argument is the command
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        // Check if this is a multi-value flag
        if (key === 'tags') {
          result.options[key] = next.split(',');
        } else {
          result.options[key] = next;
        }
        i += 2;
      } else {
        result.options[key] = true;
        i += 1;
      }
    } else if (!result.command) {
      result.command = arg;
      i += 1;
    } else {
      // Positional argument (e.g., delete ID)
      if (!result.options._args) {
        result.options._args = [];
      }
      (result.options._args as string[]).push(arg);
      i += 1;
    }
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const parsed = parseArgs(args);
  const command = parsed.command;
  const options = parsed.options;

  switch (command) {
    case 'start':
      cmdStart((options.tags as string[]) || []);
      break;
    case 'stop':
      cmdStop();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'list':
      cmdList({
        repo: options.repo as string | undefined,
        branch: options.branch as string | undefined,
        tag: options.tag as string | undefined,
        from: options.from as string | undefined,
        to: options.to as string | undefined,
      });
      break;
    case 'report':
      cmdReport({
        format: options.format as string | undefined,
        output: options.output as string | undefined,
      });
      break;
    case 'delete': {
      const idStr = (options._args as string[])?.[0];
      if (!idStr) {
        console.error('Error: Please provide a session ID. Usage: node dist/cli.js delete <id>');
        process.exit(1);
      }
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        console.error(`Error: Invalid session ID: ${idStr}`);
        process.exit(1);
      }
      cmdDelete(id);
      break;
    }
    case 'clear':
      cmdClear();
      break;
    default:
      console.error(`Error: Unknown command "${command}". Run "node dist/cli.js --help" for usage.`);
      process.exit(1);
  }
}

main();
