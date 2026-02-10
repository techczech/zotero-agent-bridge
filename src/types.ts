export type LayoutMode = 'item-folder' | 'flat' | 'year-item';

export type ConflictDecision = 'overwrite' | 'skip' | 'cancel';

export interface LogChannel {
  appendLine(message: string): void;
}

export interface ZoteroCreator {
  firstName?: string;
  lastName?: string;
  name?: string;
  creatorType?: string;
  orderIndex: number;
  displayName: string;
}

export interface ZoteroAttachment {
  itemId: number;
  key: string;
  title?: string;
  contentType?: string;
  linkMode?: number;
  path?: string;
  filename?: string;
  isPdf: boolean;
}

export interface ZoteroAnnotation {
  itemId: number;
  parentItemId: number;
  type?: string;
  text?: string;
  comment?: string;
  color?: string;
  pageLabel?: string;
  sortIndex?: string;
  position?: string;
}

export interface ZoteroNote {
  itemId: number;
  parentItemId: number;
  title?: string;
  noteHtml: string;
  noteMarkdown?: string;
}

export interface ZoteroCollection {
  collectionId: number;
  key: string;
  libraryId: number;
  collectionName: string;
  parentCollectionId: number | null;
}

export interface ZoteroLibrary {
  libraryId: number;
  libraryType: string;
  libraryName: string;
}

export interface ZoteroItemSummary {
  itemId: number;
  key: string;
  libraryId: number;
  libraryName: string;
  itemType: string;
  title: string;
  creatorsText: string;
  date?: string;
  year?: string;
  dateAdded?: string;
  dateModified?: string;
  doi?: string;
  tagsText?: string;
  pdfCount: number;
  hasPdf: boolean;
  noteCount: number;
}

export interface ZoteroItem {
  itemId: number;
  key: string;
  libraryId: number;
  libraryName: string;
  itemType: string;
  title: string;
  creators: ZoteroCreator[];
  year?: string;
  date?: string;
  publicationTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  place?: string;
  language?: string;
  doi?: string;
  url?: string;
  tags: string[];
  collections: string[];
  abstract?: string;
  dateAdded?: string;
  dateModified?: string;
  extra?: string;
  attachments: ZoteroAttachment[];
  notes: ZoteroNote[];
  annotations: ZoteroAnnotation[];
}

export interface ExportOptions {
  outputRootPath: string;
  layoutMode: LayoutMode;
  storagePath: string;
  outputChannel: LogChannel;
  resolveConflict: (existingTarget: string, item: ZoteroItem) => Promise<ConflictDecision>;
  selectPdfAttachments: (item: ZoteroItem, pdfAttachments: ZoteroAttachment[]) => Promise<ZoteroAttachment[]>;
  now?: Date;
}

export interface ExportResult {
  exported: number;
  skipped: number;
  failed: number;
  cancelled: boolean;
  warnings: string[];
}

export interface ResolvedZoteroPaths {
  sqlitePath: string;
  storagePath: string;
}
