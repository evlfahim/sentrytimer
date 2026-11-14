/**
 * Mock for the vscode module used by the extension tests.
 * Provides named exports matching the vscode API surface used by the extension.
 */

const createStatusBarItem = jest.fn();
const showInformationMessage = jest.fn();
const showErrorMessage = jest.fn();
const showWarningMessage = jest.fn();
const showQuickPick = jest.fn();
const showTextDocument = jest.fn();
const openTextDocument = jest.fn();
const registerCommand = jest.fn();

// Named exports matching the vscode API surface
export const window = {
  createStatusBarItem,
  showInformationMessage,
  showErrorMessage,
  showWarningMessage,
  showQuickPick,
  showTextDocument,
};

export const workspace = {
  openTextDocument,
};

export const commands = {
  registerCommand,
};

export const StatusBarAlignment = {
  Right: 1,
};

export class ExtensionContext {
  subscriptions: any[] = [];
}

// Also export as default for compatibility
export default {
  window,
  workspace,
  commands,
  StatusBarAlignment,
  ExtensionContext,
};
