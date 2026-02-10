import path from 'node:path';
import { promises as fs } from 'node:fs';
import { type LayoutMode, type ZoteroItem } from '../types';

const MAX_SLUG_LENGTH = 80;

export function sanitizeSegment(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
}

export function buildItemSlug(item: Pick<ZoteroItem, 'key' | 'title'>): string {
  const titlePart = sanitizeSegment(item.title) || 'untitled';
  return `${item.key}-${titlePart}`.slice(0, MAX_SLUG_LENGTH + item.key.length + 1);
}

export function sanitizeFilename(filename: string): string {
  const parsed = path.parse(filename);
  const name = sanitizeSegment(parsed.name) || 'attachment';
  const ext = parsed.ext.replace(/[^a-zA-Z0-9.]/g, '');
  return `${name}${ext}`;
}

export interface ItemOutputPaths {
  itemFolder?: string;
  markdownPath: string;
  flatPrefix?: string;
}

export function resolveItemOutputPaths(
  outputRoot: string,
  layoutMode: LayoutMode,
  slug: string,
  year?: string,
): ItemOutputPaths {
  if (layoutMode === 'flat') {
    return {
      markdownPath: path.join(outputRoot, `${slug}.md`),
      flatPrefix: `${slug}__`,
    };
  }

  if (layoutMode === 'year-item') {
    const yearFolder = sanitizeSegment(year || 'unknown-year') || 'unknown-year';
    const itemFolder = path.join(outputRoot, yearFolder, slug);
    return {
      itemFolder,
      markdownPath: path.join(itemFolder, 'item.md'),
    };
  }

  const itemFolder = path.join(outputRoot, slug);
  return {
    itemFolder,
    markdownPath: path.join(itemFolder, 'item.md'),
  };
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function makeUniqueFilePath(targetPath: string): Promise<string> {
  if (!(await pathExists(targetPath))) {
    return targetPath;
  }

  const parsed = path.parse(targetPath);
  let suffix = 2;

  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
    suffix += 1;
  }
}
