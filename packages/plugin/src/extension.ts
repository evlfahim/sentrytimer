import { ExtensionContext, window, commands, StatusBarAlignment, QuickPickItem, workspace } from 'vscode';
import {
  SessionLogger,
  detectGitContext,
  generateWeeklyReport,
  generateMarkdownReport,
  type TimeEntry,
} from '@sentry-timer/core';
import { join } from 'path';

let sessionLogger: SessionLogger | null = null;
let statusBar: ReturnType<typeof window.createStatusBarItem> | null = null;
let currentGitContext: { repoPath: string; branch: string } | null = null;

// Elapsed time update timer
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

// Test helper: allow tests to inject a logger instance before activation
let _testLogger: SessionLogger | undefined;
export function _setTestLogger(logger: SessionLogger) {
  _testLogger = logger;
}

export function _getSessionLogger(): SessionLogger | null {
  return sessionLogger;
}

/**
 * Type definition for the VS Code Git API (not exported by @types/vscode).
 */
interface GitAPI {
  repositories: Array<{
    rootUri: { fsPath: string };
    head: { name: string | undefined };
  }>;
  onDidChangeState: (fn: () => void) => { dispose: () => void };
}

/**
 * Get the VS Code Git API from the installed git extension.
 * Returns null if the git extension is not available.
 */
function getGitAPI(): GitAPI | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gitExtension = (workspace as any).getExtension('git.git');
    if (!gitExtension) {
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gitApi = gitExtension.isActive ? (gitExtension as any).exports : null;
    if (!gitApi) {
      return null;
    }
    return {
      repositories: gitApi.repositories,
      onDidChangeState: gitApi.onDidChangeState,
    };
  } catch {
    return null;
  }
}

/**
 * Detect git context using VS Code Git API first, falling back to CLI detection.
 * @param dir - Optional directory to check (defaults to active workspace folder).
 */
function detectGitContextWithVSCode(dir?: string): { repoPath: string; branch: string } | null {
  // Try VS Code Git API first
  const gitAPI = getGitAPI();
  if (gitAPI) {
    const checkDir = dir || workspace.workspaceFolders?.[0]?.uri?.fsPath;

    if (checkDir) {
      // Try to find a repo matching the specific directory
      const repo = gitAPI.repositories.find((r) => r.rootUri.fsPath === checkDir);
      if (repo && repo.head?.name) {
        return { repoPath: repo.rootUri.fsPath, branch: repo.head.name };
      }
    }

    // If no specific directory matched, try the first repo from the Git API
    // This handles cases where workspace folders aren't set (e.g., in tests)
    if (gitAPI.repositories.length > 0) {
      const firstRepo = gitAPI.repositories[0];
      if (firstRepo.head?.name) {
        return { repoPath: firstRepo.rootUri.fsPath, branch: firstRepo.head.name };
      }
    }
  }

  // Fall back to CLI detection
  return detectGitContext(dir);
}

/**
 * Debounce timer for git context detection.
 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced git context detection. Prevents spam on rapid workspace changes.
 */
function debouncedDetectGitContext(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    detectAndSyncGitContext();
    debounceTimer = null;
  }, 300);
}

/**
 * Detect the current git context and sync it with the status bar.
 */
function detectAndSyncGitContext(): void {
  const activeEditor = window.activeTextEditor;
  let dir: string | undefined;

  if (activeEditor && activeEditor.document && activeEditor.document.uri) {
    // Try to find the workspace folder that contains the active file
    const workspaceFolder = workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (workspaceFolder) {
      dir = workspaceFolder.uri.fsPath;
    }
  }

  const gitContext = detectGitContextWithVSCode(dir);

  // Only update if the context actually changed
  if (
    !currentGitContext ||
    currentGitContext.repoPath !== gitContext?.repoPath ||
    currentGitContext.branch !== gitContext?.branch
  ) {
    currentGitContext = gitContext;
    updateStatusBarWithGitContext();
  }
}

/**
 * Update the status bar to show the current git context.
 */
function updateStatusBarWithGitContext(): void {
  if (!statusBar) return;

  // Check if there's an active session — if so, show session info instead
  const activeSession = sessionLogger?.getActiveSession();
  if (activeSession) {
    updateStatusBar(activeSession);
    return;
  }

  if (currentGitContext) {
    statusBar.text = `$(git-branch) SentryTimer: ${currentGitContext.branch}`;
    statusBar.tooltip = `Repository: ${currentGitContext.repoPath}`;
  } else {
    statusBar.text = `$(git-branch) SentryTimer`;
    statusBar.tooltip = 'No git repository detected';
  }
}

/**
 * Start the elapsed time update timer.
 * This updates the status bar every second with the current elapsed time.
 */
