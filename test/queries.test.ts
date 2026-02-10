import initSqlJs, { type Database } from 'sql.js';
import { describe, expect, it } from 'vitest';
import {
  getCollectionItemSummaries,
  getItemExportData,
  getLibraries,
  searchItems,
} from '../src/zotero/queries';

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

  db.run(`INSERT INTO libraries (libraryID, type) VALUES (1, 'user'), (2, 'group');`);
  db.run(`INSERT INTO groups (groupID, libraryID, name) VALUES (1, 2, 'Group Library');`);

  db.run(
    `INSERT INTO itemTypes (itemTypeID, typeName) VALUES (1, 'journalArticle'), (2, 'attachment'), (3, 'note'), (4, 'annotation');`,
  );

  db.run(`
INSERT INTO items (itemID, itemTypeID, libraryID, key, parentItemID, dateAdded, dateModified)
VALUES
  (1, 1, 1, 'ITEM1KEY', NULL, '2024-01-01', '2024-01-02'),
  (2, 1, 2, 'ITEM2KEY', NULL, '2024-01-01', '2024-01-03'),
  (11, 2, 1, 'ATTACH1', 1, '2024-01-01', '2024-01-02');
`);

  db.run(`
INSERT INTO fields (fieldID, fieldName)
VALUES
  (1, 'title'),
  (2, 'date'),
  (3, 'DOI'),
  (4, 'abstractNote'),
  (5, 'publicationTitle');
`);

  db.run(`
INSERT INTO itemDataValues (valueID, value)
VALUES
  (1, 'Distributed Cognition'),
  (2, '1995'),
  (3, '10.1234/demo'),
  (4, 'Demo abstract'),
  (5, 'Cognitive Science'),
  (6, 'Group Library Paper');
`);

  db.run(`
INSERT INTO itemData (itemID, fieldID, valueID)
VALUES
  (1, 1, 1),
  (1, 2, 2),
  (1, 3, 3),
  (1, 4, 4),
  (1, 5, 5),
  (2, 1, 6);
`);

  db.run(`INSERT INTO creators (creatorID, firstName, lastName, fieldMode) VALUES (1, 'Edwin', 'Hutchins', 0);`);
  db.run(`INSERT INTO creatorTypes (creatorTypeID, creatorType) VALUES (1, 'author');`);
  db.run(`INSERT INTO itemCreators (itemID, creatorID, creatorTypeID, orderIndex) VALUES (1, 1, 1, 0);`);

  db.run(`INSERT INTO tags (tagID, name) VALUES (1, 'cognition');`);
  db.run(`INSERT INTO itemTags (itemID, tagID) VALUES (1, 1);`);

  db.run(`
INSERT INTO collections (collectionID, key, libraryID, collectionName, parentCollectionID)
VALUES
  (100, 'COLL1', 1, 'Top', NULL),
  (101, 'COLL2', 1, 'Child', 100);
`);

  db.run(`INSERT INTO collectionItems (collectionID, itemID) VALUES (101, 1);`);

  db.run(`
INSERT INTO itemAttachments (itemID, parentItemID, contentType, linkMode, path)
VALUES (11, 1, 'application/pdf', 1, 'storage:paper.pdf');
`);

  db.run(`
INSERT INTO itemNotes (itemID, parentItemID, title, note)
VALUES
  (21, 1, 'Item Note', '<p>Item note content</p>'),
  (22, 11, 'Attachment Note', '<p>Attachment note content</p>');
`);

  db.run(`
INSERT INTO itemAnnotations (itemID, parentItemID, type, text, comment, color, pageLabel, sortIndex, position)
VALUES (31, 11, 'highlight', 'Important quote', 'Good point', '#ff0', '4', '0001', '{}');
`);

  return db;
}

describe('zotero queries', () => {
  it('searches across title, creator, doi and tags', async () => {
    const db = await createDb();
    try {
      const byTitle = searchItems(db, 'distributed', 50);
      const first = byTitle.find((item) => item.key === 'ITEM1KEY');
      expect(byTitle.map((item) => item.key)).toContain('ITEM1KEY');
      expect(first?.hasPdf).toBe(true);
      expect(first?.pdfCount).toBe(1);
      expect(first?.noteCount).toBe(2);
      expect(searchItems(db, 'hutchins', 50).map((item) => item.key)).toContain('ITEM1KEY');
      expect(searchItems(db, '10.1234/demo', 50).map((item) => item.key)).toContain('ITEM1KEY');
      expect(searchItems(db, 'cognition', 50).map((item) => item.key)).toContain('ITEM1KEY');
    } finally {
      db.close();
    }
  });

  it('resolves recursive collection items', async () => {
    const db = await createDb();
    try {
      const items = getCollectionItemSummaries(db, 100);
      expect(items.map((item) => item.key)).toContain('ITEM1KEY');
    } finally {
      db.close();
    }
  });

  it('includes group libraries in library list', async () => {
    const db = await createDb();
    try {
      const libraries = getLibraries(db);
      expect(libraries.find((lib) => lib.libraryId === 1)?.libraryName).toBe('My Library');
      expect(libraries.find((lib) => lib.libraryId === 2)?.libraryName).toBe('Group Library');
    } finally {
      db.close();
    }
  });

  it('loads item export data with attachments, notes and annotations', async () => {
    const db = await createDb();
    try {
      const item = getItemExportData(db, 1);
      expect(item.key).toBe('ITEM1KEY');
      expect(item.attachments.length).toBe(1);
      expect(item.attachments[0].isPdf).toBe(true);
      expect(item.notes.length).toBe(2);
      expect(item.annotations.length).toBe(1);
    } finally {
      db.close();
    }
  });
});
