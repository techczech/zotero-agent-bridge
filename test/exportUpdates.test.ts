import { describe, expect, it } from 'vitest';
import {
  buildUpdatesLogEntry,
  shouldAdvanceSyncCheckpoint,
} from '../src/commands/exportUpdatesSupport';
import { type ExportResult } from '../src/types';

function baseResult(overrides?: Partial<ExportResult>): ExportResult {
  return {
    exported: 1,
    skipped: 0,
    failed: 0,
    cancelled: false,
    warnings: [],
    itemOutcomes: [],
    ...overrides,
  };
}

describe('export updates checkpoint policy', () => {
  it('advances checkpoint for clean runs', () => {
    const decision = shouldAdvanceSyncCheckpoint(baseResult());
    expect(decision.shouldAdvance).toBe(true);
  });

  it('does not advance when items were skipped', () => {
    const decision = shouldAdvanceSyncCheckpoint(baseResult({ skipped: 2 }));
    expect(decision.shouldAdvance).toBe(false);
  });

  it('does not advance when items failed', () => {
    const decision = shouldAdvanceSyncCheckpoint(baseResult({ failed: 1 }));
    expect(decision.shouldAdvance).toBe(false);
  });

  it('does not advance when run was cancelled', () => {
    const decision = shouldAdvanceSyncCheckpoint(baseResult({ cancelled: true }));
    expect(decision.shouldAdvance).toBe(false);
  });
});

describe('export updates log builder', () => {
  it('renders grouped item outcomes with checkpoint metadata', () => {
    const log = buildUpdatesLogEntry({
      runStartedAtIso: '2026-02-12T10:00:00.000Z',
      mode: 'incremental',
      previousCheckpointIso: '2026-02-11T10:00:00.000Z',
      queryUpperBoundIso: '2026-02-12T10:00:00.000Z',
      result: baseResult({
        exported: 2,
        skipped: 1,
        failed: 1,
        itemOutcomes: [
          { itemId: 1, key: 'A', title: 'Alpha', action: 'exported-new', targetPath: '/tmp/a.md' },
          { itemId: 2, key: 'B', title: 'Beta', action: 'exported-overwrite', targetPath: '/tmp/b.md' },
          { itemId: 3, key: 'C', title: 'Gamma', action: 'skipped-conflict', targetPath: '/tmp/c.md' },
          { itemId: 4, key: 'D', title: 'Delta', action: 'failed', error: 'boom' },
        ],
      }),
      checkpointAdvanced: false,
      checkpointReason: 'Run skipped 1 changed item(s).',
      nextCheckpointIso: '2026-02-11T10:00:00.000Z',
    });

    expect(log).toContain('Mode: `incremental`');
    expect(log).toContain('Checkpoint advanced: `no`');
    expect(log).toContain('### Exported New');
    expect(log).toContain('### Re-exported (Overwritten)');
    expect(log).toContain('### Skipped (Conflict)');
    expect(log).toContain('### Failed');
    expect(log).toContain('`A` Alpha -> `/tmp/a.md`');
    expect(log).toContain('`D` Delta - boom');
  });
});
