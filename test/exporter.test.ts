import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { afterEach, describe, expect, it } from 'vitest';
import { exportItems } from '../src/export/exporter';
import { buildItemSlug, resolveItemOutputPaths } from '../src/export/naming';
import { type LayoutMode, type LogChannel, type ZoteroItemSummary } from '../src/types';

async function createDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
CREATE TABLE libraries (libraryID INTEGER PRIMARY KEY, type TEXT);
CREATE TABLE groups (groupID INTEGER PRIMARY KEY, libraryID INTEGER, name TEXT);
CREATE TABLE itemTypes (itemTypeID INTEGER PRIMARY KEY, typeName TEXT);
CREATE TABLE items (
  itemID INTEGER PRIMARY KEY,
  itemTypeID INTEGER,
  libraryID INTEGER,
  key TEXT,
  parentItemID INTEGER,
  dateAdded TEXT,
  dateModified TEXT
);
CREATE TABLE fields (fieldID INTEGER PRIMARY KEY, fieldName TEXT);
CREATE TABLE itemDataValues (valueID INTEGER PRIMARY KEY, value TEXT);
CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
CREATE TABLE creators (creatorID INTEGER PRIMARY KEY, firstName TEXT, lastName TEXT, fieldMode INT);
CREATE TABLE creatorTypes (creatorTypeID INTEGER PRIMARY KEY, creatorType TEXT);
CREATE TABLE itemCreators (itemID INTEGER, creatorID INTEGER, creatorTypeID INTEGER, orderIndex INTEGER);
CREATE TABLE tags (tagID INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE itemTags (itemID INTEGER, tagID INTEGER);
CREATE TABLE collections (
  collectionID INTEGER PRIMARY KEY,
  key TEXT,
  libraryID INTEGER,
  collectionName TEXT,
  parentCollectionID INTEGER
);
CREATE TABLE collectionItems (collectionID INTEGER, itemID INTEGER);
CREATE TABLE itemAttachments (
  itemID INTEGER PRIMARY KEY,
  parentItemID INTEGER,
  contentType TEXT,
  linkMode INTEGER,
  path TEXT
);
CREATE TABLE itemNotes (
  itemID INTEGER PRIMARY KEY,
  parentItemID INTEGER,
  title TEXT,
  note TEXT
);
CREATE TABLE itemAnnotations (
  itemID INTEGER PRIMARY KEY,
  parentItemID INTEGER,
  type TEXT,
  text TEXT,
  comment TEXT,
  color TEXT,
  pageLabel TEXT,
  sortIndex TEXT,
  position TEXT
);
`);

  db.run(`INSERT INTO libraries (libraryID, type) VALUES (1, 'user');`);
  db.run(`INSERT INTO itemTypes (itemTypeID, typeName) VALUES (1, 'journalArticle');`);
  db.run(`
INSERT INTO items (itemID, itemTypeID, libraryID, key, parentItemID, dateAdded, dateModified)
VALUES (1, 1, 1, 'ITEM1KEY', NULL, '2024-01-01 00:00:00', '2024-01-02 00:00:00');
`);
  db.run(`INSERT INTO fields (fieldID, fieldName) VALUES (1, 'title');`);
  db.run(`INSERT INTO itemDataValues (valueID, value) VALUES (1, 'Test Paper');`);
  db.run(`INSERT INTO itemData (itemID, fieldID, valueID) VALUES (1, 1, 1);`);

  return db;
}

const baseSummary: ZoteroItemSummary = {
  itemId: 1,
  key: 'ITEM1KEY',
  libraryId: 1,
  libraryName: 'My Library',
  itemType: 'journalArticle',
  title: 'Test Paper',
  creatorsText: '',
  date: undefined,
  year: undefined,
  dateAdded: '2024-01-01 00:00:00',
  dateModified: '2024-01-02 00:00:00',
  doi: undefined,
  tagsText: undefined,
  pdfCount: 0,
  hasPdf: false,
  noteCount: 0,
};

const outputChannel: LogChannel = {
  appendLine: () => {
    // no-op for tests
  },
};

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscodezotero-exporter-test-'));
  tempDirs.push(dir);
  return dir;
}

async function createExistingMarkdown(
  outputRootPath: string,
  layoutMode: LayoutMode,
  summary: Pick<ZoteroItemSummary, 'key' | 'title' | 'year'>,
): Promise<void> {
  const slug = buildItemSlug({
    key: summary.key,
    title: summary.title,
  });
  const outputPaths = resolveItemOutputPaths(outputRootPath, layoutMode, slug, summary.year);
  await fs.mkdir(path.dirname(outputPaths.markdownPath), { recursive: true });
  await fs.writeFile(outputPaths.markdownPath, 'existing', 'utf8');
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('exportItems outcomes', () => {
  it('records exported-new outcome', async () => {
    const db = await createDb();
    const outputRootPath = await createTempDir();
    try {
      const result = await exportItems(db, [baseSummary], {
        outputRootPath,
        layoutMode: 'item-folder',
        storagePath: outputRootPath,
        exportHighlightsAsMarkdownFiles: false,
        outputChannel,
        resolveConflict: async () => 'overwrite',
        selectPdfAttachments: async () => [],
      });

      expect(result.exported).toBe(1);
      expect(result.itemOutcomes[0]?.action).toBe('exported-new');
    } finally {
      db.close();
    }
  });

  it('records exported-overwrite outcome when existing files are replaced', async () => {
    const db = await createDb();
    const outputRootPath = await createTempDir();
    try {
      await createExistingMarkdown(outputRootPath, 'item-folder', baseSummary);
      const result = await exportItems(db, [baseSummary], {
        outputRootPath,
        layoutMode: 'item-folder',
        storagePath: outputRootPath,
        exportHighlightsAsMarkdownFiles: false,
        outputChannel,
        resolveConflict: async () => 'overwrite',
        selectPdfAttachments: async () => [],
      });

      expect(result.exported).toBe(1);
      expect(result.itemOutcomes[0]?.action).toBe('exported-overwrite');
    } finally {
      db.close();
    }
  });

  it('records skipped-conflict outcome when overwrite is declined', async () => {
    const db = await createDb();
    const outputRootPath = await createTempDir();
    try {
      await createExistingMarkdown(outputRootPath, 'item-folder', baseSummary);
      const result = await exportItems(db, [baseSummary], {
        outputRootPath,
        layoutMode: 'item-folder',
        storagePath: outputRootPath,
        exportHighlightsAsMarkdownFiles: false,
        outputChannel,
        resolveConflict: async () => 'skip',
        selectPdfAttachments: async () => [],
      });

      expect(result.skipped).toBe(1);
      expect(result.itemOutcomes[0]?.action).toBe('skipped-conflict');
    } finally {
      db.close();
    }
  });

  it('records failed outcome when item data cannot be loaded', async () => {
    const db = await createDb();
    const outputRootPath = await createTempDir();
    try {
      const invalidSummary: ZoteroItemSummary = {
        ...baseSummary,
        itemId: 999,
        key: 'MISSING',
        title: 'Missing Item',
      };

      const result = await exportItems(db, [invalidSummary], {
        outputRootPath,
        layoutMode: 'item-folder',
        storagePath: outputRootPath,
        exportHighlightsAsMarkdownFiles: false,
        outputChannel,
        resolveConflict: async () => 'overwrite',
        selectPdfAttachments: async () => [],
      });

      expect(result.failed).toBe(1);
      expect(result.itemOutcomes[0]?.action).toBe('failed');
      expect(result.itemOutcomes[0]?.error).toMatch(/Could not load Zotero item/);
    } finally {
      db.close();
    }
  });
});

