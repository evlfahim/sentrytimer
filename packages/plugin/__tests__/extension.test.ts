import { SessionLogger, detectGitContext, generateWeeklyReport, generateMarkdownReport, type TimeEntry } from '@sentry-timer/core';
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

describe('plugin command handlers — startSession', () => {
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
    // Mock workspace.getConfiguration for config loading
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
      return {};
    });
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should start a session and show information message', async () => {
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
    expect(startHandler).toBeDefined();
    await startHandler();

    // Check the last call (the session start message, not the activation message)
    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('Session started');
  });

  it('should show error when not in a git repository', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue(null);

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

    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Not in a git repository')
    );
  });

  it('should show warning when session already running', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    logger.startSession({
      repoPath: '/tmp/test-repo',
      branch: 'main',
      startTime: new Date().toISOString(),
      tags: ['test'],
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

    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('already running')
    );
  });
});

describe('plugin command handlers — stopSession', () => {
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
      return {};
    });
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should stop a session and show duration', async () => {
    const entry = logger.startSession({
      repoPath: '/tmp/test-repo',
      branch: 'main',
      startTime: new Date().toISOString(),
      tags: ['test'],
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

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

    const stopHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.stop')?.[1];
    await stopHandler();

    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('Session stopped');
  });

  it('should show warning when no active session', async () => {
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

    const stopHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.stop')?.[1];
    await stopHandler();

    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active session')
    );
  });
});

describe('plugin command handlers — generateReport', () => {
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
      return {};
    });
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should generate a report and open it in editor', async () => {
    const entry = logger.startSession({
      repoPath: '/tmp/test-repo',
      branch: 'main',
      startTime: new Date().toISOString(),
      tags: ['test'],
    });
    logger.stopSession(entry.id);

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

    const mockDoc = { content: 'test document' };
    openTextDocument.mockResolvedValue(mockDoc);
    showTextDocument.mockResolvedValue({});

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    const reportHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.report')?.[1];
    await reportHandler();

    expect(openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'markdown' })
    );
    expect(showTextDocument).toHaveBeenCalledWith(mockDoc);

    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('Weekly report generated');
  });

  it('should generate report with empty entries', async () => {
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

    const reportHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.report')?.[1];
    await reportHandler();

    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('Weekly report generated');
  });
});

