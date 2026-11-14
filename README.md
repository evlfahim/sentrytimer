# SentryTimer

A modular, local-first time tracker that auto-detects git repositories, logs sessions with branch context, and generates weekly reports. Features a decoupled core library ready for VS Code plugin integration.

## Why SentryTimer?

- **Local-first**: All data stored in SQLite on your machine — no network dependencies, no cloud sync.
- **Git-aware**: Automatically detects which repository and branch you're working in.
- **Modular**: Core library (`@sentry-timer/core`) is fully decoupled and can be reused in any project or plugin.
- **Weekly reports**: Generate Markdown or CSV summaries of your time spent by repository and branch.
- **VS Code integration**: Extension with status bar, command palette, and auto-detection.

## Stack

- TypeScript
- Node.js
- SQLite (better-sqlite3)
- Jest
- Commander.js (CLI)
- VS Code Extension API

## Project Structure

```
sentrytimer/
├── packages/
│   ├── core/          # Core time-tracking library (git detection, logging, reporting)
│   │   ├── src/
│   │   │   ├── git.ts       # Git repository and branch detection
│   │   │   ├── logger.ts    # Session logging with SQLite persistence
│   │   │   ├── report.ts    # Weekly report generation (Markdown, CSV)
│   │   │   └── index.ts     # Public API exports
│   │   └── __tests__/
│   └── plugin/        # VS Code extension wrapper
│       ├── src/
│       │   └── extension.ts  # Extension entry point
│       └── __tests__/
├── package.json       # Root monorepo config (npm workspaces)
├── tsconfig.json      # Shared TypeScript compiler settings
├── jest.config.js     # Root Jest config (runs both packages)
└── README.md
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd sentrytimer

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Core Library

The core library can be used programmatically or via the CLI.

```typescript
import {
  detectGitContext,
  SessionLogger,
  generateWeeklyReport,
  generateMarkdownReport,
} from '@sentry-timer/core';

// Detect the current git repository and branch
const context = detectGitContext();
if (context) {
  console.log(`Repository: ${context.repoPath}`);
  console.log(`Branch: ${context.branch}`);
}

// Start a time-tracking session
const logger = new SessionLogger();
const entry = logger.startSession({
  repoPath: context.repoPath,
  branch: context.branch,
  startTime: new Date().toISOString(),
  commitHash: null,
  commitMessage: null,
  tags: ['coding'],
});

// ... work ...

// Stop the session
const stopped = logger.stopSession(entry.id);
console.log(`Duration: ${stopped.durationMs}ms`);

// Generate a weekly report
const allEntries = logger.getAllEntries();
const report = generateWeeklyReport(allEntries);
const markdown = generateMarkdownReport(report);
console.log(markdown);

logger.close();
```

### CLI

The CLI is exposed through the core package. Use it to manage sessions from the terminal.

```bash
# Start a session
npm run build && node packages/core/dist/logger.js start

# Stop the active session
npm run build && node packages/core/dist/logger.js stop

# View all entries
npm run build && node packages/core/dist/logger.js list

# Generate a weekly report
npm run build && node packages/core/dist/report.js
```

### VS Code Extension

The VS Code extension (`@sentry-timer/plugin`) wraps the core library and provides:

- **Command Palette commands**: `SentryTimer: Start Session`, `SentryTimer: Stop Session`, `SentryTimer: Generate Weekly Report`
- **Auto-detection**: Automatically detects the active git repository and branch when you open a workspace.
- **Status bar**: Shows the current repository, branch, and elapsed time.

#### Building the Extension

```bash
npm run build
```

#### Packaging the Extension

```bash
npm run build -w @sentry-timer/plugin
cd packages/plugin
npx vsce package
```

This generates a `.vsix` file you can install in VS Code via `Extensions: Install from VSIX...`.

## Weekly Report Format

### Markdown

```markdown
# Weekly Time Report

**Period:** Monday, January 1, 2024 — Sunday, January 7, 2024

## Summary

- **Total Time:** 12h 30m
- **Sessions:** 24

## By Repository

| Repository | Time |
| ---------- | ---- |
| `/home/user/project-a` | 8h 15m |
| `/home/user/project-b` | 4h 15m |

## By Branch

| Repository | Branch | Time |
| ---------- | ------ | ---- |
| `/home/user/project-a` | `main` | 6h 00m |
| `/home/user/project-a` | `feature/new-ui` | 2h 15m |
| `/home/user/project-b` | `develop` | 4h 15m |

## Detailed Entries

| Start | End | Duration | Repository | Branch |
| ----- | --- | -------- | ---------- | ------ |
| ... | ... | ... | ... | ... |
```

### CSV

```csv
id,repo_path,branch,start_time,end_time,duration_ms,commit_hash,commit_message
1,/home/user/project-a,main,2024-01-01T09:00:00.000Z,2024-01-01T10:00:00.000Z,3600000,...,...
```

## Configuration

### Storage Path

By default, sessions are stored in `.sentry-timer/sessions.db` relative to the current working directory. You can customize this by passing a path to the `SessionLogger` constructor:

```typescript
const logger = new SessionLogger('/path/to/custom/sessions.db');
```

### Report Frequency

Reports are generated on-demand. Use the CLI or extension commands to generate them whenever you need.

## Development

### Monorepo Scripts

```bash
# Build all packages
npm run build

# Run all tests
npm test

# Run tests for a specific package
npm run test:core
npm run test:plugin

# Clean build artifacts
npm run clean
```

### Adding New Tests

Tests live alongside source files in `__tests__/` directories. The Jest configuration automatically picks up `*.test.ts` files in each package.

```bash
# Run a single test file
npx jest packages/core/__tests__/git.test.ts
```

## License

MIT
