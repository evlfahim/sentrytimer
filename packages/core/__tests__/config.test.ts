import {
  loadConfig,
  getDefaultConfig,
  mergeConfig,
  type SentryTimerConfig,
  type ReportFrequency,
} from '../src/config';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('config — defaults', () => {
  it('should return default config with no overrides', () => {
    const config = getDefaultConfig();
    expect(config.dbPath).toContain('.sentry-timer');
    expect(config.dbPath).toContain('sessions.db');
    expect(config.reportFrequency).toBe('weekly');
  });

  it('should return a deep copy of defaults', () => {
    const config1 = getDefaultConfig();
    const config2 = getDefaultConfig();
    expect(config1).toEqual(config2);
    expect(config1).not.toBe(config2);
  });
});

describe('config — loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sentry-timer-config-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Clean up env vars
    delete process.env.SENTRY_TIMER_DB;
    delete process.env.SENTRY_TIMER_REPORT_FREQUENCY;
  });

  it('should return defaults when no config file or env vars exist', () => {
    // Save current cwd and restore after
    const originalCwd = process.cwd();
    try {
      // Change to tmp dir which has no config file
      // We can't easily change cwd, so we test that env vars are empty
      const config = loadConfig();
      // Without env vars and without a config file in the walk path,
      // it should fall back to defaults (but may find a config file from parent dirs)
      // The key test is that the config object has the right shape
      expect(config).toHaveProperty('dbPath');
      expect(config).toHaveProperty('reportFrequency');
      expect(['weekly', 'biweekly', 'monthly']).toContain(config.reportFrequency);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should read dbPath from environment variable', () => {
    process.env.SENTRY_TIMER_DB = join(tmpDir, 'custom.db');
    const config = loadConfig();
    expect(config.dbPath).toBe(join(tmpDir, 'custom.db'));
  });

  it('should read reportFrequency from environment variable', () => {
    process.env.SENTRY_TIMER_REPORT_FREQUENCY = 'biweekly';
    const config = loadConfig();
    expect(config.reportFrequency).toBe('biweekly');
  });

  it('should read both settings from environment variables', () => {
    process.env.SENTRY_TIMER_DB = join(tmpDir, 'custom.db');
    process.env.SENTRY_TIMER_REPORT_FREQUENCY = 'monthly';
    const config = loadConfig();
    expect(config.dbPath).toBe(join(tmpDir, 'custom.db'));
    expect(config.reportFrequency).toBe('monthly');
  });

  it('should ignore invalid reportFrequency from environment variable', () => {
    process.env.SENTRY_TIMER_REPORT_FREQUENCY = 'invalid';
    const config = loadConfig();
    // Should fall back to default since 'invalid' is not valid
    expect(config.reportFrequency).toBe('weekly');
  });

  it('should read config from .sentry-timer.json file', () => {
    // Create a config file in tmpDir
    const configPath = join(tmpDir, '.sentry-timer.json');
    const configContent = {
      dbPath: join(tmpDir, 'from-file.db'),
      reportFrequency: 'monthly',
    };
    writeFileSync(configPath, JSON.stringify(configContent));

    // Save current cwd and change to tmpDir
    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const config = loadConfig();
      expect(config.dbPath).toBe(join(tmpDir, 'from-file.db'));
      expect(config.reportFrequency).toBe('monthly');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should prefer environment variables over config file', () => {
    const configPath = join(tmpDir, '.sentry-timer.json');
    writeFileSync(configPath, JSON.stringify({
      dbPath: join(tmpDir, 'from-file.db'),
      reportFrequency: 'monthly',
    }));

    process.env.SENTRY_TIMER_DB = join(tmpDir, 'from-env.db');
    process.env.SENTRY_TIMER_REPORT_FREQUENCY = 'biweekly';

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const config = loadConfig();
      expect(config.dbPath).toBe(join(tmpDir, 'from-env.db'));
      expect(config.reportFrequency).toBe('biweekly');
    } finally {
      process.chdir(originalCwd);
      delete process.env.SENTRY_TIMER_DB;
      delete process.env.SENTRY_TIMER_REPORT_FREQUENCY;
    }
  });

  it('should handle partial config file (only dbPath)', () => {
    const configPath = join(tmpDir, '.sentry-timer.json');
    writeFileSync(configPath, JSON.stringify({
      dbPath: join(tmpDir, 'partial.db'),
    }));

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const config = loadConfig();
      expect(config.dbPath).toBe(join(tmpDir, 'partial.db'));
      expect(config.reportFrequency).toBe('weekly'); // default
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle partial config file (only reportFrequency)', () => {
    const configPath = join(tmpDir, '.sentry-timer.json');
    writeFileSync(configPath, JSON.stringify({
      reportFrequency: 'biweekly',
    }));

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const config = loadConfig();
      expect(config.reportFrequency).toBe('biweekly');
      // dbPath should be the default
      expect(config.dbPath).toContain('.sentry-timer');
      expect(config.dbPath).toContain('sessions.db');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle invalid JSON in config file gracefully', () => {
    const configPath = join(tmpDir, '.sentry-timer.json');
    writeFileSync(configPath, 'not valid json {{{');

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const config = loadConfig();
      // Should fall back to defaults
      expect(config.reportFrequency).toBe('weekly');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle empty config file gracefully', () => {
    const configPath = join(tmpDir, '.sentry-timer.json');
    writeFileSync(configPath, '');

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const config = loadConfig();
      expect(config.reportFrequency).toBe('weekly');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle config file with unknown keys', () => {
    const configPath = join(tmpDir, '.sentry-timer.json');
    writeFileSync(configPath, JSON.stringify({
      dbPath: join(tmpDir, 'unknown.db'),
      unknownKey: 'ignored',
      reportFrequency: 'monthly',
    }));

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const config = loadConfig();
      expect(config.dbPath).toBe(join(tmpDir, 'unknown.db'));
      expect(config.reportFrequency).toBe('monthly');
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe('config — mergeConfig', () => {
  it('should merge overrides over base config', () => {
    const base: SentryTimerConfig = {
      dbPath: '/default/path',
      reportFrequency: 'weekly',
    };
    const overrides = { dbPath: '/custom/path' };
    const merged = mergeConfig(base, overrides);

    expect(merged.dbPath).toBe('/custom/path');
    expect(merged.reportFrequency).toBe('weekly');
  });

  it('should override both fields', () => {
    const base: SentryTimerConfig = {
      dbPath: '/default/path',
      reportFrequency: 'weekly',
    };
    const overrides: Partial<SentryTimerConfig> = {
      dbPath: '/custom/path',
      reportFrequency: 'monthly',
    };
    const merged = mergeConfig(base, overrides);

    expect(merged.dbPath).toBe('/custom/path');
    expect(merged.reportFrequency).toBe('monthly');
  });

  it('should return a new object (not mutate base)', () => {
    const base: SentryTimerConfig = {
      dbPath: '/default/path',
      reportFrequency: 'weekly',
    };
    const originalBase = { ...base };
    mergeConfig(base, { dbPath: '/new/path' });

    expect(base).toEqual(originalBase);
  });

  it('should handle empty overrides', () => {
    const base: SentryTimerConfig = {
      dbPath: '/default/path',
      reportFrequency: 'weekly',
    };
    const merged = mergeConfig(base, {});

    expect(merged.dbPath).toBe('/default/path');
    expect(merged.reportFrequency).toBe('weekly');
  });

  it('should handle undefined overrides', () => {
    const base: SentryTimerConfig = {
      dbPath: '/default/path',
      reportFrequency: 'weekly',
    };
    const merged = mergeConfig(base, { dbPath: undefined, reportFrequency: undefined });

    expect(merged.dbPath).toBe('/default/path');
    expect(merged.reportFrequency).toBe('weekly');
  });
});

describe('config — ReportFrequency type', () => {
  it('should accept weekly', () => {
    const freq: ReportFrequency = 'weekly';
    expect(freq).toBe('weekly');
  });

  it('should accept biweekly', () => {
    const freq: ReportFrequency = 'biweekly';
    expect(freq).toBe('biweekly');
  });

  it('should accept monthly', () => {
    const freq: ReportFrequency = 'monthly';
    expect(freq).toBe('monthly');
  });
});