function startElapsedTimer(): void {
  stopElapsedTimer();
  elapsedTimer = setInterval(() => {
    try {
      if (!sessionLogger) return;
      const activeSession = sessionLogger.getActiveSession();
      if (activeSession) {
        updateStatusBar(activeSession);
      }
    } catch {
      // Database might be closed, stop the timer
      stopElapsedTimer();
    }
  }, 1000);
}

/**
 * Stop the elapsed time update timer.
 */
function stopElapsedTimer(): void {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

export function activate(context: ExtensionContext) {
  // Use test logger if provided, otherwise create a new one
  if (_testLogger) {
    sessionLogger = _testLogger;
  } else {
    const dbPath = join(process.cwd(), '.sentry-timer', 'sessions.db');
    sessionLogger = new SessionLogger(dbPath);
  }

  // Create and configure the status bar
  statusBar = window.createStatusBarItem(StatusBarAlignment.Right, 100);
  statusBar.tooltip = 'SentryTimer: Click to view session info';
  updateStatusBar(null);
  statusBar.show();

  // Register commands
  const startCommand = commands.registerCommand('sentry-timer.start', async () => {
    await startSession();
  });

  const stopCommand = commands.registerCommand('sentry-timer.stop', async () => {
    await stopSession();
  });

  const reportCommand = commands.registerCommand('sentry-timer.report', async () => {
    await generateReport();
  });

  const deleteCommand = commands.registerCommand('sentry-timer.delete', async () => {
    await deleteSession();
  });

  const listCommand = commands.registerCommand('sentry-timer.list', async () => {
    await listSessions();
  });

  context.subscriptions.push(startCommand, stopCommand, reportCommand, deleteCommand, listCommand);

  // Auto-detect git context on activation
  const gitContext = detectGitContextWithVSCode();
  if (gitContext) {
    currentGitContext = gitContext;
    updateStatusBarWithGitContext();
    window.showInformationMessage(
      `SentryTimer: Detected repository at ${gitContext.repoPath} (branch: ${gitContext.branch})`
    );
  }

  // Listen for workspace folder changes to auto-detect repo changes
  const workspaceChangeDisposable = workspace.onDidChangeWorkspaceFolders(() => {
    debouncedDetectGitContext();
  });
  context.subscriptions.push(workspaceChangeDisposable);

  // Listen for active editor changes to detect repo changes when switching files
  const activeEditorDisposable = window.onDidChangeActiveTextEditor(() => {
    debouncedDetectGitContext();
  });
  context.subscriptions.push(activeEditorDisposable);

  // Listen for git extension state changes (e.g., when git extension activates)
  const gitAPI = getGitAPI();
  if (gitAPI) {
    const gitStateDisposable = gitAPI.onDidChangeState(() => {
      debouncedDetectGitContext();
    });
    context.subscriptions.push(gitStateDisposable);
  }

  window.showInformationMessage('SentryTimer activated');
}

export function deactivate() {
  stopElapsedTimer();
  if (statusBar) {
    statusBar.dispose();
  }
  if (sessionLogger) {
    sessionLogger.close();
  }
}

async function startSession(): Promise<void> {
  if (!sessionLogger) {
    window.showErrorMessage('SentryTimer: Logger not initialized');
    return;
  }

  const gitContext = detectGitContextWithVSCode();
  if (!gitContext) {
    window.showErrorMessage('SentryTimer: Not in a git repository. Open a git repo to start tracking.');
    return;
  }

  const activeSession = sessionLogger.getActiveSession();
  if (activeSession) {
    window.showWarningMessage(
      `SentryTimer: A session is already running on branch "${activeSession.branch}". Stop it first.`
    );
    return;
  }

  const entry = sessionLogger.startSession({
    repoPath: gitContext.repoPath,
    branch: gitContext.branch,
    startTime: new Date().toISOString(),
    commitHash: null,
    commitMessage: null,
    tags: ['manual'],
  });

  updateStatusBar(entry);
  startElapsedTimer();
  window.showInformationMessage(`SentryTimer: Session started on "${entry.branch}" (ID: ${entry.id})`);
}

async function stopSession(): Promise<void> {
  if (!sessionLogger) {
    window.showErrorMessage('SentryTimer: Logger not initialized');
    return;
  }

  const activeSession = sessionLogger.getActiveSession();
  if (!activeSession) {
    window.showWarningMessage('SentryTimer: No active session to stop.');
    return;
  }

  const stopped = sessionLogger.stopSession(activeSession.id);
  if (stopped) {
    stopElapsedTimer();
    const duration = formatDuration(stopped.durationMs);
    updateStatusBar(null);
    window.showInformationMessage(`SentryTimer: Session stopped. Duration: ${duration}`);
  } else {
    window.showErrorMessage('SentryTimer: Failed to stop session.');
  }
}

async function generateReport(): Promise<void> {
  if (!sessionLogger) {
    window.showErrorMessage('SentryTimer: Logger not initialized');
    return;
  }

  const allEntries = sessionLogger.getAllEntries();
  const report = generateWeeklyReport(allEntries);
  const markdown = generateMarkdownReport(report);

  const document = await workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });
  await window.showTextDocument(document);

  window.showInformationMessage(
    `SentryTimer: Weekly report generated. ${report.entries.length} sessions, ${formatDuration(report.totalDurationMs)}`
  );
}

