import * as vscode from 'vscode';
import { openZoteroDatabase } from '../zotero/db';
import { searchItems } from '../zotero/queries';
import { resolveZoteroPaths } from '../zotero/pathDiscovery';
import { confirmSelection, promptLayoutMode, runExport } from './shared';
import { pickItemsWithThreeLineView } from './threeLineItemPicker';

export async function searchAndExportCommand(outputChannel: vscode.OutputChannel): Promise<void> {
  const searchText = await vscode.window.showInputBox({
    title: 'Search Zotero items',
    prompt: 'Search title, creators, year, DOI, tags',
    placeHolder: 'e.g. distributed cognition',
    ignoreFocusOut: true,
  });

  if (searchText === undefined) {
    return;
  }

  const maxSearchResults =
    vscode.workspace.getConfiguration('vscodezotero').get<number>('maxSearchResults') ?? 200;

  const { sqlitePath, storagePath } = await resolveZoteroPaths();
  const opened = await openZoteroDatabase(sqlitePath);

  try {
    const matches = searchItems(opened.db, searchText, maxSearchResults);
    if (matches.length === 0) {
      vscode.window.showInformationMessage('No Zotero items matched your search.');
      return;
    }

    let selectedItems: typeof matches = [];
    while (true) {
      const selected = await pickItemsWithThreeLineView(matches);

      if (!selected || selected.length === 0) {
        vscode.window.showInformationMessage('No items selected.');
        return;
      }

      selectedItems = selected;
      const decision = await confirmSelection(selectedItems, {
        allowReselect: true,
        outputChannel,
      });

      if (decision === 'cancel') {
        return;
      }
      if (decision === 'export') {
        break;
      }
    }

    const layoutMode = await promptLayoutMode();
    if (!layoutMode) {
      return;
    }

    await runExport(
      opened.db,
      selectedItems,
      layoutMode,
      outputChannel,
      storagePath,
    );
  } finally {
    await opened.cleanup();
  }
}
