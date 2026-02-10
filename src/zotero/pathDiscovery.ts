import * as vscode from 'vscode';
import { type ResolvedZoteroPaths } from '../types';
import {
  discoverCandidateSqlitePaths,
  discoverStoragePath,
  pathExists,
  pickPreferredSqliteCandidate,
} from './pathCandidates';

export async function resolveZoteroPaths(): Promise<ResolvedZoteroPaths> {
  const config = vscode.workspace.getConfiguration('vscodezotero');
  const configuredSqlite = (config.get<string>('sqlitePath') ?? '').trim();
  const configuredStorage = (config.get<string>('storagePath') ?? '').trim();

  let sqlitePath = configuredSqlite;
  if (sqlitePath) {
    if (!(await pathExists(sqlitePath))) {
      throw new Error(
        `Configured zotero.sqlite path does not exist: ${sqlitePath}. Run "Zotero: Configure Local Paths".`,
      );
    }
  } else {
    const candidates = await discoverCandidateSqlitePaths();
    if (candidates.length === 0) {
      throw new Error(
        'Could not find a local Zotero database. Run "Zotero: Configure Local Paths" to set zotero.sqlite manually.',
      );
    }

    const preferred = await pickPreferredSqliteCandidate(candidates);
    if (!preferred) {
      throw new Error(
        'Could not select a Zotero database automatically. Run "Zotero: Configure Local Paths".',
      );
    }
    sqlitePath = preferred;
  }

  const storagePath = await discoverStoragePath(sqlitePath, undefined, configuredStorage);
  if (!storagePath) {
    throw new Error(
      `Could not find Zotero storage folder for sqlite at ${sqlitePath}. Run "Zotero: Configure Local Paths".`,
    );
  }

  return { sqlitePath, storagePath };
}

export async function configureZoteroPaths(): Promise<void> {
  const sqlitePick = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: 'Select zotero.sqlite',
    filters: {
      SQLite: ['sqlite', 'db'],
      All: ['*'],
    },
  });

  if (!sqlitePick || sqlitePick.length === 0) {
    vscode.window.showInformationMessage('Zotero path configuration cancelled.');
    return;
  }

  const storagePick = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: false,
    canSelectFolders: true,
    openLabel: 'Select Zotero storage folder',
  });

  if (!storagePick || storagePick.length === 0) {
    vscode.window.showInformationMessage('Zotero path configuration cancelled.');
    return;
  }

  const config = vscode.workspace.getConfiguration('vscodezotero');
  await config.update('sqlitePath', sqlitePick[0].fsPath, vscode.ConfigurationTarget.Workspace);
  await config.update('storagePath', storagePick[0].fsPath, vscode.ConfigurationTarget.Workspace);

  vscode.window.showInformationMessage('Zotero paths were saved to workspace settings.');
}