async function deleteSession(): Promise<void> {
  if (!sessionLogger) {
    window.showErrorMessage('SentryTimer: Logger not initialized');
    return;
  }

  const activeSession = sessionLogger.getActiveSession();
  if (activeSession) {
    const items: QuickPickItem[] = [
      { label: 'Yes, delete active session', description: `ID: ${activeSession.id}, Branch: ${activeSession.branch}` },
      { label: 'Cancel' },
    ];

    const choice = await window.showQuickPick(items, {
      placeHolder: 'Delete the active session?',
    });

    if (choice && choice.label === 'Yes, delete active session') {
      const deleted = sessionLogger.deleteEntry(activeSession.id);
      if (deleted) {
        stopElapsedTimer();
        updateStatusBar(null);
        window.showInformationMessage(`SentryTimer: Session ${activeSession.id} deleted.`);
      }
    }
  } else {
    // No active session, let user pick from all entries
    const entries = sessionLogger.getAllEntries();
    if (entries.length === 0) {
      window.showInformationMessage('SentryTimer: No sessions to delete.');
      return;
    }

    const items: QuickPickItem[] = entries.map((entry) => ({
      label: `#${entry.id} - ${entry.branch}`,
      description: `${entry.startTime} | ${entry.endTime ? formatDuration(entry.durationMs) : 'running'}`,
    }));
    items.push({ label: 'Cancel' });

    const choice = await window.showQuickPick(items, {
      placeHolder: 'Select a session to delete',
    });

    if (choice && !choice.label.startsWith('Cancel')) {
      const id = parseInt(choice.label.match(/#(\d+)/)?.[1] || '0', 10);
      if (id) {
        const deleted = sessionLogger.deleteEntry(id);
        if (deleted) {
          window.showInformationMessage(`SentryTimer: Session #${id} deleted.`);
        }
      }
    }
  }
}

async function listSessions(): Promise<void> {
  if (!sessionLogger) {
    window.showErrorMessage('SentryTimer: Logger not initialized');
    return;
  }

  const entries = sessionLogger.getAllEntries();
  if (entries.length === 0) {
    window.showInformationMessage('SentryTimer: No sessions recorded.');
    return;
  }

  const items: QuickPickItem[] = entries.map((entry) => ({
    label: `#${entry.id} - ${entry.branch}`,
    description: `${entry.startTime} | ${entry.endTime ? formatDuration(entry.durationMs) : 'running'}`,
  }));

  const choice = await window.showQuickPick(items, {
    placeHolder: `Select a session (${entries.length} total)`,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (choice) {
    const id = parseInt(choice.label.match(/#(\d+)/)?.[1] || '0', 10);
    if (id) {
      const entry = sessionLogger.getEntry(id);
      if (entry) {
        const detail = [
          `ID: ${entry.id}`,
          `Repo: ${entry.repoPath}`,
          `Branch: ${entry.branch}`,
          `Start: ${entry.startTime}`,
          `End: ${entry.endTime || 'running'}`,
          `Duration: ${entry.durationMs ? formatDuration(entry.durationMs) : 'N/A'}`,
          `Tags: ${entry.tags}`,
        ].join('\n');
        window.showInformationMessage(`SentryTimer: Session #${entry.id}`, { detail }, 'Copy');
      }
    }
  }
}

/**
 * Calculate the elapsed time for a running session.
 * Returns the elapsed duration in ms, or the entry's durationMs if already stopped.
 */
function getElapsedMs(entry: TimeEntry): number {
  if (entry.durationMs !== null && entry.durationMs !== undefined) {
    return entry.durationMs;
  }
  if (entry.endTime) {
    return new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime();
  }
  return new Date().getTime() - new Date(entry.startTime).getTime();
}

function updateStatusBar(entry: TimeEntry | null): void {
  if (!statusBar) return;

  if (entry) {
    const elapsedMs = getElapsedMs(entry);
    const elapsed = formatDuration(elapsedMs);
    statusBar.text = `$(clock) SentryTimer: ${entry.branch} ${elapsed}`;
    statusBar.tooltip = `Session started at ${entry.startTime}\nRepo: ${entry.repoPath}`;
  } else {
    statusBar.text = `$(clock) SentryTimer`;
    statusBar.tooltip = 'No active session';
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}
