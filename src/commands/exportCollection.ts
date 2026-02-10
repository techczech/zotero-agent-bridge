import path from 'node:path';
import * as vscode from 'vscode';
import { sanitizeSegment } from '../export/naming';
import { openZoteroDatabase } from '../zotero/db';
import {
  getDirectCollectionItemSummaries,
  getCollectionItemSummaries,
  getCollectionsForLibrary,
  getLibraries,
} from '../zotero/queries';
import { type ZoteroCollection } from '../types';
import { resolveZoteroPaths } from '../zotero/pathDiscovery';
import {
  collectionPathLabel,
  confirmSelection,
  getWorkspaceRoot,
  promptLayoutMode,
  resolveOutputRootPath,
  runExport,
} from './shared';

type CollectionFolderMode = 'single-folder' | 'mirror-subcollections';

function getCollectionPathSegments(
  collectionId: number,
  byId: Map<number, { collectionName: string; parentCollectionId: number | null }>,
): string[] {
  const segments: string[] = [];
  let current: number | null = collectionId;

  while (current !== null) {
    const node = byId.get(current);
    if (!node) {
      break;
    }
    segments.push(node.collectionName);
    current = node.parentCollectionId;
  }

  return segments.reverse();
}

function getRelativePathSegments(
  rootCollectionId: number,
  collectionId: number,
  byId: Map<number, { collectionName: string; parentCollectionId: number | null }>,
): string[] {
  const rootSegments = getCollectionPathSegments(rootCollectionId, byId);
  const fullSegments = getCollectionPathSegments(collectionId, byId);
  return fullSegments.slice(rootSegments.length);
}

function getDescendantCollectionIds(rootCollectionId: number, collections: ZoteroCollection[]): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const collection of collections) {
    if (collection.parentCollectionId === null) {
      continue;
    }
    const arr = childrenByParent.get(collection.parentCollectionId) ?? [];
    arr.push(collection.collectionId);
    childrenByParent.set(collection.parentCollectionId, arr);
  }

  const ordered: number[] = [];
  const queue: number[] = [rootCollectionId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    const children = childrenByParent.get(current) ?? [];
    queue.push(...children);
  }
  return ordered;
}

async function promptCollectionFolderMode(): Promise<CollectionFolderMode | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      {
        label: 'Single collection folder',
        description: 'Export all selected collection items into one subfolder.',
        value: 'single-folder' as const,
      },
      {
        label: 'Mirror sub-collections',
        description: 'Create subfolders for nested collections and export into each.',
        value: 'mirror-subcollections' as const,
      },
    ],
    {
      title: 'Collection export folder mode',
    },
  );

  return pick?.value;
}

export async function exportCollectionCommand(outputChannel: vscode.OutputChannel): Promise<void> {
  const { sqlitePath, storagePath } = await resolveZoteroPaths();
  const opened = await openZoteroDatabase(sqlitePath);

  try {
    const libraries = getLibraries(opened.db);
    if (libraries.length === 0) {
      vscode.window.showInformationMessage('No Zotero libraries found.');
      return;
    }

    const selectedLibrary = await vscode.window.showQuickPick(
      libraries.map((library) => ({
        label: library.libraryName,
        description: library.libraryType,
        library,
      })),
      {
        title: 'Select Zotero library',
      },
    );

    if (!selectedLibrary) {
      return;
    }

    const collections = getCollectionsForLibrary(opened.db, selectedLibrary.library.libraryId);
    if (collections.length === 0) {
      vscode.window.showInformationMessage('No collections found in selected library.');
      return;
    }

    const collectionById = new Map(
      collections.map((collection) => [
        collection.collectionId,
        {
          collectionName: collection.collectionName,
          parentCollectionId: collection.parentCollectionId,
        },
      ]),
    );

    const selectedCollection = await vscode.window.showQuickPick(
      collections.map((collection) => ({
        label: collection.collectionName,
        description: collectionPathLabel(collection.collectionId, collectionById),
        collection,
      })),
      {
        title: `Select collection from ${selectedLibrary.library.libraryName}`,
      },
    );

    if (!selectedCollection) {
      return;
    }

    const items = getCollectionItemSummaries(opened.db, selectedCollection.collection.collectionId);
    if (items.length === 0) {
      vscode.window.showInformationMessage('No exportable items found in selected collection.');
      return;
    }

    const confirm = await vscode.window.showQuickPick(
      [
        {
          label: 'Export all items',
          description: `${items.length} items`,
          value: true,
        },
        {
          label: 'Cancel',
          value: false,
        },
      ],
      {
        title: 'Collection export confirmation',
      },
    );

    if (!confirm || !confirm.value) {
      return;
    }

    const review = await confirmSelection(items, {
      allowReselect: false,
      outputChannel,
    });
    if (review !== 'export') {
      return;
    }

    const layoutMode = await promptLayoutMode();
    if (!layoutMode) {
      return;
    }

    const collectionFolderMode = await promptCollectionFolderMode();
    if (!collectionFolderMode) {
      return;
    }

    const workspaceRoot = getWorkspaceRoot();
    const outputRootPath = await resolveOutputRootPath(workspaceRoot);
    if (!outputRootPath) {
      vscode.window.showInformationMessage('Export cancelled.');
      return;
    }

    const baseCollectionFolderName =
      sanitizeSegment(selectedCollection.collection.collectionName) || selectedCollection.collection.key;
    const collectionOutputRoot = path.join(outputRootPath, baseCollectionFolderName);

    if (collectionFolderMode === 'single-folder') {
      await runExport(opened.db, items, layoutMode, outputChannel, storagePath, {
        outputRootPathOverride: collectionOutputRoot,
        completionLabel: `Collection ${selectedCollection.collection.collectionName}`,
      });
      return;
    }

    const descendantIds = getDescendantCollectionIds(selectedCollection.collection.collectionId, collections);
    let totalExported = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let cancelled = false;

    for (const collectionId of descendantIds) {
      const directItems = getDirectCollectionItemSummaries(opened.db, collectionId);
      if (directItems.length === 0) {
        continue;
      }

      const relativeSegments = getRelativePathSegments(
        selectedCollection.collection.collectionId,
        collectionId,
        collectionById,
      );
      const safeRelativeSegments = relativeSegments.map((segment) => sanitizeSegment(segment) || 'collection');
      const targetFolder = path.join(collectionOutputRoot, ...safeRelativeSegments);
      const collectionPath = collectionPathLabel(collectionId, collectionById);

      const result = await runExport(opened.db, directItems, layoutMode, outputChannel, storagePath, {
        outputRootPathOverride: targetFolder,
        suppressCompletionMessage: true,
        completionLabel: `Collection ${collectionPath}`,
      });

      if (!result) {
        continue;
      }

      totalExported += result.exported;
      totalSkipped += result.skipped;
      totalFailed += result.failed;
      if (result.cancelled) {
        cancelled = true;
        break;
      }
    }

    const finalSummary = `Collection export complete. Exported: ${totalExported}, skipped: ${totalSkipped}, failed: ${totalFailed}${
      cancelled ? ', cancelled early' : ''
    }.`;
    outputChannel.appendLine(finalSummary);
    outputChannel.show(true);
    vscode.window.showInformationMessage(finalSummary);
  } finally {
    await opened.cleanup();
  }
}
