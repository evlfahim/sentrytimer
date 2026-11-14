import { ExtensionContext, window, commands, StatusBarAlignment, QuickPickItem, workspace } from 'vscode';
import {
  SessionLogger,
  detectGitContext,
  generateWeeklyReport,
  generateMarkdownReport,
  type TimeEntry,
} from '@sentry-timer/core';

let sessionLogger: SessionLogger | null = null;
let statusBar: ReturnType<typeof window.createStatusBarItem> | null = null;

export function activate(context: ExtensionContext) {
  // Initialize the session logger
  sessionLogger = new SessionLogger();

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
  const gitContext = detectGitContext();
  if (gitContext) {
    window.showInformationMessage(
      `SentryTimer: Detected repository at ${gitContext.repoPath} (branch: ${gitContext.branch})`
    );
  }

  window.showInformationMessage('SentryTimer activated');
}

export function deactivate() {
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

  const gitContext = detectGitContext();
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

function updateStatusBar(entry: TimeEntry | null): void {
  if (!statusBar) return;

  if (entry) {
    statusBar.text = `$(clock) SentryTimer: ${entry.branch}`;
    statusBar.tooltip = `Session started at ${entry.startTime}`;
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
