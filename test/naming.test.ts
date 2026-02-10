import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildItemSlug, makeUniqueFilePath, sanitizeFilename, sanitizeSegment } from '../src/export/naming';

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }
});

describe('naming helpers', () => {
  it('sanitizes slug segment', () => {
    expect(sanitizeSegment('  A Study: Language & Thought!  ')).toBe('A-Study-Language-Thought');
  });

  it('builds item slug from key and title', () => {
    const slug = buildItemSlug({ key: 'ABCD1234', title: 'My: Title Here' } as const);
    expect(slug.startsWith('ABCD1234-')).toBe(true);
    expect(slug).toContain('My-Title-Here');
  });

  it('sanitizes filenames', () => {
    expect(sanitizeFilename('paper (final).pdf')).toBe('paper-final.pdf');
  });

  it('creates unique file path when target already exists', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscodezotero-test-'));
    cleanupPaths.push(tmpDir);

    const target = path.join(tmpDir, 'doc.pdf');
    await fs.writeFile(target, 'x');

    const unique = await makeUniqueFilePath(target);
    expect(unique).toBe(path.join(tmpDir, 'doc-2.pdf'));
  });
});
