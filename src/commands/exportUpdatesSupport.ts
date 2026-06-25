import { type ExportResult } from '../types';

export type UpdatesMode = 'first-run-full' | 'incremental';

function formatItemLine(item: {
  key: string;
  title: string;
  targetPath?: string;
  error?: string;
}): string {
  const title = item.title?.trim() || 'Untitled';
  if (item.error) {
    return `- \`${item.key}\` ${title} - ${item.error}`;
  }
  if (item.targetPath) {
    return `- \`${item.key}\` ${title} -> \`${item.targetPath}\``;
  }
  return `- \`${item.key}\` ${title}`;
}

function formatSection(
  title: string,
  items: Array<{ key: string; title: string; targetPath?: string; error?: string }>,
): string {
  const lines = items.length > 0 ? items.map(formatItemLine) : ['- None'];
  return `### ${title}\n${lines.join('\n')}`;
}

export function shouldAdvanceSyncCheckpoint(result: ExportResult): {
  shouldAdvance: boolean;
  reason: string;
} {
  if (result.cancelled) {
    return { shouldAdvance: false, reason: 'Run cancelled.' };
  }
  if (result.failed > 0) {
    return { shouldAdvance: false, reason: `Run had ${result.failed} failed item(s).` };
  }
  if (result.skipped > 0) {
    return { shouldAdvance: false, reason: `Run skipped ${result.skipped} changed item(s).` };
  }
  return { shouldAdvance: true, reason: 'All candidate items exported successfully.' };
}

export function buildUpdatesLogEntry(payload: {
  runStartedAtIso: string;
  mode: UpdatesMode;
  previousCheckpointIso?: string;
  queryUpperBoundIso: string;
  result: ExportResult;
  checkpointAdvanced: boolean;
  checkpointReason: string;
  nextCheckpointIso?: string;
}): string {
  const exportedNew = payload.result.itemOutcomes.filter((item) => item.action === 'exported-new');
  const exportedOverwrite = payload.result.itemOutcomes.filter((item) => item.action === 'exported-overwrite');
  const skippedConflict = payload.result.itemOutcomes.filter((item) => item.action === 'skipped-conflict');
  const failed = payload.result.itemOutcomes.filter((item) => item.action === 'failed');

  const lines = [
    `## Zotero Updates Sync ${payload.runStartedAtIso}`,
    `- Mode: \`${payload.mode}\``,
    `- Previous checkpoint: \`${payload.previousCheckpointIso ?? 'none'}\``,
    `- Query upper bound: \`${payload.queryUpperBoundIso}\``,
    `- Totals: exported=${payload.result.exported}, skipped=${payload.result.skipped}, failed=${payload.result.failed}, cancelled=${payload.result.cancelled}`,
    `- Checkpoint advanced: \`${payload.checkpointAdvanced ? 'yes' : 'no'}\``,
    `- Checkpoint reason: ${payload.checkpointReason}`,
    `- Next checkpoint: \`${payload.nextCheckpointIso ?? payload.previousCheckpointIso ?? 'none'}\``,
    '',
    formatSection('Exported New', exportedNew),
    '',
    formatSection('Re-exported (Overwritten)', exportedOverwrite),
    '',
    formatSection('Skipped (Conflict)', skippedConflict),
    '',
    formatSection('Failed', failed),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

