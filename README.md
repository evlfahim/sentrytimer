# SentryTimer

A modular, local-first time tracker that auto-detects git repositories, logs sessions with branch context, and generates weekly reports. Features a decoupled core library ready for VS Code plugin integration.

## Why SentryTimer?

- **Local-first**: All data stored in SQLite on your machine — no network dependencies, no cloud sync.
- **Git-aware**: Automatically detects which repository and branch you're working in via the VS Code Git API or CLI fallback.
- **Modular**: Core library (`@sentry-timer/core`) is fully decoupled and can be reused in any project or plugin.
- **Weekly reports**: Generate Markdown or CSV summaries of your time spent by repository and branch.
- **VS Code integration**: Extension with status bar, command palette, auto-detection, and live elapsed time updates.
- **CLI interface**: Manage sessions from the terminal with start, stop, list, report, delete, and clear commands.

## Stack

- TypeScript
- Node.js
- SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3))
- Jest (testing)
- Commander.js-style CLI (custom parser)
- VS Code Extension API

## Project Structure

```
sentrytimer/
├── packages/
│   ├── core/          # Core time-tracking library
│   │   ├── src/
│   │   │   ├── git.ts       # Git repository and branch detection
│   │   │   ├── logger.ts    # Session logging with SQLite persistence
│   │   │   ├── report.ts    # Weekly report generation (Markdown, CSV)
│   │   │   ├── config.ts    # Configuration loading (file, env, defaults)
│   │   │   ├── cli.ts       # CLI entry point
│   │   │   └── index.ts     # Public API barrel exports
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

### Prerequisites

- Node.js 18+
- npm 9+
- A git repository (for git context detection)

### Setup

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
  loadConfig,
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
# Start a session (auto-detects git repo and branch)
node packages/core/dist/cli.js start

# Start a session with tags
node packages/core/dist/cli.js start --tags core,report

# Stop the active session
node packages/core/dist/cli.js stop

# View the active session and elapsed time
node packages/core/dist/cli.js status

# View all entries
node packages/core/dist/cli.js list

# Filter entries by repository
node packages/core/dist/cli.js list --repo /projects/sentry-timer

# Filter entries by tag
node packages/core/dist/cli.js list --tag core

# Generate a weekly report (Markdown, printed to stdout)
node packages/core/dist/cli.js report

# Generate a report in CSV format and write to a file
node packages/core/dist/cli.js report --format csv --output report.csv

# Delete a session by ID
node packages/core/dist/cli.js delete 1

# Delete all sessions
node packages/core/dist/cli.js clear

# Show help
node packages/core/dist/cli.js --help
```

#### CLI Commands

| Command | Description |
|---------|-------------|
| `start [options]` | Start a new time-tracking session |
| `stop` | Stop the active session |
| `status` | Show the active session and elapsed time |
| `list [options]` | List time entries |
| `report [options]` | Generate a report based on configured frequency |
| `delete <id>` | Delete a session by ID |
| `clear` | Delete all sessions |

#### CLI Options

**Start Options:**

| Option | Description |
|--------|-------------|
| `--tags <tags>` | Comma-separated tags (e.g., `"core,report"`) |

**List Options:**

| Option | Description |
|--------|-------------|
| `--repo <path>` | Filter by repository path |
| `--branch <name>` | Filter by branch name |
| `--tag <tag>` | Filter by tag |
| `--from <date>` | Filter entries from this date (ISO 8601) |
| `--to <date>` | Filter entries to this date (ISO 8601) |

**Report Options:**

| Option | Description |
|--------|-------------|
| `--format <format>` | Report format: `markdown` (default) or `csv` |
| `--output <path>` | Write report to file instead of stdout |

### VS Code Extension

The VS Code extension (`sentry-timer`) wraps the core library and provides:

- **Command Palette commands**:
  - `SentryTimer: Start Session` — Start tracking time on the current branch
  - `SentryTimer: Stop Session` — Stop the active session
  - `SentryTimer: Generate Weekly Report` — Open a Markdown report in the editor
  - `SentryTimer: Delete Session` — Delete the active session or pick from a list
  - `SentryTimer: List Sessions` — Browse all recorded sessions

- **Auto-detection**: Automatically detects the active git repository and branch when you open a workspace, switch files, or change workspace folders.

- **Status bar**: Shows the current repository, branch, and live elapsed time while a session is running. When no session is active, it shows the detected branch name.

- **Debounced detection**: Prevents spam on rapid workspace changes with a 300ms debounce.

