import { ExtensionContext, window, commands } from 'vscode';
import { SessionLogger, detectGitContext, generateWeeklyReport, generateMarkdownReport } from '@sentry-timer/core';

let sessionLogger: SessionLogger | null = null;

export function activate(context: ExtensionContext) {
  // Initialize the session logger
  sessionLogger = new SessionLogger();

  // Register commands
  const startCommand = commands.registerCommand('sentry-timer.start', () => {
    startSession();
  });

  const stopCommand = commands.registerCommand('sentry-timer.stop', () => {
    stopSession();
  });

  const reportCommand = commands.registerCommand('sentry-timer.report', () => {
    generateReport();
  });

  context.subscriptions.push(startCommand, stopCommand, reportCommand);

  // Auto-detect git context on workspace change
  const gitContext = detectGitContext();
  if (gitContext) {
    window.showInformationMessage(`SentryTimer: Detected repository at ${gitContext.repoPath} (branch: ${gitContext.branch})`);
  }

  window.showInformationMessage('SentryTimer activated');
}

export function deactivate() {
  if (sessionLogger) {
    sessionLogger.close();
  }
}

function startSession() {
  if (!sessionLogger) return;

  const gitContext = detectGitContext();
  if (!gitContext) {
    window.showErrorMessage('SentryTimer: Not in a git repository');
    return;
  }

  const activeSession = sessionLogger.getActiveSession();
  if (activeSession) {
    window.showWarningMessage('SentryTimer: A session is already running. Stop it first.');
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

  window.showInformationMessage(`SentryTimer: Session started (ID: ${entry.id})`);
}

function stopSession() {
  if (!sessionLogger) return;

  const activeSession = sessionLogger.getActiveSession();
  if (!activeSession) {
    window.showWarningMessage('SentryTimer: No active session to stop.');
    return;
  }

  const stopped = sessionLogger.stopSession(activeSession.id);
  if (stopped) {
    window.showInformationMessage(`SentryTimer: Session stopped. Duration: ${stopped.durationMs}ms`);
  }
}

function generateReport() {
  if (!sessionLogger) return;

  const allEntries = sessionLogger.getAllEntries();
  const report = generateWeeklyReport(allEntries);
  const markdown = generateMarkdownReport(report);

  window.showInformationMessage(`SentryTimer: Weekly report generated. Total time: ${report.totalDurationMs}ms`);
}
