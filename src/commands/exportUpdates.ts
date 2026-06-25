import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { openZoteroDatabase } from '../zotero/db';
import { getAllTopLevelItemSummaries, getUpdatedItemSummariesSince } from '../zotero/queries';
import { resolveZoteroPaths } from '../zotero/pathDiscovery';
import { type ExportResult, type ZoteroItem } from '../types';
import { getWorkspaceRoot, promptLayoutMode, resolveOutputRootPath, runExport } from './shared';
import {
  buildUpdatesLogEntry,
  shouldAdvanceSyncCheckpoint,
  type UpdatesMode,
} from './exportUpdatesSupport';

const LAST_SYNC_AT_KEY = 'vscodezotero.lastSyncAtIso';
const UPDATES_LOG_FILENAME = 'zotero-updates-log.md';

async function appendUpdatesLog(outputRootPath: string, entry: string): Promise<string> {
  const logPath = path.join(outputRootPath, UPDATES_LOG_FILENAME);
  await fs.appendFile(logPath, entry, 'utf8');
  return logPath;
}

async function promptBatchConflictDecision(): Promise<'overwrite' | 'skip' | 'cancel'> {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: 'Overwrite all changed',
        description: 'Re-export all changed items that already exist in destination.',
        value: 'overwrite' as const,
      },
      {
        label: 'Skip all changed',
        description: 'Keep existing files and skip changed items that already exist.',
        value: 'skip' as const,
      },
      {
        label: 'Cancel',
        description: 'Stop the incremental export.',
        value: 'cancel' as const,
      },
    ],
    {
      title: 'Changed items already exist in export destination',
    },
  );

  return choice?.value ?? 'cancel';
}

export async function exportUpdatesCommand(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const { sqlitePath, storagePath } = await resolveZoteroPaths();
  const opened = await openZoteroDatabase(sqlitePath);
  const runStartedAtIso = new Date().toISOString();
  const previousCheckpointIso = context.workspaceState.get<string>(LAST_SYNC_AT_KEY);
  const mode: UpdatesMode = previousCheckpointIso ? 'incremental' : 'first-run-full';

  try {
    const layoutMode = await promptLayoutMode();
    if (!layoutMode) {
      return;
    }

    const workspaceRoot = getWorkspaceRoot();
    const outputRootPath = await resolveOutputRootPath(workspaceRoot);
    if (!outputRootPath) {
      vscode.window.showInformationMessage('Export cancelled.');
      return;
    }

    const candidates = previousCheckpointIso
      ? getUpdatedItemSummariesSince(opened.db, previousCheckpointIso, runStartedAtIso)
      : getAllTopLevelItemSummaries(opened.db);

    if (candidates.length === 0) {
      const emptyResult: ExportResult = {
        exported: 0,
        skipped: 0,
        failed: 0,
        cancelled: false,
        warnings: [],
        itemOutcomes: [],
      };

      const logEntry = buildUpdatesLogEntry({
        runStartedAtIso,
        mode,
        previousCheckpointIso,
        queryUpperBoundIso: runStartedAtIso,
        result: emptyResult,
        checkpointAdvanced: false,
        checkpointReason: 'No updated items matched the checkpoint window.',
      });

      const logPath = await appendUpdatesLog(outputRootPath, logEntry);
      outputChannel.appendLine('No updated items since last sync checkpoint.');
      outputChannel.appendLine(`Updates log appended: ${logPath}`);
      outputChannel.show(true);
      vscode.window.showInformationMessage('No Zotero updates found since last sync checkpoint.');
      return;
    }

    let batchConflictDecision: 'overwrite' | 'skip' | 'cancel' | undefined;
    const resolveConflictOverride = async (
      _existingTarget: string,
      _item: ZoteroItem,
    ): Promise<'overwrite' | 'skip' | 'cancel'> => {
      if (!batchConflictDecision) {
        batchConflictDecision = await promptBatchConflictDecision();
      }
      return batchConflictDecision;
    };

    const result = await runExport(opened.db, candidates, layoutMode, outputChannel, storagePath, {
      outputRootPathOverride: outputRootPath,
      completionLabel: 'Zotero updates export',
      resolveConflictOverride,
    });

    if (!result) {
      return;
    }

    const checkpointDecision = shouldAdvanceSyncCheckpoint(result);
    let nextCheckpointIso = previousCheckpointIso;

    if (checkpointDecision.shouldAdvance) {
      nextCheckpointIso = runStartedAtIso;
      await context.workspaceState.update(LAST_SYNC_AT_KEY, runStartedAtIso);
      outputChannel.appendLine(`Updated sync checkpoint: ${runStartedAtIso}`);
    } else {
      outputChannel.appendLine(`Checkpoint unchanged: ${checkpointDecision.reason}`);
    }

    const logEntry = buildUpdatesLogEntry({
      runStartedAtIso,
      mode,
      previousCheckpointIso,
      queryUpperBoundIso: runStartedAtIso,
      result,
      checkpointAdvanced: checkpointDecision.shouldAdvance,
      checkpointReason: checkpointDecision.reason,
      nextCheckpointIso,
    });

    const logPath = await appendUpdatesLog(outputRootPath, logEntry);
    outputChannel.appendLine(`Updates log appended: ${logPath}`);
    outputChannel.show(true);
  } finally {
    await opened.cleanup();
  }
}