describe('plugin command handlers — deleteSession', () => {
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
    showQuickPick.mockClear();
    createStatusBarItem.mockClear();
    registerCommand.mockClear();
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should delete active session when confirmed', async () => {
    const entry = logger.startSession({
      repoPath: '/tmp/test-repo',
      branch: 'main',
      startTime: new Date().toISOString(),
      tags: ['test'],
    });

    showQuickPick.mockResolvedValue({
      label: 'Yes, delete active session',
      description: `ID: ${entry.id}, Branch: main`,
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

    const deleteHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.delete')?.[1];
    await deleteHandler();

    expect(showQuickPick).toHaveBeenCalled();

    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('deleted');
    expect(logger.getAllEntries().length).toBe(0);
  });

  it('should cancel deletion when user selects Cancel', async () => {
    logger.startSession({
      repoPath: '/tmp/test-repo',
      branch: 'main',
      startTime: new Date().toISOString(),
      tags: ['test'],
    });

    showQuickPick.mockResolvedValue({
      label: 'Cancel',
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

    const deleteHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.delete')?.[1];
    await deleteHandler();

    expect(logger.getAllEntries().length).toBe(1);
  });

  it('should list all sessions for deletion when no active session', async () => {
    logger.startSession({
      repoPath: '/tmp/test-repo',
      branch: 'main',
      startTime: new Date().toISOString(),
      tags: ['test'],
    });
    const entries = logger.getAllEntries();
    for (const e of entries) {
      logger.stopSession(e.id);
    }

    showQuickPick.mockResolvedValue({
      label: '#1 - main',
      description: `${new Date().toISOString()} | running`,
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

    const deleteHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.delete')?.[1];
    await deleteHandler();

    expect(showQuickPick).toHaveBeenCalled();
    expect(logger.getAllEntries().length).toBe(0);
  });
});

describe('plugin command handlers — listSessions', () => {
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
    showQuickPick.mockClear();
    createStatusBarItem.mockClear();
    registerCommand.mockClear();
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should list sessions when they exist', async () => {
    logger.startSession({
      repoPath: '/tmp/test-repo',
      branch: 'main',
      startTime: new Date().toISOString(),
      tags: ['test'],
    });

    showQuickPick.mockResolvedValue({
      label: '#1 - main',
      description: `${new Date().toISOString()} | running`,
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

    const listHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.list')?.[1];
    await listHandler();

    expect(showQuickPick).toHaveBeenCalled();

    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('Session #1');
  });

  it('should show no sessions message when empty', async () => {
    showQuickPick.mockResolvedValue(null);

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

    const listHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.list')?.[1];
    await listHandler();

    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('No sessions');
  });
});

describe('plugin activation — command registration', () => {
  let logger: SessionLogger;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      fs.mkdtempSync(path.join(require('os').tmpdir(), 'sentry-timer-db-')),
      'sessions.db'
    );
    logger = new SessionLogger(dbPath);
    showInformationMessage.mockClear();
    createStatusBarItem.mockClear();
    registerCommand.mockClear();
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should register all 5 commands on activation', async () => {
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

    const registeredCommands = registerCommand.mock.calls.map((c: any[]) => c[0]);

    expect(registeredCommands).toContain('sentry-timer.start');
    expect(registeredCommands).toContain('sentry-timer.stop');
    expect(registeredCommands).toContain('sentry-timer.report');
    expect(registeredCommands).toContain('sentry-timer.delete');
    expect(registeredCommands).toContain('sentry-timer.list');
    expect(registeredCommands.length).toBe(5);
  });

  it('should show activation message', async () => {
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
  });

  it('should detect git context on activation', async () => {
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

    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Detected repository')
    );
  });

  it('should create status bar on activation', async () => {
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

    expect(createStatusBarItem).toHaveBeenCalledWith(StatusBarAlignment.Right, 100);

    const statusBar = createStatusBarItem.mock.results[0].value;
    expect(statusBar.show).toHaveBeenCalled();
  });
});

describe('plugin deactivation', () => {
  let logger: SessionLogger;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      fs.mkdtempSync(path.join(require('os').tmpdir(), 'sentry-timer-db-')),
      'sessions.db'
    );
    logger = new SessionLogger(dbPath);
    showInformationMessage.mockClear();
    createStatusBarItem.mockClear();
    registerCommand.mockClear();
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should dispose status bar and close logger on deactivate', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    const statusBarMock = {
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    };
    createStatusBarItem.mockReturnValue(statusBarMock);

    const { activate, deactivate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    deactivate();

    expect(statusBarMock.dispose).toHaveBeenCalled();
  });
});

