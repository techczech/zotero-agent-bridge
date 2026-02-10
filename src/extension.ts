import * as vscode from 'vscode';
import { exportCollectionCommand } from './commands/exportCollection';
import { searchAndExportCommand } from './commands/searchAndExport';
import { configureZoteroPaths } from './zotero/pathDiscovery';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('VS Code Zotero Export');
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodezotero.searchAndExport', async () => {
      try {
        await searchAndExportCommand(outputChannel);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[error] ${message}`);
        outputChannel.show(true);
        vscode.window.showErrorMessage(`Zotero export failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodezotero.exportCollection', async () => {
      try {
        await exportCollectionCommand(outputChannel);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[error] ${message}`);
        outputChannel.show(true);
        vscode.window.showErrorMessage(`Zotero collection export failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodezotero.configurePaths', async () => {
      try {
        await configureZoteroPaths();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[error] ${message}`);
        outputChannel.show(true);
        vscode.window.showErrorMessage(`Failed to configure Zotero paths: ${message}`);
      }
    }),
  );
}

export function deactivate(): void {
  // no-op
}