#### Installing the Extension

1. Build the extension:

   ```bash
   npm run build
   ```

2. Package the extension:

   ```bash
   cd packages/plugin
   npx vsce package
   ```

   This generates a `.vsix` file (e.g., `sentry-timer-1.0.0.vsix`).

3. Install in VS Code:

   - Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run `Extensions: Install from VSIX...`
   - Select the generated `.vsix` file

   Alternatively, from the command line:

   ```bash
   code --install-extension packages/plugin/sentry-timer-1.0.0.vsix
   ```

#### Extension Settings

The extension reads settings from VS Code's settings UI or `settings.json`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sentryTimer.dbPath` | `string` | `""` (use default) | Custom path to the SQLite database file |
| `sentryTimer.reportFrequency` | `string` | `"weekly"` | Report frequency: `weekly`, `biweekly`, or `monthly` |

To configure via `settings.json`:

```json
{
  "sentryTimer.dbPath": "/path/to/custom/sessions.db",
  "sentryTimer.reportFrequency": "biweekly"
}
```

An empty `sentryTimer.dbPath` falls back to the default location. Invalid `reportFrequency` values are ignored and fall back to `"weekly"`.

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
| Jan 1, 2024, 9:00 AM | Jan 1, 2024, 10:00 AM | 1h 0m | `/home/user/project-a` | `main` |
| Jan 1, 2024, 10:30 AM | Jan 1, 2024, 11:00 AM | 30m | `/home/user/project-a` | `feature/new-ui` |
```

### CSV

```csv
id,repo_path,branch,start_time,end_time,duration_ms,commit_hash,commit_message
1,"/home/user/project-a","main","2024-01-01T09:00:00.000Z","2024-01-01T10:00:00.000Z",3600000,...,...
```

## Configuration

SentryTimer supports three layers of configuration that merge together (highest priority first):

1. **VS Code settings** (extension only)
2. **Environment variables** (CLI and extension)
3. **Config file** (`.sentry-timer.json`, found by walking up the directory tree)
4. **Defaults** (built-in fallbacks)

### Config File

Create a `.sentry-timer.json` file in your project root (or any parent directory):

```json
{
  "dbPath": "/path/to/custom/sessions.db",
  "reportFrequency": "weekly"
}
```

Supported options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbPath` | `string` | `.sentry-timer/sessions.db` | Path to the SQLite database file |
| `reportFrequency` | `"weekly" \| "biweekly" \| "monthly"` | `"weekly"` | Time window for report generation |

### Environment Variables

Override configuration via environment variables:

| Variable | Description |
|----------|-------------|
| `SENTRY_TIMER_DB` | Custom path to the SQLite database |
| `SENTRY_TIMER_REPORT_FREQUENCY` | Report frequency: `weekly`, `biweekly`, or `monthly` |

Example:

```bash
SENTRY_TIMER_DB=/tmp/sentry-timer.db \
SENTRY_TIMER_REPORT_FREQUENCY=biweekly \
node packages/core/dist/cli.js report
```

### VS Code Settings

The extension reads settings from VS Code's settings UI or `settings.json`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sentryTimer.dbPath` | `string` | `""` (use default) | Custom path to the SQLite database file |
| `sentryTimer.reportFrequency` | `string` | `"weekly"` | Report frequency: `weekly`, `biweekly`, or `monthly` |

To configure via `settings.json`:

```json
{
  "sentryTimer.dbPath": "/path/to/custom/sessions.db",
  "sentryTimer.reportFrequency": "biweekly"
}
```

An empty `sentryTimer.dbPath` falls back to the default location. Invalid `reportFrequency` values are ignored and fall back to `"weekly"`.

### Programmatic Configuration

When using the core library directly, pass a config object to the `SessionLogger` constructor:

```typescript
import { SessionLogger, loadConfig } from '@sentry-timer/core';

// Load config from file + env vars
const config = loadConfig();
const logger = new SessionLogger(undefined, config);

// Or provide a custom config
const customConfig = {
  dbPath: '/my/custom/path.db',
  reportFrequency: 'monthly',
};
const logger2 = new SessionLogger(undefined, customConfig);
```

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

### Building the VS Code Extension

```bash
# Build core and plugin
npm run build

# Package the extension into a .vsix file
cd packages/plugin
npx vsce package
```

The generated `.vsix` file can be installed in VS Code via `Extensions: Install from VSIX...` or `code --install-extension packages/plugin/sentry-timer-1.0.0.vsix`.

## License

MIT