describe('VS Code Git API integration — auto-detect on workspace change', () => {
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
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should detect git context via VS Code Git API when available', async () => {
    // Mock the VS Code Git extension
    const mockGitAPI = {
      repositories: [
        {
          rootUri: { fsPath: '/tmp/test-repo' },
          head: { name: 'main' },
        },
      ],
      onDidChangeState: jest.fn(),
    };
    const mockGitExtension = {
      isActive: true,
      exports: mockGitAPI,
    };

    // Directly set the mock's return value (getExtension is already a jest.fn in the mock)
    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReturnValue(mockGitExtension);

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Should show the detected repository message
    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Detected repository')
    );
  });

  it('should fall back to CLI detection when Git API is not available', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    // Directly set the mock's return value to null (no git extension)
    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReturnValue(null);

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Should still detect via CLI fallback
    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Detected repository')
    );
  });

  it('should register workspace folder change listener', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReturnValue(null);
    const onDidChangeWorkspaceFolders = require('vscode').workspace.onDidChangeWorkspaceFolders as jest.Mock;
    onDidChangeWorkspaceFolders.mockReturnValue({ dispose: jest.fn() });

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Should have registered the workspace folder change listener
    expect(onDidChangeWorkspaceFolders).toHaveBeenCalled();
  });

  it('should register active text editor change listener', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReturnValue(null);
    const onDidChangeActiveTextEditor = require('vscode').window.onDidChangeActiveTextEditor as jest.Mock;
    onDidChangeActiveTextEditor.mockReturnValue({ dispose: jest.fn() });

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Should have registered the active editor change listener
    expect(onDidChangeActiveTextEditor).toHaveBeenCalled();
  });

  it('should register git state change listener when Git API is available', async () => {
    const mockGitAPI = {
      repositories: [
        {
          rootUri: { fsPath: '/tmp/test-repo' },
          head: { name: 'main' },
        },
      ],
      onDidChangeState: jest.fn(),
    };
    const mockGitExtension = {
      isActive: true,
      exports: mockGitAPI,
    };

    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReturnValue(mockGitExtension);

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Should have called onDidChangeState on the git API
    expect(mockGitAPI.onDidChangeState).toHaveBeenCalled();
  });

  it('should use VS Code Git API repo info in startSession', async () => {
    const mockGitAPI = {
      repositories: [
        {
          rootUri: { fsPath: '/tmp/test-repo' },
          head: { name: 'feature/new-ui' },
        },
      ],
      onDidChangeState: jest.fn(),
    };
    const mockGitExtension = {
      isActive: true,
      exports: mockGitAPI,
    };

    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReturnValue(mockGitExtension);

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

    // Should have started a session with the VS Code Git API branch
    const lastCall = getLastInfoCall();
    expect(lastCall[0]).toContain('feature/new-ui');
  });

  it('should update status bar with git context on activation', async () => {
    const mockGitAPI = {
      repositories: [
        {
          rootUri: { fsPath: '/tmp/test-repo' },
          head: { name: 'develop' },
        },
      ],
      onDidChangeState: jest.fn(),
    };
    const mockGitExtension = {
      isActive: true,
      exports: mockGitAPI,
    };

    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReturnValue(mockGitExtension);

    const statusBarMock = {
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    };
    createStatusBarItem.mockReturnValue(statusBarMock);

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Status bar should show the git branch
    expect(statusBarMock.text).toContain('develop');
    expect(statusBarMock.tooltip).toContain('/tmp/test-repo');
  });

  it('should handle no git extension gracefully', async () => {
    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReturnValue(null);
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue(null);

    createStatusBarItem.mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    });

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Should still activate without error
    expect(showInformationMessage).toHaveBeenCalledWith('SentryTimer activated');
  });

  it('should handle git extension error gracefully', async () => {
    const vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockImplementation(() => {
      throw new Error('Extension not found');
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

    // Should fall back to CLI detection and still activate
    expect(showInformationMessage).toHaveBeenCalledWith('SentryTimer activated');
  });

  it('should debounce rapid workspace changes', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
        repoPath: '/tmp/test-repo',
        branch: 'main',
      });

      const vscodeModule = require('vscode');
      vscodeModule.workspace.getExtension.mockReturnValue(null);
      const onDidChangeWorkspaceFolders = require('vscode').workspace.onDidChangeWorkspaceFolders as jest.Mock;
      onDidChangeWorkspaceFolders.mockReturnValue({ dispose: jest.fn() });

      createStatusBarItem.mockReturnValue({
        show: jest.fn(),
        dispose: jest.fn(),
        text: '',
        tooltip: '',
      });

      const { activate } = reloadExtension();
      _setTestLogger(logger);
      activate(new ExtensionContext());

      // Get the debounce callback
      const workspaceChangeCallback = onDidChangeWorkspaceFolders.mock.calls[0][0];

      // Call it multiple times rapidly
      workspaceChangeCallback();
      workspaceChangeCallback();
      workspaceChangeCallback();

      // At this point, no actual detection should have happened yet (debounce not fired)
      // The debounce timer is set to 300ms

      // Advance time past the debounce period
      jest.advanceTimersByTime(500);

      // Now the detection should have happened once (debounced)
      expect(require('@sentry-timer/core').detectGitContext).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('should update status bar when git context changes via debounced detection', async () => {
    jest.useFakeTimers();
    try {
      const mockGitAPI = {
        repositories: [
          {
            rootUri: { fsPath: '/tmp/repo-1' },
            head: { name: 'main' },
          },
        ],
        onDidChangeState: jest.fn(),
      };
      const mockGitExtension = {
        isActive: true,
        exports: mockGitAPI,
      };

      const vscodeModule = require('vscode');
      vscodeModule.workspace.getExtension.mockReturnValue(mockGitExtension);

      const statusBarMock = {
        show: jest.fn(),
        dispose: jest.fn(),
        text: '',
        tooltip: '',
      };
      createStatusBarItem.mockReturnValue(statusBarMock);

      const { activate } = reloadExtension();
      _setTestLogger(logger);
      activate(new ExtensionContext());

      // Initial status bar should show 'main'
      expect(statusBarMock.text).toContain('main');

      // Simulate a workspace change that would trigger debounced detection
      const onDidChangeWorkspaceFolders = require('vscode').workspace.onDidChangeWorkspaceFolders as jest.Mock;
      const workspaceChangeCallback = onDidChangeWorkspaceFolders.mock.calls[0][0];

      // Change the git API to return a different repo
      mockGitAPI.repositories[0] = {
        rootUri: { fsPath: '/tmp/repo-2' },
        head: { name: 'feature/new-feature' },
      };

      // Trigger the debounced detection
      workspaceChangeCallback();
      jest.advanceTimersByTime(500);

      // Status bar should now show the new branch
      expect(statusBarMock.text).toContain('feature/new-feature');
      expect(statusBarMock.tooltip).toContain('/tmp/repo-2');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('status bar UI — elapsed time and context display', () => {
  let logger: SessionLogger;
  let dbPath: string;
  let vscodeModule: typeof import('vscode');

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

    // Reset the vscode mock state to avoid leaking from previous test suites
    vscodeModule = require('vscode');
    vscodeModule.workspace.getExtension.mockReset();
    vscodeModule.workspace.getExtension.mockReturnValue(null);
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReset();
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('should show elapsed time in status bar when session is running', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    const statusBarMock = {
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    };
    createStatusBarItem.mockReturnValue(statusBarMock);

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
    await startHandler();

    // Status bar should show the branch and elapsed time
    expect(statusBarMock.text).toContain('main');
    expect(statusBarMock.text).toContain('$(clock)');
    // Elapsed time format: h m s (e.g., "0s", "1s", "1m 2s", "1h 2m 3s")
    expect(statusBarMock.text).toMatch(/\d+s/);
  });

  it('should show repo path in tooltip when session is running', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    const statusBarMock = {
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    };
    createStatusBarItem.mockReturnValue(statusBarMock);

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
    await startHandler();

    // Tooltip should contain repo path
    expect(statusBarMock.tooltip).toContain('/tmp/test-repo');
  });

  it('should stop elapsed timer when session is stopped', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
        repoPath: '/tmp/test-repo',
        branch: 'main',
      });

      const statusBarMock = {
        show: jest.fn(),
        dispose: jest.fn(),
        text: '',
        tooltip: '',
      };
      createStatusBarItem.mockReturnValue(statusBarMock);

      const { activate } = reloadExtension();
      _setTestLogger(logger);
      activate(new ExtensionContext());

      const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
      await startHandler();

      // Verify elapsed timer was started (status bar should update)
      const initialText = statusBarMock.text;
      expect(initialText).toContain('main');

      // Advance time to trigger elapsed timer update
      jest.advanceTimersByTime(1500);
      expect(statusBarMock.text).not.toBe(initialText);

      // Stop the session
      const stopHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.stop')?.[1];
      await stopHandler();

      // After stopping, no more updates should occur
      const textAfterStop = statusBarMock.text;
      jest.advanceTimersByTime(1500);
      expect(statusBarMock.text).toBe(textAfterStop);
    } finally {
      jest.useRealTimers();
    }
  });

  it('should update status bar periodically while session is running', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
        repoPath: '/tmp/test-repo',
        branch: 'main',
      });

      const statusBarMock = {
        show: jest.fn(),
        dispose: jest.fn(),
        text: '',
        tooltip: '',
      };
      createStatusBarItem.mockReturnValue(statusBarMock);

      const { activate } = reloadExtension();
      _setTestLogger(logger);
      activate(new ExtensionContext());

      const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
      await startHandler();

      // Initial state
      const initialText = statusBarMock.text;
      expect(initialText).toContain('main');

      // After 1 second, elapsed time should increase
      jest.advanceTimersByTime(1000);
      expect(statusBarMock.text).not.toBe(initialText);
      expect(statusBarMock.text).toContain('main');

      // After another second, elapsed time should increase again
      const textAfter1s = statusBarMock.text;
      jest.advanceTimersByTime(1000);
      expect(statusBarMock.text).not.toBe(textAfter1s);
    } finally {
      jest.useRealTimers();
    }
  });

  it('should show elapsed time with minutes when session runs long enough', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
        repoPath: '/tmp/test-repo',
        branch: 'main',
      });

      const statusBarMock = {
        show: jest.fn(),
        dispose: jest.fn(),
        text: '',
        tooltip: '',
      };
      createStatusBarItem.mockReturnValue(statusBarMock);

      const { activate } = reloadExtension();
      _setTestLogger(logger);
      activate(new ExtensionContext());

      const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
      await startHandler();

      // Advance time to 1 minute 30 seconds
      jest.advanceTimersByTime(90000);

      // Status bar should show minutes
      expect(statusBarMock.text).toContain('1m');
    } finally {
      jest.useRealTimers();
    }
  });

  it('should show elapsed time with hours when session runs long enough', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
        repoPath: '/tmp/test-repo',
        branch: 'main',
      });

      const statusBarMock = {
        show: jest.fn(),
        dispose: jest.fn(),
        text: '',
        tooltip: '',
      };
      createStatusBarItem.mockReturnValue(statusBarMock);

      const { activate } = reloadExtension();
      _setTestLogger(logger);
      activate(new ExtensionContext());

      const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
      await startHandler();

      // Advance time to 1 hour 30 minutes
      jest.advanceTimersByTime(5400000);

      // Status bar should show hours
      expect(statusBarMock.text).toContain('1h');
    } finally {
      jest.useRealTimers();
    }
  });

  it('should clear elapsed timer on deactivation', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
        repoPath: '/tmp/test-repo',
        branch: 'main',
      });

      const statusBarMock = {
        show: jest.fn(),
        dispose: jest.fn(),
        text: '',
        tooltip: '',
      };
      createStatusBarItem.mockReturnValue(statusBarMock);

      const { activate, deactivate } = reloadExtension();
      _setTestLogger(logger);
      activate(new ExtensionContext());

      const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
      await startHandler();

      // Advance time to trigger elapsed timer
      jest.advanceTimersByTime(1500);

      // Deactivate
      deactivate();

      // After deactivation, no more updates should occur
      const textAfterDeactivate = statusBarMock.text;
      jest.advanceTimersByTime(1500);
      expect(statusBarMock.text).toBe(textAfterDeactivate);
    } finally {
      jest.useRealTimers();
    }
  });

  it('should show status bar with git context when no session is running', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'develop',
    });

    const statusBarMock = {
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    };
    createStatusBarItem.mockReturnValue(statusBarMock);

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Status bar should show git branch without elapsed time
    expect(statusBarMock.text).toContain('develop');
    expect(statusBarMock.text).toContain('$(git-branch)');
    expect(statusBarMock.tooltip).toContain('/tmp/test-repo');
  });

  it('should show no active session message when no session and no git context', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue(null);

    const statusBarMock = {
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    };
    createStatusBarItem.mockReturnValue(statusBarMock);

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    // Status bar should show no active session
    expect(statusBarMock.text).toContain('$(clock) SentryTimer');
    expect(statusBarMock.tooltip).toBe('No active session');
  });

  it('should update status bar when session is deleted', async () => {
    jest.spyOn(require('@sentry-timer/core'), 'detectGitContext').mockReturnValue({
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });

    const statusBarMock = {
      show: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
    };
    createStatusBarItem.mockReturnValue(statusBarMock);

    const { activate } = reloadExtension();
    _setTestLogger(logger);
    activate(new ExtensionContext());

    const startHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.start')?.[1];
    await startHandler();

    // Verify session is running
    expect(statusBarMock.text).toContain('main');

    // Delete the session
    showQuickPick.mockResolvedValue({
      label: 'Yes, delete active session',
      description: `ID: 1, Branch: main`,
    });

    const deleteHandler = registerCommand.mock.calls.find((c: any[]) => c[0] === 'sentry-timer.delete')?.[1];
    await deleteHandler();

    // Status bar should be cleared
    expect(statusBarMock.text).toBe('$(clock) SentryTimer');
    expect(statusBarMock.tooltip).toBe('No active session');
  });
});
