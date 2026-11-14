# SentryTimer

> A modular, local-first time tracker that auto-detects git repositories, logs sessions with branch context, and generates weekly reports, featuring a decoupled core library ready for VS Code plugin integration.

Task: Project time tracker that detects which git repo you are working in, logs time automatically and makes weekly reports; later a VS Code plugin #plugin #vscode

## Why it is better than what exists
- Clessira/vscode
- AliveFPS/Dev-Tracker-VSCode-Extension

## Features
- Auto-detect git repository and branch on workspace activation
- Local SQLite storage with no network dependencies
- Automatic time logging with repo/branch metadata
- Weekly report generation in Markdown and CSV
- Modular core library architecture for plugin reuse
- CLI interface for manual session management
- Debounced detection to prevent spam on rapid switches
- VS Code extension wrapper with status bar and command palette

## Stack
TypeScript, Node.js, SQLite (better-sqlite3), Jest, Commander.js, VS Code Extension API

## Becoming a plugin
Core logic is isolated in `packages/core`; the VS Code extension (`packages/plugin`) imports this library to handle IDE events, UI, and git context, while the core manages storage, logging, and reporting.

## Steps
- [x] 1. Initialize monorepo structure with `packages/core` and `packages/plugin`; configure TypeScript, Jest, and build scripts; verify build and test infrastructure with `npm run build && npm test`.
- [x] 2. Implement `core/src/git.ts` to detect active git repository and branch using `git rev-parse`; verify with `node dist/git.js` in a test repo.
- [x] 3. Implement `core/src/logger.ts` to start/stop sessions and persist entries to SQLite; verify with `node dist/logger.js start` and `stop`.
- [x] 4. Implement `core/src/report.ts` to generate weekly summaries by repo and branch; verify with `node dist/report.js` outputting Markdown.
- [x] 5. Add comprehensive unit tests for git detection, logging, and reporting; verify with `npm test` passing all assertions.
- [x] 6. Create `packages/cli.ts` to expose core functionality via command-line interface; verify with `node dist/cli.js --help` and `start` commands.
- [x] 7. Test CLI end-to-end in a git repository; verify entries are created and reports reflect CLI usage.
- [x] 8. Scaffold `packages/plugin` with VS Code extension manifest and activation events; verify `vsce package` generates a valid `.vsix`.
- [x] 9. Integrate `@sentry-timer/core` into the plugin; verify imports resolve and core functions execute within the extension context.
- [x] 10. Implement plugin command handlers for start/stop using core logger; verify commands appear in VS Code Command Palette.
- [x] 11. Add VS Code Git API integration to auto-detect repo on workspace change; verify repo context updates automatically.
- [x] 12. Implement status bar UI showing current repo, branch, and elapsed time; verify UI updates on session start/stop.
- [ ] 13. Refactor core to export a clean API interface; verify plugin and CLI both use the same core without duplication.
- [ ] 14. Add configuration settings for report frequency and storage path; verify settings load correctly in plugin and CLI.
- [ ] 15. Write `README.md` with installation, usage examples, weekly report format, and instructions to build the VS Code plugin; verify README covers all requirements.
