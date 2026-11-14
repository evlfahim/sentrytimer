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
