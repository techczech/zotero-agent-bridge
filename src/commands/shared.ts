import { promises as fs } from 'node:fs';
import path from 'node:path';
import { type Database } from 'sql.js';
import * as vscode from 'vscode';
import { exportItems } from '../export/exporter';
import {
  type ConflictDecision,
  type ExportResult,
  type LayoutMode,
  type ZoteroAttachment,
  type ZoteroItem,
  type ZoteroItemSummary,
} from '../types';

export function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Open a workspace folder before exporting Zotero items.');
  }

  return folder.uri.fsPath;
}

export async function promptLayoutMode(): Promise<LayoutMode | undefined> {
  const config = vscode.workspace.getConfiguration('vscodezotero');
  const configured = (config.get<string>('layoutMode') ?? '').trim() as LayoutMode | '';
  const validModes: LayoutMode[] = ['item-folder', 'flat', 'year-item'];
  if (validModes.includes(configured as LayoutMode)) {
    return configured as LayoutMode;
  }

  const pick = await vscode.window.showQuickPick(
    [
      {
        label: 'item-folder',
        detail: 'articles/<slug>/item.md + PDFs in the same folder',
        value: 'item-folder' as LayoutMode,
      },
      {
        label: 'flat',
        detail: 'articles/<slug>.md + prefixed PDFs',
        value: 'flat' as LayoutMode,
      },
      {
        label: 'year-item',
        detail: 'articles/<year>/<slug>/item.md + PDFs in the same folder',
        value: 'year-item' as LayoutMode,
      },
    ],
    {
      title: 'Select export layout (saved for this workspace)',
      placeHolder: 'How should exported files be organized?',
    },
  );

  if (!pick) {
    return undefined;
  }

  await config.update('layoutMode', pick.value, vscode.ConfigurationTarget.Workspace);
  return pick.value;
}

export async function promptConflictDecision(
  existingTarget: string,
  item: ZoteroItem,
): Promise<ConflictDecision> {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: 'Overwrite',
        value: 'overwrite' as const,
      },
      {
        label: 'Skip',
        value: 'skip' as const,
      },
      {
        label: 'Cancel',
        value: 'cancel' as const,
      },
    ],
    {
      title: `Item already exists: ${item.title || item.key}`,
      placeHolder: existingTarget,
    },
  );

  return choice?.value ?? 'cancel';
}

export async function promptPdfSelection(
  item: ZoteroItem,
  pdfAttachments: ZoteroAttachment[],
): Promise<ZoteroAttachment[]> {
  if (pdfAttachments.length <= 1) {
    return pdfAttachments;
  }

  const picks = await vscode.window.showQuickPick(
    pdfAttachments.map((attachment) => ({
      label: attachment.filename ?? attachment.key,
      description: attachment.title,
      attachment,
      picked: true,
    })),
    {
      title: `Select PDFs for ${item.title || item.key}`,
      canPickMany: true,
      placeHolder: 'Choose one or more PDFs to export',
    },
  );

  if (!picks) {
    return [];
  }

  return picks.map((pick) => pick.attachment);
}

export function formatItemSummary(item: ZoteroItemSummary): string {
  const pdfLabel = item.hasPdf ? `yes (${item.pdfCount})` : 'no';
  const creators = item.creatorsText || 'Unknown creator';
  const year = item.year || 'n.d.';
  return `${creators} • ${year} • PDF: ${pdfLabel} • Notes: ${item.noteCount}`;
}

export type SelectionDecision = 'export' | 'reselect' | 'cancel';

