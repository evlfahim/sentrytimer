#!/usr/bin/env node
/**
 * Verification script for report.ts
 * Run with: node packages/core/report-cli.js
 * 
 * This script creates a test database, adds sample entries,
 * generates a weekly report, and outputs it as Markdown.
 */

const { SessionLogger } = require('./dist/src/logger');
const { generateWeeklyReport, generateMarkdownReport } = require('./dist/src/report');
const { join } = require('path');
const { mkdirSync, existsSync, rmSync } = require('fs');

// Create a temporary test database
const testDbPath = join(__dirname, '.sentry-timer-test', 'sessions.db');
const dbDir = join(__dirname, '.sentry-timer-test');

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Clean up any previous test data
try {
  rmSync(testDbPath);
} catch (e) {
  // File doesn't exist yet, that's fine
}

const logger = new SessionLogger(testDbPath);

// Get current week's start date
const now = new Date();
const day = now.getDay();
const diff = now.getDate() - day + (day === 0 ? -6 : 1);
const weekStart = new Date(now);
weekStart.setDate(diff);
weekStart.setHours(0, 0, 0, 0);
const startDate = weekStart.toISOString();

// Create sample entries for the current week
const entries = [
  {
    repoPath: '/projects/sentry-timer',
    branch: 'main',
    startTime: startDate,
    commitHash: 'abc123',
    commitMessage: 'Initial commit',
    tags: ['core', 'report'],
  },
  {
    repoPath: '/projects/sentry-timer',
    branch: 'feature/reports',
    startTime: new Date(new Date(startDate).getTime() + 3600000).toISOString(),
    commitHash: 'def456',
    commitMessage: 'Add report generation',
    tags: ['core', 'report'],
  },
  {
    repoPath: '/projects/other-app',
    branch: 'develop',
    startTime: new Date(new Date(startDate).getTime() + 7200000).toISOString(),
    commitHash: 'ghi789',
    commitMessage: 'Feature work',
    tags: ['feature'],
  },
];

// Start and stop sessions to create entries
const startedSessions = [];
for (const entry of entries) {
  const session = logger.startSession(entry);
  startedSessions.push(session);
  
  // Stop the session after a simulated duration
  logger.stopSession(session.id);
}

// Generate the weekly report
const allEntries = logger.getAllEntries();
const report = generateWeeklyReport(allEntries);

// Generate and output the Markdown report
const markdown = generateMarkdownReport(report);
console.log(markdown);

// Clean up
logger.close();
rmSync(testDbPath);
rmSync(dbDir, { recursive: true });

console.log('\n✓ Report generated successfully!');
console.log(`  Total sessions: ${report.entries.length}`);
console.log(`  Total time: ${report.totalDurationMs}ms`);
console.log(`  Repositories: ${report.byRepo.size}`);
console.log(`  Branches: ${report.byBranch.size}`);
