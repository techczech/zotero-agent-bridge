import { type Database } from 'sql.js';
import {
  type ZoteroAnnotation,
  type ZoteroAttachment,
  type ZoteroCollection,
  type ZoteroCreator,
  type ZoteroItem,
  type ZoteroItemSummary,
  type ZoteroLibrary,
  type ZoteroNote,
} from '../types';
import { runOne, runQuery, sqlPlaceholders } from './db';

interface BaseItemRow {
  itemID: number;
  key: string;
  libraryID: number;
  libraryName: string | null;
  itemType: string;
  title: string | null;
  creatorsText: string | null;
  date: string | null;
  dateAdded: string | null;
  dateModified: string | null;
  doi: string | null;
  tagsText: string | null;
  pdfCount: number | null;
  noteCount: number | null;
}

function extractYear(dateValue?: string): string | undefined {
  if (!dateValue) {
    return undefined;
  }

  const match = dateValue.match(/(\d{4})/);
  return match?.[1];
}

function creatorDisplayName(creator: Pick<ZoteroCreator, 'name' | 'firstName' | 'lastName'>): string {
  if (creator.name && creator.name.trim().length > 0) {
    return creator.name.trim();
  }

  const parts = [creator.lastName?.trim(), creator.firstName?.trim()].filter(Boolean);
  return parts.join(', ');
}