export async function confirmSelection(
  items: ZoteroItemSummary[],
  options: { allowReselect: boolean; outputChannel: vscode.OutputChannel },
): Promise<SelectionDecision> {
  const previewLimit = 1000;
  const shown = items.slice(0, previewLimit);
  options.outputChannel.clear();
  options.outputChannel.appendLine('Selected items for export:');
  for (const [index, item] of shown.entries()) {
    const pdfLabel = item.hasPdf ? `yes (${item.pdfCount})` : 'no';
    options.outputChannel.appendLine(
      `${index + 1}. ${item.title} | ${item.creatorsText || 'Unknown creator'} | ${item.year || 'n.d.'} | PDF: ${pdfLabel} | Notes: ${item.noteCount} | ${item.libraryName}`,
    );
  }
  if (items.length > previewLimit) {
    options.outputChannel.appendLine(`... and ${items.length - previewLimit} more item(s).`);
  }
  options.outputChannel.show(true);

  const choices = options.allowReselect ? ['Export', 'Re-select', 'Cancel'] : ['Export', 'Cancel'];
  const decision = await vscode.window.showInformationMessage(
    `${items.length} item(s) selected. Details are in the "VS Code Zotero Export" output panel.`,
    { modal: true },
    ...choices,
  );

  if (decision === 'Export') {
    return 'export';
  }
  if (decision === 'Re-select') {
    return 'reselect';
  }
  return 'cancel';
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveOutputRootPath(workspaceRoot: string): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('vscodezotero');
  const configuredOutputPath = (config.get<string>('outputPath') ?? '').trim();
  const defaultFolderName = (config.get<string>('outputFolderName') ?? 'articles').trim() || 'articles';
  const defaultOutputPath = path.join(workspaceRoot, defaultFolderName);

  if (configuredOutputPath) {
    if (await pathExists(configuredOutputPath)) {
      return configuredOutputPath;
    }

    const recover = await vscode.window.showWarningMessage(
      `Saved export folder does not exist: ${configuredOutputPath}`,
      { modal: true },
      'Choose Folder',
      'Cancel',
    );
    if (recover !== 'Choose Folder') {
      return undefined;
    }
  }

  const mode = await vscode.window.showQuickPick(
    [
      {
        label: 'Use default workspace/articles',
        description: defaultOutputPath,
        value: 'default' as const,
      },
      {
        label: 'Choose custom folder',
        description: 'Select another export folder and save it',
        value: 'custom' as const,
      },
    ],
    {
      title: 'Select export destination (saved for next runs)',
    },
  );

  if (!mode) {
    return undefined;
  }

  let selectedPath: string | undefined;
  if (mode.value === 'default') {
    selectedPath = defaultOutputPath;
  } else {
    const pick = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFiles: false,
      canSelectFolders: true,
      openLabel: 'Use this export folder',
      defaultUri: vscode.Uri.file(workspaceRoot),
    });
    if (!pick || pick.length === 0) {
      return undefined;
    }
    selectedPath = pick[0].fsPath;
  }

  await fs.mkdir(selectedPath, { recursive: true });
  await config.update('outputPath', selectedPath, vscode.ConfigurationTarget.Workspace);
  return selectedPath;
}

export async function runExport(
  db: Database,
  itemSummaries: ZoteroItemSummary[],
  layoutMode: LayoutMode,
  outputChannel: vscode.OutputChannel,
  storagePath: string,
  options?: {
    outputRootPathOverride?: string;
    suppressCompletionMessage?: boolean;
    completionLabel?: string;
  },
): Promise<ExportResult | undefined> {
  if (itemSummaries.length === 0) {
    vscode.window.showInformationMessage('No Zotero items selected for export.');
    return undefined;
  }

  const workspaceRoot = getWorkspaceRoot();
  const outputRootPath = options?.outputRootPathOverride ?? (await resolveOutputRootPath(workspaceRoot));
  if (!outputRootPath) {
    vscode.window.showInformationMessage('Export cancelled.');
    return undefined;
  }

  outputChannel.appendLine(`Using storage: ${storagePath}`);
  outputChannel.appendLine(`Workspace root: ${workspaceRoot}`);
  outputChannel.appendLine(`Export destination: ${outputRootPath}`);

  const result = await exportItems(db, itemSummaries, {
    outputRootPath,
    layoutMode,
    storagePath,
    outputChannel,
    resolveConflict: promptConflictDecision,
    selectPdfAttachments: promptPdfSelection,
  });

  const summary = `Export complete. Exported: ${result.exported}, skipped: ${result.skipped}, failed: ${result.failed}${
    result.cancelled ? ', cancelled early' : ''
  }.`;

  if (options?.completionLabel) {
    outputChannel.appendLine(`${options.completionLabel}: ${summary}`);
  } else {
    outputChannel.appendLine(summary);
  }
  outputChannel.show(true);
  if (!options?.suppressCompletionMessage) {
    vscode.window.showInformationMessage(summary);
  }
  return result;
}

export function collectionPathLabel(
  collectionId: number,
  byId: Map<number, { collectionName: string; parentCollectionId: number | null }>,
): string {
  const chain: string[] = [];
  let current: number | null = collectionId;

  while (current !== null) {
    const node = byId.get(current);
    if (!node) {
      break;
    }
    chain.push(node.collectionName);
    current = node.parentCollectionId;
  }

  return chain.reverse().join(' / ');
}

export function basenamePathLabel(fsPath: string): string {
  return path.basename(fsPath);
}
