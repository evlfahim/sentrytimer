/**
 * Tests for configuration settings in the VS Code extension.
 * Verifies that settings load correctly from VS Code configuration.
 */
import { SessionLogger, type ReportFrequency } from '@sentry-timer/core';
import * as fs from 'fs';
import * as path from 'path';
import { window, commands, workspace, StatusBarAlignment, ExtensionContext } from 'vscode';
import { _setTestLogger, _getSessionLogger } from '../src/extension';

// Access mocked vscode members
const createStatusBarItem = window.createStatusBarItem as jest.Mock;
const showInformationMessage = window.showInformationMessage as jest.Mock;
const showErrorMessage = window.showErrorMessage as jest.Mock;
const showWarningMessage = window.showWarningMessage as jest.Mock;
const showQuickPick = window.showQuickPick as jest.Mock;
const showTextDocument = window.showTextDocument as jest.Mock;
const openTextDocument = workspace.openTextDocument as jest.Mock;
const registerCommand = commands.registerCommand as jest.Mock;

// Clear the module cache so that require('../src/extension') picks up the mocked vscode
function reloadExtension() {
  delete require.cache[require.resolve('../src/extension')];
  return require('../src/extension');
}

function getLastInfoCall() {
  const calls = showInformationMessage.mock.calls;
  return calls.length > 0 ? calls[calls.length - 1] : [];
}

describe('extension configuration settings', () => {
  let logger: SessionLogger;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      fs.mkdtempSync(path.join(require('os').tmpdir(), 'sentry-timer-db-')),
      'sessions.db'
    );
    logger = new SessionLogger(dbPath);
    showInformationMessage.mockClear();
    showErrorMessage.mockClear();
    showWarningMessage.mockClear();
    createStatusBarItem.mockClear();
    registerCommand.mockClear();
    openTextDocument.mockClear();
    showTextDocument.mockClear();
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should use custom dbPath from VS Code settings', async () => {
    // Mock workspace.getConfiguration to return custom dbPath
    const originalGetConfiguration = workspace.getConfiguration;
    workspace.getConfiguration = jest.fn((section?: string) => {
      if (section === 'sentryTimer') {
        return {
          get: (key: string) => {
            if (key === 'dbPath') return dbPath;
            if (key === 'reportFrequency') return 'weekly';
            return undefined;
          },
        };
      }
      return originalGetConfiguration(section);
    });

    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Verify the logger was initialized (activation completes without error)
    expect(showInformationMessage).toHaveBeenCalledWith('SentryTimer activated');

    // Restore
    workspace.getConfiguration = originalGetConfiguration;
  });

  it('should use custom reportFrequency from VS Code settings', async () => {
    const originalGetConfiguration = workspace.getConfiguration;
    workspace.getConfiguration = jest.fn((section?: string) => {
      if (section === 'sentryTimer') {
        return {
          get: (key: string) => {
            if (key === 'dbPath') return undefined;
            if (key === 'reportFrequency') return 'monthly' as ReportFrequency;
            return undefined;
          },
        };
      }
      return originalGetConfiguration(section);
    });

    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    openTextDocument.mockResolvedValue({ content: '' });
    showTextDocument.mockResolvedValue({});

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Generate a report — should use monthly frequency
    const reportHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.report')?.[1];
    await reportHandler();

    expect(openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'markdown' })
    );

    // Restore
    workspace.getConfiguration = originalGetConfiguration;
  });

  it('should handle empty dbPath setting (use default)', async () => {
    const originalGetConfiguration = workspace.getConfiguration;
    workspace.getConfiguration = jest.fn((section?: string) => {
      if (section === 'sentryTimer') {
        return {
          get: (key: string) => {
            if (key === 'dbPath') return '';
            if (key === 'reportFrequency') return 'weekly';
            return undefined;
          },
        };
      }
      return originalGetConfiguration(section);
    });

    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    expect(showInformationMessage).toHaveBeenCalledWith('SentryTimer activated');

    // Restore
    workspace.getConfiguration = originalGetConfiguration;
  });

  it('should handle invalid reportFrequency setting (fall back to default)', async () => {
    const originalGetConfiguration = workspace.getConfiguration;
    workspace.getConfiguration = jest.fn((section?: string) => {
      if (section === 'sentryTimer') {
        return {
          get: (key: string) => {
            if (key === 'dbPath') return undefined;
            if (key === 'reportFrequency') return 'invalid-frequency' as ReportFrequency;
            return undefined;
          },
        };
      }
      return originalGetConfiguration(section);
    });

    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    openTextDocument.mockResolvedValue({ content: '' });
    showTextDocument.mockResolvedValue({});

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Should not throw — invalid frequency is ignored
    const reportHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.report')?.[1];
    await reportHandler();

    expect(openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'markdown' })
    );

    // Restore
    workspace.getConfiguration = originalGetConfiguration;
  });

  it('should start a session with config-loaded logger', async () => {
    const originalGetConfiguration = workspace.getConfiguration;
    workspace.getConfiguration = jest.fn((section?: string) => {
      if (section === 'sentryTimer') {
        return {
          get: (key: string) => {
            if (key === 'dbPath') return dbPath;
            if (key === 'reportFrequency') return 'weekly';
            return undefined;
          },
        };
      }
      return originalGetConfiguration(section);
    });

    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
    await startHandler();

    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('Session started');

    // Verify the session was actually stored in the database
    const entries = logger.getAllEntries();
    expect(entries.length).toBe(1);

    // Restore
    workspace.getConfiguration = originalGetConfiguration;
  });

  it('should generate report with custom dbPath and frequency', async () => {
    const customDbPath = path.join(
      fs.mkdtempSync(path.join(require('os').tmpdir(), 'sentry-timer-custom-')),
      'custom.db'
    );
    const customLogger = new SessionLogger(customDbPath);

    const originalGetConfiguration = workspace.getConfiguration;
    workspace.getConfiguration = jest.fn((section?: string) => {
      if (section === 'sentryTimer') {
        return {
          get: (key: string) => {
            if (key === 'dbPath') return customDbPath;
            if (key === 'reportFrequency') return 'biweekly' as ReportFrequency;
            return undefined;
          },
        };
      }
      return originalGetConfiguration(section);
    });

    // Pre-populate the custom logger with an entry
    const entry = customLogger.startSession({
      repoPath: '/tmp/test-repo',
      branch: 'main',
      startTime: new Date().toISOString(),
      tags: ['test'],
    });
    customLogger.stopSession(entry.id);

    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    openTextDocument.mockResolvedValue({ content: '' });
    showTextDocument.mockResolvedValue({});

    const { activate } = reloadExtension();
    _setTestLogger(customLogger);
    activate(new ExtensionContext());

    const reportHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.report')?.[1];
    await reportHandler();

    expect(openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'markdown' })
    );

    // Cleanup
    customLogger.close();
    fs.rmSync(path.dirname(customDbPath), { recursive: true, force: true });

    // Restore
    workspace.getConfiguration = originalGetConfiguration;
  });
});