function parseDelimited(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mapSummary(row: BaseItemRow): ZoteroItemSummary {
  const pdfCount = Number(row.pdfCount ?? 0);
  const noteCount = Number(row.noteCount ?? 0);
  return {
    itemId: Number(row.itemID),
    key: String(row.key),
    libraryId: Number(row.libraryID),
    libraryName: row.libraryName ?? `Library ${row.libraryID}`,
    itemType: String(row.itemType),
    title: row.title?.trim() || 'Untitled',
    creatorsText: row.creatorsText?.trim() || '',
    date: row.date ?? undefined,
    year: extractYear(row.date ?? undefined),
    dateAdded: row.dateAdded ?? undefined,
    dateModified: row.dateModified ?? undefined,
    doi: row.doi ?? undefined,
    tagsText: row.tagsText ?? undefined,
    pdfCount,
    hasPdf: pdfCount > 0,
    noteCount,
  };
}

function baseItemSummariesSql(idSourceSql: string): string {
  return `
WITH filtered_items AS (
  ${idSourceSql}
),
base AS (
  SELECT i.itemID, i.key, i.libraryID, i.itemTypeID, i.dateAdded, i.dateModified
  FROM items i
  JOIN filtered_items fi ON fi.itemID = i.itemID
),
item_type AS (
  SELECT it.itemTypeID, it.typeName
  FROM itemTypes it
),
field_values AS (
  SELECT id.itemID,
    MAX(CASE WHEN f.fieldName='title' THEN v.value END) AS title,
    MAX(CASE WHEN f.fieldName='date' THEN v.value END) AS date,
    MAX(CASE WHEN f.fieldName='DOI' THEN v.value END) AS doi
  FROM itemData id
  JOIN fields f ON f.fieldID = id.fieldID
  JOIN itemDataValues v ON v.valueID = id.valueID
  GROUP BY id.itemID
),
creator_values AS (
  SELECT ic.itemID,
    GROUP_CONCAT(
      TRIM(COALESCE(c.lastName, '') ||
      CASE WHEN c.firstName IS NOT NULL AND c.firstName != '' THEN ', ' || c.firstName ELSE '' END),
      '; '
    ) AS creatorsText
  FROM itemCreators ic
  JOIN creators c ON c.creatorID = ic.creatorID
  GROUP BY ic.itemID
),
tag_values AS (
  SELECT it.itemID, GROUP_CONCAT(t.name, '; ') AS tagsText
  FROM itemTags it
  JOIN tags t ON t.tagID = it.tagID
  GROUP BY it.itemID
),
attachment_values AS (
  SELECT
    ia.parentItemID AS itemID,
    SUM(
      CASE
        WHEN LOWER(COALESCE(ia.contentType, '')) LIKE '%pdf%'
          OR LOWER(COALESCE(ia.path, '')) LIKE '%.pdf'
        THEN 1
        ELSE 0
      END
    ) AS pdfCount
  FROM itemAttachments ia
  WHERE ia.parentItemID IS NOT NULL
  GROUP BY ia.parentItemID
),
note_targets AS (
  SELECT i.itemID AS rootItemID, i.itemID AS targetItemID
  FROM items i
  UNION ALL
  SELECT ia.parentItemID AS rootItemID, ia.itemID AS targetItemID
  FROM itemAttachments ia
  WHERE ia.parentItemID IS NOT NULL
),
note_values AS (
  SELECT nt.rootItemID AS itemID, COUNT(DISTINCT n.itemID) AS noteCount
  FROM note_targets nt
  JOIN itemNotes n ON n.parentItemID = nt.targetItemID
  GROUP BY nt.rootItemID
),
library_names AS (
  SELECT l.libraryID,
    COALESCE(g.name,
      CASE WHEN l.type = 'user' THEN 'My Library' ELSE 'Library ' || l.libraryID END
    ) AS libraryName
  FROM libraries l
  LEFT JOIN groups g ON g.libraryID = l.libraryID
)
SELECT
  b.itemID,
  b.key,
  b.libraryID,
  ln.libraryName,
  it.typeName AS itemType,
  fv.title,
  fv.date,
  b.dateAdded,
  b.dateModified,
  fv.doi,
  cv.creatorsText,
  tv.tagsText,
  COALESCE(av.pdfCount, 0) AS pdfCount,
  COALESCE(nv.noteCount, 0) AS noteCount
FROM base b
JOIN item_type it ON it.itemTypeID = b.itemTypeID
LEFT JOIN field_values fv ON fv.itemID = b.itemID
LEFT JOIN creator_values cv ON cv.itemID = b.itemID
LEFT JOIN tag_values tv ON tv.itemID = b.itemID
LEFT JOIN attachment_values av ON av.itemID = b.itemID
LEFT JOIN note_values nv ON nv.itemID = b.itemID
LEFT JOIN library_names ln ON ln.libraryID = b.libraryID
WHERE it.typeName NOT IN ('attachment', 'note', 'annotation')
`;
}

export function searchItems(db: Database, searchText: string, limit: number): ZoteroItemSummary[] {
  const normalized = searchText.trim();
  const like = `%${normalized.toLowerCase()}%`;

  const sql = `
${baseItemSummariesSql('SELECT itemID FROM items')}
AND (
  ? = ''
  OR LOWER(COALESCE(fv.title, '')) LIKE ?
  OR LOWER(COALESCE(cv.creatorsText, '')) LIKE ?
  OR LOWER(COALESCE(fv.date, '')) LIKE ?
  OR LOWER(COALESCE(fv.doi, '')) LIKE ?
  OR LOWER(COALESCE(tv.tagsText, '')) LIKE ?
)
ORDER BY b.dateModified DESC
LIMIT ?
`;

  const rows = runQuery<BaseItemRow>(db, sql, [normalized, like, like, like, like, like, limit]);
  return rows.map(mapSummary);
}

export function getLibraries(db: Database): ZoteroLibrary[] {
  const sql = `
SELECT l.libraryID,
  l.type AS libraryType,
  COALESCE(g.name,
    CASE WHEN l.type = 'user' THEN 'My Library' ELSE 'Library ' || l.libraryID END
  ) AS libraryName
FROM libraries l
LEFT JOIN groups g ON g.libraryID = l.libraryID
ORDER BY CASE WHEN l.type = 'user' THEN 0 ELSE 1 END, libraryName
`;

  const rows = runQuery<{
    libraryID: number;
    libraryType: string;
    libraryName: string;
  }>(db, sql);

  return rows.map((row) => ({
    libraryId: Number(row.libraryID),
    libraryType: String(row.libraryType),
    libraryName: String(row.libraryName),
  }));
}

export function getCollectionsForLibrary(db: Database, libraryId: number): ZoteroCollection[] {
  const sql = `
SELECT collectionID, key, libraryID, collectionName, parentCollectionID
FROM collections
WHERE libraryID = ?
ORDER BY collectionName
`;

  const rows = runQuery<{
    collectionID: number;
    key: string;
    libraryID: number;
    collectionName: string;
    parentCollectionID: number | null;
  }>(db, sql, [libraryId]);

  return rows.map((row) => ({
    collectionId: Number(row.collectionID),
    key: String(row.key),
    libraryId: Number(row.libraryID),
    collectionName: String(row.collectionName),
    parentCollectionId: row.parentCollectionID === null ? null : Number(row.parentCollectionID),
  }));
}

export function getCollectionItemSummaries(
  db: Database,
  collectionId: number,
  limit = 10_000,
): ZoteroItemSummary[] {
  const itemRows = runQuery<{ itemID: number }>(
    db,
    `
WITH RECURSIVE descendants(collectionID) AS (
  SELECT ?
  UNION ALL
  SELECT c.collectionID
  FROM collections c
  JOIN descendants d ON c.parentCollectionID = d.collectionID
)
SELECT DISTINCT ci.itemID
FROM collectionItems ci
JOIN descendants d ON d.collectionID = ci.collectionID
`,
    [collectionId],
  );

  const itemIds = itemRows.map((row) => Number(row.itemID));
  return getItemSummariesByIds(db, itemIds, limit);
}

export function getDirectCollectionItemSummaries(
  db: Database,
  collectionId: number,
  limit = 10_000,
): ZoteroItemSummary[] {
  const itemRows = runQuery<{ itemID: number }>(
    db,
    `
SELECT DISTINCT itemID
FROM collectionItems
WHERE collectionID = ?
`,
    [collectionId],
  );
  const itemIds = itemRows.map((row) => Number(row.itemID));
  return getItemSummariesByIds(db, itemIds, limit);
}

function getItemSummariesByIds(db: Database, itemIds: number[], limit: number): ZoteroItemSummary[] {
  if (itemIds.length === 0) {
    return [];
  }

  const placeholders = sqlPlaceholders(itemIds.length);
  const sql = `
${baseItemSummariesSql(`SELECT itemID FROM items WHERE itemID IN (${placeholders})`)}
ORDER BY b.dateModified DESC
LIMIT ?
`;
  const rows = runQuery<BaseItemRow>(db, sql, [...itemIds, limit]);
  return rows.map(mapSummary);
}

function getFieldMap(db: Database, itemId: number): Record<string, string> {
  const rows = runQuery<{ fieldName: string; value: string }>(
    db,
    `
SELECT f.fieldName, v.value
FROM itemData id
JOIN fields f ON f.fieldID = id.fieldID
JOIN itemDataValues v ON v.valueID = id.valueID
WHERE id.itemID = ?
`,
    [itemId],
  );

  const map: Record<string, string> = {};
  for (const row of rows) {
    const fieldName = String(row.fieldName);
    const value = String(row.value);
    if (map[fieldName]) {
      map[fieldName] = `${map[fieldName]}; ${value}`;
    } else {
      map[fieldName] = value;
    }
  }
  return map;
}

function deriveAttachmentFilename(attachmentPath: string | undefined, key: string): string {
  if (!attachmentPath) {
    return `${key}.pdf`;
  }

  const withoutPrefix = attachmentPath.startsWith('storage:')
    ? attachmentPath.slice('storage:'.length)
    : attachmentPath;

  const trimmed = withoutPrefix.replace(/^[/\\]+/, '');
  const base = trimmed.split(/[/\\]/).pop() ?? key;
  return base || `${key}.pdf`;
}

function getCreatorsForItem(db: Database, itemId: number): ZoteroCreator[] {
  const rows = runQuery<{
    orderIndex: number;
    creatorType: string | null;
    firstName: string | null;
    lastName: string | null;
    fieldMode: number | null;
  }>(
    db,
    `
SELECT
  ic.orderIndex,
  ct.creatorType,
  c.firstName,
  c.lastName,
  c.fieldMode
FROM itemCreators ic
JOIN creators c ON c.creatorID = ic.creatorID
LEFT JOIN creatorTypes ct ON ct.creatorTypeID = ic.creatorTypeID
WHERE ic.itemID = ?
ORDER BY ic.orderIndex ASC
`,
    [itemId],
  );

  return rows.map((row) => {
    const fieldMode = row.fieldMode === null ? 0 : Number(row.fieldMode);
    const singleFieldName = fieldMode === 1 ? row.lastName ?? undefined : undefined;
    const creator: ZoteroCreator = {
      firstName: row.firstName ?? undefined,
      lastName: row.lastName ?? undefined,
      name: singleFieldName,
      creatorType: row.creatorType ?? undefined,
      orderIndex: Number(row.orderIndex),
      displayName: '',
    };

    creator.displayName = creatorDisplayName(creator) || 'Unknown Creator';
    return creator;
  });
}

function getTagsForItem(db: Database, itemId: number): string[] {
  const rows = runQuery<{ name: string }>(
    db,
    `
SELECT t.name
FROM itemTags it
JOIN tags t ON t.tagID = it.tagID
WHERE it.itemID = ?
ORDER BY t.name
`,
    [itemId],
  );

  return rows.map((row) => String(row.name));
}

function getCollectionNamesForItem(db: Database, itemId: number): string[] {
  const rows = runQuery<{ collectionName: string }>(
    db,
    `
SELECT c.collectionName
FROM collectionItems ci
JOIN collections c ON c.collectionID = ci.collectionID
WHERE ci.itemID = ?
ORDER BY c.collectionName
`,
    [itemId],
  );

  return rows.map((row) => String(row.collectionName));
}

function getAttachmentsForItem(db: Database, itemId: number): ZoteroAttachment[] {
  const rows = runQuery<{
    itemID: number;
    key: string;
    title: string | null;
    contentType: string | null;
    linkMode: number | null;
    path: string | null;
  }>(
    db,
    `
SELECT
  ia.itemID,
  ai.key,
  tf.value AS title,
  ia.contentType,
  ia.linkMode,
  ia.path
FROM itemAttachments ia
JOIN items ai ON ai.itemID = ia.itemID
LEFT JOIN (
  SELECT id.itemID, v.value
  FROM itemData id
  JOIN fields f ON f.fieldID = id.fieldID
  JOIN itemDataValues v ON v.valueID = id.valueID
  WHERE f.fieldName = 'title'
) tf ON tf.itemID = ia.itemID
WHERE ia.parentItemID = ?
ORDER BY ia.itemID
`,
    [itemId],
  );

  return rows.map((row) => {
    const contentType = row.contentType ?? undefined;
    const attachmentPath = row.path ?? undefined;
    const filename = deriveAttachmentFilename(attachmentPath, String(row.key));
    const isPdf =
      (contentType?.toLowerCase().includes('pdf') ?? false) || filename.toLowerCase().endsWith('.pdf');

    return {
      itemId: Number(row.itemID),
      key: String(row.key),
      title: row.title ?? undefined,
      contentType,
      linkMode: row.linkMode === null ? undefined : Number(row.linkMode),
      path: attachmentPath,
      filename,
      isPdf,
    };
  });
}

function getNotesForItemAndAttachments(
  db: Database,
  itemId: number,
  attachmentIds: number[],
): ZoteroNote[] {
  const notes: ZoteroNote[] = [];

  const parentRows = runQuery<{
    itemID: number;
    parentItemID: number;
    title: string | null;
    note: string | null;
  }>(
    db,
    `
SELECT itemID, parentItemID, title, note
FROM itemNotes
WHERE parentItemID = ?
ORDER BY itemID
`,
    [itemId],
  );

  for (const row of parentRows) {
    notes.push({
      itemId: Number(row.itemID),
      parentItemId: Number(row.parentItemID),
      title: row.title ?? undefined,
      noteHtml: row.note ?? '',
    });
  }

  if (attachmentIds.length > 0) {
    const placeholders = sqlPlaceholders(attachmentIds.length);
    const attachmentRows = runQuery<{
      itemID: number;
      parentItemID: number;
      title: string | null;
      note: string | null;
    }>(
      db,
      `
SELECT itemID, parentItemID, title, note
FROM itemNotes
WHERE parentItemID IN (${placeholders})
ORDER BY itemID
`,
      attachmentIds,
    );

    for (const row of attachmentRows) {
      notes.push({
        itemId: Number(row.itemID),
        parentItemId: Number(row.parentItemID),
        title: row.title ?? undefined,
        noteHtml: row.note ?? '',
      });
    }
  }

  return notes;
}

function getAnnotationsForAttachments(db: Database, attachmentIds: number[]): ZoteroAnnotation[] {
  if (attachmentIds.length === 0) {
    return [];
  }

  const placeholders = sqlPlaceholders(attachmentIds.length);
  const rows = runQuery<{
    itemID: number;
    parentItemID: number;
    type: string | null;
    text: string | null;
    comment: string | null;
    color: string | null;
    pageLabel: string | null;
    sortIndex: string | null;
    position: string | null;
  }>(
    db,
    `
SELECT itemID, parentItemID, type, text, comment, color, pageLabel, sortIndex, position
FROM itemAnnotations
WHERE parentItemID IN (${placeholders})
ORDER BY parentItemID ASC, sortIndex ASC, itemID ASC
`,
    attachmentIds,
  );

  return rows.map((row) => ({
    itemId: Number(row.itemID),
    parentItemId: Number(row.parentItemID),
    type: row.type ?? undefined,
    text: row.text ?? undefined,
    comment: row.comment ?? undefined,
    color: row.color ?? undefined,
    pageLabel: row.pageLabel ?? undefined,
    sortIndex: row.sortIndex ?? undefined,
    position: row.position ?? undefined,
  }));
}

export function getItemExportData(db: Database, itemId: number): ZoteroItem {
  const base = runOne<{
    itemID: number;
    key: string;
    libraryID: number;
    libraryName: string | null;
    itemType: string;
    dateAdded: string | null;
    dateModified: string | null;
  }>(
    db,
    `
SELECT
  i.itemID,
  i.key,
  i.libraryID,
  COALESCE(g.name,
    CASE WHEN l.type = 'user' THEN 'My Library' ELSE 'Library ' || i.libraryID END
  ) AS libraryName,
  it.typeName AS itemType,
  i.dateAdded,
  i.dateModified
FROM items i
JOIN itemTypes it ON it.itemTypeID = i.itemTypeID
LEFT JOIN libraries l ON l.libraryID = i.libraryID
LEFT JOIN groups g ON g.libraryID = i.libraryID
WHERE i.itemID = ?
`,
    [itemId],
  );

  if (!base) {
    throw new Error(`Could not load Zotero item ${itemId}.`);
  }

  const fields = getFieldMap(db, itemId);
  const creators = getCreatorsForItem(db, itemId);
  const tags = getTagsForItem(db, itemId);
  const collections = getCollectionNamesForItem(db, itemId);
  const attachments = getAttachmentsForItem(db, itemId);
  const attachmentIds = attachments.map((attachment) => attachment.itemId);
  const notes = getNotesForItemAndAttachments(db, itemId, attachmentIds);
  const annotations = getAnnotationsForAttachments(db, attachmentIds);

  const date = fields.date;

  return {
    itemId: Number(base.itemID),
    key: String(base.key),
    libraryId: Number(base.libraryID),
    libraryName: base.libraryName ?? `Library ${base.libraryID}`,
    itemType: String(base.itemType),
    title: fields.title ?? 'Untitled',
    creators,
    year: extractYear(date),
    date,
    publicationTitle: fields.publicationTitle,
    volume: fields.volume,
    issue: fields.issue,
    pages: fields.pages,
    publisher: fields.publisher,
    place: fields.place,
    language: fields.language,
    doi: fields.DOI,
    url: fields.url,
    tags,
    collections,
    abstract: fields.abstractNote,
    dateAdded: base.dateAdded ?? undefined,
    dateModified: base.dateModified ?? undefined,
    extra: fields.extra,
    attachments,
    notes,
    annotations,
  };
}

export function getItemSummariesByIdsUnbounded(db: Database, itemIds: number[]): ZoteroItemSummary[] {
  if (itemIds.length === 0) {
    return [];
  }

  const placeholders = sqlPlaceholders(itemIds.length);
  const sql = `
${baseItemSummariesSql(`SELECT itemID FROM items WHERE itemID IN (${placeholders})`)}
ORDER BY b.dateModified DESC
`;
  const rows = runQuery<BaseItemRow>(db, sql, itemIds);
  return rows.map(mapSummary);
}

export function parseTagsText(tagsText?: string): string[] {
  return parseDelimited(tagsText);
}
