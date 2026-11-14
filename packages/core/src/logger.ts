import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { type SentryTimerConfig, loadConfig } from './config';

export interface TimeEntry {
  id: number;
  repoPath: string;
  branch: string;
  startTime: string; // ISO 8601
  endTime: string | null; // ISO 8601, null if still running
  durationMs: number | null; // null if still running
  commitHash: string | null;
  commitMessage: string | null;
  tags: string; // JSON stringified array of tags
}

export interface TimeEntryCreate {
  repoPath: string;
  branch: string;
  startTime: string;
  commitHash: string | null;
  commitMessage: string | null;
  tags: string[];
}

export interface TimeEntryUpdate {
  id: number;
  endTime: string;
  durationMs: number;
}

const DEFAULT_DB_PATH = join(process.cwd(), '.sentry-timer', 'sessions.db');

export class SessionLogger {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string, config?: SentryTimerConfig) {
    // Resolve dbPath: explicit argument > config > default
    if (dbPath) {
      this.dbPath = dbPath;
    } else if (config?.dbPath) {
      this.dbPath = config.dbPath;
    } else {
      this.dbPath = DEFAULT_DB_PATH;
    }
    this.ensureDbDir();
    this.db = new Database(this.dbPath);
    this.initializeSchema();
  }

  private ensureDbDir(): void {
    const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_path TEXT NOT NULL,
        branch TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_ms INTEGER,
        commit_hash TEXT,
        commit_message TEXT,
        tags TEXT DEFAULT '[]'
      )
    `);
  }

  private mapRow(row: Record<string, unknown>): TimeEntry {
    return {
      id: Number(row.id),
      repoPath: String(row.repo_path),
      branch: String(row.branch),
      startTime: String(row.start_time),
      endTime: row.end_time ? String(row.end_time) : null,
      durationMs: row.duration_ms !== null && row.duration_ms !== undefined ? Number(row.duration_ms) : null,
      commitHash: row.commit_hash ? String(row.commit_hash) : null,
      commitMessage: row.commit_message ? String(row.commit_message) : null,
      tags: String(row.tags),
    };
  }

  startSession(entry: TimeEntryCreate): TimeEntry {
    const startTime = new Date().toISOString();
    const tags = JSON.stringify(entry.tags);

    const stmt = this.db.prepare(`
      INSERT INTO time_entries (repo_path, branch, start_time, commit_hash, commit_message, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      entry.repoPath,
      entry.branch,
      startTime,
      entry.commitHash,
      entry.commitMessage,
      tags
    );

    return {
      id: Number(result.lastInsertRowid),
      repoPath: entry.repoPath,
      branch: entry.branch,
      startTime,
      endTime: null,
      durationMs: null,
      commitHash: entry.commitHash,
      commitMessage: entry.commitMessage,
      tags,
    };
  }

  stopSession(id: number): TimeEntry | null {
    const endTime = new Date().toISOString();

    // Get the entry
    const entry = this.getEntry(id);
    if (!entry) return null;

    const startTime = new Date(entry.startTime).getTime();
    const durationMs = new Date(endTime).getTime() - startTime;

    const stmt = this.db.prepare(`
      UPDATE time_entries
      SET end_time = ?, duration_ms = ?
      WHERE id = ?
    `);

    stmt.run(endTime, durationMs, id);

    return this.getEntry(id);
  }

  getEntry(id: number): TimeEntry | null {
    const stmt = this.db.prepare('SELECT * FROM time_entries WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  getActiveSession(): TimeEntry | null {
    const stmt = this.db.prepare('SELECT * FROM time_entries WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1');
    const row = stmt.get() as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  getAllEntries(): TimeEntry[] {
    const stmt = this.db.prepare('SELECT * FROM time_entries ORDER BY start_time DESC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  getEntriesByDateRange(startDate: string, endDate: string): TimeEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM time_entries
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY start_time DESC
    `);
    const rows = stmt.all(startDate, endDate) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  getEntriesByRepo(repoPath: string): TimeEntry[] {
    const stmt = this.db.prepare('SELECT * FROM time_entries WHERE repo_path = ? ORDER BY start_time DESC');
    const rows = stmt.all(repoPath) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  getEntriesByBranch(repoPath: string, branch: string): TimeEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM time_entries WHERE repo_path = ? AND branch = ? ORDER BY start_time DESC'
    );
    const rows = stmt.all(repoPath, branch) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  getEntriesByTag(tag: string): TimeEntry[] {
    const stmt = this.db.prepare('SELECT * FROM time_entries WHERE tags LIKE ? ORDER BY start_time DESC');
    const rows = stmt.all(`%${tag}%`) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  deleteEntry(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM time_entries WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  clearAll(): void {
    this.db.exec('DELETE FROM time_entries');
  }

  close(): void {
    this.db.close();
  }
}
