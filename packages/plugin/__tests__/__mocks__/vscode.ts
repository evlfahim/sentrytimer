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
const onDidChangeActiveTextEditor = jest.fn();
const onDidChangeWorkspaceFolders = jest.fn();
const getExtension = jest.fn();

// Mock active text editor
let _activeTextEditor: any = null;
const getActiveTextEditor = () => _activeTextEditor;
const setActiveTextEditor = (editor: any) => {
  _activeTextEditor = editor;
};

// Mock workspace folders
let _workspaceFolders: any[] = [];
const getWorkspaceFolders = () => _workspaceFolders;
const setWorkspaceFolders = (folders: any[]) => {
  _workspaceFolders = folders;
};

// Mock workspace folder lookup
const getWorkspaceFolder = jest.fn((uri: any) => {
  if (!uri || !uri.fsPath) return null;
  return _workspaceFolders.find((f) => uri.fsPath.startsWith(f.uri.fsPath)) || null;
});

// Named exports matching the vscode API surface
export const window = {
  createStatusBarItem,
  showInformationMessage,
  showErrorMessage,
  showWarningMessage,
  showQuickPick,
  showTextDocument,
  activeTextEditor: getActiveTextEditor,
  onDidChangeActiveTextEditor,
};

export const workspace = {
  openTextDocument,
  workspaceFolders: getWorkspaceFolders,
  getWorkspaceFolder,
  getExtension,
  onDidChangeWorkspaceFolders,
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

// Test helpers
export { getActiveTextEditor, setActiveTextEditor, getWorkspaceFolders, setWorkspaceFolders, getExtension };
