import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

// ── Types ────────────────────────────────────────────────────────────────────

export type ReportFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface SentryTimerConfig {
  /** Path to the SQLite database file */
  dbPath: string;
  /** How often to generate reports: weekly, biweekly, or monthly */
  reportFrequency: ReportFrequency;
}

export interface SentryTimerConfigFile {
  /** Path to the SQLite database file */
  dbPath?: string;
  /** How often to generate reports: weekly, biweekly, or monthly */
  reportFrequency?: ReportFrequency;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = join(process.cwd(), '.sentry-timer', 'sessions.db');
const DEFAULT_REPORT_FREQUENCY: ReportFrequency = 'weekly';

const DEFAULT_CONFIG: SentryTimerConfig = {
  dbPath: DEFAULT_DB_PATH,
  reportFrequency: DEFAULT_REPORT_FREQUENCY,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const CONFIG_FILE_NAME = '.sentry-timer.json';

function findConfigFile(): string | null {
  let dir = process.cwd();
  // Walk up the directory tree looking for .sentry-timer.json
  const maxDepth = 20;
  for (let i = 0; i < maxDepth; i++) {
    const configPath = join(dir, CONFIG_FILE_NAME);
    if (existsSync(configPath)) {
      return configPath;
    }
    const parent = join(dir, '..');
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

function parseConfigFile(filePath: string): SentryTimerConfigFile {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as SentryTimerConfigFile;
  } catch {
    return {};
  }
}

function isValidReportFrequency(value: string): value is ReportFrequency {
  return ['weekly', 'biweekly', 'monthly'].includes(value);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the SentryTimer configuration by merging:
 * 1. Defaults
 * 2. Config file (.sentry-timer.json) found by walking up the directory tree
 * 3. Environment variables (SENTRY_TIMER_DB, SENTRY_TIMER_REPORT_FREQUENCY)
 *
 * Environment variables take precedence over config file values.
 */
export function loadConfig(): SentryTimerConfig {
  const config: SentryTimerConfig = { ...DEFAULT_CONFIG };

  // Layer 2: config file
  const configFilePath = findConfigFile();
  if (configFilePath) {
    const fileConfig = parseConfigFile(configFilePath);
    if (fileConfig.dbPath) {
      config.dbPath = fileConfig.dbPath;
    }
    if (fileConfig.reportFrequency && isValidReportFrequency(fileConfig.reportFrequency)) {
      config.reportFrequency = fileConfig.reportFrequency;
    }
  }

  // Layer 3: environment variables (override config file)
  const envDbPath = process.env.SENTRY_TIMER_DB;
  if (envDbPath) {
    config.dbPath = envDbPath;
  }

  const envReportFreq = process.env.SENTRY_TIMER_REPORT_FREQUENCY;
  if (envReportFreq && isValidReportFrequency(envReportFreq)) {
    config.reportFrequency = envReportFreq;
  }

  return config;
}

/**
 * Get the default config without reading files or environment variables.
 * Useful for tests and for providing a base to merge user settings on top of.
 */
export function getDefaultConfig(): SentryTimerConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Merge user-provided settings over the loaded config.
 * Only non-undefined values override the loaded config.
 */
export function mergeConfig(loaded: SentryTimerConfig, overrides: Partial<SentryTimerConfig>): SentryTimerConfig {
  return {
    dbPath: overrides.dbPath ?? loaded.dbPath,
    reportFrequency: overrides.reportFrequency ?? loaded.reportFrequency,
  };
}
